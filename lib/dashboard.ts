import {
  ISSUE_TYPE_LABELS,
  type EvidenceType,
  type IssueType,
  type Urgency,
} from '@/lib/classification';
import type { Industry } from '@/lib/industries';
import type { PersonalState, ReviewStatus } from '@/lib/personalState';
import type { EnrichedArticle, EnrichedGroup } from '@/types/article';

/**
 * 대시보드의 검색·필터·정렬·지표 계산.
 *
 * 모두 순수 함수다. 화면(Dashboard.tsx)에서 useMemo로 감싸 필터가 바뀔 때만 다시
 * 계산하고, 서버에는 다시 묻지 않는다 — 목록은 이미 내려와 있다.
 */

export type DateRange = 'all' | 'today' | '3d' | '7d' | '30d';
export type ReadFilter = 'all' | 'unread' | 'new';
export type SortKey =
  | 'relevance'
  | 'latest'
  | 'urgency'
  | 'company-voice'
  | 'unreviewed'
  | 'publisher-diversity';

export const SORT_LABELS: Record<SortKey, string> = {
  relevance: '연관성 높은 순',
  latest: '최신순',
  urgency: '긴급도 높은 순',
  'company-voice': '기업 직접 발언 우선',
  unreviewed: '미검토 우선',
  'publisher-diversity': '언론사 다양성 우선',
};

export const DATE_RANGE_LABELS: Record<DateRange, string> = {
  all: '전체 기간',
  today: '오늘',
  '3d': '최근 3일',
  '7d': '최근 7일',
  '30d': '최근 30일',
};

export type DashboardFilters = {
  search: string;
  industries: Industry[];
  issueTypes: IssueType[];
  evidenceTypes: EvidenceType[];
  urgencies: Urgency[];
  minScore: number;
  dateRange: DateRange;
  publishers: string[];
  overseasOnly: boolean;
  directQuoteOnly: boolean;
  agencies: string[];
  readFilter: ReadFilter;
  reviewStatuses: ReviewStatus[];
  bookmarkedOnly: boolean;
  inReportOnly: boolean;
  showHidden: boolean;
  sort: SortKey;
};

export const DEFAULT_FILTERS: DashboardFilters = {
  search: '',
  industries: [],
  issueTypes: [],
  evidenceTypes: [],
  urgencies: [],
  minScore: 0,
  dateRange: 'all',
  publishers: [],
  overseasOnly: false,
  directQuoteOnly: false,
  agencies: [],
  readFilter: 'all',
  reviewStatuses: [],
  bookmarkedOnly: false,
  inReportOnly: false,
  showHidden: false,
  sort: 'relevance',
};

const URGENCY_RANK: Record<Urgency, number> = { critical: 3, high: 2, medium: 1, low: 0 };

function daysAgoDate(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function rangeStart(range: DateRange): string | null {
  switch (range) {
    case 'today':
      return new Date().toISOString().slice(0, 10);
    case '3d':
      return daysAgoDate(3);
    case '7d':
      return daysAgoDate(7);
    case '30d':
      return daysAgoDate(30);
    default:
      return null;
  }
}

/** 검색어가 어디에서 걸렸는지. 카드에 "상세 요약에서 검색됨" 배지를 붙일 때 쓴다 */
export type SearchHit = 'none' | 'card' | 'expanded';

export function matchSearch(article: EnrichedArticle, term: string): SearchHit {
  if (term.length === 0) return 'card';
  const needle = term.toLowerCase();
  if (article.searchText.includes(needle)) return 'card';
  if (article.expandedSearchText.includes(needle)) return 'expanded';
  return 'none';
}

export type FilteredGroup = {
  group: EnrichedGroup;
  searchHit: SearchHit;
};

/** 적용된 필터 하나. 화면 위쪽에 제거 가능한 chip으로 보여준다 */
export type ActiveFilterChip = {
  key: string;
  label: string;
};

export function activeFilterChips(filters: DashboardFilters): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];

  if (filters.search.trim()) chips.push({ key: 'search', label: `검색: ${filters.search.trim()}` });
  filters.industries.forEach((industry) =>
    chips.push({ key: `industry:${industry}`, label: industry }),
  );
  filters.issueTypes.forEach((type) =>
    chips.push({ key: `issue:${type}`, label: ISSUE_TYPE_LABELS[type] }),
  );
  filters.evidenceTypes.forEach((type) => chips.push({ key: `evidence:${type}`, label: type }));
  filters.urgencies.forEach((urgency) => chips.push({ key: `urgency:${urgency}`, label: `긴급도 ${urgency}` }));
  if (filters.minScore > 0) chips.push({ key: 'minScore', label: `${filters.minScore}점 이상` });
  if (filters.dateRange !== 'all') {
    chips.push({ key: 'dateRange', label: DATE_RANGE_LABELS[filters.dateRange] });
  }
  filters.publishers.forEach((publisher) =>
    chips.push({ key: `publisher:${publisher}`, label: publisher }),
  );
  filters.agencies.forEach((agency) => chips.push({ key: `agency:${agency}`, label: agency }));
  if (filters.overseasOnly) chips.push({ key: 'overseas', label: '해외 규제' });
  if (filters.directQuoteOnly) chips.push({ key: 'directQuote', label: '직접 발언 포함' });
  if (filters.readFilter === 'unread') chips.push({ key: 'read', label: '아직 열지 않음' });
  if (filters.readFilter === 'new') chips.push({ key: 'read', label: '마지막 방문 이후' });
  filters.reviewStatuses.forEach((status) =>
    chips.push({ key: `review:${status}`, label: `검토: ${status}` }),
  );
  if (filters.bookmarkedOnly) chips.push({ key: 'bookmarked', label: '저장한 기사' });
  if (filters.inReportOnly) chips.push({ key: 'inReport', label: '보고서 포함' });
  if (filters.showHidden) chips.push({ key: 'showHidden', label: '숨긴 기사 포함' });

  return chips;
}

export function removeFilterChip(filters: DashboardFilters, key: string): DashboardFilters {
  const [kind, value] = key.split(':');
  switch (kind) {
    case 'search':
      return { ...filters, search: '' };
    case 'industry':
      return { ...filters, industries: filters.industries.filter((item) => item !== value) };
    case 'issue':
      return { ...filters, issueTypes: filters.issueTypes.filter((item) => item !== value) };
    case 'evidence':
      return { ...filters, evidenceTypes: filters.evidenceTypes.filter((item) => item !== value) };
    case 'urgency':
      return { ...filters, urgencies: filters.urgencies.filter((item) => item !== value) };
    case 'minScore':
      return { ...filters, minScore: 0 };
    case 'dateRange':
      return { ...filters, dateRange: 'all' };
    case 'publisher':
      return { ...filters, publishers: filters.publishers.filter((item) => item !== value) };
    case 'agency':
      return { ...filters, agencies: filters.agencies.filter((item) => item !== value) };
    case 'overseas':
      return { ...filters, overseasOnly: false };
    case 'directQuote':
      return { ...filters, directQuoteOnly: false };
    case 'read':
      return { ...filters, readFilter: 'all' };
    case 'review':
      return {
        ...filters,
        reviewStatuses: filters.reviewStatuses.filter((item) => item !== value),
      };
    case 'bookmarked':
      return { ...filters, bookmarkedOnly: false };
    case 'inReport':
      return { ...filters, inReportOnly: false };
    case 'showHidden':
      return { ...filters, showHidden: false };
    default:
      return filters;
  }
}

/** 마지막 방문 이후에 수집된 기사인지 */
export function isNewSinceLastVisit(article: EnrichedArticle, previousVisitAt: string | null): boolean {
  if (!previousVisitAt) return false;
  return new Date(article.collectedAt).getTime() > new Date(previousVisitAt).getTime();
}

export function filterGroups(
  groups: EnrichedGroup[],
  filters: DashboardFilters,
  personal: PersonalState,
): FilteredGroup[] {
  const since = rangeStart(filters.dateRange);
  const term = filters.search.trim().toLowerCase();

  const result: FilteredGroup[] = [];

  for (const group of groups) {
    const article = group.representative;
    const { classification } = article;

    if (!filters.showHidden && personal.hidden[article.url]) continue;
    if (filters.minScore > 0 && article.relevanceScore < filters.minScore) continue;
    if (since && article.publishedAt < since) continue;

    if (filters.industries.length > 0) {
      if (!filters.industries.some((industry) => article.industries.includes(industry))) continue;
    }
    if (filters.issueTypes.length > 0) {
      if (!filters.issueTypes.some((type) => classification.issueTypes.includes(type))) continue;
    }
    if (filters.evidenceTypes.length > 0) {
      if (!classification.evidenceType || !filters.evidenceTypes.includes(classification.evidenceType)) {
        continue;
      }
    }
    if (filters.urgencies.length > 0 && !filters.urgencies.includes(classification.urgency)) continue;
    if (filters.publishers.length > 0 && !filters.publishers.includes(article.publisher)) continue;
    if (filters.agencies.length > 0) {
      if (!filters.agencies.some((agency) => classification.agencies.includes(agency))) continue;
    }
    if (filters.overseasOnly && classification.geographicScope !== 'overseas') continue;
    if (filters.directQuoteOnly && !classification.directQuote) continue;

    if (filters.readFilter === 'unread' && personal.read[article.url]) continue;
    if (filters.readFilter === 'new' && !isNewSinceLastVisit(article, personal.previousVisitAt)) {
      continue;
    }
    if (filters.reviewStatuses.length > 0) {
      const status = personal.review[article.url] ?? 'unread';
      if (!filters.reviewStatuses.includes(status)) continue;
    }
    if (filters.bookmarkedOnly && !personal.bookmarks[article.url]) continue;
    if (filters.inReportOnly && !personal.report.includes(article.url)) continue;

    const searchHit = matchSearch(article, term);
    if (searchHit === 'none') continue;

    result.push({ group, searchHit });
  }

  return result;
}

export function sortGroups(
  items: FilteredGroup[],
  sort: SortKey,
  personal: PersonalState,
): FilteredGroup[] {
  const sorted = [...items];

  /** PRD 5-1의 기본 정렬: 점수 내림차순, 동점이면 발행일 최신순 */
  const byRelevance = (a: FilteredGroup, b: FilteredGroup) =>
    b.group.representative.relevanceScore - a.group.representative.relevanceScore ||
    b.group.representative.publishedAt.localeCompare(a.group.representative.publishedAt);

  switch (sort) {
    case 'latest':
      sorted.sort(
        (a, b) =>
          b.group.representative.publishedAt.localeCompare(a.group.representative.publishedAt) ||
          byRelevance(a, b),
      );
      break;
    case 'urgency':
      sorted.sort(
        (a, b) =>
          URGENCY_RANK[b.group.representative.classification.urgency] -
            URGENCY_RANK[a.group.representative.classification.urgency] || byRelevance(a, b),
      );
      break;
    case 'company-voice':
      sorted.sort((a, b) => {
        const rank = (item: FilteredGroup) =>
          item.group.representative.classification.evidenceType === 'company-direct'
            ? 2
            : item.group.representative.classification.evidenceType === 'association-direct'
              ? 1
              : 0;
        return rank(b) - rank(a) || byRelevance(a, b);
      });
      break;
    case 'unreviewed':
      sorted.sort((a, b) => {
        const rank = (item: FilteredGroup) =>
          personal.read[item.group.representative.url] ? 0 : 1;
        return rank(b) - rank(a) || byRelevance(a, b);
      });
      break;
    case 'publisher-diversity': {
      // 같은 언론사가 연달아 나오지 않게 라운드로빈으로 다시 깐다
      sorted.sort(byRelevance);
      const byPublisher = new Map<string, FilteredGroup[]>();
      sorted.forEach((item) => {
        const key = item.group.representative.publisher;
        byPublisher.set(key, [...(byPublisher.get(key) ?? []), item]);
      });
      const queues = [...byPublisher.values()];
      const mixed: FilteredGroup[] = [];
      while (mixed.length < sorted.length) {
        queues.forEach((queue) => {
          const next = queue.shift();
          if (next) mixed.push(next);
        });
      }
      return mixed;
    }
    default:
      sorted.sort(byRelevance);
  }

  return sorted;
}

/** 상단 지표 카드 하나 */
export type Metric = {
  id: string;
  label: string;
  value: number;
  /** 보조 설명. 계산 근거를 짧게 남긴다 */
  hint: string;
  /** 클릭 시 적용할 필터 (없으면 클릭 불가) */
  filters?: Partial<DashboardFilters>;
  /** 클릭 시 이동할 경로. filters와 배타적이며, 있으면 카드가 링크로 렌더링된다 */
  href?: string;
  /** 0~1. 막대 길이로만 쓰고 없는 값은 만들지 않는다 */
  ratio?: number;
};

export type MetricInput = {
  groups: EnrichedGroup[];
  personal: PersonalState;
  totalArticles: number;
  collectedToday: number;
  clusterCount: number;
};

export function buildMetrics({
  groups,
  personal,
  totalArticles,
  collectedToday,
  clusterCount,
}: MetricInput): Metric[] {
  const visible = groups.filter((group) => !personal.hidden[group.representative.url]);
  const total = visible.length || 1;

  const highScore = visible.filter((group) => group.representative.relevanceScore >= 80).length;
  const companyVoice = visible.filter(
    (group) => group.representative.classification.evidenceType === 'company-direct',
  ).length;
  const tightening = visible.filter((group) =>
    group.representative.classification.issueTypes.includes('regulation-tightening'),
  ).length;
  const relaxation = visible.filter((group) =>
    group.representative.classification.issueTypes.includes('regulation-relaxation'),
  ).length;
  const unread = visible.filter((group) => !personal.read[group.representative.url]).length;

  return [
    {
      id: 'total',
      label: '저장된 기사',
      value: totalArticles,
      hint: '지금까지 저장한 대표 기사 전체 · 전체 목록 열기',
      href: '/articles',
    },
    {
      id: 'today',
      label: '오늘 수집',
      value: collectedToday,
      hint: '오늘(KST) 새로 저장된 대표 기사',
    },
    {
      id: 'high',
      label: '연관성 80점 이상',
      value: highScore,
      hint: '현재 목록에서 80점 이상',
      filters: { minScore: 80 },
      ratio: highScore / total,
    },
    {
      id: 'company',
      label: '기업 직접 발언',
      value: companyVoice,
      hint: '기업 관계자 발언이 인용된 기사',
      filters: { evidenceTypes: ['company-direct'] },
      ratio: companyVoice / total,
    },
    {
      id: 'tightening',
      label: '규제 강화',
      value: tightening,
      hint: '의무·제재·기준 강화 신호',
      filters: { issueTypes: ['regulation-tightening'] },
      ratio: tightening / total,
    },
    {
      id: 'relaxation',
      label: '규제 완화',
      value: relaxation,
      hint: '완화·특례·유예 신호',
      filters: { issueTypes: ['regulation-relaxation'] },
      ratio: relaxation / total,
    },
    {
      id: 'clusters',
      label: '이슈 군집',
      value: clusterCount,
      hint: '같은 사안으로 묶인 이슈 수',
    },
    {
      id: 'unread',
      label: '아직 열지 않음',
      value: unread,
      hint: '이 브라우저에서 열어본 적 없는 기사',
      filters: { readFilter: 'unread' },
      ratio: unread / total,
    },
  ];
}

/** 산업별 집계. 오른쪽 인사이트 패널의 막대에 쓴다 */
export type IndustryStat = {
  industry: Industry;
  count: number;
  averageScore: number;
  highScoreCount: number;
  companyVoiceCount: number;
  unreadCount: number;
};

export function buildIndustryStats(
  groups: EnrichedGroup[],
  personal: PersonalState,
): IndustryStat[] {
  const map = new Map<Industry, EnrichedArticle[]>();

  groups.forEach((group) => {
    group.representative.industries.forEach((industry) => {
      map.set(industry, [...(map.get(industry) ?? []), group.representative]);
    });
  });

  return [...map.entries()]
    .map(([industry, articles]) => ({
      industry,
      count: articles.length,
      averageScore: Math.round(
        articles.reduce((sum, article) => sum + article.relevanceScore, 0) / articles.length,
      ),
      highScoreCount: articles.filter((article) => article.relevanceScore >= 80).length,
      companyVoiceCount: articles.filter(
        (article) => article.classification.evidenceType === 'company-direct',
      ).length,
      unreadCount: articles.filter((article) => !personal.read[article.url]).length,
    }))
    .sort((a, b) => b.count - a.count || b.averageScore - a.averageScore);
}

/** 언급 주체 순위 (기업·협회·정부기관) */
export type EntityStat = {
  name: string;
  count: number;
  averageScore: number;
  latestPublishedAt: string;
  directVoiceCount: number;
};

export function buildEntityStats(
  groups: EnrichedGroup[],
  pick: (article: EnrichedArticle) => string[],
): EntityStat[] {
  const map = new Map<string, EnrichedArticle[]>();

  groups.forEach((group) => {
    pick(group.representative).forEach((name) => {
      map.set(name, [...(map.get(name) ?? []), group.representative]);
    });
  });

  return [...map.entries()]
    .map(([name, articles]) => ({
      name,
      count: articles.length,
      averageScore: Math.round(
        articles.reduce((sum, article) => sum + article.relevanceScore, 0) / articles.length,
      ),
      latestPublishedAt: articles
        .map((article) => article.publishedAt)
        .sort()
        .at(-1) as string,
      directVoiceCount: articles.filter(
        (article) => article.classification.evidenceType === 'company-direct',
      ).length,
    }))
    .sort((a, b) => b.count - a.count || b.averageScore - a.averageScore);
}

/** 이슈 유형별 최근 추세. 기준 기간과 직전 같은 기간의 건수를 비교한다 */
export type IssueTrend = {
  type: IssueType;
  label: string;
  current: number;
  previous: number;
  /** 직전 대비 증감. previous가 0이면 null (증가율을 만들지 않는다) */
  changeRatio: number | null;
};

export function buildIssueTrends(groups: EnrichedGroup[], days: number): IssueTrend[] {
  const currentStart = daysAgoDate(days);
  const previousStart = daysAgoDate(days * 2);

  const counts = new Map<IssueType, { current: number; previous: number }>();

  groups.forEach((group) => {
    const { publishedAt, classification } = group.representative;
    const bucket =
      publishedAt >= currentStart ? 'current' : publishedAt >= previousStart ? 'previous' : null;
    if (!bucket) return;

    classification.issueTypes.forEach((type) => {
      const entry = counts.get(type) ?? { current: 0, previous: 0 };
      entry[bucket] += 1;
      counts.set(type, entry);
    });
  });

  return [...counts.entries()]
    .map(([type, entry]) => ({
      type,
      label: ISSUE_TYPE_LABELS[type],
      current: entry.current,
      previous: entry.previous,
      changeRatio: entry.previous === 0 ? null : (entry.current - entry.previous) / entry.previous,
    }))
    .filter((trend) => trend.current > 0)
    .sort((a, b) => b.current - a.current);
}

/** 수집 신선도. 실제 수집 주기(하루 1회)를 기준으로 판정한다 */
export type Freshness = 'fresh' | 'delayed' | 'stale' | 'unknown';

export const FRESHNESS_LABELS: Record<Freshness, string> = {
  fresh: '최신',
  delayed: '수집 지연',
  stale: '업데이트 필요',
  unknown: '수집 이력 없음',
};

/**
 * PRD 5-1의 자동 수집 주기는 하루 1회(오전 8시 KST)다.
 * 그 주기를 기준으로 26시간(하루 + 여유 2시간)까지는 정상, 그 뒤로는 지연,
 * 이틀이 넘으면 업데이트 필요로 본다.
 */
export function collectionFreshness(lastSuccessAt: string | null, now = new Date()): Freshness {
  if (!lastSuccessAt) return 'unknown';
  const elapsedHours = (now.getTime() - new Date(lastSuccessAt).getTime()) / (60 * 60 * 1000);
  if (elapsedHours <= 26) return 'fresh';
  if (elapsedHours <= 48) return 'delayed';
  return 'stale';
}
