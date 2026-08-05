import { buildEntityStats, buildIndustryStats } from '@/lib/dashboard';
import type { Industry } from '@/lib/industries';
import type { AgentAnswerMode, AgentFollowUp, AgentPreset } from '@/types/agent';
import type { EnrichedGroup } from '@/types/article';
import type { PersonalState } from '@/lib/personalState';

/**
 * 추천 질문·후속 질문 생성 (PRD 추가요구 4·5장).
 *
 * **LLM을 호출하지 않는다.** 이미 계산된 산업·기업 집계(lib/dashboard.ts, 대시보드
 * 인사이트 패널이 쓰는 함수를 그대로 재사용한다)에서 규칙으로만 뽑는다. 이 파일은
 * app/api/agent/suggestions/route.ts(서버)에서도, 필요하면 순수 함수 성격상
 * 어디서든 안전하게 계산할 수 있지만 실제로는 서버 라우트에서만 호출한다 —
 * 클라이언트는 이 파일의 타입만 가져다 쓴다.
 *
 * `PersonalState`는 타입만 참조한다(런타임 import 없음) — buildIndustryStats가
 * 요구하는 모양을 맞추기 위한 최소 객체를 여기서 직접 만든다.
 */

const EMPTY_PERSONAL_STATE: PersonalState = {
  version: 1,
  read: {},
  review: {},
  bookmarks: {},
  memos: {},
  report: [],
  hidden: {},
  savedViews: [],
  recentSearches: [],
  viewMode: 'card',
  lastVisitAt: null,
  previousVisitAt: null,
};

export type SuggestedPrompt = {
  id: string;
  category: string;
  label: string;
  prompt: string;
  preset?: AgentPreset;
};

const BASE_PROMPTS: SuggestedPrompt[] = [
  { id: 'base-summary', category: '빠른 동향', label: '최근 주요 기업 애로사항 요약', prompt: '최근 주요 기업 애로사항을 요약해줘.' },
  {
    id: 'base-direct',
    category: '기업 애로사항',
    label: '기업이 직접 건의한 내용',
    prompt: '기업이 직접 건의한 내용만 정리해줘.',
    preset: { directStatementOnly: true },
  },
  {
    id: 'base-week',
    category: '빠른 동향',
    label: '최근 일주일 핵심 동향',
    prompt: '최근 일주일간 핵심 동향을 알려줘.',
    preset: { dateRange: '7d' },
  },
  {
    id: 'base-compare',
    category: '산업 분석',
    label: '산업별 규제 이슈 비교',
    prompt: '산업별 규제 이슈를 비교해줘.',
    preset: { answerMode: 'compare' },
  },
  { id: 'base-score', category: '빠른 동향', label: '연관성 높은 기사 정리', prompt: '연관성 높은 기사들을 핵심 쟁점별로 묶어줘.' },
  { id: 'base-review', category: '보고서 작성', label: '정부 검토 필요 사안', prompt: '정부가 추가로 검토할 필요가 있는 사안을 찾아줘.' },
  {
    id: 'base-compare2',
    category: '비교·분석',
    label: '동일 주제 기사 비교',
    prompt: '동일한 사안을 다룬 기사들의 공통점과 차이점을 알려줘.',
    preset: { answerMode: 'compare' },
  },
  {
    id: 'base-report',
    category: '보고서 작성',
    label: '부내 공유용 동향 정리',
    prompt: '수집된 기사로 부내 공유용 동향을 정리해줘.',
    preset: { answerMode: 'report' },
  },
];

export const CATEGORY_PROMPTS: Record<string, SuggestedPrompt[]> = {
  '빠른 동향': [
    { id: 'cat-today', category: '빠른 동향', label: '오늘의 핵심 기사', prompt: '오늘의 핵심 기사를 요약해줘.', preset: { dateRange: 'today' } },
    { id: 'cat-new-issue', category: '빠른 동향', label: '새로 등장한 애로사항', prompt: '새롭게 등장한 기업 애로사항을 찾아줘.' },
  ],
  '기업 애로사항': [
    {
      id: 'cat-assoc',
      category: '기업 애로사항',
      label: '기업단체 건의사항',
      prompt: '기업단체가 건의한 규제 개선사항을 알려줘.',
      preset: { issueTypes: ['business-difficulty'] },
    },
    { id: 'cat-size', category: '기업 애로사항', label: '중소기업 애로사항', prompt: '중소기업과 관련된 애로사항만 찾아줘.' },
  ],
  '산업 분석': [],
  '비교·분석': [
    { id: 'cat-view', category: '비교·분석', label: '기업·정부 입장 비교', prompt: '기업과 정부의 입장을 비교해줘.', preset: { answerMode: 'compare' } },
  ],
  '보고서 작성': [
    {
      id: 'cat-source',
      category: '보고서 작성',
      label: '근거 기사와 함께 설명',
      prompt: '근거가 된 기사와 함께 설명해줘.',
      preset: { answerMode: 'sources-only' },
    },
  ],
  '검색 범위 확장': [
    {
      id: 'cat-expand',
      category: '검색 범위 확장',
      label: '관련 산업까지 넓혀 찾기',
      prompt: '관련 산업까지 범위를 넓혀서 다시 찾아줘.',
      preset: { searchMode: 'broad' },
    },
    {
      id: 'cat-expand2',
      category: '검색 범위 확장',
      label: '누락 기사 다시 찾기',
      prompt: '놓친 기사가 없는지 관련 기사까지 다시 찾아줘.',
      preset: { searchMode: 'broad' },
    },
  ],
};

/** 산업·기업 집계에서 실제 존재하는 값만 골라 동적 추천을 만든다 (지어내지 않는다) */
export function buildSuggestedPrompts(groups: EnrichedGroup[], activeIndustry: Industry | null): SuggestedPrompt[] {
  const dynamic: SuggestedPrompt[] = [];

  if (activeIndustry) {
    dynamic.push({
      id: `dyn-industry-${activeIndustry}`,
      category: '산업 분석',
      label: `${activeIndustry} 최근 규제 이슈`,
      prompt: `최근 ${activeIndustry} 산업의 규제 애로사항을 알려줘.`,
      preset: { industries: [activeIndustry] },
    });
  } else {
    const topIndustry = buildIndustryStats(groups, EMPTY_PERSONAL_STATE)[0];
    if (topIndustry) {
      dynamic.push({
        id: `dyn-top-industry-${topIndustry.industry}`,
        category: '산업 분석',
        label: `${topIndustry.industry} 최근 이슈`,
        prompt: `최근 ${topIndustry.industry} 산업의 핵심 이슈를 정리해줘.`,
        preset: { industries: [topIndustry.industry] },
      });
    }
  }

  const topCompany = buildEntityStats(groups, (article) => article.classification.companies)[0];
  if (topCompany) {
    dynamic.push({
      id: `dyn-company-${topCompany.name}`,
      category: '기업 애로사항',
      label: `${topCompany.name} 관련 기사`,
      prompt: `${topCompany.name}이(가) 언급된 최근 기사를 시간순으로 정리해줘.`,
      preset: { answerMode: 'timeline' },
    });
  }

  return [...BASE_PROMPTS, ...dynamic];
}

export function buildFollowUps(input: {
  answerMode: AgentAnswerMode | null;
  directStatementOnly: boolean;
  expansionApplied: boolean;
  resultCount: number;
  distinctIssueTypeCount: number;
}): AgentFollowUp[] {
  const followUps: AgentFollowUp[] = [];

  if (!input.directStatementOnly) {
    followUps.push({ label: '기업 직접 발언만 보기', prompt: '기업이 직접 발언한 내용만 다시 정리해줘.', preset: { directStatementOnly: true } });
  }
  if (input.answerMode !== 'compare' && input.distinctIssueTypeCount >= 2) {
    followUps.push({ label: '공통점과 차이점 비교', prompt: '공통 쟁점과 차이점을 비교해줘.', preset: { answerMode: 'compare' } });
  }
  if (input.answerMode !== 'timeline') {
    followUps.push({ label: '시간순 정리', prompt: '시간순으로 정리해줘.', preset: { answerMode: 'timeline' } });
  }
  if (input.answerMode !== 'report') {
    followUps.push({ label: '보고서 형식으로 보기', prompt: '보고서 형식으로 바꿔줘.', preset: { answerMode: 'report' } });
  }
  followUps.push({ label: '이 답변의 근거 기사만 보기', prompt: '이 답변의 근거 기사만 보여줘.', preset: { answerMode: 'sources-only' } });
  if (!input.expansionApplied && input.resultCount <= 6) {
    followUps.push({
      label: '범위를 넓혀 다시 찾기',
      prompt: '관련 산업과 유사 표현까지 범위를 넓혀서 다시 찾아줘.',
      preset: { searchMode: 'broad' },
    });
  }

  return followUps.slice(0, 4);
}
