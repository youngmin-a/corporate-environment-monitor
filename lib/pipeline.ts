import { findExistingUrls, saveArticles, type ArticleInsert } from '@/lib/articles';
import {
  BACKFILL_LIMIT,
  OPERATIONAL_DAILY_LIMIT,
  filterCandidates,
  groupDuplicates,
  isLinkAlive,
  rankCandidates,
  selectWithIndustryQuota,
  type ExcludedSample,
} from '@/lib/collector';
import { markAttempt, markSuccess, readState, remainingQuota } from '@/lib/collectionState';
import { ALL_INDUSTRIES, type Industry } from '@/lib/industries';
import { fetchAllCandidates } from '@/lib/naver';
import { summarizeAll } from '@/lib/summarize';

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

/**
 * 운영 수집(operational)은 Vercel Cron·수동 새로고침이 쓰며 쿨다운·하루 상한이 적용된다.
 * 백필 수집(backfill)은 로컬 CLI 스크립트 전용이며 쿨다운·today_new_count를 건드리지
 * 않고 BACKFILL_LIMIT까지 한 번에 가져온다 (PLAN, item 3).
 */
export type CollectionMode = 'operational' | 'backfill';

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
    /** 대표 기사 기준 산업별 건수. 다중 산업 기사는 각 산업에 모두 집계한다 */
    byIndustry: Record<Industry, number>;
    /** 산업 검색발 기사 중 관련성 점수·산업 미달로 제외된 표본 (보고용) */
    excludedSamples: ExcludedSample[];
  };
};

/**
 * 수집 → 요약 → 저장 (DESIGN.md 2-1, PLAN 14번).
 *
 * 순서는 PRD 4번을 그대로 따른다:
 *   여유분 확인 → 네이버 호출 → 필터(기간·점수제) → 기수집 URL 제외
 *   → 링크 확인 → 중복 묶기 → 산업별 우선 쿠터 + 관련도순 컷 → 요약 → 저장
 *
 * 중복을 상한 컷보다 먼저 묶어야 상한이 실제 사안 수를 뜻하게 된다.
 */
export async function runCollection(mode: CollectionMode = 'operational'): Promise<CollectResult> {
  let quota: number;

  if (mode === 'operational') {
    const state = await readState();
    quota = remainingQuota(state);

    // 여유분이 없으면 외부 API를 아예 부르지 않는다 (호출·비용 절약)
    if (quota <= 0) {
      return { saved: 0, skipped: `오늘 수집 상한(${OPERATIONAL_DAILY_LIMIT}건)에 도달했습니다.` };
    }

    await markAttempt();
  } else {
    quota = BACKFILL_LIMIT;
  }

  const raw = await fetchAllCandidates();
  const { candidates: filtered, excludedSamples } = filterCandidates(raw);

  const existingUrls = await findExistingUrls(filtered.map((item) => item.url));
  const unseen = filtered.filter((item) => !existingUrls.has(item.url));

  const alive = await filterAliveLinks(unseen);
  const allGroups = groupDuplicates(rankCandidates(alive));
  const groups = selectWithIndustryQuota(allGroups, quota);

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
      industries: group.representative.industries,
    });
    for (const item of group.related) {
      rows.push({
        url: item.url,
        title: item.title,
        press: item.press,
        published_at: item.publishedAt,
        summary: null,
        group_id: group.representative.url,
        industries: item.industries,
      });
    }
  });

  const saved = await saveArticles(rows);

  if (mode === 'operational') {
    // 부분 성공이어도 마지막 성공 시각을 갱신한다 — 장애를 알아채는 유일한 수단이다
    await markSuccess(saved);
  }

  const byIndustry = Object.fromEntries(ALL_INDUSTRIES.map((industry) => [industry, 0])) as Record<
    Industry,
    number
  >;
  for (const group of groups) {
    group.representative.industries.forEach((industry) => {
      byIndustry[industry] += 1;
    });
  }

  return {
    saved,
    stats: {
      raw: raw.length,
      filtered: filtered.length,
      unseen: unseen.length,
      alive: alive.length,
      groups: groups.length,
      summaryFailed: summaries.filter((summary) => summary === null).length,
      byIndustry,
      excludedSamples,
    },
  };
}
