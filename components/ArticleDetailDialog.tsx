'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import Image from 'next/image';
import { getArticleImage } from '@/lib/industries';
import type { Article, ArticleGroup } from '@/types/article';

/** 카드가 있던 자리. 여기서 패널이 확장되는 것처럼 보이게 한다 */
export type DetailOrigin = {
  rect: { x: number; y: number; width: number; height: number };
  /** 클릭 좌표 (뷰포트 기준). overlay 컬러 확산의 중심이 된다 */
  clickX: number;
  clickY: number;
};

type Props = {
  group: ArticleGroup;
  origin: DetailOrigin | null;
  onClose: () => void;
};

const CLOSE_DURATION_MS = 420;
const REDUCED_CLOSE_DURATION_MS = 200;
/** 관련 기사로 갈아탈 때 패널을 닫지 않고 안쪽만 바꾸는 데 걸리는 시간 */
const SWAP_DURATION_MS = 220;

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** "2026-08-03" → "2026년 8월 3일" */
function formatFullDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${year}년 ${Number(month)}월 ${Number(day)}일`;
}

function badgeToneClass(score: number): string {
  if (score >= 85) return 'score-badge--high';
  if (score >= 70) return 'score-badge--mid';
  return 'score-badge--low';
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
export function ArticleDetailDialog({ group, origin, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const timersRef = useRef<number[]>([]);
  const titleId = useId();

  // 관련 기사를 눌러 패널 안에서 다른 기사로 갈아탄 경우에만 값이 찬다
  const [shownArticle, setShownArticle] = useState<Article>(group.representative);
  const [isSwapping, setIsSwapping] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const isRepresentative = shownArticle.url === group.representative.url;
  // 대표 기사에서만 관련 기사 목록을 보여준다. 묶인 기사끼리는 서로를 참조하지 않는다
  const relatedArticles = isRepresentative ? group.related : [];

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
  }, []);

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

  // Escape는 dialog의 기본 동작(cancel)을 가로채 닫기 애니메이션으로 연결한다
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

  /** 패널 바깥(=dialog 자신)을 눌렀을 때만 닫는다 */
  function handleDialogClick(event: React.MouseEvent<HTMLDialogElement>) {
    if (event.target === dialogRef.current) requestClose();
  }

  /** 관련 기사로 갈아탄다. 패널을 닫았다 열지 않고 안쪽 내용만 교체한다 */
  function handleSwapArticle(article: Article) {
    if (isSwapping) return;
    setIsSwapping(true);
    timersRef.current.push(
      window.setTimeout(() => {
        setShownArticle(article);
        setIsSwapping(false);
      }, SWAP_DURATION_MS),
    );
  }

  // 카드 자리에서 패널이 확장되는 것처럼 보이도록 좌표 차이를 CSS 변수로 넘긴다
  const originVariables: Record<string, string> = {};
  if (origin) {
    const cardCenterX = origin.rect.x + origin.rect.width / 2;
    const cardCenterY = origin.rect.y + origin.rect.height / 2;
    originVariables['--origin-x'] = `${cardCenterX - window.innerWidth / 2}px`;
    originVariables['--origin-y'] = `${cardCenterY - window.innerHeight / 2}px`;
    originVariables['--origin-scale'] = String(
      Math.max(0.3, Math.min(0.9, origin.rect.width / Math.min(window.innerWidth, 820))),
    );
    originVariables['--click-x'] = `${origin.clickX}px`;
    originVariables['--click-y'] = `${origin.clickY}px`;
  }
  const originStyle = originVariables as React.CSSProperties;

  const imageSrc = getArticleImage(shownArticle.industries);
  const summaryLines = shownArticle.summary;

  return (
    <dialog
      ref={dialogRef}
      // native <dialog>가 암묵적으로 갖는 역할이지만, 보조기기 구현 차이를 줄이려고
      // 명시해 둔다 (showModal()이 focus trap·배경 접근 차단을 담당한다)
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

      {/*
        모바일은 하단 시트(최대 92dvh), 데스크톱은 중앙 modal(최대 820px·88dvh).
        같은 컴포넌트로 처리하고 클래스만 분기한다.
      */}
      <div
        className="detail-panel relative z-10 flex max-h-[92dvh] w-full flex-col rounded-t-3xl pb-[env(safe-area-inset-bottom)] sm:max-h-[88dvh] sm:max-w-[820px] sm:rounded-3xl"
      >
        {isSwapping && <span aria-hidden="true" className="detail-swap-line" />}

        <div className={`detail-body flex min-h-0 flex-col ${isSwapping ? 'is-swapping' : ''}`}>
          {/* 상단 이미지 + 산업명. 스크롤과 무관하게 닫기 버튼이 항상 눌린다 */}
          <div className="detail-item detail-item--1 relative aspect-[16/7] shrink-0 overflow-hidden bg-slate-200">
            <Image
              src={imageSrc}
              alt=""
              fill
              sizes="(max-width: 639px) 100vw, 820px"
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
              {shownArticle.industries.length > 0 && (
                <p className="mb-1 text-[12px] font-medium text-[#A5D8FF]">
                  {shownArticle.industries.join(' · ')}
                </p>
              )}
              <h2 id={titleId} className="text-lg font-bold leading-snug text-white sm:text-xl">
                {shownArticle.title}
              </h2>
            </div>
          </div>

          {/* 본문은 패널 안에서만 스크롤한다 */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">
            <div className="detail-item detail-item--2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-slate-500">
              <span>{shownArticle.press}</span>
              <span aria-hidden="true">·</span>
              <span>{formatFullDate(shownArticle.publishedAt)}</span>
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

            <section className="detail-item detail-item--3 detail-summary mt-4 rounded-2xl p-4">
              <h3 className="text-sm font-semibold text-[#1E3A5F]">핵심 요약</h3>
              {summaryLines && summaryLines.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {summaryLines.map((line, index) => (
                    <li key={index} className="text-[15px] leading-7 text-slate-700">
                      {line}
                    </li>
                  ))}
                </ul>
              ) : (
                // 저장된 요약이 없으면 문장을 지어내지 않는다 (PRD 5-2)
                <p className="mt-3 text-[15px] leading-7 text-slate-500">
                  요약 정보가 제공되지 않은 기사입니다.
                </p>
              )}
            </section>

            <div className="detail-item detail-item--4 mt-5">
              {/* 원문은 사이트 안에 복제하지 않고 새 탭으로만 연다 */}
              <a
                href={shownArticle.url}
                target="_blank"
                rel="noopener noreferrer"
                className="refresh-button inline-flex h-11 items-center rounded-full px-5 text-sm font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5] focus-visible:ring-offset-2"
              >
                원문 기사 열기
              </a>
            </div>

            {relatedArticles.length > 0 && (
              <section className="detail-item detail-item--5 mt-6 border-t border-slate-200 pt-4">
                <h3 className="text-sm font-semibold text-[#1E3A5F]">
                  관련 기사 {relatedArticles.length}건
                </h3>
                <ul className="mt-3 space-y-2">
                  {relatedArticles.map((item) => (
                    <li key={item.url}>
                      <button
                        type="button"
                        onClick={() => handleSwapArticle(item)}
                        className="w-full rounded-xl border border-slate-200 p-3 text-left transition hover:border-[#1A73E8]/40 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A73E8]"
                      >
                        <span className="block text-sm leading-5 text-slate-700">{item.title}</span>
                        <span className="mt-1 block text-[12px] text-slate-400">
                          {item.press} · {formatFullDate(item.publishedAt)} · 연관성{' '}
                          {item.relevanceScore}점
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {!isRepresentative && (
              <button
                type="button"
                onClick={() => handleSwapArticle(group.representative)}
                className="detail-item detail-item--6 mt-4 rounded-lg text-sm text-[#1A73E8] underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A73E8]"
              >
                대표 기사로 돌아가기
              </button>
            )}
          </div>
        </div>
      </div>
    </dialog>
  );
}
