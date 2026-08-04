import { Header } from '@/components/Header';
import { IndustryFilteredArticles } from '@/components/IndustryFilteredArticles';
import { getCollectionState, getRecentArticleGroups } from '@/lib/articles';

/**
 * Supabase 조회(supabase-js의 내부 fetch)는 기본 캐시 대상이라, 동적 API를 쓰지 않는
 * 이 서버 컴포넌트는 next build 시점 스냅샷으로 정적 굳어버린다. 수집이 끝난 뒤
 * Supabase 데이터가 바뀌어도 화면에 반영되지 않으므로 매 요청마다 다시 조회하게
 * 강제한다.
 */
export const dynamic = 'force-dynamic';

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
    <div className="mx-auto w-full max-w-[1180px] flex-1 bg-slate-100 px-4 sm:px-6 lg:px-8">
      <Header lastSuccessAt={collectionState.lastSuccessAt} />
      <IndustryFilteredArticles groups={groups} />
    </div>
  );
}
