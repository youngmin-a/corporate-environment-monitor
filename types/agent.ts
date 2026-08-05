import type { EvidenceType, IssueType } from '@/lib/classification';
import type { Industry } from '@/lib/industries';
import type { EnrichedGroup } from '@/types/article';

/**
 * 기업환경 AI 분석관(RAG 채팅)이 클라이언트-서버 경계에서 주고받는 타입.
 *
 * 이 파일은 순수 타입만 담는다(런타임 값 없음) — 어떤 컴포넌트에서 import해도
 * 번들에 서버 코드가 섞여 들어갈 위험이 없다. `lib/agentSearch.ts`·`lib/agentQuery.ts`
 * 처럼 Supabase·OpenAI를 직접 부르는 서버 전용 모듈은 클라이언트 컴포넌트에서
 * 절대 런타임 import하지 않는다(`import type`만 허용).
 */

export type AgentDateRange =
  | 'today'
  | '3d'
  | '7d'
  | '30d'
  | '90d'
  | 'this-month'
  | 'last-month'
  | 'all';

export type AgentAnswerMode =
  | 'summary'
  | 'list'
  | 'compare'
  | 'timeline'
  | 'issues'
  | 'report'
  | 'sources-only';

export type AgentSearchMode = 'precise' | 'balanced' | 'broad';

/**
 * 사용자가 명시적으로 지정한 검색 조건.
 *
 * 값이 존재하면 "사용자가 명시했다"는 뜻이며, 자동 검색 확장 단계에서 이 값은
 * 임의로 덮어쓰지 않는다(PRD 추가요구 11장). `undefined`는 "아직 지정 안 됨"이다.
 */
export type AgentPreset = {
  industries?: Industry[];
  dateRange?: AgentDateRange;
  directStatementOnly?: boolean;
  issueTypes?: IssueType[];
  minScore?: number;
  sort?: 'relevance' | 'latest';
  answerMode?: AgentAnswerMode;
  searchMode?: AgentSearchMode;
  /** 질문에 명시된 특정 기업명 (자유 텍스트) */
  company?: string;
};

export type AgentSourceTier = 'primary' | 'supporting' | 'reference';

export type AgentSource = {
  articleId: string;
  title: string;
  publisher: string;
  publishedAt: string;
  industries: Industry[];
  relevanceScore: number;
  evidenceType: EvidenceType | null;
  url: string;
  tier: AgentSourceTier;
  /** 본문 [n] 인용에 쓰는 번호. reference 등급은 인용하지 않으므로 null이다 */
  citationIndex: number | null;
};

export type AgentSearchMetadata = {
  searchMode: AgentSearchMode;
  initialResultCount: number;
  expandedResultCount: number;
  expansionApplied: boolean;
  expansionTypes: string[];
  primarySourceCount: number;
  supportingSourceCount: number;
  referenceSourceCount: number;
  appliedIndustries: Industry[] | 'all';
  appliedDateRange: AgentDateRange;
  directStatementOnly: boolean;
};

export type AgentFollowUp = {
  label: string;
  prompt: string;
  preset?: AgentPreset;
};

/** 스트리밍 마지막에 한 번 내려오는 전체 메타데이터 + 최종 답변 텍스트 */
export type AgentAnswerPayload = {
  answer: string;
  sources: AgentSource[];
  referenceSources: AgentSource[];
  /** 위 sources·referenceSources에 표시된 기사들의 전체 데이터. 상세 dialog를
   *  추가 요청 없이 열기 위해 함께 내려준다. */
  sourceGroups: EnrichedGroup[];
  suggestedFollowUps: AgentFollowUp[];
  appliedFilters: AgentPreset;
  searchMetadata: AgentSearchMetadata;
  insufficientEvidence: boolean;
};

export type AgentConversationContext = {
  previousQuery?: string;
  previousArticleIds?: string[];
  appliedFilters?: AgentPreset;
};

export type AgentChatRequest = {
  message: string;
  conversationContext?: AgentConversationContext;
  /** 현재 대시보드 화면에 걸려 있는 산업 필터. 대화 첫 턴의 기본값 힌트로만 쓴다 */
  currentIndustryScope?: Industry[];
};

/** 서버가 스트림으로 보내는 이벤트. app/api/agent/chat/route.ts와 lib/agentClient.ts가 이 계약을 공유한다 */
export type AgentStreamEvent =
  | { type: 'meta'; phase: 'searching' | 'analyzing'; resultCount?: number }
  | { type: 'token'; text: string }
  | { type: 'final'; payload: AgentAnswerPayload }
  | { type: 'error'; message: string };
