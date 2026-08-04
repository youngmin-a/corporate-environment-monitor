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
      {/* Google 검색창처럼 크고 둥근 선택 영역. 기존 label + HTML select 구조는 그대로 둔다 */}
      <div className="mt-4 flex animate-industry-panel-in items-center gap-3 rounded-2xl border border-[#E8EAED] bg-white px-4 shadow-[0_1px_3px_rgba(60,64,67,0.08)] focus-within:border-[#1A73E8] focus-within:ring-2 focus-within:ring-[#1A73E8]/30 md:px-6">
        <label
          htmlFor="industry-filter"
          className="shrink-0 text-sm font-medium text-[#5F6368]"
        >
          산업 선택
        </label>
        <select
          id="industry-filter"
          value={selectedIndustry}
          onChange={handleChange}
          className="h-[54px] w-full cursor-pointer bg-transparent text-[15px] text-[#202124] focus:outline-none md:max-w-sm"
        >
          {INDUSTRY_FILTER_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      {/* 태블릿·데스크톱(768px~)에서는 2열, 그 아래는 1열. 산업 전환 시 opacity만
          짧게 바뀔 뿐, 배열을 다시 만들거나 key를 바꾸지 않는다(기존 로직 그대로). */}
      <main
        className={`grid grid-cols-1 gap-5 py-4 transition-opacity duration-200 motion-reduce:transition-none md:grid-cols-2 lg:gap-6 ${
          isVisible ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {groups.length === 0 ? (
          // PRD 예외 처리: 전체 기사 자체가 없을 때의 기존 안내 문구를 그대로 쓴다
          <p className="col-span-full py-16 text-center text-sm leading-6 text-slate-500">
            오늘 조건에 맞는 새 기사가 없습니다.
          </p>
        ) : filteredGroups.length === 0 ? (
          <p className="col-span-full py-16 text-center text-sm leading-6 text-slate-500">
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
