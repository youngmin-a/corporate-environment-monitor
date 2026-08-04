'use client';

import { useState, type ChangeEvent } from 'react';
import { ArticleCard } from '@/components/ArticleCard';
import { INDUSTRY_FILTER_OPTIONS, type IndustryFilter } from '@/lib/industries';
import type { ArticleGroup } from '@/types/article';

type Props = { groups: ArticleGroup[] };

/**
 * 산업 선택 드롭다운 + 필터링된 기사 목록 (PRD 5-3).
 *
 * 시스템이 정한 8개 산업으로 이미 내려받은 기사를 거르는 고정형 필터다 —
 * 사용자가 만드는 태그가 아니다. 선택해도 페이지 이동·URL 변경·서버 재호출은
 * 없다. 원본 groups 배열은 건드리지 않고 필터링 결과만 새로 계산한다.
 */
export function IndustryFilteredArticles({ groups }: Props) {
  const [selectedIndustry, setSelectedIndustry] = useState<IndustryFilter>('전체');
  // 산업 변경 시 짧은 opacity 전환을 주기 위한 상태. DOM은 다시 만들지 않는다.
  const [isVisible, setIsVisible] = useState(true);

  const filteredGroups =
    selectedIndustry === '전체'
      ? groups
      : groups.filter((group) => group.representative.industries.includes(selectedIndustry));

  function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    setSelectedIndustry(event.target.value as IndustryFilter);
    setIsVisible(false);
    requestAnimationFrame(() => setIsVisible(true));
  }

  return (
    <>
      <div className="mx-4 mt-4 animate-industry-panel-in rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <label htmlFor="industry-filter" className="block text-xs font-medium text-slate-500">
          산업 선택
        </label>
        <select
          id="industry-filter"
          value={selectedIndustry}
          onChange={handleChange}
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
        >
          {INDUSTRY_FILTER_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      <main
        className={`space-y-3 p-4 transition-opacity duration-200 motion-reduce:transition-none ${
          isVisible ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {groups.length === 0 ? (
          // PRD 예외 처리: 전체 기사 자체가 없을 때의 기존 안내 문구를 그대로 쓴다
          <p className="py-16 text-center text-sm leading-6 text-slate-500">
            오늘 조건에 맞는 새 기사가 없습니다.
          </p>
        ) : filteredGroups.length === 0 ? (
          <p className="py-16 text-center text-sm leading-6 text-slate-500">
            선택한 산업에 해당하는 기사가 없습니다.
          </p>
        ) : (
          filteredGroups.map((group) => (
            <ArticleCard key={group.representative.url} group={group} />
          ))
        )}
      </main>
    </>
  );
}
