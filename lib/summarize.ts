import OpenAI from 'openai';
import type { Candidate } from '@/lib/collector';

/** PRD 5-2: 요약은 3줄 이내, 한 줄당 40자 이내 (공백 포함, 한글·영문·숫자 모두 1자) */
export const MAX_SUMMARY_LINES = 3;
export const MAX_LINE_LENGTH = 40;

/**
 * 원래 PRD 8번은 Claude API(claude-opus-5)로 고정돼 있었으나, Anthropic 키가 없어
 * 이미 .env에 있는 OPENAI_API_KEY로 바꿔 달라는 요청에 따라 OpenAI로 교체했다.
 * gpt-5-mini는 구조화된 출력(json_schema)을 지원하고 짧은 요약 작업에 비용이 저렴하다.
 */
const SUMMARY_MODEL = 'gpt-5-mini';

/**
 * LLM은 한글 글자 수를 정확히 세지 못하는 경향이 있다 (실측: 40자 제한을 그대로
 * 안내하면 약 75%가 초과). 목표치를 40자보다 훨씬 낮게(28~32자) 잡아 여유를 두면
 * 실제 상한(40자)을 넘는 빈도가 크게 줄어든다. PRD의 40자 규칙 자체는 그대로 두고,
 * 프롬프트에서 안전 마진만 둔 것이다.
 */
const SAFE_TARGET_LENGTH = '28~32';

/**
 * 상세 화면용 확장 요약 (PRD 5-2-1).
 * 카드용 3줄과 역할이 다르다 — 원문을 열기 전에 맥락을 파악하는 용도라 길다.
 */
export const MIN_EXPANDED_LINES = 3;
export const MAX_EXPANDED_LINES = 8;
export const MAX_EXPANDED_LINE_LENGTH = 120;

const SYSTEM_PROMPT = [
  '너는 재정경제부 기업환경과 실무자를 위해 기업 규제 관련 기사를 요약한다.',
  '기사 발췌문에 실제로 적힌 내용만 쓴다. 없는 배경·전망·원인을 추측해서 덧붙이지 않는다.',
  '',
  '[lines] 목록 카드용 짧은 요약',
  `- ${MAX_SUMMARY_LINES}줄 이내로 쓴다. 한 줄은 공백 포함 ${MAX_LINE_LENGTH}자가 절대 상한이며, 이를 넘기면 안 된다.`,
  `- 너는 글자 수를 정확히 세지 못하는 경향이 있으니, 안전하게 ${SAFE_TARGET_LENGTH}자를 목표로 짧게 써라.`,
  '- 한 문장에 여러 사실을 욱여넣지 말고, 핵심 하나만 담아 문장을 짧게 끊어라.',
  '- 기업이 겪는 불편이나 요구사항이 무엇인지가 드러나게 쓴다.',
  '',
  '[expandedLines] 상세 화면용 확장 요약',
  `- ${MIN_EXPANDED_LINES}~${MAX_EXPANDED_LINES}개의 문장으로 쓴다. 한 문장은 ${MAX_EXPANDED_LINE_LENGTH}자 이내다.`,
  '- lines의 문장을 그대로 옮기거나 표현만 바꿔 반복하지 않는다.',
  '- 발췌문에 있는 것만 골라 쓴다: 핵심 사건·정책 변화, 배경, 기업·산업이 겪는 어려움,',
  '  관련 규제·제도의 현재 상태, 기업이나 협회의 요구, 정부·국회의 대응, 예상되는 영향.',
  '- 위 항목을 기계적으로 하나씩 채우지 않는다. 발췌문에 없는 항목은 쓰지 않는다.',
  '- 발췌문이 짧아 쓸 내용이 없으면 억지로 8문장을 채우지 말고 있는 만큼만 쓴다.',
  '- 발언 주체(기업·협회·정부·국회·전문가)를 섞지 않는다. 수치·날짜·기관명은 발췌문 그대로 쓴다.',
  '- 단정적 해석, 과장, 감정적 평가, 발췌문에 없는 정책 제안을 넣지 않는다.',
].join('\n');

/** OpenAI Structured Outputs(strict 모드)는 모든 단계에 additionalProperties: false가 필요하다 */
const SUMMARY_JSON_SCHEMA = {
  name: 'article_summary',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      lines: {
        type: 'array',
        description: `카드용 요약 문장 배열. 최대 ${MAX_SUMMARY_LINES}개, 각 문장 ${MAX_LINE_LENGTH}자 이내.`,
        items: { type: 'string' },
      },
      expandedLines: {
        type: 'array',
        description: `상세용 확장 요약 문장 배열. ${MIN_EXPANDED_LINES}~${MAX_EXPANDED_LINES}개, 각 문장 ${MAX_EXPANDED_LINE_LENGTH}자 이내.`,
        items: { type: 'string' },
      },
    },
    required: ['lines', 'expandedLines'],
    additionalProperties: false,
  },
} as const;

function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY가 .env에 없습니다.');
  return new OpenAI({ apiKey });
}

/** PRD 5-2의 길이 규칙을 지켰는지 확인한다 */
function isValidSummary(lines: unknown): lines is string[] {
  return (
    Array.isArray(lines) &&
    lines.length > 0 &&
    lines.length <= MAX_SUMMARY_LINES &&
    lines.every(
      (line) =>
        typeof line === 'string' &&
        line.trim().length > 0 &&
        line.trim().length <= MAX_LINE_LENGTH,
    )
  );
}

/**
 * 확장 요약 검증. 카드 요약과 달리 **실패해도 기사 저장을 막지 않는다** —
 * 규칙을 어기면 null로 두고, 상세 화면이 카드 요약으로 대체한다.
 */
function toExpandedSummary(value: unknown, cardLines: string[]): string[] | null {
  if (!Array.isArray(value)) return null;

  const cardSet = new Set(cardLines.map((line) => line.trim()));
  const lines = value
    .map((line) => String(line).trim())
    .filter((line) => line.length > 0 && line.length <= MAX_EXPANDED_LINE_LENGTH)
    // 카드 요약을 그대로 복사한 문장은 상세에서 중복이므로 뺀다
    .filter((line) => !cardSet.has(line));

  const unique = [...new Set(lines)].slice(0, MAX_EXPANDED_LINES);
  return unique.length >= MIN_EXPANDED_LINES ? unique : null;
}

/** 요약 한 건의 결과. 카드용과 상세용을 한 번의 호출로 함께 받는다 */
export type SummaryResult = {
  /** PRD 5-2의 3줄 요약. null이면 화면에 "요약 실패"로 표시된다 */
  lines: string[] | null;
  /** 상세용 확장 요약. 규칙을 못 맞추면 null이며 상세가 카드 요약으로 대체한다 */
  expandedLines: string[] | null;
};

async function requestSummary(
  client: OpenAI,
  candidate: Candidate,
  retryHint: string | null,
): Promise<SummaryResult | null> {
  const userContent = [
    `제목: ${candidate.title}`,
    `언론사: ${candidate.press}`,
    `발행일: ${candidate.publishedAt}`,
    '',
    '발췌문:',
    candidate.description,
    retryHint ? `\n${retryHint}` : '',
  ].join('\n');

  const response = await client.chat.completions.create({
    model: SUMMARY_MODEL,
    // 확장 요약(최대 8문장)까지 한 응답에 담기므로 예산을 늘렸다.
    // 호출 횟수는 그대로 1건당 1회다.
    max_completion_tokens: 1600,
    // gpt-5-mini는 추론 모델이라 reasoning_effort를 낮추지 않으면 토큰 예산을
    // 내부 사고에 다 쓰고 빈 응답(finish_reason: 'length')을 낸다. 3줄 요약처럼
    // 추론이 필요 없는 작업에는 'minimal'이 맞다.
    reasoning_effort: 'minimal',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: SUMMARY_JSON_SCHEMA,
    },
  });

  const choice = response.choices[0];
  // 안전 필터에 걸리면 finish_reason이 'content_filter'로 온다
  if (!choice || choice.finish_reason === 'content_filter') return null;

  const text = choice.message.content;
  if (!text) return null;

  try {
    const parsed = JSON.parse(text) as { lines?: unknown; expandedLines?: unknown };
    const lines = Array.isArray(parsed.lines)
      ? parsed.lines.map((line) => String(line).trim())
      : null;
    if (!isValidSummary(lines)) return null;

    return { lines, expandedLines: toExpandedSummary(parsed.expandedLines, lines) };
  } catch {
    return null;
  }
}

/**
 * 기사 한 건을 요약한다.
 *
 * PRD 5-2의 "요약 실패" 세 가지를 모두 null로 돌려준다:
 *   1. API 오류 또는 타임아웃
 *   2. 재시도 1회 후에도 3줄·40자 규칙을 어긴 응답
 *   3. 빈 응답
 * 실패 시 문장을 지어내지 않는다 — 화면에 "요약 실패"로 표시된다.
 */
export async function summarize(candidate: Candidate): Promise<SummaryResult> {
  const failed: SummaryResult = { lines: null, expandedLines: null };

  try {
    const client = getClient();

    const first = await requestSummary(client, candidate, null);
    if (first) return first;

    const retried = await requestSummary(
      client,
      candidate,
      `앞선 응답이 길이 규칙을 어겼다. lines는 ${MAX_SUMMARY_LINES}줄 이내, 각 줄 ${MAX_LINE_LENGTH}자 이내로 다시 작성해라.`,
    );
    return retried ?? failed;
  } catch (error) {
    console.warn('요약 실패:', candidate.url, error);
    return failed;
  }
}

/** 동시에 너무 많이 던지지 않도록 4건씩 끊어서 요약한다 */
export async function summarizeAll(
  candidates: Candidate[],
  concurrency = 4,
): Promise<SummaryResult[]> {
  const summaries: SummaryResult[] = [];
  for (let i = 0; i < candidates.length; i += concurrency) {
    const batch = candidates.slice(i, i + concurrency);
    const results = await Promise.all(batch.map((item) => summarize(item)));
    summaries.push(...results);
  }
  return summaries;
}
