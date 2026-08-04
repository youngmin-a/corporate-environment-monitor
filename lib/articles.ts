import { ALL_INDUSTRIES, type Industry } from '@/lib/industries';
import { supabase } from '@/lib/supabase';
import type { Article, ArticleGroup, CollectionState } from '@/types/article';

/** Supabase `articles` 행의 원래 컬럼 이름(snake_case) */
type ArticleRow = {
  url: string;
  title: string;
  press: string;
  published_at: string;
  summary: string[] | null;
  collected_at: string;
  group_id: string | null;
  industries: unknown;
};

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
    collectedAt: row.collected_at,
    groupId: row.group_id,
    industries: toIndustries(row.industries),
  };
}

/**
 * 화면 기본 표시 범위인 최근 N일치 기사를 대표 기사 단위로 묶어 가져온다
 * (PRD 5-1: "화면 기본 표시는 최근 7일").
 *
 * 대표 기사가 이 기간 밖에 있어 함께 조회되지 않은 중복 기사는 표시하지 않는다 —
 * 요약이 없는 기사를 단독 카드로 보여주지 않기 위해서다.
 */
export async function getRecentArticleGroups(days = 7): Promise<ArticleGroup[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceDate = since.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('articles')
    .select('*')
    .gte('published_at', sinceDate)
    .order('published_at', { ascending: false });

  if (error) throw error;

  const rows = (data ?? []).map(toArticle);

  const groups: ArticleGroup[] = [];
  for (const item of rows) {
    if (item.groupId) continue; // 대표 기사가 아니면 건너뛴다 — 아래에서 대표에 붙인다
    const related = rows.filter((row) => row.groupId === item.url);
    groups.push({ representative: item, related });
  }
  return groups;
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
  group_id: string | null;
  industries: Industry[];
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
