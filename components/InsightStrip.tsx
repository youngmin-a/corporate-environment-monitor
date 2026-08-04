'use client';

import type { DashboardFilters } from '@/lib/dashboard';

export type InsightItem = {
  id: string;
  /** 작은 분류 라벨 */
  kind: string;
  title: string;
  detail: string;
  filters?: Partial<DashboardFilters>;
};

/**
 * 상단 이슈 분석 스트립.
 *
 * ticker처럼 계속 흐르지 않는다. 3~5개 카드를 가로로 두고 자동 회전도 하지 않으며,
 * 근거가 되는 기사가 실제로 있을 때만 카드를 만든다.
 */
export function InsightStrip({
  items,
  onApply,
}: {
  items: InsightItem[];
  onApply: (filters: Partial<DashboardFilters>) => void;
}) {
  if (items.length === 0) return null;

  return (
    <section aria-label="오늘의 이슈 요약" className="insight-strip mt-4">
      {items.map((item) => {
        const clickable = Boolean(item.filters);
        const body = (
          <>
            <span className="insight-card__kind">{item.kind}</span>
            <span className="insight-card__title">{item.title}</span>
            <span className="insight-card__detail">{item.detail}</span>
          </>
        );

        return clickable ? (
          <button
            key={item.id}
            type="button"
            onClick={() => onApply(item.filters as Partial<DashboardFilters>)}
            className="insight-card"
          >
            {body}
          </button>
        ) : (
          <div key={item.id} className="insight-card" data-static="true">
            {body}
          </div>
        );
      })}
    </section>
  );
}
