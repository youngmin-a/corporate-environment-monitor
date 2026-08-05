'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useRef, useState } from 'react';
import { AgentEntryButton } from '@/components/AgentEntryButton';
import { AgentPanel } from '@/components/AgentPanel';
import { INDUSTRY_FILTER_OPTIONS, type Industry, type IndustryFilter } from '@/lib/industries';
import type { ArticleArchiveSort } from '@/lib/articles';

const SORT_OPTIONS: { value: ArticleArchiveSort; label: string }[] = [
  { value: 'latest', label: '최신순' },
  { value: 'relevance', label: '연관성 높은 순' },
];

type Props = {
  totalArticles: number;
  industry: Industry | null;
  sort: ArticleArchiveSort;
};

/**
 * 전체 기사 화면의 정적 상단 영역.
 *
 * 데이터 조회(Suspense)와 분리해 둬서, 페이지를 넘기거나 필터를 바꿔도 이 영역은
 * 다시 그려지지 않는다 — AI 분석관 패널이 열려 있어도 유지된다.
 */
export function ArchiveControls({ totalArticles, industry, sort }: Props) {
  const router = useRouter();
  const industryId = useId();
  const sortId = useId();
  const [agentOpen, setAgentOpen] = useState(false);
  const agentEntryButtonRef = useRef<HTMLButtonElement>(null);

  function navigate(next: { industry?: Industry | null; sort?: ArticleArchiveSort }) {
    const nextIndustry = next.industry !== undefined ? next.industry : industry;
    const nextSort = next.sort ?? sort;
    const params = new URLSearchParams();
    if (nextIndustry) params.set('industry', nextIndustry);
    if (nextSort !== 'latest') params.set('sort', nextSort);
    // 필터·정렬이 바뀌면 이전 페이지 번호는 의미가 없으므로 1페이지로 되돌아간다
    router.push(`/articles${params.toString() ? `?${params.toString()}` : ''}`);
  }

  return (
    <>
      <header className="app-header animate-header-in mt-4 rounded-3xl p-5 md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <Link
              href="/"
              className="text-[13px] font-medium text-[#1A73E8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A73E8] focus-visible:ring-offset-2 hover:underline"
            >
              ← 대시보드로 돌아가기
            </Link>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[#202124]">전체 기사</h1>
            <p className="mt-1 text-sm text-[#5F6368]">
              저장된 전체 기사{' '}
              <strong className="font-semibold text-[#202124]">{totalArticles.toLocaleString()}건</strong>을 페이지
              단위로 확인합니다.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="industry-panel flex items-center gap-3 rounded-2xl px-4">
              <label htmlFor={industryId} className="shrink-0 text-sm font-medium text-[#5F6368]">
                산업 선택
              </label>
              <select
                id={industryId}
                value={industry ?? '전체'}
                onChange={(event) => {
                  const value = event.target.value as IndustryFilter;
                  navigate({ industry: value === '전체' ? null : value });
                }}
                className="h-[46px] w-full cursor-pointer bg-transparent text-[15px] text-[#202124] focus:outline-none md:w-40"
              >
                {INDUSTRY_FILTER_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <label htmlFor={sortId} className="sr-only">
              정렬 기준
            </label>
            <select
              id={sortId}
              value={sort}
              onChange={(event) => navigate({ sort: event.target.value as ArticleArchiveSort })}
              className="toolbar-select"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      <AgentEntryButton ref={agentEntryButtonRef} onClick={() => setAgentOpen(true)} liftForActionBar={false} />
      <AgentPanel
        open={agentOpen}
        onClose={() => {
          setAgentOpen(false);
          agentEntryButtonRef.current?.focus();
        }}
        currentIndustryScope={industry ? [industry] : []}
      />
    </>
  );
}
