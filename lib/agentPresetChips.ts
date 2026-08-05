import { ISSUE_TYPE_LABELS } from '@/lib/classification';
import type { AgentPreset } from '@/types/agent';

/**
 * AgentPreset을 화면에 보여줄 chip 문구로 바꾸는 순수 함수만 모은 파일.
 *
 * 이 파일은 **클라이언트 컴포넌트에서 안전하게 import할 수 있어야 한다** — Supabase나
 * OpenAI를 부르는 코드를 여기 섞지 않는다. 서버 전용 검색 로직(lib/agentSearch.ts)이
 * 이 파일을 가져다 쓰는 것은 괜찮지만, 반대 방향(클라이언트가 서버 전용 모듈을
 * import)은 절대 안 된다.
 */

export const DATE_RANGE_LABELS: Record<string, string> = {
  today: '오늘',
  '3d': '최근 3일',
  '7d': '최근 7일',
  '30d': '최근 30일',
  '90d': '최근 90일',
  'this-month': '이번 달',
  'last-month': '지난달',
  all: '전체 기간',
};

export const SEARCH_MODE_LABELS: Record<string, string> = {
  precise: '정확 검색',
  balanced: '균형 검색',
  broad: '포괄 검색',
};

export const ANSWER_MODE_LABELS: Record<string, string> = {
  summary: '핵심 요약',
  list: '기사 목록',
  compare: '비교 분석',
  timeline: '시간순 정리',
  issues: '애로사항 추출',
  report: '보고서용 정리',
  'sources-only': '근거 확인',
};

export type PresetChip = { key: string; label: string };

/** 적용된 검색 조건을 제거 가능한 chip 목록으로 바꾼다 */
export function presetChips(preset: AgentPreset): PresetChip[] {
  const chips: PresetChip[] = [];

  if (preset.industries?.length) chips.push({ key: 'industries', label: preset.industries.join(', ') });
  if (preset.dateRange && preset.dateRange !== 'all') {
    chips.push({ key: 'dateRange', label: DATE_RANGE_LABELS[preset.dateRange] ?? preset.dateRange });
  }
  if (preset.directStatementOnly) chips.push({ key: 'directStatementOnly', label: '직접 발언' });
  if (preset.issueTypes?.length) {
    chips.push({ key: 'issueTypes', label: preset.issueTypes.map((type) => ISSUE_TYPE_LABELS[type]).join(', ') });
  }
  if (preset.minScore) chips.push({ key: 'minScore', label: `${preset.minScore}점 이상` });
  if (preset.company) chips.push({ key: 'company', label: preset.company });
  if (preset.searchMode && preset.searchMode !== 'balanced') {
    chips.push({ key: 'searchMode', label: SEARCH_MODE_LABELS[preset.searchMode] });
  }
  if (preset.answerMode) chips.push({ key: 'answerMode', label: ANSWER_MODE_LABELS[preset.answerMode] });

  return chips;
}

export function removePresetChip(preset: AgentPreset, key: string): AgentPreset {
  const next = { ...preset };
  switch (key) {
    case 'industries':
      delete next.industries;
      break;
    case 'dateRange':
      delete next.dateRange;
      break;
    case 'directStatementOnly':
      delete next.directStatementOnly;
      break;
    case 'issueTypes':
      delete next.issueTypes;
      break;
    case 'minScore':
      delete next.minScore;
      break;
    case 'company':
      delete next.company;
      break;
    case 'searchMode':
      delete next.searchMode;
      break;
    case 'answerMode':
      delete next.answerMode;
      break;
    default:
      break;
  }
  return next;
}
