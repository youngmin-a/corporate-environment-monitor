'use client';

import { useState } from 'react';
import type { DashboardFilters, EntityStat, IndustryStat, IssueTrend } from '@/lib/dashboard';

type Props = {
  industryStats: IndustryStat[];
  trends: IssueTrend[];
  trendDays: number;
  onTrendDaysChange: (days: number) => void;
  agencies: EntityStat[];
  associations: EntityStat[];
  companies: EntityStat[];
  onApply: (filters: Partial<DashboardFilters>) => void;
};

function Bar({ ratio }: { ratio: number }) {
  return (
    <span aria-hidden="true" className="insight-bar">
      <span
        className="insight-bar__fill"
        style={{ width: `${Math.max(4, Math.min(100, Math.round(ratio * 100)))}%` }}
      />
    </span>
  );
}

function EntityList({
  items,
  emptyLabel,
  onSelect,
}: {
  items: EntityStat[];
  emptyLabel: string;
  onSelect: (name: string) => void;
}) {
  if (items.length === 0) {
    return <p className="insight-empty">{emptyLabel}</p>;
  }

  return (
    <ul className="mt-2 space-y-1">
      {items.slice(0, 6).map((item) => (
        <li key={item.name}>
          <button type="button" onClick={() => onSelect(item.name)} className="entity-row">
            <span className="entity-row__name">{item.name}</span>
            <span className="entity-row__meta">
              {item.count}건 · 평균 {item.averageScore}점
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * 오른쪽 인사이트 패널.
 *
 * 모든 수치는 현재 화면에 있는 기사에서 계산한다. 근거가 없으면 차트를 그리지 않고
 * "데이터 부족"이라고 적는다 — 빈 칸을 임의의 숫자로 채우지 않는다.
 */
export function InsightPanel({
  industryStats,
  trends,
  trendDays,
  onTrendDaysChange,
  agencies,
  associations,
  companies,
  onApply,
}: Props) {
  const [entityTab, setEntityTab] = useState<'agency' | 'association' | 'company'>('agency');
  const maxIndustryCount = Math.max(1, ...industryStats.map((stat) => stat.count));

  return (
    <aside aria-label="산업·이슈 인사이트" className="insight-panel">
      <section className="insight-section">
        <h2 className="insight-section__title">산업별 현황</h2>
        {industryStats.length === 0 ? (
          <p className="insight-empty">분류된 기사가 없어 표시할 데이터가 부족합니다.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {industryStats.map((stat) => (
              <li key={stat.industry}>
                <button
                  type="button"
                  onClick={() => onApply({ industries: [stat.industry] })}
                  className="insight-row"
                >
                  <span className="insight-row__head">
                    <span>{stat.industry}</span>
                    <span className="insight-row__value">{stat.count}건</span>
                  </span>
                  <Bar ratio={stat.count / maxIndustryCount} />
                  <span className="insight-row__meta">
                    평균 {stat.averageScore}점 · 80점 이상 {stat.highScoreCount}건 · 미열람{' '}
                    {stat.unreadCount}건
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="insight-section">
        <div className="flex items-center justify-between">
          <h2 className="insight-section__title">이슈 추세</h2>
          <div className="flex gap-1">
            {[3, 7, 30].map((days) => (
              <button
                key={days}
                type="button"
                aria-pressed={trendDays === days}
                onClick={() => onTrendDaysChange(days)}
                className={`trend-chip ${trendDays === days ? 'is-on' : ''}`}
              >
                {days}일
              </button>
            ))}
          </div>
        </div>

        {trends.length === 0 ? (
          <p className="insight-empty">해당 기간에 분류된 이슈가 없습니다.</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {trends.slice(0, 6).map((trend) => (
              <li key={trend.type}>
                <button
                  type="button"
                  onClick={() => onApply({ issueTypes: [trend.type] })}
                  className="entity-row"
                >
                  <span className="entity-row__name">{trend.label}</span>
                  <span className="entity-row__meta">
                    {trend.current}건
                    {trend.changeRatio !== null && (
                      <span
                        className={
                          trend.changeRatio > 0
                            ? 'trend-up'
                            : trend.changeRatio < 0
                              ? 'trend-down'
                              : undefined
                        }
                      >
                        {' '}
                        {trend.changeRatio > 0 ? '▲' : trend.changeRatio < 0 ? '▼' : '−'}
                        {Math.abs(Math.round(trend.changeRatio * 100))}%
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[11px] text-slate-400">
          직전 같은 기간과 비교한 값입니다. 이전 기간 기사가 없으면 증감을 표시하지 않습니다.
        </p>
      </section>

      <section className="insight-section">
        <h2 className="insight-section__title">많이 언급된 주체</h2>
        <div className="mt-2 flex gap-1">
          {(
            [
              ['agency', '정부기관'],
              ['association', '협회'],
              ['company', '기업'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={entityTab === key}
              onClick={() => setEntityTab(key)}
              className={`trend-chip ${entityTab === key ? 'is-on' : ''}`}
            >
              {label}
            </button>
          ))}
        </div>

        {entityTab === 'agency' && (
          <EntityList
            items={agencies}
            emptyLabel="요약에서 확인된 정부기관이 없습니다."
            onSelect={(name) => onApply({ agencies: [name] })}
          />
        )}
        {entityTab === 'association' && (
          <EntityList
            items={associations}
            emptyLabel="요약에서 확인된 협회가 없습니다."
            onSelect={(name) => onApply({ search: name })}
          />
        )}
        {entityTab === 'company' && (
          <EntityList
            items={companies}
            emptyLabel="요약에서 확인된 기업이 없습니다."
            onSelect={(name) => onApply({ search: name })}
          />
        )}
        <p className="mt-2 text-[11px] text-slate-400">
          저장된 요약에 실제로 등장한 고정 명칭만 셉니다.
        </p>
      </section>
    </aside>
  );
}
