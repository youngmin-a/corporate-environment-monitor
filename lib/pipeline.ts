import { findExistingUrls, saveArticles, type ArticleInsert } from '@/lib/articles';
import {
  filterCandidates,
  groupDuplicates,
  isLinkAlive,
  rankCandidates,
  type ExcludedSample,
} from '@/lib/collector';
import {
  COOLDOWN_MINUTES,
  isCooldownOver,
  markAttempt,
  markSuccess,
  readState,
  remainingQuota,
} from '@/lib/collectionState';
import { ALL_INDUSTRIES, type Industry } from '@/lib/industries';
import { fetchAllCandidates } from '@/lib/naver';
import { MAX_VISIBLE_ARTICLES } from '@/lib/relevance';
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
 * 않고 MAX_VISIBLE_ARTICLES까지 한 번에 가져온다 (PLAN, item 3).
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
    /** 연관성 판정(필수 조건·60점 미만)에서 제외된 표본 (보고용) */
    excludedSamples: ExcludedSample[];
  };
};

/**
 * 수집 → 요약 → 저장 (DESIGN.md 2-1, PLAN 14번).
 *
 * 순서는 PRD 4번을 그대로 따른다:
 *   여유분 확인 → 네이버 호출 → 기간 필터 → 산업 분류·연관성 점수 계산
 *   → 필수 통과 조건·60점 미만 제외 → 기수집 URL 제외 → 링크 확인
 *   → 중복 묶기 → 점수순 상위 30건 컷 → 요약 → 저장
 *
 * 60점 미만을 요약보다 앞에서 자르는 것이 핵심이다 — 요약이 유일한 유료 호출이라
 * 관련성 낮은 기사에 비용을 쓰지 않기 위해서다. 중복도 상한 컷보다 먼저 묶어야
 * 상한이 실제 사안 수를 뜻하게 된다.
 */
export async function runCollection(mode: CollectionMode = 'operational'): Promise<CollectResult> {
  let quota: number;

  if (mode === 'operational') {
    const state = await readState();
    quota = remainingQuota(state);

    // 여유분이 없으면 외부 API를 아예 부르지 않는다 (호출·비용 절약)
    if (quota <= 0) {
      return { saved: 0, skipped: `오늘 수집 상한(${MAX_VISIBLE_ARTICLES}건)에 도달했습니다.` };
    }

    // PRD 5-1: 수동 새로고침 쿨다운은 반드시 서버에서 강제한다.
    // 화면 쪽 검증만으로는 API를 직접 부르면 그대로 통과한다.
    if (!isCooldownOver(state)) {
      return { saved: 0, skipped: `수집 쿨다운 중입니다. ${COOLDOWN_MINUTES}분 뒤에 다시 시도해 주세요.` };
    }

    await markAttempt();
  } else {
    quota = MAX_VISIBLE_ARTICLES;
  }

  const raw = await fetchAllCandidates();
  const { candidates: filtered, excludedSamples } = filterCandidates(raw);

  const existingUrls = await findExistingUrls(filtered.map((item) => item.url));
  const unseen = filtered.filter((item) => !existingUrls.has(item.url));

  const alive = await filterAliveLinks(unseen);
  // rankCandidates가 점수순이므로 각 묶음의 대표는 자동으로 "점수 높고 최신인" 기사가 된다
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
      summary: summaries[index].lines,
      // PRD 5-2-1: 상세용 확장 요약은 같은 응답에서 함께 받는다 (추가 호출 없음)
      expanded_summary: summaries[index].expandedLines,
      group_id: null,
      industries: group.representative.industries,
      relevance_score: group.representative.score,
    });
    for (const item of group.related) {
      rows.push({
        url: item.url,
        title: item.title,
        press: item.press,
        published_at: item.publishedAt,
        // PRD 5-2: 요약은 대표 기사 1건에만 만든다
        summary: null,
        expanded_summary: null,
        group_id: group.representative.url,
        industries: item.industries,
        relevance_score: item.score,
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
      summaryFailed: summaries.filter((summary) => summary.lines === null).length,
      byIndustry,
      excludedSamples,
    },
  };
}
