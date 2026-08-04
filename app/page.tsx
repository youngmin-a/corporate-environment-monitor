import { Header } from '@/components/Header';
import { IndustryFilteredArticles } from '@/components/IndustryFilteredArticles';
import { getCollectionState, getRecentArticleGroups } from '@/lib/articles';

/**
 * 기사 목록 화면 (DESIGN.md 2-2, 2-4).
 *
 * 서버 컴포넌트에서 Supabase를 직접 조회하고, 산업 드롭다운·필터링은
 * IndustryFilteredArticles(클라이언트 컴포넌트)에 맡긴다. 화면 배치 순서는
 * 제목 → 마지막 수집 시각 → 새로고침 버튼(이상 Header) → 산업 드롭다운 → 기사 목록.
 */
export default async function Home() {
  const [groups, collectionState] = await Promise.all([
    getRecentArticleGroups(),
    getCollectionState(),
  ]);

  return (
    <div className="mx-auto w-full max-w-[430px] flex-1 bg-slate-100">
      <Header lastSuccessAt={collectionState.lastSuccessAt} />
      <IndustryFilteredArticles groups={groups} />
    </div>
  );
}
