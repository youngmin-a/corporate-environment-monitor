'use client';

import Link from 'next/link';
import { useEffect } from 'react';

/**
 * 전체 기사 조회 실패 시의 오류 화면.
 *
 * Supabase 오류 메시지나 stack trace는 그대로 보여주지 않는다 — 콘솔에만 남기고
 * 화면에는 안내 문구·재시도·대시보드 복귀만 제공한다. `reset()`은 이 라우트
 * 세그먼트를 다시 렌더링해 실제로 재조회한다(Next.js가 보장하는 동작).
 */
export default function ArticlesError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('전체 기사 조회 실패:', error);
  }, [error]);

  return (
    <div className="mx-auto w-full max-w-[1560px] flex-1 px-4 pb-24 pt-10 sm:px-6 lg:px-8">
      <div className="empty-panel rounded-2xl px-6 py-16 text-center">
        <p className="text-sm text-slate-600">전체 기사를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={reset}
            className="refresh-button inline-flex h-10 items-center rounded-full px-5 text-sm font-medium text-white"
          >
            다시 시도
          </button>
          <Link
            href="/"
            className="inline-flex h-10 items-center rounded-full border border-slate-300 px-5 text-sm font-medium text-slate-700"
          >
            대시보드로 돌아가기
          </Link>
        </div>
      </div>
    </div>
  );
}
