import OpenAI from 'openai';
import { ALL_ISSUE_TYPES, type IssueType } from '@/lib/classification';
import { ALL_INDUSTRIES, type Industry } from '@/lib/industries';
import type { AgentAnswerMode } from '@/types/agent';

/**
 * 사용자 질문에서 검색 조건을 추출하는 구조화 분석 (PRD 7장).
 *
 * lib/summarize.ts와 같은 방식(json_schema strict + reasoning_effort minimal)을
 * 쓴다. 실패해도 채팅 전체가 죽지 않도록 항상 null을 돌려주고, 호출부가 원래
 * 질문 문자열을 그대로 검색어로 쓰게 한다.
 */
const QUERY_MODEL = 'gpt-5-mini';

const SYSTEM_PROMPT = [
  '너는 기업환경 모니터링 서비스의 질문 분석기다.',
  '사용자 질문에서 검색에 필요한 조건만 뽑아 JSON으로 반환한다.',
  '질문에 명시되지 않은 항목은 비워 둔다(산업·이슈유형은 빈 배열, 기업명은 빈 문자열).',
  '산업은 반드시 주어진 8개 값 중에서만 고른다. 질문에 없는 산업을 추측해서 넣지 않는다.',
].join('\n');

const SCHEMA = {
  name: 'agent_query_analysis',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      industries: { type: 'array', items: { type: 'string', enum: ALL_INDUSTRIES } },
      issueTypes: { type: 'array', items: { type: 'string', enum: ALL_ISSUE_TYPES } },
      companyName: { type: 'string', description: '질문에 명시된 특정 기업명. 없으면 빈 문자열.' },
      directStatementOnly: { type: 'boolean' },
      comparisonRequested: { type: 'boolean' },
      sourceOnlyRequested: { type: 'boolean' },
      expansionRequested: { type: 'boolean' },
      answerMode: {
        type: 'string',
        enum: ['summary', 'list', 'compare', 'timeline', 'issues', 'report', 'sources-only', 'unspecified'],
      },
    },
    required: [
      'industries',
      'issueTypes',
      'companyName',
      'directStatementOnly',
      'comparisonRequested',
      'sourceOnlyRequested',
      'expansionRequested',
      'answerMode',
    ],
    additionalProperties: false,
  },
} as const;

export type QueryAnalysis = {
  industries: Industry[];
  issueTypes: IssueType[];
  companyName: string | null;
  directStatementOnly: boolean;
  comparisonRequested: boolean;
  sourceOnlyRequested: boolean;
  expansionRequested: boolean;
  answerMode: AgentAnswerMode | null;
};

export async function analyzeQuery(question: string): Promise<QueryAnalysis | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  try {
    const client = new OpenAI({ apiKey });
    const response = await client.chat.completions.create({
      model: QUERY_MODEL,
      max_completion_tokens: 400,
      reasoning_effort: 'minimal',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: question },
      ],
      response_format: { type: 'json_schema', json_schema: SCHEMA },
    });

    const text = response.choices[0]?.message?.content;
    if (!text) return null;

    const parsed = JSON.parse(text) as Record<string, unknown>;
    const industries = Array.isArray(parsed.industries)
      ? (parsed.industries as string[]).filter((item): item is Industry => ALL_INDUSTRIES.includes(item as Industry))
      : [];
    const issueTypes = Array.isArray(parsed.issueTypes)
      ? (parsed.issueTypes as string[]).filter((item): item is IssueType => ALL_ISSUE_TYPES.includes(item as IssueType))
      : [];
    const answerMode =
      typeof parsed.answerMode === 'string' && parsed.answerMode !== 'unspecified'
        ? (parsed.answerMode as AgentAnswerMode)
        : null;

    return {
      industries,
      issueTypes,
      companyName: typeof parsed.companyName === 'string' && parsed.companyName.trim() ? parsed.companyName.trim() : null,
      directStatementOnly: Boolean(parsed.directStatementOnly),
      comparisonRequested: Boolean(parsed.comparisonRequested),
      sourceOnlyRequested: Boolean(parsed.sourceOnlyRequested),
      expansionRequested: Boolean(parsed.expansionRequested),
      answerMode,
    };
  } catch (error) {
    console.warn('질문 분석 실패, 원문 질문으로 대체합니다:', error);
    return null;
  }
}
