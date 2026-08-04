'use client';

import { useEffect, useId, useRef, useState } from 'react';
import {
  ALL_EVIDENCE_TYPES,
  ALL_ISSUE_TYPES,
  ALL_URGENCIES,
  EVIDENCE_TYPE_LABELS,
  ISSUE_TYPE_LABELS,
  URGENCY_LABELS,
} from '@/lib/classification';
import { DATE_RANGE_LABELS, type DashboardFilters, type DateRange } from '@/lib/dashboard';
import { ALL_INDUSTRIES } from '@/lib/industries';
import { personalActions, REVIEW_STATUS_LABELS, REVIEW_STATUS_ORDER } from '@/lib/personalState';

type Props = {
  open: boolean;
  filters: DashboardFilters;
  onChange: (next: DashboardFilters) => void;
  onClose: () => void;
  onReset: () => void;
  publishers: string[];
  agencies: string[];
  resultCount: number;
};

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function CheckChip({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onToggle}
      className={`filter-chip ${checked ? 'is-on' : ''}`}
    >
      {label}
    </button>
  );
}

/**
 * 상세 필터.
 *
 * 데스크톱에서는 오른쪽에서 나오는 drawer, 모바일(639px 이하)에서는 아래에서
 * 올라오는 bottom sheet다 — 같은 컴포넌트이며 CSS로만 나뉜다.
 * native <dialog>의 showModal()로 focus trap·Escape·배경 접근 차단을 얻는다.
 */
export function FilterDrawer({
  open,
  filters,
  onChange,
  onClose,
  onReset,
  publishers,
  agencies,
  resultCount,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [viewName, setViewName] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleCancel = (event: Event) => {
      event.preventDefault();
      onClose();
    };
    dialog.addEventListener('cancel', handleCancel);
    return () => dialog.removeEventListener('cancel', handleCancel);
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
      className="filter-dialog"
    >
      <div className="filter-drawer">
        <div className="flex items-center justify-between border-b border-slate-200 p-4">
          <h2 id={titleId} className="text-base font-semibold text-[#1E3A5F]">
            상세 필터
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="상세 필터 닫기"
            className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A73E8]"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
          <fieldset className="filter-group">
            <legend>산업 (복수 선택)</legend>
            <div className="filter-chip-row">
              {ALL_INDUSTRIES.map((industry) => (
                <CheckChip
                  key={industry}
                  label={industry}
                  checked={filters.industries.includes(industry)}
                  onToggle={() =>
                    onChange({ ...filters, industries: toggle(filters.industries, industry) })
                  }
                />
              ))}
            </div>
          </fieldset>

          <fieldset className="filter-group">
            <legend>이슈 유형</legend>
            <div className="filter-chip-row">
              {ALL_ISSUE_TYPES.map((type) => (
                <CheckChip
                  key={type}
                  label={ISSUE_TYPE_LABELS[type]}
                  checked={filters.issueTypes.includes(type)}
                  onToggle={() =>
                    onChange({ ...filters, issueTypes: toggle(filters.issueTypes, type) })
                  }
                />
              ))}
            </div>
          </fieldset>

          <fieldset className="filter-group">
            <legend>근거 유형</legend>
            <div className="filter-chip-row">
              {ALL_EVIDENCE_TYPES.map((type) => (
                <CheckChip
                  key={type}
                  label={EVIDENCE_TYPE_LABELS[type]}
                  checked={filters.evidenceTypes.includes(type)}
                  onToggle={() =>
                    onChange({ ...filters, evidenceTypes: toggle(filters.evidenceTypes, type) })
                  }
                />
              ))}
            </div>
          </fieldset>

          <fieldset className="filter-group">
            <legend>긴급도</legend>
            <div className="filter-chip-row">
              {ALL_URGENCIES.map((urgency) => (
                <CheckChip
                  key={urgency}
                  label={URGENCY_LABELS[urgency]}
                  checked={filters.urgencies.includes(urgency)}
                  onToggle={() =>
                    onChange({ ...filters, urgencies: toggle(filters.urgencies, urgency) })
                  }
                />
              ))}
            </div>
          </fieldset>

          <fieldset className="filter-group">
            <legend>연관성 점수 하한: {filters.minScore}점</legend>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={filters.minScore}
              onChange={(event) => onChange({ ...filters, minScore: Number(event.target.value) })}
              className="w-full accent-[#1A73E8]"
              aria-label="연관성 점수 하한"
            />
          </fieldset>

          <fieldset className="filter-group">
            <legend>발행 기간</legend>
            <div className="filter-chip-row">
              {(Object.keys(DATE_RANGE_LABELS) as DateRange[]).map((range) => (
                <CheckChip
                  key={range}
                  label={DATE_RANGE_LABELS[range]}
                  checked={filters.dateRange === range}
                  onToggle={() => onChange({ ...filters, dateRange: range })}
                />
              ))}
            </div>
          </fieldset>

          <fieldset className="filter-group">
            <legend>범위</legend>
            <div className="filter-chip-row">
              <CheckChip
                label="해외 규제만"
                checked={filters.overseasOnly}
                onToggle={() => onChange({ ...filters, overseasOnly: !filters.overseasOnly })}
              />
              <CheckChip
                label="직접 발언 포함"
                checked={filters.directQuoteOnly}
                onToggle={() => onChange({ ...filters, directQuoteOnly: !filters.directQuoteOnly })}
              />
              <CheckChip
                label="숨긴 기사 포함"
                checked={filters.showHidden}
                onToggle={() => onChange({ ...filters, showHidden: !filters.showHidden })}
              />
            </div>
          </fieldset>

          {publishers.length > 0 && (
            <fieldset className="filter-group">
              <legend>언론사</legend>
              <div className="filter-chip-row">
                {publishers.map((publisher) => (
                  <CheckChip
                    key={publisher}
                    label={publisher}
                    checked={filters.publishers.includes(publisher)}
                    onToggle={() =>
                      onChange({ ...filters, publishers: toggle(filters.publishers, publisher) })
                    }
                  />
                ))}
              </div>
            </fieldset>
          )}

          {agencies.length > 0 && (
            <fieldset className="filter-group">
              <legend>언급된 정부기관</legend>
              <div className="filter-chip-row">
                {agencies.map((agency) => (
                  <CheckChip
                    key={agency}
                    label={agency}
                    checked={filters.agencies.includes(agency)}
                    onToggle={() =>
                      onChange({ ...filters, agencies: toggle(filters.agencies, agency) })
                    }
                  />
                ))}
              </div>
            </fieldset>
          )}

          <fieldset className="filter-group">
            <legend>검토 상태 (이 브라우저에 저장됨)</legend>
            <div className="filter-chip-row">
              {REVIEW_STATUS_ORDER.map((status) => (
                <CheckChip
                  key={status}
                  label={REVIEW_STATUS_LABELS[status]}
                  checked={filters.reviewStatuses.includes(status)}
                  onToggle={() =>
                    onChange({
                      ...filters,
                      reviewStatuses: toggle(filters.reviewStatuses, status),
                    })
                  }
                />
              ))}
              <CheckChip
                label="보고서에 담은 기사"
                checked={filters.inReportOnly}
                onToggle={() => onChange({ ...filters, inReportOnly: !filters.inReportOnly })}
              />
            </div>
          </fieldset>

          <fieldset className="filter-group">
            <legend>현재 조건을 보기로 저장</legend>
            <div className="flex gap-2">
              <input
                type="text"
                value={viewName}
                onChange={(event) => setViewName(event.target.value)}
                placeholder="예: 고연관성 금융 기사"
                aria-label="저장할 보기 이름"
                className="h-10 flex-1 rounded-lg border border-slate-300 px-3 text-sm focus:border-[#1A73E8] focus:outline-none"
              />
              <button
                type="button"
                disabled={viewName.trim().length === 0}
                onClick={() => {
                  personalActions.saveView(viewName.trim(), filters);
                  setViewName('');
                }}
                className="h-10 rounded-lg bg-[#1A73E8] px-4 text-sm font-medium text-white disabled:opacity-40"
              >
                저장
              </button>
            </div>
            <p className="mt-2 text-[12px] text-slate-500">
              저장된 보기·검토 상태·메모는 이 브라우저에만 보관됩니다.
            </p>
          </fieldset>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button type="button" onClick={onReset} className="text-sm text-[#1A73E8] underline">
            전체 초기화
          </button>
          <button
            type="button"
            onClick={onClose}
            className="refresh-button h-11 rounded-full px-6 text-sm font-medium text-white"
          >
            {resultCount}건 보기
          </button>
        </div>
      </div>
    </dialog>
  );
}
