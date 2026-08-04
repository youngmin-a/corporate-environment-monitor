import { Dashboard } from '@/components/Dashboard';
import { getArticleStats, getCollectionState, getRecentArticleGroups } from '@/lib/articles';

/**
 * Supabase 조회(supabase-js의 내부 fetch)는 기본 캐시 대상이라, 동적 API를 쓰지 않는
 * 이 서버 컴포넌트는 next build 시점 스냅샷으로 정적 굳어버린다. 수집이 끝난 뒤
 * Supabase 데이터가 바뀌어도 화면에 반영되지 않으므로 매 요청마다 다시 조회하게
 * 강제한다.
 */
export const dynamic = 'force-dynamic';

/**
 * 기사 모니터링 대시보드 (DESIGN.md 2-2, 2-4).
 *
 * 서버 컴포넌트에서 Supabase를 한 번만 조회하고, 검색·필터·정렬·지표·인사이트·
 * 상세는 모두 Dashboard(클라이언트 컴포넌트)가 내려온 데이터로 계산한다 —
 * 필터를 바꿔도 서버에 다시 묻지 않는다.
 */
export default async function Home() {
  const [groups, collectionState, stats] = await Promise.all([
    getRecentArticleGroups(),
    getCollectionState(),
    getArticleStats(),
  ]);

  return (
    <div
      data-main-content
      tabIndex={-1}
      className="mx-auto w-full max-w-[1560px] flex-1 px-4 pb-24 sm:px-6 lg:px-8 focus:outline-none"
    >
      <Dashboard
        groups={groups}
        lastSuccessAt={collectionState.lastSuccessAt}
        totalArticles={stats.totalArticles}
        collectedToday={stats.collectedToday}
      />
    </div>
  );
}
