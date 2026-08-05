/** 전체 기사 목록 영역 전용 로딩 상태. 헤더·필터는 그대로 둔 채 이 영역만 대체된다 */
export function ArchiveListSkeleton() {
  return (
    <div aria-hidden="true" className="mt-4">
      <p className="h-4 w-48 animate-pulse rounded bg-slate-200 motion-reduce:animate-none" />
      <div className="feed-grid mt-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <div
            key={index}
            className="h-[380px] animate-pulse rounded-2xl bg-slate-200 motion-reduce:animate-none"
          />
        ))}
      </div>
    </div>
  );
}
