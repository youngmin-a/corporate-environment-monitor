import { ALL_INDUSTRIES, type Industry } from '@/lib/industries';
import { MAX_VISIBLE_ARTICLES, MIN_RELEVANCE_SCORE, toRelevanceScore } from '@/lib/relevance';
import { supabase } from '@/lib/supabase';
import type { Article, ArticleGroup, CollectionState } from '@/types/article';

/** Supabase `articles` 행의 원래 컬럼 이름(snake_case) */
type ArticleRow = {
  url: string;
  title: string;
  press: string;
  published_at: string;
  summary: string[] | null;
  /** 마이그레이션 이전에 저장된 행에는 없으므로 undefined도 올 수 있다 */
  expanded_summary?: string[] | null;
  collected_at: string;
  group_id: string | null;
  industries: unknown;
  relevance_score: unknown;
};

/** 확장 요약은 값이 없거나 빈 배열이면 "없음"으로 본다 (PRD 5-2-1) */
function toExpandedSummary(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const lines = value.map((line) => String(line).trim()).filter((line) => line.length > 0);
  return lines.length > 0 ? lines : null;
}

/** 값이 없거나 올바른 배열이 아니면 빈 배열로 처리한다 (PRD 5-3) */
function toIndustries(value: unknown): Industry[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Industry => ALL_INDUSTRIES.includes(item as Industry));
}

function toArticle(row: ArticleRow): Article {
  return {
    url: row.url,
    title: row.title,
    press: row.press,
    publishedAt: row.published_at,
    summary: row.summary,
    expandedSummary: toExpandedSummary(row.expanded_summary),
    collectedAt: row.collected_at,
    groupId: row.group_id,
    industries: toIndustries(row.industries),
    relevanceScore: toRelevanceScore(row.relevance_score),
  };
}

/**
 * 화면 기본 표시 범위인 최근 N일치 기사를 대표 기사 단위로 묶어 가져온다
 * (PRD 5-1: "화면 기본 표시는 최근 7일").
 *
 * 대표 기사만 먼저 "60점 이상 → 점수 내림차순 → 발행일 최신순 → 상위 30건"으로
 * 뽑고, 거기 묶인 관련 기사를 따로 붙인다. 대표와 관련 기사를 한 번에 조회하면
 * 관련 기사가 상한 30건을 잡아먹어 카드 수가 줄어들기 때문이다.
 *
 * 관련 기사에는 점수 조건을 걸지 않는다 — 카드 안에서 제목·링크만 보여주는
 * 부속 정보라 대표 기사의 노출 여부만 판단하면 충분하다.
 */
export async function getRecentArticleGroups(days = 7): Promise<ArticleGroup[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceDate = since.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('articles')
    .select('*')
    .gte('published_at', sinceDate)
    .is('group_id', null)
    .gte('relevance_score', MIN_RELEVANCE_SCORE)
    .order('relevance_score', { ascending: false })
    .order('published_at', { ascending: false })
    .limit(MAX_VISIBLE_ARTICLES);

  if (error) throw error;

  const representatives = (data ?? []).map(toArticle);
  if (representatives.length === 0) return [];

  const { data: relatedData, error: relatedError } = await supabase
    .from('articles')
    .select('*')
    .in(
      'group_id',
      representatives.map((item) => item.url),
    )
    .order('published_at', { ascending: false });

  if (relatedError) throw relatedError;

  const related = (relatedData ?? []).map(toArticle);

  return representatives.map((representative) => ({
    representative,
    related: related.filter((row) => row.groupId === representative.url),
  }));
}

/**
 * PRD 5-1: 이미 수집한 적 있는 기사는 다시 담지 않는다.
 * 후보 URL 중 DB에 이미 있는 것들을 골라 돌려준다.
 */
export async function findExistingUrls(urls: string[]): Promise<Set<string>> {
  if (urls.length === 0) return new Set();

  const found = new Set<string>();
  // URL이 길어 쿼리 문자열 한도에 걸리지 않도록 나눠서 조회한다
  const chunkSize = 100;
  for (let i = 0; i < urls.length; i += chunkSize) {
    const chunk = urls.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from('articles')
      .select('url')
      .in('url', chunk);
    if (error) throw error;
    for (const row of data ?? []) found.add(row.url as string);
  }
  return found;
}

/** 저장할 기사 한 건 (DB 컬럼 이름 그대로) */
export type ArticleInsert = {
  url: string;
  title: string;
  press: string;
  published_at: string;
  summary: string[] | null;
  expanded_summary: string[] | null;
  group_id: string | null;
  industries: Industry[];
  relevance_score: number;
};

/**
 * 수집한 기사를 저장한다.
 *
 * 대표 기사를 먼저 넣고 묶인 기사를 나중에 넣는다 — group_id가 대표 기사의 url을
 * 참조하는 외래 키라, 순서가 뒤바뀌면 저장에 실패한다.
 */
export async function saveArticles(rows: ArticleInsert[]): Promise<number> {
  if (rows.length === 0) return 0;

  const representatives = rows.filter((row) => row.group_id === null);
  const related = rows.filter((row) => row.group_id !== null);

  for (const batch of [representatives, related]) {
    if (batch.length === 0) continue;
    const { error } = await supabase
      .from('articles')
      .upsert(batch, { onConflict: 'url' });
    if (error) throw error;
  }

  return representatives.length;
}

/**
 * AI 분석관 검색용 전체 후보 조회 (DESIGN.md 6장).
 *
 * `getRecentArticleGroups()`와 달리 최근 7일·상위 30건 제한을 두지 않는다 —
 * 사용자가 "지난달"·"특정 기업 시간순" 같은 질문을 하면 화면 목록보다 넓은 범위를
 * 뒤져야 하기 때문이다. 다만 연관성 60점 미만은 여기서도 걸러낸다 — 이 서비스가
 * "기업 규제·애로 연관성"을 정의하는 최소 기준이지, 화면 노출용으로만 정한 값이
 * 아니기 때문이다(사용자 질문으로도 이 기준 아래로는 내려가지 않는다).
 *
 * limit은 안전장치일 뿐 사실상 전체 조회다 — 지금 규모(수백 건)에서는 이렇게 한
 * 번에 가져와 메모리에서 점수를 매기는 편이 벡터 인덱스보다 단순하고 충분히
 * 빠르다. 데이터가 수만 건 규모로 커지면 이 함수부터 페이지네이션이 필요하다.
 */
export async function getAllArticleGroupsForSearch(limit = 1000): Promise<ArticleGroup[]> {
  const { data, error } = await supabase
    .from('articles')
    .select('*')
    .is('group_id', null)
    .gte('relevance_score', MIN_RELEVANCE_SCORE)
    .order('relevance_score', { ascending: false })
    .order('published_at', { ascending: false })
    .limit(limit);

  if (error) throw error;

  const representatives = (data ?? []).map(toArticle);
  if (representatives.length === 0) return [];

  const { data: relatedData, error: relatedError } = await supabase
    .from('articles')
    .select('*')
    .in(
      'group_id',
      representatives.map((item) => item.url),
    )
    .order('published_at', { ascending: false });

  if (relatedError) throw relatedError;

  const related = (relatedData ?? []).map(toArticle);

  return representatives.map((representative) => ({
    representative,
    related: related.filter((row) => row.groupId === representative.url),
  }));
}

export type ArticleArchiveSort = 'latest' | 'relevance';

export type ArticleArchivePage = {
  groups: ArticleGroup[];
  /** 현재 페이지 조건(산업 필터 포함)에 해당하는 기사 수. 전체 저장 건수와는 다르다 */
  filteredCount: number;
  page: number;
  pageSize: number;
};

/**
 * "전체 기사" 탐색 화면용 서버 페이지네이션 조회 (일회성 확장 요구사항).
 *
 * `getRecentArticleGroups()`와 달리 최근 7일 제한이 없고, 상한도 화면 기본
 * 목록(MAX_VISIBLE_ARTICLES)이 아니라 페이지 단위로 넘긴다. 152건 전체를 한 번에
 * 클라이언트로 내려보내지 않고 Supabase `range()`로 필요한 페이지만 가져온다.
 */
export async function getArticleGroupsPage({
  page,
  industry,
  sort,
  pageSize = MAX_VISIBLE_ARTICLES,
}: {
  page: number;
  industry: Industry | null;
  sort: ArticleArchiveSort;
  pageSize?: number;
}): Promise<ArticleArchivePage> {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('articles')
    .select('*', { count: 'exact' })
    .is('group_id', null)
    .gte('relevance_score', MIN_RELEVANCE_SCORE);

  if (industry) query = query.contains('industries', [industry]);

  query =
    sort === 'latest'
      ? query.order('published_at', { ascending: false }).order('relevance_score', { ascending: false })
      : query.order('relevance_score', { ascending: false }).order('published_at', { ascending: false });

  const { data, error, count } = await query.range(from, to);
  if (error) throw error;

  const filteredCount = count ?? 0;
  const representatives = (data ?? []).map(toArticle);

  if (representatives.length === 0) {
    return { groups: [], filteredCount, page, pageSize };
  }

  const { data: relatedData, error: relatedError } = await supabase
    .from('articles')
    .select('*')
    .in(
      'group_id',
      representatives.map((item) => item.url),
    )
    .order('published_at', { ascending: false });

  if (relatedError) throw relatedError;

  const related = (relatedData ?? []).map(toArticle);

  return {
    groups: representatives.map((representative) => ({
      representative,
      related: related.filter((row) => row.groupId === representative.url),
    })),
    filteredCount,
    page,
    pageSize,
  };
}

/**
 * 대시보드 상단 지표용 집계 (DESIGN.md 3-2).
 *
 * 화면에 내려온 30건만으로는 알 수 없는 "전체 규모"만 서버에서 센다. head 조회로
 * count만 받아 오므로 기사 본문을 다시 내려받지 않는다. 화면에서 계산할 수 있는
 * 지표(점수 분포·이슈 유형 등)는 여기서 세지 않는다.
 */
export type ArticleStats = {
  /** 저장된 대표 기사 총 건수 */
  totalArticles: number;
  /** 오늘(KST) 수집된 대표 기사 수 */
  collectedToday: number;
  /** 최근 7일 안에 발행된 대표 기사 수 (목록 상한과 무관한 실제 모수) */
  recentArticles: number;
};

export async function getArticleStats(days = 7): Promise<ArticleStats> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceDate = since.toISOString().slice(0, 10);

  // KST 자정을 UTC 시각으로 바꿔 오늘 수집분을 센다
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const kstMidnightUtc = new Date(
    Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate()) - 9 * 60 * 60 * 1000,
  ).toISOString();

  const base = () => supabase.from('articles').select('url', { count: 'exact', head: true }).is('group_id', null);

  const [total, today, recent] = await Promise.all([
    base(),
    base().gte('collected_at', kstMidnightUtc),
    base().gte('published_at', sinceDate).gte('relevance_score', MIN_RELEVANCE_SCORE),
  ]);

  return {
    totalArticles: total.count ?? 0,
    collectedToday: today.count ?? 0,
    recentArticles: recent.count ?? 0,
  };
}

export async function getCollectionState(): Promise<CollectionState> {
  const { data, error } = await supabase
    .from('collection_state')
    .select('*')
    .eq('id', 1)
    .single();

  if (error) throw error;

  return {
    lastAttemptAt: data.last_attempt_at,
    lastSuccessAt: data.last_success_at,
    todayDate: data.today_date,
    todayNewCount: data.today_new_count,
    initialBackfillDone: data.initial_backfill_done,
  };
}
