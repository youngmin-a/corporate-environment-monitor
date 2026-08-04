'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import Image from 'next/image';
import {
  EVIDENCE_TYPE_LABELS,
  ISSUE_TYPE_LABELS,
  POLICY_STAGE_LABELS,
  URGENCY_LABELS,
} from '@/lib/classification';
import { getArticleImage } from '@/lib/industries';
import {
  personalActions,
  REVIEW_STATUS_LABELS,
  REVIEW_STATUS_ORDER,
  type ReviewStatus,
} from '@/lib/personalState';
import type { EnrichedArticle, EnrichedGroup } from '@/types/article';

/** 카드가 있던 자리. 여기서 패널이 확장되는 것처럼 보이게 한다 */
export type DetailOrigin = {
  rect: { x: number; y: number; width: number; height: number };
  /** 클릭 좌표 (뷰포트 기준). overlay 컬러 확산의 중심이 된다 */
  clickX: number;
  clickY: number;
};

type Props = {
  group: EnrichedGroup;
  origin: DetailOrigin | null;
  /** 검색어. 확장 요약에서 걸린 문장을 강조한다 */
  searchTerm: string;
  reviewStatus: ReviewStatus;
  isBookmarked: boolean;
  isInReport: boolean;
  memo: string;
  onClose: () => void;
};

const CLOSE_DURATION_MS = 420;
const REDUCED_CLOSE_DURATION_MS = 200;
/** 관련 기사로 갈아탈 때 패널을 닫지 않고 안쪽만 바꾸는 데 걸리는 시간 */
const SWAP_DURATION_MS = 220;
const MEMO_SAVE_DEBOUNCE_MS = 500;

type TabKey = 'summary' | 'structure' | 'entities' | 'related' | 'meta';

const TAB_LABELS: Record<TabKey, string> = {
  summary: '핵심 요약',
  structure: '규제·애로 구조',
  entities: '기업·기관',
  related: '관련 기사',
  meta: '기사 정보',
};

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** "2026-08-03" → "2026년 8월 3일" */
function formatFullDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${year}년 ${Number(month)}월 ${Number(day)}일`;
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 ${String(
    date.getHours(),
  ).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function badgeToneClass(score: number): string {
  if (score >= 85) return 'score-badge--high';
  if (score >= 70) return 'score-badge--mid';
  return 'score-badge--low';
}

/** 검색어가 들어 있는 문장을 표시한다 (문장 안 강조는 하지 않아 렌더 비용을 낮춘다) */
function isSearchHit(line: string, term: string): boolean {
  return term.length > 0 && line.toLowerCase().includes(term.toLowerCase());
}

/**
 * 기사 상세 dialog.
 *
 * 화면에 이미 내려와 있는 데이터만 받아 그린다 — 열 때 기사 API·OpenAI·Supabase를
 * 다시 부르지 않는다. 기사 본문은 저장하지도 크롤링하지도 않으므로, 저장된 요약과
 * 메타데이터만 보여주고 원문은 새 탭 링크로만 연결한다.
 *
 * focus trap·Escape·배경 접근 차단은 native <dialog>의 showModal()에 맡긴다.
 */
export function ArticleDetailDialog({
  group,
  origin,
  searchTerm,
  reviewStatus,
  isBookmarked,
  isInReport,
  memo,
  onClose,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const timersRef = useRef<number[]>([]);
  const memoTimerRef = useRef<number>(0);
  const titleId = useId();

  const [shownArticle, setShownArticle] = useState<EnrichedArticle>(group.representative);
  const [tab, setTab] = useState<TabKey>('summary');
  const [isSwapping, setIsSwapping] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [memoDraft, setMemoDraft] = useState(memo);

  const isRepresentative = shownArticle.url === group.representative.url;
  const relatedArticles = isRepresentative ? group.related : [];
  const { classification } = shownArticle;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
  }, []);

  // 상세를 연 것 자체가 "확인함"이다 (PRD 5-4)
  useEffect(() => {
    personalActions.markRead(shownArticle.url);
  }, [shownArticle.url]);

  /**
   * 배경 스크롤 잠금.
   * iOS Safari는 overflow:hidden만으로는 배경이 밀리므로 position:fixed로 고정하고,
   * 닫을 때 원래 스크롤 위치를 정확히 되돌린다.
   */
  useEffect(() => {
    const scrollY = window.scrollY;
    const body = document.body;
    const previous = {
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      overflow: body.style.overflow,
    };

    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.width = '100%';
    body.style.overflow = 'hidden';

    return () => {
      body.style.position = previous.position;
      body.style.top = previous.top;
      body.style.width = previous.width;
      body.style.overflow = previous.overflow;
      window.scrollTo(0, scrollY);
    };
  }, []);

  useEffect(
    () => () => {
      timersRef.current.forEach((id) => window.clearTimeout(id));
      window.clearTimeout(memoTimerRef.current);
    },
    [],
  );

  /** 닫기 애니메이션을 보여준 뒤 실제로 언마운트한다 */
  const requestClose = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
    const duration = prefersReducedMotion() ? REDUCED_CLOSE_DURATION_MS : CLOSE_DURATION_MS;
    timersRef.current.push(window.setTimeout(onClose, duration));
  }, [isClosing, onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleCancel = (event: Event) => {
      event.preventDefault();
      requestClose();
    };
    dialog.addEventListener('cancel', handleCancel);
    return () => dialog.removeEventListener('cancel', handleCancel);
  }, [requestClose]);

  function handleDialogClick(event: React.MouseEvent<HTMLDialogElement>) {
    if (event.target === dialogRef.current) requestClose();
  }

  /** 관련 기사로 갈아탄다. 패널을 닫았다 열지 않고 안쪽 내용만 교체한다 */
  function handleSwapArticle(article: EnrichedArticle) {
    if (isSwapping) return;
    setIsSwapping(true);
    timersRef.current.push(
      window.setTimeout(() => {
        setShownArticle(article);
        setTab('summary');
        setIsSwapping(false);
      }, SWAP_DURATION_MS),
    );
  }

  function handleMemoChange(value: string) {
    setMemoDraft(value);
    window.clearTimeout(memoTimerRef.current);
    memoTimerRef.current = window.setTimeout(() => {
      personalActions.setMemo(shownArticle.url, value);
    }, MEMO_SAVE_DEBOUNCE_MS);
  }

  // 카드 자리에서 패널이 확장되는 것처럼 보이도록 좌표 차이를 CSS 변수로 넘긴다
  const originVariables: Record<string, string> = {};
  if (origin) {
    const cardCenterX = origin.rect.x + origin.rect.width / 2;
    const cardCenterY = origin.rect.y + origin.rect.height / 2;
    originVariables['--origin-x'] = `${cardCenterX - window.innerWidth / 2}px`;
    originVariables['--origin-y'] = `${cardCenterY - window.innerHeight / 2}px`;
    originVariables['--origin-scale'] = String(
      Math.max(0.3, Math.min(0.9, origin.rect.width / Math.min(window.innerWidth, 900))),
    );
    originVariables['--click-x'] = `${origin.clickX}px`;
    originVariables['--click-y'] = `${origin.clickY}px`;
  }
  const originStyle = originVariables as React.CSSProperties;

  const imageSrc = getArticleImage(shownArticle.industries);
  const expanded = shownArticle.expandedSummary;
  const hasExpanded = Boolean(expanded && expanded.length > 0);
  /** 확장 요약이 없으면 카드 요약으로 대체한다 — 문장을 새로 만들지 않는다 */
  const detailLines = hasExpanded ? (expanded as string[]) : (shownArticle.summary ?? []);

  return (
    <dialog
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={handleDialogClick}
      style={originStyle}
      className={`detail-dialog m-0 h-full max-h-none w-full items-end justify-center backdrop:bg-transparent open:flex sm:items-center ${
        isClosing ? 'is-closing' : ''
      }`}
    >
      <span aria-hidden="true" className="detail-overlay" />

      <div className="detail-panel relative z-10 flex max-h-[94dvh] w-full flex-col rounded-t-3xl pb-[env(safe-area-inset-bottom)] sm:max-h-[90dvh] sm:max-w-[900px] sm:rounded-3xl">
        {isSwapping && <span aria-hidden="true" className="detail-swap-line" />}

        <div className={`detail-body flex min-h-0 flex-col ${isSwapping ? 'is-swapping' : ''}`}>
          <div className="detail-item detail-item--1 relative aspect-[16/6] shrink-0 overflow-hidden bg-slate-200">
            <Image
              src={imageSrc}
              alt=""
              fill
              sizes="(max-width: 639px) 100vw, 900px"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />

            <button
              type="button"
              onClick={requestClose}
              aria-label="기사 상세 닫기"
              className="absolute right-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-lg text-white backdrop-blur-sm transition hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              ✕
            </button>

            <div className="absolute inset-x-0 bottom-0 p-5">
              <p className="mb-1 flex flex-wrap items-center gap-1.5 text-[12px] font-medium text-[#A5D8FF]">
                {shownArticle.industries.length > 0 && (
                  <span>{shownArticle.industries.join(' · ')}</span>
                )}
                {classification.issueTypes.map((type) => (
                  <span key={type} className="badge badge--issue">
                    {ISSUE_TYPE_LABELS[type]}
                  </span>
                ))}
              </p>
              <h2 id={titleId} className="text-lg font-bold leading-snug text-white sm:text-xl">
                {shownArticle.title}
              </h2>
            </div>
          </div>

          {/* 탭 */}
          <div role="tablist" aria-label="기사 상세 보기" className="detail-tabs">
            {(Object.keys(TAB_LABELS) as TabKey[]).map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={`detail-tab ${tab === key ? 'is-on' : ''}`}
              >
                {TAB_LABELS[key]}
                {key === 'related' && relatedArticles.length > 0 && ` ${relatedArticles.length}`}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">
            <div className="detail-item detail-item--2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-slate-500">
              <span title={shownArticle.domain ?? shownArticle.press}>{shownArticle.publisher}</span>
              <span aria-hidden="true">·</span>
              <span>{formatFullDate(shownArticle.publishedAt)} 발행</span>
              <span aria-hidden="true">·</span>
              <span>{formatDateTime(shownArticle.collectedAt)} 수집</span>
              <span
                className={`score-badge ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium ${badgeToneClass(
                  shownArticle.relevanceScore,
                )}`}
              >
                <span aria-hidden="true">연관성 {shownArticle.relevanceScore}점</span>
                <span className="sr-only">
                  기업 규제 및 애로 연관성 {shownArticle.relevanceScore}점
                </span>
              </span>
            </div>

            {/* ── 핵심 요약 ─────────────────────────────────────── */}
            {tab === 'summary' && (
              <div key="summary" className="detail-tabpanel">
                <div className="detail-item detail-item--3 mt-3 flex flex-wrap gap-1.5 text-[12px]">
                  <span className="mini-tag">긴급도 {URGENCY_LABELS[classification.urgency]}</span>
                  {classification.evidenceType && (
                    <span className="mini-tag">
                      {EVIDENCE_TYPE_LABELS[classification.evidenceType]}
                    </span>
                  )}
                  {classification.policyStage && (
                    <span className="mini-tag">
                      {POLICY_STAGE_LABELS[classification.policyStage]}
                    </span>
                  )}
                </div>

                <section className="detail-item detail-item--4 detail-summary mt-4 rounded-2xl p-4">
                  <h3 className="text-sm font-semibold text-[#1E3A5F]">상세 요약</h3>

                  {detailLines.length > 0 ? (
                    <>
                      {!hasExpanded && (
                        <p className="mt-2 text-[12px] text-slate-500">
                          상세 요약이 아직 생성되지 않은 기사입니다. 현재 제공되는 핵심 요약을
                          표시합니다.
                        </p>
                      )}
                      <ol className="detail-summary__list mt-3">
                        {detailLines.map((line, index) => (
                          <li
                            key={index}
                            className={`detail-summary__line ${
                              isSearchHit(line, searchTerm) ? 'is-hit' : ''
                            }`}
                            style={{ ['--line-index' as string]: String(index) }}
                          >
                            <span aria-hidden="true" className="detail-summary__index">
                              {String(index + 1).padStart(2, '0')}
                            </span>
                            <span>{line}</span>
                          </li>
                        ))}
                      </ol>
                    </>
                  ) : (
                    <p className="mt-3 text-[15px] leading-7 text-slate-500">
                      요약 정보가 제공되지 않은 기사입니다.
                    </p>
                  )}
                </section>

                <div className="detail-item detail-item--5 mt-5 flex flex-wrap items-center gap-2">
                  <a
                    href={shownArticle.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="refresh-button inline-flex h-11 items-center rounded-full px-5 text-sm font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5] focus-visible:ring-offset-2"
                  >
                    원문 기사 열기
                  </a>

                  <button
                    type="button"
                    onClick={() => personalActions.toggleBookmark(shownArticle.url)}
                    aria-pressed={isBookmarked}
                    className={`card-action ${isBookmarked ? 'is-on' : ''}`}
                  >
                    {isBookmarked ? '저장됨' : '저장'}
                  </button>

                  <button
                    type="button"
                    onClick={() => personalActions.toggleReport(shownArticle.url)}
                    aria-pressed={isInReport}
                    className={`card-action ${isInReport ? 'is-on' : ''}`}
                  >
                    {isInReport ? '브리핑에 있음' : '브리핑에 추가'}
                  </button>

                  <label className="ml-auto text-[13px] text-slate-500">
                    검토 상태
                    <select
                      value={reviewStatus}
                      onChange={(event) =>
                        personalActions.setReview(shownArticle.url, event.target.value as ReviewStatus)
                      }
                      className="ml-2 h-9 rounded-lg border border-slate-300 px-2 text-[13px]"
                    >
                      {REVIEW_STATUS_ORDER.map((status) => (
                        <option key={status} value={status}>
                          {REVIEW_STATUS_LABELS[status]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="detail-item detail-item--6 mt-5 block text-sm font-semibold text-[#1E3A5F]">
                  메모
                  <textarea
                    value={memoDraft}
                    onChange={(event) => handleMemoChange(event.target.value)}
                    rows={3}
                    placeholder="검토 메모를 남기면 이 브라우저에만 저장됩니다."
                    className="mt-2 w-full rounded-xl border border-slate-300 p-3 text-sm font-normal leading-6 text-slate-700 focus:border-[#1A73E8] focus:outline-none"
                  />
                </label>
              </div>
            )}

            {/* ── 규제·애로 구조 ────────────────────────────────── */}
            {tab === 'structure' && (
              <div key="structure" className="detail-tabpanel mt-4">
                <dl className="structure-list">
                  <div>
                    <dt>이슈 유형</dt>
                    <dd>
                      {classification.issueTypes.length > 0
                        ? classification.issueTypes.map((type) => ISSUE_TYPE_LABELS[type]).join(', ')
                        : '저장된 분류 결과가 없습니다.'}
                    </dd>
                  </div>
                  <div>
                    <dt>근거 유형</dt>
                    <dd>
                      {classification.evidenceType
                        ? EVIDENCE_TYPE_LABELS[classification.evidenceType]
                        : '요약에서 발언 주체를 확인하지 못했습니다.'}
                    </dd>
                  </div>
                  <div>
                    <dt>정책 단계</dt>
                    <dd>
                      {classification.policyStage
                        ? POLICY_STAGE_LABELS[classification.policyStage]
                        : '요약에서 진행 단계를 확인하지 못했습니다.'}
                    </dd>
                  </div>
                  <div>
                    <dt>긴급도</dt>
                    <dd>{URGENCY_LABELS[classification.urgency]}</dd>
                  </div>
                  <div>
                    <dt>지역 범위</dt>
                    <dd>{classification.geographicScope === 'overseas' ? '해외 규제' : '국내'}</dd>
                  </div>
                </dl>

                <h3 className="mt-5 text-sm font-semibold text-[#1E3A5F]">연관성 점수 근거</h3>
                {shownArticle.scoreReasons.length > 0 ? (
                  <ul className="mt-2 space-y-1 text-[14px] leading-6 text-slate-700">
                    {shownArticle.scoreReasons.map((reason) => (
                      <li key={reason.label}>
                        <span className={reason.positive ? 'text-[#1A73E8]' : 'text-[#C2410C]'}>
                          {reason.positive ? '+' : ''}
                          {reason.points}
                        </span>{' '}
                        {reason.label}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">기록된 판정 근거가 없습니다.</p>
                )}

                <p className="mt-4 text-[12px] leading-5 text-slate-400">
                  이 화면의 분류는 저장된 제목과 요약에서 고정 키워드로 판정한 결과입니다. 기사에
                  없는 내용을 추정해 채우지 않습니다.
                </p>
              </div>
            )}

            {/* ── 기업·기관 ─────────────────────────────────────── */}
            {tab === 'entities' && (
              <div key="entities" className="detail-tabpanel mt-4">
                {[
                  ['언급된 정부기관', classification.agencies],
                  ['언급된 협회·경제단체', classification.associations],
                  ['언급된 기업', classification.companies],
                ].map(([label, items]) => (
                  <section key={label as string} className="mb-4">
                    <h3 className="text-sm font-semibold text-[#1E3A5F]">{label as string}</h3>
                    {(items as string[]).length > 0 ? (
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {(items as string[]).map((name) => (
                          <li key={name} className="mini-tag">
                            {name}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-sm text-slate-500">확인된 항목이 없습니다.</p>
                    )}
                  </section>
                ))}
              </div>
            )}

            {/* ── 관련 기사 ─────────────────────────────────────── */}
            {tab === 'related' && (
              <div key="related" className="detail-tabpanel mt-4">
                {relatedArticles.length > 0 ? (
                  <ul className="space-y-2">
                    {relatedArticles.map((item) => (
                      <li key={item.url}>
                        <button
                          type="button"
                          onClick={() => handleSwapArticle(item)}
                          className="w-full rounded-xl border border-slate-200 p-3 text-left transition hover:border-[#1A73E8]/40 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A73E8]"
                        >
                          <span className="block text-sm leading-5 text-slate-700">{item.title}</span>
                          <span className="mt-1 block text-[12px] text-slate-400">
                            {item.publisher} · {formatFullDate(item.publishedAt)} · 연관성{' '}
                            {item.relevanceScore}점
                            {item.classification.evidenceType === 'company-direct' &&
                              ' · 기업 직접 발언'}
                          </span>
                        </button>
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 inline-block text-[12px] text-[#1A73E8] underline"
                        >
                          원문 열기
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-500">같은 사안으로 묶인 기사가 없습니다.</p>
                )}

                {!isRepresentative && (
                  <button
                    type="button"
                    onClick={() => handleSwapArticle(group.representative)}
                    className="mt-4 rounded-lg text-sm text-[#1A73E8] underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A73E8]"
                  >
                    대표 기사로 돌아가기
                  </button>
                )}
              </div>
            )}

            {/* ── 기사 정보 ─────────────────────────────────────── */}
            {tab === 'meta' && (
              <div key="meta" className="detail-tabpanel mt-4">
                <dl className="structure-list">
                  <div>
                    <dt>원문 URL</dt>
                    <dd className="break-all">
                      <a
                        href={shownArticle.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#1A73E8] underline"
                      >
                        {shownArticle.url}
                      </a>
                    </dd>
                  </div>
                  <div>
                    <dt>언론사</dt>
                    <dd>
                      {shownArticle.publisher}
                      {shownArticle.domain && ` (${shownArticle.domain})`}
                    </dd>
                  </div>
                  <div>
                    <dt>발행일</dt>
                    <dd>{formatFullDate(shownArticle.publishedAt)}</dd>
                  </div>
                  <div>
                    <dt>수집 시각</dt>
                    <dd>{formatDateTime(shownArticle.collectedAt)}</dd>
                  </div>
                  <div>
                    <dt>산업 분류</dt>
                    <dd>
                      {shownArticle.industries.length > 0
                        ? shownArticle.industries.join(', ')
                        : '미분류'}
                    </dd>
                  </div>
                  <div>
                    <dt>상세 요약</dt>
                    <dd>{hasExpanded ? `${(expanded as string[]).length}문장 저장됨` : '없음'}</dd>
                  </div>
                </dl>

                <h3 className="mt-5 text-sm font-semibold text-[#1E3A5F]">데이터 품질 피드백</h3>
                <p className="mt-1 text-[12px] text-slate-500">
                  선택하면 이 브라우저에서만 숨겨집니다. 서버 데이터는 바뀌지 않습니다.
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(
                    [
                      ['not-relevant', '관련 없음'],
                      ['wrong-industry', '산업 분류 오류'],
                      ['duplicate', '중복 기사'],
                      ['bad-summary', '요약 오류'],
                      ['bad-source', '출처 오류'],
                    ] as const
                  ).map(([reason, label]) => (
                    <button
                      key={reason}
                      type="button"
                      onClick={() => {
                        personalActions.hide(shownArticle.url, reason);
                        requestClose();
                      }}
                      className="card-action"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </dialog>
  );
}
