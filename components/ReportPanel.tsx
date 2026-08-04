'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { personalActions } from '@/lib/personalState';
import {
  buildCsv,
  buildMarkdown,
  REPORT_FORMAT_LABELS,
  SUMMARY_LEVEL_LABELS,
  type ReportFormat,
  type SummaryLevel,
} from '@/lib/report';
import type { EnrichedArticle } from '@/types/article';

type Props = {
  open: boolean;
  articles: EnrichedArticle[];
  onClose: () => void;
};

/**
 * 브리핑 작성 패널.
 *
 * 저장된 요약만 조합해 초안을 만든다 — AI를 부르지 않는다.
 * 상세 요약을 골라도 확장 요약이 없는 기사는 카드 요약으로 대체된다.
 */
export function ReportPanel({ open, articles, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [title, setTitle] = useState('일일 기업환경 브리핑');
  const [format, setFormat] = useState<ReportFormat>('daily-briefing');
  const [level, setLevel] = useState<SummaryLevel>('short');
  const [copied, setCopied] = useState(false);

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

  const markdown = useMemo(
    () => buildMarkdown({ title, articles, format, level }),
    [title, articles, format, level],
  );

  const expandedMissing = articles.filter(
    (article) => !article.expandedSummary || article.expandedSummary.length === 0,
  ).length;

  function move(url: string, direction: -1 | 1) {
    const order = articles.map((article) => article.url);
    const index = order.indexOf(url);
    const target = index + direction;
    if (target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];
    personalActions.setReportOrder(order);
  }

  async function copyMarkdown() {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  function downloadCsv() {
    const blob = new Blob([buildCsv(articles)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `기업환경-브리핑-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

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
      <div className="filter-drawer report-drawer">
        <div className="flex items-center justify-between border-b border-slate-200 p-4">
          <h2 id={titleId} className="text-base font-semibold text-[#1E3A5F]">
            브리핑 작성 · {articles.length}건
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="브리핑 패널 닫기"
            className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A73E8]"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
          <label className="block text-sm font-medium text-[#5F6368]">
            보고서 제목
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm text-[#202124] focus:border-[#1A73E8] focus:outline-none"
            />
          </label>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium text-[#5F6368]">
              형식
              <select
                value={format}
                onChange={(event) => setFormat(event.target.value as ReportFormat)}
                className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-2 text-sm"
              >
                {(Object.keys(REPORT_FORMAT_LABELS) as ReportFormat[]).map((key) => (
                  <option key={key} value={key}>
                    {REPORT_FORMAT_LABELS[key]}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm font-medium text-[#5F6368]">
              요약 수준
              <select
                value={level}
                onChange={(event) => setLevel(event.target.value as SummaryLevel)}
                className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-2 text-sm"
              >
                {(Object.keys(SUMMARY_LEVEL_LABELS) as SummaryLevel[]).map((key) => (
                  <option key={key} value={key}>
                    {SUMMARY_LEVEL_LABELS[key]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {level === 'expanded' && expandedMissing > 0 && (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
              {expandedMissing}건은 상세 요약이 아직 없어 카드 요약으로 대체됩니다.
            </p>
          )}

          <h3 className="mt-5 text-sm font-semibold text-[#1E3A5F]">포함된 기사</h3>
          {articles.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">
              기사 카드에서 &lsquo;브리핑에 추가&rsquo;를 누르면 여기에 쌓입니다.
            </p>
          ) : (
            <ol className="mt-2 space-y-2">
              {articles.map((article, index) => (
                <li key={article.url} className="report-item">
                  <span className="report-item__index">{index + 1}</span>
                  <span className="report-item__body">
                    <span className="report-item__title">{article.title}</span>
                    <span className="report-item__meta">
                      {article.publisher} · {article.publishedAt} · {article.relevanceScore}점
                    </span>
                  </span>
                  <span className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => move(article.url, -1)}
                      aria-label={`${article.title} 위로`}
                      className="report-item__action"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => move(article.url, 1)}
                      aria-label={`${article.title} 아래로`}
                      className="report-item__action"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => personalActions.toggleReport(article.url)}
                      aria-label={`${article.title} 제거`}
                      className="report-item__action"
                    >
                      ✕
                    </button>
                  </span>
                </li>
              ))}
            </ol>
          )}

          <h3 className="mt-5 text-sm font-semibold text-[#1E3A5F]">미리보기</h3>
          <pre className="report-preview" data-report-preview>
            {markdown}
          </pre>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={copyMarkdown}
            disabled={articles.length === 0}
            className="refresh-button h-11 rounded-full px-5 text-sm font-medium text-white disabled:opacity-40"
          >
            {copied ? '복사했습니다' : 'Markdown 복사'}
          </button>
          <button
            type="button"
            onClick={downloadCsv}
            disabled={articles.length === 0}
            className="h-11 rounded-full border border-slate-300 px-5 text-sm font-medium text-slate-700 disabled:opacity-40"
          >
            CSV 내려받기
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            disabled={articles.length === 0}
            className="h-11 rounded-full border border-slate-300 px-5 text-sm font-medium text-slate-700 disabled:opacity-40"
          >
            인쇄 · PDF
          </button>
          <button
            type="button"
            onClick={() => personalActions.clearReport()}
            disabled={articles.length === 0}
            className="ml-auto text-sm text-slate-500 underline disabled:opacity-40"
          >
            비우기
          </button>
        </div>
      </div>
    </dialog>
  );
}
