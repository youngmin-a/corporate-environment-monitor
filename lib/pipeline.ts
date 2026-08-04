import { findExistingUrls, saveArticles, type ArticleInsert } from '@/lib/articles';
import {
  filterCandidates,
  groupDuplicates,
  isLinkAlive,
  rankCandidates,
} from '@/lib/collector';
import { markAttempt, markSuccess, readState, remainingQuota } from '@/lib/collectionState';
import { classifyIndustries, type Industry } from '@/lib/industries';
import { fetchAllCandidates } from '@/lib/naver';
import { summarizeAll } from '@/lib/summarize';

/**
 * PRD 5-3: 산업 분류는 별도 AI 호출 없이 제목+발췌문 키워드로만 판정한다.
 * 분류 오류가 나도 수집 전체를 실패시키지 않고 빈 배열로 처리한다.
 */
function safeClassify(title: string, description: string): Industry[] {
  try {
    return classifyIndustries(title, description);
  } catch (error) {
    console.warn('산업 분류 실패:', title, error);
    return [];
  }
}

/** HEAD 요청을 한꺼번에 너무 많이 던지지 않도록 나눠서 보낸다 */
const HEAD_CONCURRENCY = 20;

async function filterAliveLinks<T extends { url: string }>(items: T[]): Promise<T[]> {
  const alive: T[] = [];
  for (let i = 0; i < items.length; i += HEAD_CONCURRENCY) {
    const batch = items.slice(i, i + HEAD_CONCURRENCY);
    const results = await Promise.all(batch.map((item) => isLinkAlive(item.url)));
    batch.forEach((item, index) => {
      if (results[index]) alive.push(item);
    });
  }
  return alive;
}

export type CollectResult = {
  saved: number;
  skipped?: string;
  stats?: {
    raw: number;
    filtered: number;
    unseen: number;
    alive: number;
    groups: number;
    summaryFailed: number;
  };
};

/**
 * 수집 → 요약 → 저장 (DESIGN.md 2-1, PLAN 14번).
 *
 * 순서는 PRD 4번을 그대로 따른다:
 *   여유분 확인 → 네이버 호출 → 필터(키워드·기간) → 기수집 URL 제외
 *   → 링크 확인 → 중복 묶기 → 관련도순 컷 → 요약 → 저장
 *
 * 중복을 20건 컷보다 먼저 묶어야 "20건"이 실제 사안 20개를 뜻하게 된다.
 */
export async function runCollection(): Promise<CollectResult> {
  const state = await readState();
  const quota = remainingQuota(state);

  // 여유분이 없으면 외부 API를 아예 부르지 않는다 (호출·비용 절약)
  if (quota <= 0) {
    return { saved: 0, skipped: '오늘 수집 상한(20건)에 도달했습니다.' };
  }

  await markAttempt();

  const raw = await fetchAllCandidates();
  const filtered = filterCandidates(raw);

  const existingUrls = await findExistingUrls(filtered.map((item) => item.url));
  const unseen = filtered.filter((item) => !existingUrls.has(item.url));

  const alive = await filterAliveLinks(unseen);
  const groups = groupDuplicates(rankCandidates(alive)).slice(0, quota);

  // PRD 5-2: 요약은 대표 기사 1건에 대해서만 만든다
  const summaries = await summarizeAll(groups.map((group) => group.representative));

  const rows: ArticleInsert[] = [];
  groups.forEach((group, index) => {
    rows.push({
      url: group.representative.url,
      title: group.representative.title,
      press: group.representative.press,
      published_at: group.representative.publishedAt,
      summary: summaries[index],
      group_id: null,
      industries: safeClassify(group.representative.title, group.representative.description),
    });
    for (const item of group.related) {
      rows.push({
        url: item.url,
        title: item.title,
        press: item.press,
        published_at: item.publishedAt,
        summary: null,
        group_id: group.representative.url,
        industries: safeClassify(item.title, item.description),
      });
    }
  });

  const saved = await saveArticles(rows);

  // 부분 성공이어도 마지막 성공 시각을 갱신한다 — 장애를 알아채는 유일한 수단이다
  await markSuccess(saved);

  return {
    saved,
    stats: {
      raw: raw.length,
      filtered: filtered.length,
      unseen: unseen.length,
      alive: alive.length,
      groups: groups.length,
      summaryFailed: summaries.filter((summary) => summary === null).length,
    },
  };
}
