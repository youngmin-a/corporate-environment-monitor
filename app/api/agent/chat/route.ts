import { NextRequest } from 'next/server';
import OpenAI from 'openai';
import { parseCommands } from '@/lib/agentCommands';
import {
  AGENT_SYSTEM_PROMPT,
  buildContextBlock,
  extractCitationIndices,
  INSUFFICIENT_EVIDENCE_MESSAGES,
} from '@/lib/agentPrompt';
import { analyzeQuery } from '@/lib/agentQuery';
import { acquireSlot, checkRateLimit, releaseSlot } from '@/lib/agentRateLimit';
import { retrieveArticles, toAgentSources } from '@/lib/agentSearch';
import { buildFollowUps } from '@/lib/suggestedPrompts';
import type { AgentAnswerPayload, AgentChatRequest, AgentPreset, AgentStreamEvent } from '@/types/agent';

/**
 * 기업환경 AI 분석관 채팅 API (PRD 15·16장).
 *
 * 순서: 요청 검증 → rate limit → 명령어 파싱 → 질문 분석(LLM, 실패해도 무해하게
 * 계속 진행) → 검색(하이브리드 스코어링) → 근거 부족이면 답변 생성 없이 종료 →
 * 근거가 있으면 스트리밍 답변 생성 → 실제 인용된 출처만 추출 → 후속 질문 생성.
 *
 * 응답은 Server-Sent-Events 스타일의 자체 프레이밍이다(`data: <JSON>\n\n`).
 * 새 스트리밍 라이브러리를 추가하지 않고 fetch + ReadableStream만으로 처리한다.
 */

const MAX_MESSAGE_LENGTH = 600;
const ANSWER_MODEL = 'gpt-5-mini';

function clientKey(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

function emptyMetadata(): AgentAnswerPayload['searchMetadata'] {
  return {
    searchMode: 'balanced',
    initialResultCount: 0,
    expandedResultCount: 0,
    expansionApplied: false,
    expansionTypes: [],
    primarySourceCount: 0,
    supportingSourceCount: 0,
    referenceSourceCount: 0,
    appliedIndustries: 'all',
    appliedDateRange: 'all',
    directStatementOnly: false,
  };
}

export async function POST(request: NextRequest) {
  let body: AgentChatRequest;
  try {
    body = (await request.json()) as AgentChatRequest;
  } catch {
    return new Response(JSON.stringify({ error: '잘못된 요청입니다.' }), { status: 400 });
  }

  const rawMessage = typeof body.message === 'string' ? body.message.trim() : '';
  if (rawMessage.length === 0) {
    return new Response(JSON.stringify({ error: '질문을 입력해 주세요.' }), { status: 400 });
  }
  if (rawMessage.length > MAX_MESSAGE_LENGTH) {
    return new Response(
      JSON.stringify({ error: `질문은 ${MAX_MESSAGE_LENGTH}자 이내로 입력해 주세요.` }),
      { status: 400 },
    );
  }

  const key = clientKey(request);
  const rate = checkRateLimit(key);
  if (!rate.allowed) {
    return new Response(
      JSON.stringify({ error: `요청이 많습니다. ${rate.retryAfterSeconds}초 후 다시 시도해 주세요.` }),
      { status: 429 },
    );
  }
  if (!acquireSlot(key)) {
    return new Response(JSON.stringify({ error: '이전 질문이 아직 처리 중입니다.' }), { status: 429 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: AgentStreamEvent) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      const close = () => {
        if (closed) return;
        closed = true;
        controller.close();
      };

      try {
        const { preset: commandPreset, action, text } = parseCommands(rawMessage);
        const question = text.length > 0 ? text : rawMessage;

        if (action === 'reset') {
          send({
            type: 'final',
            payload: {
              answer: '새 대화를 시작합니다.',
              sources: [],
              referenceSources: [],
              sourceGroups: [],
              suggestedFollowUps: [],
              appliedFilters: {},
              searchMetadata: emptyMetadata(),
              insufficientEvidence: false,
            },
          });
          close();
          return;
        }

        const previousFilters = body.conversationContext?.appliedFilters ?? {};
        const preset: AgentPreset = { ...previousFilters, ...commandPreset };

        // 명령어·이전 대화 조건에 없는 값만 LLM 질문 분석으로 채운다 (사용자가
        // 명시한 조건은 임의로 덮어쓰지 않는다 — PRD 추가요구 26장)
        const analysis = await analyzeQuery(question);
        if (analysis) {
          if (!preset.industries?.length && analysis.industries.length > 0) preset.industries = analysis.industries;
          if (!preset.issueTypes?.length && analysis.issueTypes.length > 0) preset.issueTypes = analysis.issueTypes;
          if (!preset.company && analysis.companyName) preset.company = analysis.companyName;
          if (!preset.directStatementOnly && analysis.directStatementOnly) preset.directStatementOnly = true;
          if (!preset.answerMode && analysis.answerMode) preset.answerMode = analysis.answerMode;
          if (!preset.searchMode && analysis.expansionRequested) preset.searchMode = 'broad';
          if (!preset.answerMode && analysis.comparisonRequested) preset.answerMode = 'compare';
          if (!preset.answerMode && analysis.sourceOnlyRequested) preset.answerMode = 'sources-only';
        }
        if (!preset.industries?.length && body.currentIndustryScope?.length && !body.conversationContext?.previousQuery) {
          preset.industries = body.currentIndustryScope;
        }

        send({ type: 'meta', phase: 'searching' });

        const forceExpand =
          preset.searchMode === 'broad' ||
          /범위를\s*넓|포괄|전체적으로|다른\s*산업까지|놓친\s*기사|누락/.test(question);
        const { primary, supporting, reference, metadata } = await retrieveArticles(question, preset, forceExpand);

        if (primary.length === 0 && supporting.length === 0) {
          const payload: AgentAnswerPayload = {
            answer:
              metadata.initialResultCount === 0 && !metadata.expansionApplied
                ? INSUFFICIENT_EVIDENCE_MESSAGES.none
                : INSUFFICIENT_EVIDENCE_MESSAGES.limited,
            sources: [],
            referenceSources: [],
            sourceGroups: [],
            suggestedFollowUps: [
              { label: '전체 기간에서 검색하기', prompt: '전체 기간에서 다시 찾아줘.', preset: { dateRange: 'all' } },
              { label: '관련 산업 포함하기', prompt: '관련 산업까지 범위를 넓혀서 다시 찾아줘.', preset: { searchMode: 'broad' } },
              { label: '전체 산업에서 검색하기', prompt: '전체 산업에서 다시 찾아줘.', preset: { industries: undefined } },
            ],
            appliedFilters: preset,
            searchMetadata: metadata,
            insufficientEvidence: true,
          };
          send({ type: 'final', payload });
          close();
          return;
        }

        send({ type: 'meta', phase: 'analyzing', resultCount: primary.length + supporting.length });

        const { citable, reference: referenceSources } = toAgentSources(primary, supporting, reference);
        const contextBlock = buildContextBlock(primary, supporting, reference, citable);

        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) throw new Error('OPENAI_API_KEY가 .env에 없습니다.');
        const client = new OpenAI({ apiKey });

        const userContent = `${contextBlock}\n\n사용자 질문: ${question}\n\n답변 형태 힌트: ${preset.answerMode ?? 'summary'}`;

        let fullAnswer = '';
        try {
          const completion = await client.chat.completions.create({
            model: ANSWER_MODEL,
            max_completion_tokens: 1800,
            reasoning_effort: 'minimal',
            stream: true,
            messages: [
              { role: 'system', content: AGENT_SYSTEM_PROMPT },
              { role: 'user', content: userContent },
            ],
          });

          for await (const chunk of completion) {
            const delta = chunk.choices[0]?.delta?.content;
            if (delta) {
              fullAnswer += delta;
              send({ type: 'token', text: delta });
            }
          }
        } catch (streamError) {
          console.warn('스트리밍 실패, 비스트리밍으로 재시도합니다:', streamError);
          const completion = await client.chat.completions.create({
            model: ANSWER_MODEL,
            max_completion_tokens: 1800,
            reasoning_effort: 'minimal',
            messages: [
              { role: 'system', content: AGENT_SYSTEM_PROMPT },
              { role: 'user', content: userContent },
            ],
          });
          fullAnswer = completion.choices[0]?.message?.content ?? '';
          if (fullAnswer) send({ type: 'token', text: fullAnswer });
        }

        if (!fullAnswer.trim()) {
          fullAnswer = INSUFFICIENT_EVIDENCE_MESSAGES.limited;
          send({ type: 'token', text: fullAnswer });
        }

        const usedIndices = extractCitationIndices(fullAnswer);
        const usedSources = citable.filter((source) => source.citationIndex !== null && usedIndices.has(source.citationIndex));
        const sourcesToShow = usedSources.length > 0 ? usedSources : citable.slice(0, Math.min(5, citable.length));

        const distinctIssueTypes = new Set(
          [...primary, ...supporting].flatMap((group) => group.representative.classification.issueTypes),
        );

        const suggestedFollowUps = buildFollowUps({
          answerMode: preset.answerMode ?? null,
          directStatementOnly: Boolean(preset.directStatementOnly),
          expansionApplied: metadata.expansionApplied,
          resultCount: primary.length + supporting.length,
          distinctIssueTypeCount: distinctIssueTypes.size,
        });

        const shownUrls = new Set([...sourcesToShow.map((source) => source.articleId), ...referenceSources.map((source) => source.articleId)]);
        const sourceGroups = [...primary, ...supporting, ...reference].filter((group) => shownUrls.has(group.representative.url));

        const payload: AgentAnswerPayload = {
          answer: fullAnswer,
          sources: sourcesToShow,
          referenceSources,
          sourceGroups,
          suggestedFollowUps,
          appliedFilters: preset,
          searchMetadata: metadata,
          insufficientEvidence: false,
        };

        send({ type: 'final', payload });
        close();
      } catch (error) {
        console.error('AI 분석 처리 실패:', error);
        send({ type: 'error', message: '답변 생성이 중단되었습니다. 같은 조건으로 다시 시도할 수 있습니다.' });
        close();
      } finally {
        releaseSlot(key);
      }
    },
    cancel() {
      releaseSlot(key);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
