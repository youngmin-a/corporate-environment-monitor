'use client';

import { useEffect, useRef, useState } from 'react';
import type { DashboardFilters, Metric } from '@/lib/dashboard';

/** 숫자가 처음 보일 때 한 번만 세어 올린다 (reduced-motion이면 즉시 표시) */
function useCountUp(value: number): number {
  const [shown, setShown] = useState(value);
  const previous = useRef(value);
  const frame = useRef<number>(0);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const from = previous.current;
    previous.current = value;

    if (reduce || from === value) {
      setShown(value);
      return;
    }

    const start = performance.now();
    const duration = 620;

    const tick = (time: number) => {
      const progress = Math.min(1, (time - start) / duration);
      // 끝에서 부드럽게 감속
      const eased = 1 - Math.pow(1 - progress, 3);
      setShown(Math.round(from + (value - from) * eased));
      if (progress < 1) frame.current = requestAnimationFrame(tick);
    };

    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [value]);

  return shown;
}

function MetricCard({
  metric,
  active,
  onApply,
}: {
  metric: Metric;
  active: boolean;
  onApply: (filters: Partial<DashboardFilters>) => void;
}) {
  const shown = useCountUp(metric.value);
  const clickable = Boolean(metric.filters);

  const content = (
    <>
      <span className="metric-card__label">{metric.label}</span>
      <span className="metric-card__value">{shown.toLocaleString()}</span>
      {typeof metric.ratio === 'number' && (
        <span aria-hidden="true" className="metric-card__bar">
          <span
            className="metric-card__bar-fill"
            style={{ width: `${Math.min(100, Math.round(metric.ratio * 100))}%` }}
          />
        </span>
      )}
      <span className="metric-card__hint">{metric.hint}</span>
    </>
  );

  if (!clickable) {
    return (
      <div className="metric-card" data-static="true">
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onApply(metric.filters as Partial<DashboardFilters>)}
      aria-pressed={active}
      className={`metric-card ${active ? 'is-active' : ''}`}
    >
      {content}
    </button>
  );
}

/**
 * 핵심 지표 카드.
 *
 * 모든 값은 현재 화면에 내려온 데이터나 서버 count로 계산한다 — 데이터가 없는
 * 지표는 아예 만들지 않는다. 클릭하면 그 조건이 필터로 적용된다.
 */
export function MetricCards({
  metrics,
  activeIds,
  onApply,
}: {
  metrics: Metric[];
  activeIds: string[];
  onApply: (filters: Partial<DashboardFilters>) => void;
}) {
  return (
    <section aria-label="핵심 지표" className="metric-row mt-4">
      {metrics.map((metric) => (
        <MetricCard
          key={metric.id}
          metric={metric}
          active={activeIds.includes(metric.id)}
          onApply={onApply}
        />
      ))}
    </section>
  );
}
