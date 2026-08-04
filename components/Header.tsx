'use client';

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
  /** 새로고침이 진행 중인지 */
  isRefreshing?: boolean;
  onRefresh?: () => void;
};

/**
 * 화면 상단 헤더.
 *
 * PRD 5-2: 마지막 수집 성공 시각을 항상 표시한다. 수집이 며칠째 실패해도
 * 사용자가 이 날짜만 보고 알아챌 수 있게 하기 위한 장치다.
 */
export function Header({ lastSuccessAt, isRefreshing = false, onRefresh }: Props) {
  return (
    <header className="bg-[#1E3A5F] px-4 py-4">
      <h1 className="text-xl font-bold text-white">기업환경 모니터</h1>

      <p className="mt-1 text-[13px] text-[#C7D2E1]">
        {lastSuccessAt
          ? `마지막 수집: ${formatDateTime(lastSuccessAt)}`
          : '아직 수집한 기사가 없습니다'}
      </p>

      <button
        type="button"
        onClick={onRefresh}
        disabled={isRefreshing}
        className="mt-3 rounded-lg bg-[#2563EB] px-4 py-2 text-sm font-semibold text-white transition-transform duration-150 active:scale-95 disabled:opacity-60 motion-reduce:transition-none"
      >
        {isRefreshing ? '수집 중…' : '새로고침'}
      </button>
    </header>
  );
}
