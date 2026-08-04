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
 *
 * 모바일은 기존과 같은 세로 순서(제목 → 마지막 수집 → 버튼)를 유지하고,
 * 데스크톱(768px~)에서는 왼쪽에 제목+설명, 오른쪽에 마지막 수집 시각+버튼을
 * 배치한다. 좌우 여백은 부모 컨테이너(page.tsx)가 이미 주므로 여기서는
 * 세로 여백만 관리한다.
 */
export function Header({ lastSuccessAt, isRefreshing = false, onRefresh }: Props) {
  return (
    <header className="mt-4 rounded-3xl border border-[#E8EAED] bg-white p-5 shadow-[0_1px_3px_rgba(60,64,67,0.08)] md:p-8">
      <div className="flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between md:gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#202124]">
            기업 환경 모니터링
          </h1>
          <p className="mt-1 text-sm text-[#5F6368]">
            기업 규제·애로사항을 연관성 높은 순으로 확인합니다.
          </p>
        </div>

        <div className="flex flex-col items-start gap-2 md:items-end">
          <p className="text-[13px] text-[#5F6368]">
            {lastSuccessAt
              ? `마지막 수집: ${formatDateTime(lastSuccessAt)}`
              : '아직 수집한 기사가 없습니다'}
          </p>

          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="rounded-full bg-[#1A73E8] px-5 py-2.5 text-sm font-medium text-white transition duration-150 hover:bg-[#1B66C9] active:scale-95 disabled:opacity-60 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A73E8] focus-visible:ring-offset-2"
          >
            {isRefreshing ? '수집 중…' : '새로고침'}
          </button>
        </div>
      </div>
    </header>
  );
}
