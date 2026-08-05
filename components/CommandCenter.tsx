'use client';

import { useState } from 'react';
import { collectionFreshness, FRESHNESS_LABELS } from '@/lib/dashboard';

/** ISO 시각 → "8/4 08:00" */
function formatDateTime(iso: string): string {
  const date = new Date(iso);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${month}/${day} ${hour}:${minute}`;
}

type Props = {
  /** 마지막으로 수집이 끝난 시각. 없으면 아직 한 번도 수집하지 않은 상태 */
  lastSuccessAt: string | null;
  totalArticles: number;
  collectedToday: number;
  /** 현재 필터를 적용한 결과 수 */
  resultCount: number;
  /** 필터 적용 전 목록 수 */
  loadedCount: number;
  /** 마지막 방문 이후 새로 들어온 기사 수 */
  newSinceLastVisit: number;
  isRefreshing: boolean;
  /** 수집 결과 안내. 쿨다운·상한 안내도 여기로 온다 */
  refreshMessage: string | null;
  onRefresh: () => void;
};

/**
 * 상단 Command Center.
 *
 * 기존 헤더가 보여주던 제목·설명·마지막 수집 시각·새로고침 버튼을 그대로 두고,
 * 수집 상태와 데이터 규모를 옆에 붙였다. 여기 숫자는 모두 실제로 계산되는 값이며,
 * 알 수 없는 값(다음 자동 수집 예정 시각 등)은 만들어 넣지 않는다.
 */
export function CommandCenter({
  lastSuccessAt,
  totalArticles,
  collectedToday,
  resultCount,
  loadedCount,
  newSinceLastVisit,
  isRefreshing,
  refreshMessage,
  onRefresh,
}: Props) {
  const freshness = collectionFreshness(lastSuccessAt);
  const [logoFailed, setLogoFailed] = useState(false);

  return (
    <header className="app-header animate-header-in mt-4 rounded-3xl p-5 md:p-8">
      {/* 수집 중에는 상단 라인에 컬러가 흐른다. 헤더 전체를 깜빡이게 하지 않는다 */}
      <span
        aria-hidden="true"
        className={`command-status-line command-status-line--${freshness} ${
          isRefreshing ? 'is-collecting' : ''
        }`}
      />

      <div className="relative flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between md:gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#202124]">
            기업 환경 모니터링
          </h1>
          <p className="mt-1 text-sm text-[#5F6368]">
            기업 규제·애로사항을 연관성 높은 순으로 확인합니다.
          </p>
        </div>

        <div className="flex w-full flex-wrap items-center justify-between gap-4 md:w-auto md:justify-end md:gap-6">
          {/* 기관 식별용 브랜드 로고. 장식 효과 없이 원본 비율만 유지한다 */}
          {!logoFailed && (
            <img
              src="/재정경제부.svg"
              alt="재정경제부"
              onError={() => setLogoFailed(true)}
              className="header-agency-logo h-7 w-auto shrink-0 object-contain sm:h-8 md:h-9"
            />
          )}

          <div className="flex flex-col items-start gap-2 md:items-end">
            <div className="flex flex-wrap items-center gap-2 text-[13px] text-[#5F6368]">
              <span className={`freshness-pill freshness-pill--${freshness}`}>
                <span aria-hidden="true" className="freshness-dot" />
                {FRESHNESS_LABELS[freshness]}
              </span>
              <span>
                {lastSuccessAt
                  ? `마지막 수집: ${formatDateTime(lastSuccessAt)}`
                  : '아직 수집한 기사가 없습니다'}
              </span>
            </div>

            <button
              type="button"
              onClick={onRefresh}
              disabled={isRefreshing}
              className="refresh-button rounded-full px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5] focus-visible:ring-offset-2"
            >
              <span className={isRefreshing ? 'refresh-spinner' : undefined} aria-hidden="true">
                ⟳
              </span>{' '}
              {isRefreshing ? '수집 중…' : '새로고침'}
            </button>
          </div>
        </div>
      </div>

      {/* 수집 상태 요약. 값을 모르는 항목은 표시하지 않는다 */}
      <dl className="relative mt-5 flex flex-wrap gap-x-6 gap-y-2 border-t border-slate-200/70 pt-4 text-[13px]">
        <div className="flex items-center gap-1.5">
          <dt className="text-[#5F6368]">전체 저장</dt>
          <dd className="font-semibold text-[#202124]">{totalArticles.toLocaleString()}건</dd>
        </div>
        <div className="flex items-center gap-1.5">
          <dt className="text-[#5F6368]">오늘 수집</dt>
          <dd className="font-semibold text-[#202124]">{collectedToday}건</dd>
        </div>
        <div className="flex items-center gap-1.5">
          <dt className="text-[#5F6368]">현재 화면</dt>
          <dd className="font-semibold text-[#202124]">
            {resultCount}/{loadedCount}건
          </dd>
        </div>
        {newSinceLastVisit > 0 && (
          <div className="flex items-center gap-1.5">
            <dt className="text-[#5F6368]">마지막 방문 이후</dt>
            <dd className="font-semibold text-[#1A73E8]">{newSinceLastVisit}건</dd>
          </div>
        )}
      </dl>

      {refreshMessage && (
        <p
          role="status"
          className="relative mt-3 rounded-xl bg-slate-50 px-3 py-2 text-[13px] text-slate-600"
        >
          {refreshMessage}
        </p>
      )}
    </header>
  );
}
