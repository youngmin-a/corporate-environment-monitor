import { ArticlesArchive } from '@/components/ArticlesArchive';
import { getArticleGroupsPage, type ArticleArchiveSort } from '@/lib/articles';
import type { Industry } from '@/lib/industries';

/**
 * 전체 기사 목록의 데이터 조회 부분. Suspense 경계 안에서만 이 컴포넌트가 다시
 * 그려지므로, 페이지·필터가 바뀌어도 ArchiveControls(헤더)는 그대로 남는다.
 */
export async function ArchiveListSection({
  page,
  industry,
  sort,
}: {
  page: number;
  industry: Industry | null;
  sort: ArticleArchiveSort;
}) {
  const result = await getArticleGroupsPage({ page, industry, sort });

  return (
    <ArticlesArchive
      groups={result.groups}
      filteredCount={result.filteredCount}
      page={result.page}
      pageSize={result.pageSize}
      industry={industry}
      sort={sort}
    />
  );
}
