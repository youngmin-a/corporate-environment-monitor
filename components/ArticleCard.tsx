'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { ISSUE_TYPE_LABELS, URGENCY_LABELS } from '@/lib/classification';
import { getArticleImage } from '@/lib/industries';
import {
  personalActions,
  REVIEW_STATUS_LABELS,
  REVIEW_STATUS_ORDER,
  type ReviewStatus,
} from '@/lib/personalState';
import type { EnrichedGroup } from '@/types/article';
import type { DetailOrigin } from '@/components/ArticleDetailDialog';

/** "2026-08-03" → "8.3" */
function formatDate(iso: string): string {
  const [, month, day] = iso.split('-');
  return `${Number(month)}.${Number(day)}`;
}

/** 발행일 기준 상대 표기. 카드에는 짧게, tooltip에는 정확한 날짜를 준다 */
function relativeDays(iso: string): string {
  const days = Math.floor((Date.now() - new Date(`${iso}T00:00:00`).getTime()) / 86_400_000);
  if (days <= 0) return '오늘';
  if (days === 1) return '어제';
  return `${days}일 전`;
}

function collectedLabel(iso: string): string {
  const date = new Date(iso);
  return `수집: ${date.getMonth() + 1}월 ${date.getDate()}일 ${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes(),
  ).padStart(2, '0')}`;
}

type Props = {
  group: EnrichedGroup;
  /** 상세를 열 때 카드 위치·클릭 좌표를 함께 넘겨 그 자리에서 확장되게 한다 */
  onOpenDetail: (group: EnrichedGroup, origin: DetailOrigin, trigger: HTMLElement) => void;
  /** 마지막 방문 이후 새로 들어온 기사인지 */
  isNew: boolean;
  isRead: boolean;
  reviewStatus: ReviewStatus;
  isBookmarked: boolean;
  isInReport: boolean;
  hasMemo: boolean;
  isSelected: boolean;
  onToggleSelect: (url: string) => void;
  /** 검색어가 확장 요약에만 있었을 때 배지를 붙인다 */
  matchedInExpanded: boolean;
  variant?: 'card' | 'compact';
};

/** ripple → 출렁임이 끝나고 상세가 열리기까지 */
const OPEN_DELAY_MS = 260;
const WOBBLE_DURATION_MS = 380;

/**
 * 연관성 점수 배지 (PRD 5-2).
 * 60점 미만은 애초에 목록에 오지 않으므로 회색이 사실상 최하 등급이다.
 */
function relevanceBadgeClass(score: number): string {
  if (score >= 85) return 'score-badge--high';
  if (score >= 70) return 'score-badge--mid';
  return 'score-badge--low';
}

/**
 * 기사 카드 한 장.
 *
 * 이미지·제목 오버레이·본문 배치·hover·관련 기사 펼치기는 기존 구조를 유지하고,
 * 대시보드에 필요한 표시(신규·이슈 유형·긴급도·검토 상태·언론사명·점수 근거)와
 * 업무 액션(저장·검토·브리핑·메모·숨김)을 더했다. 주요 액션만 표에 두고 나머지는
 * 더보기 메뉴로 접는다.
 */
export function ArticleCard({
  group,
  onOpenDetail,
  isNew,
  isRead,
  reviewStatus,
  isBookmarked,
  isInReport,
  hasMemo,
  isSelected,
  onToggleSelect,
  matchedInExpanded,
  variant = 'card',
}: Props) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [ripple, setRipple] = useState<{ key: number; x: number; y: number } | null>(null);
  const [isOpening, setIsOpening] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [scoreOpen, setScoreOpen] = useState(false);
  const cardRef = useRef<HTMLElement>(null);
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const timersRef = useRef<number[]>([]);
  const { representative, related } = group;
  const { classification } = representative;
  const imageSrc = getArticleImage(representative.industries);

  useEffect(
    () => () => {
      timersRef.current.forEach((id) => window.clearTimeout(id));
    },
    [],
  );

  function openDetail(point: { x: number; y: number } | null) {
    const card = cardRef.current;
    if (!card || isOpening) return;

    const rect = card.getBoundingClientRect();
    const x = point ? point.x : rect.x + rect.width / 2;
    const y = point ? point.y : rect.y + rect.height / 2;

    setIsPressed(false);
    setIsOpening(true);
    setRipple({ key: Date.now(), x: x - rect.x, y: y - rect.y });

    timersRef.current.push(
      window.setTimeout(() => {
        onOpenDetail(
          group,
          {
            rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
            clickX: x,
            clickY: y,
          },
          openButtonRef.current ?? card,
        );
      }, OPEN_DELAY_MS),
    );

    timersRef.current.push(
      window.setTimeout(() => {
        setIsOpening(false);
        setRipple(null);
      }, WOBBLE_DURATION_MS),
    );
  }

  /**
   * 마우스·터치는 누른 좌표를, 키보드(Enter·Space)는 좌표가 없다는 뜻으로 null을
   * 넘긴다 — 키보드 실행은 clientX/Y가 0으로 들어온다.
   */
  function pointFromEvent(event: React.MouseEvent): { x: number; y: number } | null {
    return event.detail === 0 ? null : { x: event.clientX, y: event.clientY };
  }

  function handleCardClick(event: React.MouseEvent<HTMLElement>) {
    openDetail(pointFromEvent(event));
  }

  /** 카드 안의 링크·버튼을 눌렀을 때 상세가 함께 열리지 않게 막는다 */
  function stopCardOpen(event: React.MouseEvent) {
    event.stopPropagation();
  }

  function cycleReview() {
    const index = REVIEW_STATUS_ORDER.indexOf(reviewStatus);
    const next = REVIEW_STATUS_ORDER[(index + 1) % REVIEW_STATUS_ORDER.length];
    personalActions.setReview(representative.url, next);
  }

  const scoreBadge = (
    <span className="relative">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setScoreOpen((previous) => !previous);
        }}
        aria-expanded={scoreOpen}
        className={`score-badge shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${relevanceBadgeClass(
          representative.relevanceScore,
        )}`}
      >
        <span aria-hidden="true">연관성 {representative.relevanceScore}점</span>
        <span className="sr-only">
          기업 규제 및 애로 연관성 {representative.relevanceScore}점, 점수 근거 보기
        </span>
      </button>

      {scoreOpen && (
        <span className="score-popover" onClick={stopCardOpen}>
          <span className="score-popover__title">연관성 {representative.relevanceScore}점 근거</span>
          {representative.scoreReasons.length > 0 ? (
            <span className="score-popover__list">
              {representative.scoreReasons.map((reason) => (
                <span key={reason.label} className="score-popover__item">
                  <span className={reason.positive ? 'text-[#1A73E8]' : 'text-[#C2410C]'}>
                    {reason.positive ? '+' : ''}
                    {reason.points}
                  </span>{' '}
                  {reason.label}
                </span>
              ))}
            </span>
          ) : (
            <span className="score-popover__item">기록된 판정 근거가 없습니다.</span>
          )}
        </span>
      )}
    </span>
  );

  /* ── 압축 목록 보기 ─────────────────────────────────────────── */
  if (variant === 'compact') {
    return (
      <article
        ref={cardRef}
        onClick={handleCardClick}
        className={`compact-row ${isRead ? 'is-read' : ''} ${isSelected ? 'is-selected' : ''}`}
      >
        <label className="compact-row__check-wrap" onClick={stopCardOpen}>
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelect(representative.url)}
            aria-label={`${representative.title} 선택`}
            className="select-checkbox"
          />
        </label>
        <div className="min-w-0 flex-1">
          <button
            ref={openButtonRef}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              openDetail(pointFromEvent(event));
            }}
            className="compact-row__title"
            title={representative.title}
          >
            {isNew && <span className="badge badge--new">신규</span>}
            {representative.title}
          </button>
          <p className="compact-row__meta">
            <span title={representative.press}>{representative.publisher}</span>
            <span aria-hidden="true"> · </span>
            <span title={`발행 ${representative.publishedAt} / ${collectedLabel(representative.collectedAt)}`}>
              {formatDate(representative.publishedAt)}
            </span>
            {representative.industries.length > 0 && (
              <>
                <span aria-hidden="true"> · </span>
                <span>{representative.industries.join(', ')}</span>
              </>
            )}
            {classification.issueTypes.length > 0 && (
              <>
                <span aria-hidden="true"> · </span>
                <span>{ISSUE_TYPE_LABELS[classification.issueTypes[0]]}</span>
              </>
            )}
            <span aria-hidden="true"> · </span>
            <span>{REVIEW_STATUS_LABELS[reviewStatus]}</span>
          </p>
        </div>
        {scoreBadge}
      </article>
    );
  }

  /* ── 카드 보기 (기존 디자인 유지) ────────────────────────────── */
  return (
    <article
      ref={cardRef}
      onClick={handleCardClick}
      onPointerDown={() => setIsPressed(true)}
      onPointerUp={() => setIsPressed(false)}
      onPointerCancel={() => setIsPressed(false)}
      onPointerLeave={() => setIsPressed(false)}
      className={`article-card group relative flex h-full cursor-pointer flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-[transform,box-shadow] duration-200 hover:-translate-y-[3px] motion-reduce:transform-none motion-reduce:transition-none ${
        isOpening ? 'is-opening' : isPressed ? 'is-pressed' : ''
      } ${isSelected ? 'is-selected' : ''} ${isRead ? 'is-read' : ''}`}
    >
      {/* 산업별 accent rail */}
      <span aria-hidden="true" className="article-card__rail" />
      <span aria-hidden="true" className="article-card__sheen" />

      {ripple && (
        <span
          key={ripple.key}
          aria-hidden="true"
          className="card-ripple"
          style={
            {
              '--click-x': `${ripple.x}px`,
              '--click-y': `${ripple.y}px`,
            } as React.CSSProperties
          }
        />
      )}

      <div className="relative aspect-video overflow-hidden bg-slate-200">
        {imageFailed ? (
          <div className="absolute inset-0 bg-gradient-to-br from-[#1A73E8] via-[#4F46E5] to-[#7C3AED]" />
        ) : (
          <Image
            src={imageSrc}
            alt=""
            fill
            loading="lazy"
            sizes="(max-width: 767px) 100vw, 50vw"
            className="article-card__image object-cover motion-reduce:transform-none motion-reduce:transition-none"
            onError={() => setImageFailed(true)}
          />
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />

        {/* 선택 체크박스 — 다중 선택용 */}
        <label className="card-select" onClick={stopCardOpen}>
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelect(representative.url)}
            aria-label={`${representative.title} 선택`}
            className="select-checkbox"
          />
        </label>

        {/* 배지 줄. 색만으로 상태를 구분하지 않도록 모두 글자를 함께 쓴다 */}
        <div className="card-badges">
          {isNew && <span className="badge badge--new">신규</span>}
          {representative.industries[0] && (
            <span className="badge badge--industry">{representative.industries[0]}</span>
          )}
          {classification.issueTypes[0] && (
            <span className="badge badge--issue">
              {ISSUE_TYPE_LABELS[classification.issueTypes[0]]}
            </span>
          )}
          {(classification.urgency === 'critical' || classification.urgency === 'high') && (
            <span className="badge badge--urgency">긴급도 {URGENCY_LABELS[classification.urgency]}</span>
          )}
          {classification.evidenceType === 'company-direct' && (
            <span className="badge badge--voice">기업 직접 발언</span>
          )}
        </div>

        <h2 className="absolute inset-x-0 bottom-0 p-5">
          <button
            ref={openButtonRef}
            type="button"
            title={representative.title}
            onClick={(event) => {
              event.stopPropagation();
              openDetail(pointFromEvent(event));
            }}
            className="card-open-button line-clamp-3 text-lg font-bold leading-snug text-white"
          >
            {representative.title}
          </button>
        </h2>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-[13px] text-slate-500">
            <span title={representative.domain ?? representative.press}>{representative.publisher}</span>
            <span aria-hidden="true"> · </span>
            <span title={`발행 ${representative.publishedAt} · ${collectedLabel(representative.collectedAt)}`}>
              {formatDate(representative.publishedAt)} ({relativeDays(representative.publishedAt)})
            </span>
          </p>
          {scoreBadge}
        </div>

        {/* 상태 줄 — 검토 상태와 개인 표시 */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className={`review-pill review-pill--${reviewStatus}`}>
            {REVIEW_STATUS_LABELS[reviewStatus]}
          </span>
          {isBookmarked && <span className="mini-tag">저장함</span>}
          {isInReport && <span className="mini-tag">브리핑</span>}
          {hasMemo && <span className="mini-tag">메모</span>}
          {matchedInExpanded && <span className="mini-tag">상세 요약에서 검색됨</span>}
        </div>

        <div className="mt-3 border-t border-slate-200 pt-3">
          {representative.summary ? (
            representative.summary.map((line, index) => (
              <p key={index} className="text-[15px] leading-6 text-slate-700">
                {line}
              </p>
            ))
          ) : (
            <p className="text-[15px] leading-6 text-red-700">요약 실패</p>
          )}
        </div>

        {(classification.agencies.length > 0 || classification.companies.length > 0) && (
          <p className="mt-3 text-[12px] text-slate-500">
            {[...classification.agencies, ...classification.associations, ...classification.companies]
              .slice(0, 4)
              .join(' · ')}
          </p>
        )}

        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-2 pt-4">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              openDetail(pointFromEvent(event));
            }}
            className="card-action card-action--primary"
          >
            상세 분석
          </button>

          <a
            href={representative.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => {
              event.stopPropagation();
              personalActions.markRead(representative.url);
            }}
            className="card-action"
          >
            원문 보기
          </a>

          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              personalActions.toggleBookmark(representative.url);
            }}
            aria-pressed={isBookmarked}
            className={`card-action ${isBookmarked ? 'is-on' : ''}`}
          >
            {isBookmarked ? '저장됨' : '저장'}
          </button>

          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              personalActions.toggleReport(representative.url);
            }}
            aria-pressed={isInReport}
            className={`card-action ${isInReport ? 'is-on' : ''}`}
          >
            {isInReport ? '브리핑에 있음' : '브리핑에 추가'}
          </button>

          {related.length > 0 && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setIsExpanded((previous) => !previous);
              }}
              aria-expanded={isExpanded}
              className="flex items-center gap-1 rounded text-sm text-slate-500 transition duration-150 active:scale-95 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
            >
              관련 기사 {related.length}건
              <span
                className={`inline-block transition-transform duration-200 motion-reduce:transition-none ${
                  isExpanded ? 'rotate-180' : ''
                }`}
              >
                ▾
              </span>
            </button>
          )}

          {/* 나머지 액션은 더보기 메뉴로 접는다 */}
          <span className="relative ml-auto">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setMenuOpen((previous) => !previous);
              }}
              aria-expanded={menuOpen}
              aria-label="기사 추가 작업"
              className="card-action"
            >
              ⋯
            </button>

            {menuOpen && (
              <span className="card-menu" onClick={stopCardOpen}>
                <button
                  type="button"
                  onClick={() => {
                    cycleReview();
                    setMenuOpen(false);
                  }}
                >
                  검토 상태 바꾸기 ({REVIEW_STATUS_LABELS[reviewStatus]})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(representative.url);
                    setMenuOpen(false);
                  }}
                >
                  링크 복사
                </button>
                <button
                  type="button"
                  onClick={() => {
                    personalActions.hide(representative.url, 'not-relevant');
                    setMenuOpen(false);
                  }}
                >
                  이 브라우저에서 숨김
                </button>
              </span>
            )}
          </span>
        </div>

        {related.length > 0 && (
          <div
            className={`grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${
              isExpanded ? 'mt-3 grid-rows-[1fr]' : 'grid-rows-[0fr]'
            }`}
          >
            <div className="relative overflow-hidden">
              {isExpanded && <span aria-hidden="true" className="related-line" />}
              <ul className="space-y-2 border-t border-slate-200 pt-3">
                {related.map((item) => (
                  <li key={item.url} className="text-sm leading-5">
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={stopCardOpen}
                      className="rounded text-slate-600 underline decoration-slate-300 underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
                    >
                      {item.title}
                    </a>
                    <span className="ml-1 text-slate-400">
                      · {item.publisher} · {formatDate(item.publishedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
