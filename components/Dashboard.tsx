'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AgentEntryButton } from '@/components/AgentEntryButton';
import { AgentPanel } from '@/components/AgentPanel';
import { ArticleCard } from '@/components/ArticleCard';
import { ArticleDetailDialog, type DetailOrigin } from '@/components/ArticleDetailDialog';
import { CommandCenter } from '@/components/CommandCenter';
import { FilterDrawer } from '@/components/FilterDrawer';
import { FilterToolbar } from '@/components/FilterToolbar';
import { InsightPanel } from '@/components/InsightPanel';
import { InsightStrip, type InsightItem } from '@/components/InsightStrip';
import { MetricCards } from '@/components/MetricCards';
import { ReportPanel } from '@/components/ReportPanel';
import { buildIssueClusters, multiMemberClusters } from '@/lib/clustering';
import {
  buildEntityStats,
  buildIndustryStats,
  buildIssueTrends,
  buildMetrics,
  DEFAULT_FILTERS,
  filterGroups,
  isNewSinceLastVisit,
  sortGroups,
  type DashboardFilters,
} from '@/lib/dashboard';
import { enrichGroups } from '@/lib/enrich';
import {
  personalActions,
  reviewStatusOf,
  usePersonalState,
  type SavedView,
} from '@/lib/personalState';
import type { ArticleGroup, EnrichedGroup } from '@/types/article';

/** 한 번에 그리는 카드 수. 더 보기로 늘린다 */
const PAGE_SIZE = 20;

type Props = {
  groups: ArticleGroup[];
  lastSuccessAt: string | null;
  totalArticles: number;
  collectedToday: number;
};

export function Dashboard({ groups, lastSuccessAt, totalArticles, collectedToday }: Props) {
  const personal = usePersonalState();
  const [filters, setFilters] = useState<DashboardFilters>(DEFAULT_FILTERS);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [agentOpen, setAgentOpen] = useState(false);
  const agentEntryButtonRef = useRef<HTMLButtonElement>(null);
  const [trendDays, setTrendDays] = useState(7);
  const [selected, setSelected] = useState<string[]>([]);
  const [detail, setDetail] = useState<{ group: EnrichedGroup; origin: DetailOrigin } | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [isFading, setIsFading] = useState(false);

  const detailTriggerRef = useRef<HTMLElement | null>(null);
  const shouldRestoreFocusRef = useRef(false);
  const fadeTimerRef = useRef<number>(0);

  // 방문 시각은 마운트 때 한 번만 갱신한다 ("마지막 방문 이후" 판정 기준)
  useEffect(() => {
    personalActions.touchVisit();
  }, []);

  useEffect(() => () => window.clearTimeout(fadeTimerRef.current), []);

  /** 분류·점수 근거·언론사명은 목록이 바뀔 때만 계산한다 */
  const enriched = useMemo(() => enrichGroups(groups), [groups]);

  const filtered = useMemo(
    () => filterGroups(enriched, filters, personal),
    [enriched, filters, personal],
  );
  const sorted = useMemo(
    () => sortGroups(filtered, filters.sort, personal),
    [filtered, filters.sort, personal],
  );

  const clusters = useMemo(
    () => buildIssueClusters(sorted.map((item) => item.group)),
    [sorted],
  );
  const groupedClusters = useMemo(() => multiMemberClusters(clusters), [clusters]);

  const metrics = useMemo(
    () =>
      buildMetrics({
        groups: enriched,
        personal,
        totalArticles,
        collectedToday,
        clusterCount: groupedClusters.length,
      }),
    [enriched, personal, totalArticles, collectedToday, groupedClusters.length],
  );

  const industryStats = useMemo(
    () => buildIndustryStats(sorted.map((item) => item.group), personal),
    [sorted, personal],
  );
  const trends = useMemo(
    () => buildIssueTrends(enriched, trendDays),
    [enriched, trendDays],
  );
  const agencyStats = useMemo(
    () => buildEntityStats(enriched, (article) => article.classification.agencies),
    [enriched],
  );
  const associationStats = useMemo(
    () => buildEntityStats(enriched, (article) => article.classification.associations),
    [enriched],
  );
  const companyStats = useMemo(
    () => buildEntityStats(enriched, (article) => article.classification.companies),
    [enriched],
  );

  const publishers = useMemo(
    () => [...new Set(enriched.map((group) => group.representative.publisher))].sort(),
    [enriched],
  );
  const agencyNames = useMemo(() => agencyStats.map((stat) => stat.name), [agencyStats]);

  const newSinceLastVisit = useMemo(
    () =>
      enriched.filter((group) =>
        isNewSinceLastVisit(group.representative, personal.previousVisitAt),
      ).length,
    [enriched, personal.previousVisitAt],
  );

  const reportArticles = useMemo(() => {
    const byUrl = new Map(enriched.map((group) => [group.representative.url, group.representative]));
    return personal.report
      .map((url) => byUrl.get(url))
      .filter((article): article is NonNullable<typeof article> => Boolean(article));
  }, [enriched, personal.report]);

  /** 상단 이슈 스트립. 근거가 되는 기사가 실제로 있을 때만 카드를 만든다 */
  const insights = useMemo<InsightItem[]>(() => {
    const items: InsightItem[] = [];
    const top = sorted[0]?.group.representative;

    if (top) {
      items.push({
        id: 'top',
        kind: '오늘의 핵심 이슈',
        title: top.title,
        detail: `${top.publisher} · 연관성 ${top.relevanceScore}점`,
        filters: { search: '' },
      });
    }

    const topIndustry = industryStats[0];
    if (topIndustry) {
      items.push({
        id: 'industry',
        kind: '기사가 많은 산업',
        title: topIndustry.industry,
        detail: `${topIndustry.count}건 · 평균 ${topIndustry.averageScore}점`,
        filters: { industries: [topIndustry.industry] },
      });
    }

    const topTrend = trends[0];
    if (topTrend) {
      items.push({
        id: 'trend',
        kind: `최근 ${trendDays}일 주요 이슈`,
        title: topTrend.label,
        detail:
          topTrend.changeRatio === null
            ? `${topTrend.current}건`
            : `${topTrend.current}건 · 직전 대비 ${topTrend.changeRatio > 0 ? '+' : ''}${Math.round(
                topTrend.changeRatio * 100,
              )}%`,
        filters: { issueTypes: [topTrend.type] },
      });
    }

    const topAgency = agencyStats[0];
    if (topAgency) {
      items.push({
        id: 'agency',
        kind: '많이 언급된 기관',
        title: topAgency.name,
        detail: `${topAgency.count}건 · 평균 ${topAgency.averageScore}점`,
        filters: { agencies: [topAgency.name] },
      });
    }

    if (groupedClusters.length > 0) {
      const cluster = groupedClusters[0];
      items.push({
        id: 'cluster',
        kind: '반복되는 이슈',
        title: cluster.lead.representative.title,
        detail: `${cluster.articleCount}건 · 언론사 ${cluster.publisherCount}곳`,
        filters: { search: cluster.sharedKeywords[0] ?? '' },
      });
    }

    return items.slice(0, 5);
  }, [sorted, industryStats, trends, trendDays, agencyStats, groupedClusters]);

  /** 필터가 바뀌면 짧게 흐려졌다 새 결과가 들어온다 (목록을 즉시 지우지 않는다) */
  function applyFilters(next: DashboardFilters) {
    setIsFading(true);
    setFilters(next);
    setVisibleCount(PAGE_SIZE);
    window.clearTimeout(fadeTimerRef.current);
    fadeTimerRef.current = window.setTimeout(() => setIsFading(false), 180);
  }

  function patchFilters(patch: Partial<DashboardFilters>) {
    applyFilters({ ...filters, ...patch });
  }

  function resetFilters() {
    applyFilters(DEFAULT_FILTERS);
  }

  function applySavedView(view: SavedView) {
    applyFilters({ ...DEFAULT_FILTERS, ...(view.filters as DashboardFilters) });
  }

  async function handleRefresh() {
    if (isRefreshing) return;
    setIsRefreshing(true);
    setRefreshMessage(null);

    try {
      const response = await fetch('/api/collect');
      const result = (await response.json()) as {
        saved?: number;
        skipped?: string;
        error?: string;
      };

      if (result.error) setRefreshMessage(`수집 실패: ${result.error}`);
      else if (result.skipped) setRefreshMessage(result.skipped);
      else {
        setRefreshMessage(`새 기사 ${result.saved ?? 0}건을 저장했습니다. 목록을 갱신합니다.`);
        // 저장된 기사를 보려면 서버 컴포넌트를 다시 그려야 한다
        if ((result.saved ?? 0) > 0) window.location.reload();
      }
    } catch (error) {
      setRefreshMessage(error instanceof Error ? `수집 실패: ${error.message}` : '수집 실패');
    } finally {
      setIsRefreshing(false);
    }
  }

  function handleOpenDetail(group: EnrichedGroup, origin: DetailOrigin, trigger: HTMLElement) {
    detailTriggerRef.current = trigger;
    setDetail({ group, origin });
  }

  function handleCloseDetail() {
    shouldRestoreFocusRef.current = true;
    setDetail(null);
  }

  /** 포커스 복귀는 dialog가 DOM에서 빠진 뒤에 해야 한다 (top layer 제약) */
  useEffect(() => {
    if (detail || !shouldRestoreFocusRef.current) return;
    shouldRestoreFocusRef.current = false;
    const trigger = detailTriggerRef.current;
    const target = trigger?.isConnected
      ? trigger
      : document.querySelector<HTMLElement>('[data-main-content]');
    target?.focus();
    detailTriggerRef.current = null;
  }, [detail]);

  function toggleSelect(url: string) {
    setSelected((previous) =>
      previous.includes(url) ? previous.filter((item) => item !== url) : [...previous, url],
    );
  }

  const advancedCount =
    filters.issueTypes.length +
    filters.evidenceTypes.length +
    filters.urgencies.length +
    filters.publishers.length +
    filters.agencies.length +
    filters.reviewStatuses.length +
    (filters.minScore > 0 ? 1 : 0) +
    (filters.overseasOnly ? 1 : 0) +
    (filters.directQuoteOnly ? 1 : 0) +
    (filters.inReportOnly ? 1 : 0);

  const activeMetricIds = metrics
    .filter((metric) => {
      if (!metric.filters) return false;
      return Object.entries(metric.filters).every(([key, value]) => {
        const current = filters[key as keyof DashboardFilters];
        return Array.isArray(value) && Array.isArray(current)
          ? value.every((item) => (current as unknown[]).includes(item))
          : current === value;
      });
    })
    .map((metric) => metric.id);

  const visible = sorted.slice(0, visibleCount);
  const viewMode = personal.viewMode;

  return (
    <>
      <CommandCenter
        lastSuccessAt={lastSuccessAt}
        totalArticles={totalArticles}
        collectedToday={collectedToday}
        resultCount={sorted.length}
        loadedCount={enriched.length}
        newSinceLastVisit={newSinceLastVisit}
        isRefreshing={isRefreshing}
        refreshMessage={refreshMessage}
        onRefresh={handleRefresh}
      />

      <MetricCards metrics={metrics} activeIds={activeMetricIds} onApply={patchFilters} />
      <InsightStrip items={insights} onApply={patchFilters} />

      <FilterToolbar
        filters={filters}
        onChange={applyFilters}
        onReset={resetFilters}
        resultCount={sorted.length}
        totalCount={enriched.length}
        viewMode={viewMode}
        onViewModeChange={(mode) => personalActions.setViewMode(mode)}
        onOpenAdvanced={() => setAdvancedOpen(true)}
        advancedCount={advancedCount}
        recentSearches={personal.recentSearches}
        savedViews={personal.savedViews}
        onApplySavedView={applySavedView}
      />

      <div className="dashboard-body">
        <main
          className={`dashboard-feed transition-opacity duration-200 motion-reduce:transition-none ${
            isFading ? 'opacity-60' : 'opacity-100'
          }`}
        >
          {enriched.length === 0 ? (
            <p className="empty-panel rounded-2xl py-16 text-center text-sm leading-6 text-slate-500">
              오늘 조건에 맞는 새 기사가 없습니다.
            </p>
          ) : sorted.length === 0 ? (
            <div className="empty-panel rounded-2xl px-6 py-14 text-center">
              <p className="text-sm text-slate-600">조건에 맞는 기사가 없습니다.</p>
              <p className="mt-2 text-[13px] text-slate-500">
                적용된 조건 {advancedCount + (filters.search ? 1 : 0)}개를 줄이면 결과가 늘어납니다.
              </p>
              <button
                type="button"
                onClick={resetFilters}
                className="refresh-button mt-4 inline-flex h-10 items-center rounded-full px-5 text-sm font-medium text-white"
              >
                필터 전체 초기화
              </button>
            </div>
          ) : viewMode === 'cluster' ? (
            <ul className="cluster-list">
              {clusters.map((cluster) => (
                <li key={cluster.id} className="cluster-card">
                  <div className="cluster-card__head">
                    <span className="cluster-card__count">{cluster.articleCount}건</span>
                    <span className="cluster-card__meta">
                      언론사 {cluster.publisherCount}곳 · 최고 {cluster.highestScore}점 ·{' '}
                      {cluster.firstPublishedAt} ~ {cluster.lastPublishedAt}
                    </span>
                  </div>
                  <ArticleCard
                    group={cluster.lead}
                    onOpenDetail={handleOpenDetail}
                    isNew={isNewSinceLastVisit(cluster.lead.representative, personal.previousVisitAt)}
                    isRead={Boolean(personal.read[cluster.lead.representative.url])}
                    reviewStatus={reviewStatusOf(personal, cluster.lead.representative.url)}
                    isBookmarked={Boolean(personal.bookmarks[cluster.lead.representative.url])}
                    isInReport={personal.report.includes(cluster.lead.representative.url)}
                    hasMemo={Boolean(personal.memos[cluster.lead.representative.url])}
                    isSelected={selected.includes(cluster.lead.representative.url)}
                    onToggleSelect={toggleSelect}
                    matchedInExpanded={false}
                    variant="compact"
                  />
                  {cluster.members.length > 1 && (
                    <ul className="cluster-card__members">
                      {cluster.members
                        .filter((member) => member !== cluster.lead)
                        .map((member) => (
                          <li key={member.representative.url}>
                            <ArticleCard
                              group={member}
                              onOpenDetail={handleOpenDetail}
                              isNew={isNewSinceLastVisit(
                                member.representative,
                                personal.previousVisitAt,
                              )}
                              isRead={Boolean(personal.read[member.representative.url])}
                              reviewStatus={reviewStatusOf(personal, member.representative.url)}
                              isBookmarked={Boolean(personal.bookmarks[member.representative.url])}
                              isInReport={personal.report.includes(member.representative.url)}
                              hasMemo={Boolean(personal.memos[member.representative.url])}
                              isSelected={selected.includes(member.representative.url)}
                              onToggleSelect={toggleSelect}
                              matchedInExpanded={false}
                              variant="compact"
                            />
                          </li>
                        ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <>
              <div className={viewMode === 'card' ? 'feed-grid' : 'compact-list'}>
                {visible.map(({ group, searchHit }) => (
                  <ArticleCard
                    key={group.representative.url}
                    group={group}
                    onOpenDetail={handleOpenDetail}
                    isNew={isNewSinceLastVisit(group.representative, personal.previousVisitAt)}
                    isRead={Boolean(personal.read[group.representative.url])}
                    reviewStatus={reviewStatusOf(personal, group.representative.url)}
                    isBookmarked={Boolean(personal.bookmarks[group.representative.url])}
                    isInReport={personal.report.includes(group.representative.url)}
                    hasMemo={Boolean(personal.memos[group.representative.url])}
                    isSelected={selected.includes(group.representative.url)}
                    onToggleSelect={toggleSelect}
                    matchedInExpanded={searchHit === 'expanded'}
                    variant={viewMode === 'card' ? 'card' : 'compact'}
                  />
                ))}
              </div>

              {visibleCount < sorted.length && (
                <div className="mt-5 text-center">
                  <p className="text-[13px] text-slate-500">
                    {visible.length} / {sorted.length}건 표시 중
                  </p>
                  <button
                    type="button"
                    onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
                    className="mt-2 h-11 rounded-full border border-slate-300 px-6 text-sm font-medium text-slate-700"
                  >
                    더 보기
                  </button>
                </div>
              )}
            </>
          )}
        </main>

        <InsightPanel
          industryStats={industryStats}
          trends={trends}
          trendDays={trendDays}
          onTrendDaysChange={setTrendDays}
          agencies={agencyStats}
          associations={associationStats}
          companies={companyStats}
          onApply={patchFilters}
        />
      </div>

      {/* 선택 또는 브리핑 담김이 있을 때만 하단 바를 띄운다 */}
      {(selected.length > 0 || personal.report.length > 0) && (
        <div className="action-bar" role="region" aria-label="선택한 기사 작업">
          <span className="text-sm text-white">
            {selected.length > 0 ? `${selected.length}건 선택됨` : `브리핑 ${personal.report.length}건`}
          </span>
          {selected.length > 0 && (
            <>
              <button type="button" onClick={() => personalActions.addToReport(selected)}>
                브리핑에 추가
              </button>
              <button
                type="button"
                onClick={() => selected.forEach((url) => personalActions.setReview(url, 'reviewing'))}
              >
                검토 중으로
              </button>
              <button type="button" onClick={() => personalActions.markAllRead(selected)}>
                읽음 처리
              </button>
              <button type="button" onClick={() => setSelected([])}>
                선택 해제
              </button>
            </>
          )}
          <button type="button" className="is-primary" onClick={() => setReportOpen(true)}>
            브리핑 작성 ({personal.report.length})
          </button>
        </div>
      )}

      <FilterDrawer
        open={advancedOpen}
        filters={filters}
        onChange={applyFilters}
        onClose={() => setAdvancedOpen(false)}
        onReset={resetFilters}
        publishers={publishers}
        agencies={agencyNames}
        resultCount={sorted.length}
      />

      <ReportPanel
        open={reportOpen}
        articles={reportArticles}
        onClose={() => setReportOpen(false)}
      />

      {detail && (
        <ArticleDetailDialog
          key={detail.group.representative.url}
          group={detail.group}
          origin={detail.origin}
          searchTerm={filters.search.trim()}
          reviewStatus={reviewStatusOf(personal, detail.group.representative.url)}
          isBookmarked={Boolean(personal.bookmarks[detail.group.representative.url])}
          isInReport={personal.report.includes(detail.group.representative.url)}
          memo={personal.memos[detail.group.representative.url]?.text ?? ''}
          onClose={handleCloseDetail}
        />
      )}

      <AgentEntryButton
        ref={agentEntryButtonRef}
        onClick={() => setAgentOpen(true)}
        liftForActionBar={selected.length > 0 || personal.report.length > 0}
      />
      <AgentPanel
        open={agentOpen}
        onClose={() => {
          setAgentOpen(false);
          agentEntryButtonRef.current?.focus();
        }}
        currentIndustryScope={filters.industries}
      />
    </>
  );
}
