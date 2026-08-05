import type { Industry } from '@/lib/industries';
import type { AgentPreset } from '@/types/agent';

/**
 * 선택적 슬래시 명령어 (PRD 추가요구 6·7·8장).
 *
 * 명령어는 필수 입력 방식이 아니다 — 같은 의도를 자연어로도 표현할 수 있어야
 * 한다(lib/agentQuery.ts의 LLM 질문 분석이 그 역할을 한다). 이 파일은 순수
 * 데이터/파서만 담아 클라이언트(자동완성 UI)와 서버(파싱) 양쪽에서 안전하게
 * import할 수 있다 — Supabase·OpenAI 코드를 여기 두지 않는다.
 */

const INDUSTRY_COMMAND_MAP: Record<string, Industry> = {
  자동차: '자동차',
  철강: '철강',
  조선해운: '조선 및 해운',
  에너지: '에너지',
  바이오: '바이오',
  금융: '금융',
  반도체: '반도체',
  정보통신: '정보통신',
};

export type AgentCommandDef = {
  id: string;
  description: string;
  preset: AgentPreset;
  /** 검색 조건이 아니라 특수 동작을 뜻하는 명령어 (예: 대화 초기화) */
  action?: 'reset';
};

export const AGENT_COMMANDS: AgentCommandDef[] = [
  { id: '최근7일', description: '최근 7일 이내 기사만 검색합니다.', preset: { dateRange: '7d' } },
  { id: '최근30일', description: '최근 30일 이내 기사만 검색합니다.', preset: { dateRange: '30d' } },
  { id: '전체기간', description: '기간 제한 없이 검색합니다.', preset: { dateRange: 'all' } },
  { id: '전체산업', description: '산업 제한을 해제합니다.', preset: { industries: undefined } },
  { id: '직접발언', description: '기업·단체의 직접 발언이 확인되는 기사를 우선합니다.', preset: { directStatementOnly: true } },
  {
    id: '기업건의',
    description: '기업이 직접 건의·요구한 내용을 우선합니다.',
    preset: { directStatementOnly: true, issueTypes: ['business-difficulty'] },
  },
  {
    id: '규제',
    description: '규제 강화·완화·불확실성 관련 기사로 좁힙니다.',
    preset: { issueTypes: ['regulation-tightening', 'regulation-relaxation', 'regulatory-uncertainty'] },
  },
  { id: '금융애로', description: '금융 접근성 관련 기사로 좁힙니다.', preset: { issueTypes: ['finance'] } },
  { id: '연관성80', description: '연관성 점수 80점 이상만 검색합니다.', preset: { minScore: 80 } },
  { id: '최신순', description: '최신 발행일 순으로 정렬합니다.', preset: { sort: 'latest' } },
  { id: '관련도순', description: '연관성 점수 순으로 정렬합니다.', preset: { sort: 'relevance' } },
  { id: '요약', description: '핵심 요약 형태로 답변합니다.', preset: { answerMode: 'summary' } },
  { id: '비교', description: '비교 분석 형태로 답변합니다.', preset: { answerMode: 'compare' } },
  { id: '시간순', description: '시간순 정리 형태로 답변합니다.', preset: { answerMode: 'timeline' } },
  { id: '보고서', description: '보고서용 정리 형태로 답변합니다.', preset: { answerMode: 'report' } },
  { id: '출처', description: '답변보다 근거 기사 목록을 우선 표시합니다.', preset: { answerMode: 'sources-only' } },
  { id: '검색확장', description: '기간·산업·유사 표현까지 검색 범위를 넓힙니다.', preset: { searchMode: 'broad' } },
  { id: '새대화', description: '현재 대화와 검색 조건을 초기화합니다.', preset: {}, action: 'reset' },
  ...Object.entries(INDUSTRY_COMMAND_MAP).map(([id, industry]) => ({
    id,
    description: `${industry} 산업으로 검색 범위를 좁힙니다.`,
    preset: { industries: [industry] } as AgentPreset,
  })),
];

/**
 * 메시지 맨 앞의 연속된 /명령어들을 파싱해 preset과 남은 자연어 질문을 분리한다.
 * 모르는 명령어를 만나면 그 지점에서 파싱을 멈추고 나머지는 모두 질문 텍스트로 본다
 * — 사용자가 "/뭔가 이상한거"처럼 쓸 때 질문 자체를 삼키지 않기 위해서다.
 */
export function parseCommands(message: string): { preset: AgentPreset; action?: 'reset'; text: string } {
  const tokens = message.trim().split(/\s+/);
  let preset: AgentPreset = {};
  let action: 'reset' | undefined;
  let consumed = 0;

  for (const token of tokens) {
    if (!token.startsWith('/') || token.length <= 1) break;
    const id = token.slice(1);
    const command = AGENT_COMMANDS.find((candidate) => candidate.id === id);
    if (!command) break;
    preset = { ...preset, ...command.preset };
    if (command.action) action = command.action;
    consumed += 1;
  }

  return { preset, action, text: tokens.slice(consumed).join(' ').trim() };
}
