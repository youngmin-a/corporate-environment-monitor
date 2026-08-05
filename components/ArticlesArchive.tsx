'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArticleCard } from '@/components/ArticleCard';
import { ArticleDetailDialog, type DetailOrigin } from '@/components/ArticleDetailDialog';
import { isNewSinceLastVisit } from '@/lib/dashboard';
import { enrichGroups } from '@/lib/enrich';
import { reviewStatusOf, usePersonalState } from '@/lib/personalState';
import type { ArticleArchiveSort } from '@/lib/articles';
import type { Industry } from '@/lib/industries';
import type { ArticleGroup, EnrichedGroup } from '@/types/article';

type Props = {
  groups: ArticleGroup[];
  /** 현재 산업 필터 조건에 해당하는 기사 수 (전체 저장 건수와는 다르다) */
  filteredCount: number;
  page: number;
  pageSize: number;
  industry: Industry | null;
  sort: ArticleArchiveSort;
};

function pageHref(page: number, industry: Industry | null, sort: ArticleArchiveSort): string {
  const params = new URLSearchParams();
  if (page > 1) params.set('page', String(page));
  if (industry) params.set('industry', industry);
  if (sort !== 'latest') params.set('sort', sort);
  const query = params.toString();
  return `/articles${query ? `?${query}` : ''}`;
}

/** 최대 7개 버튼(1 … 현재±2 … 끝) 범위로 압축한 페이지 번호 목록 */
function buildPageList(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);

  const pages = new Set<number>([1, total, current]);
  for (let offset = 1; offset <= 2; offset += 1) {
    if (current - offset >= 1) pages.add(current - offset);
    if (current + offset <= total) pages.add(current + offset);
  }

  const sorted = [...pages].sort((a, b) => a - b);
  const result: (number | 'ellipsis')[] = [];
  sorted.forEach((page, index) => {
    if (index > 0 && page - sorted[index - 1] > 1) result.push('ellipsis');
    result.push(page);
  });
  return result;
}

/**
 * 전체 기사 목록 (일회성 확장 요구사항).
 *
 * 대시보드(Dashboard.tsx)와 달리 서버가 이미 페이지 단위로 잘라 내려준 30건만
 * 다루므로, 클라이언트에서 다시 자르거나 152건 전체를 들고 있지 않는다. 카드·상세
 * dialog·개인 상태(읽음·저장·브리핑)는 대시보드와 동일한 컴포넌트를 그대로 쓴다.
 */
export function ArticlesArchive({ groups, filteredCount, page, pageSize, industry, sort }: Props) {
  const personal = usePersonalState();
  const [selected, setSelected] = useState<string[]>([]);
  const [detail, setDetail] = useState<{ group: EnrichedGroup; origin: DetailOrigin } | null>(null);
  const detailTriggerRef = useRef<HTMLElement | null>(null);
  const shouldRestoreFocusRef = useRef(false);
  const listHeadingRef = useRef<HTMLHeadingElement>(null);

  const enriched = useMemo(() => enrichGroups(groups), [groups]);
  const totalPages = Math.max(1, Math.ceil(filteredCount / pageSize));
  const rangeStart = filteredCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(filteredCount, page * pageSize);

  // 페이지·필터가 바뀔 때마다 이 컴포넌트가 새로 마운트되므로, 목록 제목으로
  // 포커스를 옮겨 스크린리더·키보드 사용자가 바뀐 결과를 바로 알 수 있게 한다
  useEffect(() => {
    listHeadingRef.current?.focus();
  }, []);

  function toggleSelect(url: string) {
    setSelected((previous) =>
      previous.includes(url) ? previous.filter((item) => item !== url) : [...previous, url],
    );
  }

  function handleOpenDetail(group: EnrichedGroup, origin: DetailOrigin, trigger: HTMLElement) {
    detailTriggerRef.current = trigger;
    setDetail({ group, origin });
  }

  function handleCloseDetail() {
    shouldRestoreFocusRef.current = true;
    setDetail(null);
  }

  useEffect(() => {
    if (detail || !shouldRestoreFocusRef.current) return;
    shouldRestoreFocusRef.current = false;
    const trigger = detailTriggerRef.current;
    const target = trigger?.isConnected ? trigger : listHeadingRef.current;
    target?.focus();
    detailTriggerRef.current = null;
  }, [detail]);

  const pageList = buildPageList(page, totalPages);

  return (
    <section aria-label="전체 기사 목록" className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 ref={listHeadingRef} tabIndex={-1} className="text-lg font-semibold text-[#202124] focus:outline-none">
          기사 목록
        </h2>
        <p aria-live="polite" className="text-[13px] text-[#5F6368]">
          {industry && (
            <>
              <strong className="text-[#202124]">{industry}</strong> 조건 {filteredCount.toLocaleString()}건 중{' '}
            </>
          )}
          {filteredCount === 0 ? '0건' : `${rangeStart}–${rangeEnd}건 표시`}
        </p>
      </div>

      {filteredCount === 0 ? (
        <div className="empty-panel mt-4 rounded-2xl px-6 py-14 text-center">
          <p className="text-sm text-slate-600">
            {industry ? `${industry} 조건에 맞는 기사가 없습니다.` : '저장된 기사가 없습니다.'}
          </p>
          {industry && (
            <Link
              href="/articles"
              className="refresh-button mt-4 inline-flex h-10 items-center rounded-full px-5 text-sm font-medium text-white"
            >
              산업 필터 해제
            </Link>
          )}
        </div>
      ) : (
        <>
          <div className="feed-grid mt-4">
            {enriched.map((group) => (
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
                matchedInExpanded={false}
                variant="card"
              />
            ))}
          </div>

          {totalPages > 1 && (
            <nav aria-label="전체 기사 페이지 이동" className="mt-6 flex flex-wrap items-center justify-center gap-1.5">
              {page <= 1 ? (
                <span aria-disabled="true" className="pager-button is-disabled">
                  이전
                </span>
              ) : (
                <Link href={pageHref(page - 1, industry, sort)} aria-label="이전 페이지" className="pager-button">
                  이전
                </Link>
              )}

              {pageList.map((entry, index) =>
                entry === 'ellipsis' ? (
                  <span key={`ellipsis-${index}`} aria-hidden="true" className="pager-ellipsis">
                    …
                  </span>
                ) : (
                  <Link
                    key={entry}
                    href={pageHref(entry, industry, sort)}
                    aria-current={entry === page ? 'page' : undefined}
                    aria-label={`${entry}페이지`}
                    className={`pager-button ${entry === page ? 'is-current' : ''}`}
                  >
                    {entry}
                  </Link>
                ),
              )}

              {page >= totalPages ? (
                <span aria-disabled="true" className="pager-button is-disabled">
                  다음
                </span>
              ) : (
                <Link href={pageHref(page + 1, industry, sort)} aria-label="다음 페이지" className="pager-button">
                  다음
                </Link>
              )}
            </nav>
          )}
        </>
      )}

      {detail && (
        <ArticleDetailDialog
          key={detail.group.representative.url}
          group={detail.group}
          origin={detail.origin}
          searchTerm=""
          reviewStatus={reviewStatusOf(personal, detail.group.representative.url)}
          isBookmarked={Boolean(personal.bookmarks[detail.group.representative.url])}
          isInReport={personal.report.includes(detail.group.representative.url)}
          memo={personal.memos[detail.group.representative.url]?.text ?? ''}
          onClose={handleCloseDetail}
        />
      )}
    </section>
  );
}
