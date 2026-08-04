'use client';

import { useEffect, useId, useRef, useState } from 'react';
import {
  activeFilterChips,
  DATE_RANGE_LABELS,
  removeFilterChip,
  SORT_LABELS,
  type DashboardFilters,
  type DateRange,
  type SortKey,
} from '@/lib/dashboard';
import { ALL_INDUSTRIES, INDUSTRY_FILTER_OPTIONS, type IndustryFilter } from '@/lib/industries';
import { personalActions, type SavedView, type ViewMode } from '@/lib/personalState';

/** 한글 조합 중에는 검색을 실행하지 않도록 조합 상태를 함께 본다 */
const SEARCH_DEBOUNCE_MS = 300;

type Props = {
  filters: DashboardFilters;
  onChange: (next: DashboardFilters) => void;
  onReset: () => void;
  resultCount: number;
  totalCount: number;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onOpenAdvanced: () => void;
  advancedCount: number;
  recentSearches: string[];
  savedViews: SavedView[];
  onApplySavedView: (view: SavedView) => void;
};

const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  card: '카드',
  compact: '압축 목록',
  cluster: '이슈 군집',
};

export function FilterToolbar({
  filters,
  onChange,
  onReset,
  resultCount,
  totalCount,
  viewMode,
  onViewModeChange,
  onOpenAdvanced,
  advancedCount,
  recentSearches,
  savedViews,
  onApplySavedView,
}: Props) {
  const searchId = useId();
  const industryId = useId();
  const sortId = useId();
  const [draft, setDraft] = useState(filters.search);
  const [syncedSearch, setSyncedSearch] = useState(filters.search);
  const composingRef = useRef(false);
  const timerRef = useRef<number>(0);

  // 바깥에서 필터가 초기화되면(지표 카드 클릭·전체 초기화) 입력창도 따라간다.
  // effect가 아니라 렌더 중에 맞추는 편이 한 프레임 늦게 반영되는 일이 없다.
  if (filters.search !== syncedSearch) {
    setSyncedSearch(filters.search);
    setDraft(filters.search);
  }

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  function scheduleSearch(value: string) {
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      if (composingRef.current) return;
      onChange({ ...filters, search: value });
    }, SEARCH_DEBOUNCE_MS);
  }

  function commitSearch(value: string) {
    window.clearTimeout(timerRef.current);
    onChange({ ...filters, search: value });
    personalActions.pushRecentSearch(value);
  }

  const chips = activeFilterChips(filters);
  const selectedIndustry: IndustryFilter =
    filters.industries.length === 1 ? filters.industries[0] : '전체';

  return (
    <section aria-label="검색과 필터" className="filter-toolbar mt-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="search-field">
          <label htmlFor={searchId} className="sr-only">
            기사 검색
          </label>
          <span aria-hidden="true" className="search-field__icon">
            ⌕
          </span>
          <input
            id={searchId}
            type="search"
            value={draft}
            placeholder="제목·요약·언론사·기업·기관·규제 검색"
            onChange={(event) => {
              setDraft(event.target.value);
              scheduleSearch(event.target.value);
            }}
            onCompositionStart={() => {
              composingRef.current = true;
            }}
            onCompositionEnd={(event) => {
              composingRef.current = false;
              scheduleSearch(event.currentTarget.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !composingRef.current) commitSearch(draft);
            }}
            className="search-field__input"
          />
          {draft.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setDraft('');
                commitSearch('');
              }}
              aria-label="검색어 지우기"
              className="search-field__clear"
            >
              ✕
            </button>
          )}
        </div>

        {/* 기존 산업 select는 그대로 두고, 여러 산업 선택은 고급 필터에서 한다 */}
        <div className="industry-panel flex items-center gap-3 rounded-2xl px-4">
          <label htmlFor={industryId} className="shrink-0 text-sm font-medium text-[#5F6368]">
            산업 선택
          </label>
          <select
            id={industryId}
            value={selectedIndustry}
            onChange={(event) => {
              const value = event.target.value as IndustryFilter;
              onChange({
                ...filters,
                industries: value === '전체' ? [] : [value],
              });
            }}
            className="h-[46px] w-full cursor-pointer bg-transparent text-[15px] text-[#202124] focus:outline-none md:w-40"
          >
            {INDUSTRY_FILTER_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor={sortId} className="sr-only">
            정렬 기준
          </label>
          <select
            id={sortId}
            value={filters.sort}
            onChange={(event) => onChange({ ...filters, sort: event.target.value as SortKey })}
            className="toolbar-select"
          >
            {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
              <option key={key} value={key}>
                {SORT_LABELS[key]}
              </option>
            ))}
          </select>

          <button type="button" onClick={onOpenAdvanced} className="toolbar-button">
            상세 필터
            {advancedCount > 0 && <span className="toolbar-button__badge">{advancedCount}</span>}
          </button>
        </div>
      </div>

      {/* 자주 쓰는 필터 chip */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {(['today', '3d', '7d'] as DateRange[]).map((range) => (
          <button
            key={range}
            type="button"
            aria-pressed={filters.dateRange === range}
            onClick={() =>
              onChange({ ...filters, dateRange: filters.dateRange === range ? 'all' : range })
            }
            className={`quick-chip ${filters.dateRange === range ? 'is-on' : ''}`}
          >
            {DATE_RANGE_LABELS[range]}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={filters.minScore >= 80}
          onClick={() => onChange({ ...filters, minScore: filters.minScore >= 80 ? 0 : 80 })}
          className={`quick-chip ${filters.minScore >= 80 ? 'is-on' : ''}`}
        >
          80점 이상
        </button>
        <button
          type="button"
          aria-pressed={filters.directQuoteOnly}
          onClick={() => onChange({ ...filters, directQuoteOnly: !filters.directQuoteOnly })}
          className={`quick-chip ${filters.directQuoteOnly ? 'is-on' : ''}`}
        >
          직접 발언
        </button>
        <button
          type="button"
          aria-pressed={filters.readFilter === 'unread'}
          onClick={() =>
            onChange({ ...filters, readFilter: filters.readFilter === 'unread' ? 'all' : 'unread' })
          }
          className={`quick-chip ${filters.readFilter === 'unread' ? 'is-on' : ''}`}
        >
          미열람
        </button>
        <button
          type="button"
          aria-pressed={filters.bookmarkedOnly}
          onClick={() => onChange({ ...filters, bookmarkedOnly: !filters.bookmarkedOnly })}
          className={`quick-chip ${filters.bookmarkedOnly ? 'is-on' : ''}`}
        >
          저장함
        </button>

        <span className="ml-auto flex items-center gap-1 rounded-full bg-white/70 p-1">
          {(Object.keys(VIEW_MODE_LABELS) as ViewMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={viewMode === mode}
              onClick={() => onViewModeChange(mode)}
              className={`view-chip ${viewMode === mode ? 'is-on' : ''}`}
            >
              {VIEW_MODE_LABELS[mode]}
            </button>
          ))}
        </span>
      </div>

      {/* 적용된 필터와 결과 수 */}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200/70 pt-3">
        <p aria-live="polite" className="text-[13px] text-[#5F6368]">
          <strong className="text-[#202124]">{resultCount}건</strong> / 불러온 {totalCount}건
        </p>

        {chips.map((chip) => (
          <button
            key={chip.key}
            type="button"
            onClick={() => onChange(removeFilterChip(filters, chip.key))}
            className="applied-chip"
          >
            {chip.label}
            <span aria-hidden="true">✕</span>
            <span className="sr-only">필터 제거</span>
          </button>
        ))}

        {chips.length > 0 && (
          <button type="button" onClick={onReset} className="text-[13px] text-[#1A73E8] underline">
            전체 초기화
          </button>
        )}
      </div>

      {(recentSearches.length > 0 || savedViews.length > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-slate-500">
          {savedViews.length > 0 && <span>저장된 보기</span>}
          {savedViews.map((view) => (
            <span key={view.id} className="saved-view">
              <button type="button" onClick={() => onApplySavedView(view)}>
                {view.name}
              </button>
              <button
                type="button"
                onClick={() => personalActions.deleteView(view.id)}
                aria-label={`${view.name} 보기 삭제`}
              >
                ✕
              </button>
            </span>
          ))}

          {recentSearches.length > 0 && <span className="ml-2">최근 검색</span>}
          {recentSearches.map((term) => (
            <span key={term} className="saved-view">
              <button
                type="button"
                onClick={() => {
                  setDraft(term);
                  onChange({ ...filters, search: term });
                }}
              >
                {term}
              </button>
              <button
                type="button"
                onClick={() => personalActions.removeRecentSearch(term)}
                aria-label={`최근 검색어 ${term} 삭제`}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

export { ALL_INDUSTRIES };
