import { Suspense } from 'react';
import { ArchiveControls } from '@/components/ArchiveControls';
import { ArchiveListSection } from '@/components/ArchiveListSection';
import { ArchiveListSkeleton } from '@/components/ArchiveListSkeleton';
import { getArticleStats } from '@/lib/articles';
import { ALL_INDUSTRIES, type Industry } from '@/lib/industries';
import type { ArticleArchiveSort } from '@/lib/articles';

/** 대시보드와 마찬가지로 매 요청마다 Supabase를 다시 조회한다 */
export const dynamic = 'force-dynamic';

function parseIndustry(value: string | undefined): Industry | null {
  return value && (ALL_INDUSTRIES as string[]).includes(value) ? (value as Industry) : null;
}

function parseSort(value: string | undefined): ArticleArchiveSort {
  return value === 'relevance' ? 'relevance' : 'latest';
}

function parsePage(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : 1;
}

type Props = {
  searchParams: Promise<{ page?: string; industry?: string; sort?: string }>;
};

/**
 * 전체 기사 탐색 화면 (일회성 확장 요구사항).
 *
 * 대시보드(app/page.tsx)의 최근 7일·30건 제한과 분리된 별도 화면이다 — 여기서는
 * 저장된 기사 전체를 서버 페이지네이션으로 30건씩 보여준다. page/industry/sort는
 * URL 쿼리에 그대로 실려 브라우저 히스토리·뒤로가기가 자연스럽게 동작한다.
 */
export default async function ArticlesPage({ searchParams }: Props) {
  const params = await searchParams;
  const page = parsePage(params.page);
  const industry = parseIndustry(params.industry);
  const sort = parseSort(params.sort);

  const stats = await getArticleStats();

  return (
    <div
      data-main-content
      tabIndex={-1}
      className="mx-auto w-full max-w-[1560px] flex-1 px-4 pb-24 sm:px-6 lg:px-8 focus:outline-none"
    >
      <ArchiveControls totalArticles={stats.totalArticles} industry={industry} sort={sort} />
      <Suspense key={`${page}-${industry ?? 'all'}-${sort}`} fallback={<ArchiveListSkeleton />}>
        <ArchiveListSection page={page} industry={industry} sort={sort} />
      </Suspense>
    </div>
  );
}
