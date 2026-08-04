'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { getArticleImage } from '@/lib/industries';
import type { ArticleGroup } from '@/types/article';
import type { DetailOrigin } from '@/components/ArticleDetailDialog';

/** "2026-08-03" → "8.3" */
function formatDate(iso: string): string {
  const [, month, day] = iso.split('-');
  return `${Number(month)}.${Number(day)}`;
}

type Props = {
  group: ArticleGroup;
  /** 상세를 열 때 카드 위치·클릭 좌표를 함께 넘겨 그 자리에서 확장되게 한다 */
  onOpenDetail: (group: ArticleGroup, origin: DetailOrigin, trigger: HTMLElement) => void;
};

/** ripple → 출렁임이 끝나고 상세가 열리기까지 */
const OPEN_DELAY_MS = 260;
const WOBBLE_DURATION_MS = 380;

/**
 * 연관성 점수 배지 (PRD 5-2).
 * 카드에는 점수만 작게 보여주고, 산정 근거·키워드는 넣지 않는다.
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
 * PRD 5-2: 카드에 표시하는 것은 제목 / 언론사 / 발행일 / 요약 / 원문 링크 5가지와,
 * 묶인 기사가 있을 때만 "관련 기사 N건"이다. 그 외 정보는 넣지 않는다 — 산업 배지·
 * 관련도 점수 등은 여전히 표시하지 않는다. 상단 이미지는 장식용(산업별 대표 이미지)
 * 이며 기사 본문·원문 이미지를 크롤링한 것이 아니다.
 */
export function ArticleCard({ group, onOpenDetail }: Props) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [ripple, setRipple] = useState<{ key: number; x: number; y: number } | null>(null);
  const [isOpening, setIsOpening] = useState(false);
  // 터치 기기는 hover가 없으므로 누르는 동안만 살짝 눌린 느낌을 준다
  const [isPressed, setIsPressed] = useState(false);
  const cardRef = useRef<HTMLElement>(null);
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const timersRef = useRef<number[]>([]);
  const { representative, related } = group;
  const imageSrc = getArticleImage(representative.industries);

  useEffect(
    () => () => {
      timersRef.current.forEach((id) => window.clearTimeout(id));
    },
    [],
  );

  /**
   * 카드를 눌러 상세를 연다.
   *
   * ripple → 미세한 출렁임을 먼저 보여주고, 그 다음 상세를 띄운다.
   * 카드 안의 링크·버튼은 각자 stopPropagation으로 막으므로 여기까지 오지 않는다.
   */
  function openDetail(point: { x: number; y: number } | null) {
    const card = cardRef.current;
    if (!card || isOpening) return;

    const rect = card.getBoundingClientRect();
    // 좌표가 없으면(키보드 실행) 카드 중앙에서 퍼지게 한다
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
          // 상세를 닫을 때 포커스를 되돌릴 곳. 카드 자체는 초점을 받지 못하므로
          // 실제로 초점을 받을 수 있는 제목 버튼을 넘긴다
          openButtonRef.current ?? card,
        );
      }, OPEN_DELAY_MS),
    );

    // 출렁임이 끝나면 상태 class를 떼어 hover transform과 겹치지 않게 한다
    timersRef.current.push(
      window.setTimeout(() => {
        setIsOpening(false);
        setRipple(null);
      }, WOBBLE_DURATION_MS),
    );
  }

  /**
   * 마우스·터치는 누른 좌표를, 키보드(Enter·Space)는 좌표가 없다는 뜻으로 null을
   * 넘긴다 — 키보드 실행은 clientX/Y가 0으로 들어와 그대로 쓰면 ripple이 카드
   * 왼쪽 위 모서리에서 퍼진다. `detail === 0`이 키보드 실행 표시다.
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
      }`}
    >
      {/* hover로 들어올 때 카드 위를 한 번 지나가는 빛 */}
      <span aria-hidden="true" className="article-card__sheen" />

      {/* 클릭 지점에서 한 번 퍼지는 ripple */}
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
          // 이미지 파일이 없거나 로딩에 실패하면 깨진 아이콘 대신 브랜드 색 그라데이션으로 대체한다
          <div className="absolute inset-0 bg-gradient-to-br from-[#1A73E8] via-[#4F46E5] to-[#7C3AED]" />
        ) : (
          <Image
            src={imageSrc}
            alt=""
            fill
            sizes="(max-width: 767px) 100vw, 50vw"
            className="article-card__image object-cover motion-reduce:transform-none motion-reduce:transition-none"
            onError={() => setImageFailed(true)}
          />
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />

        {/*
          제목을 button으로 감싸 키보드(Tab → Enter/Space)로도 상세를 열 수 있게 한다.
          카드 전체를 role="button"으로 만들면 내부 링크와 중첩돼 접근성이 깨진다.
        */}
        <h2 className="absolute inset-x-0 bottom-0 p-5">
          <button
            ref={openButtonRef}
            type="button"
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
          <p className="text-[13px] text-slate-500">
            {representative.press} · {formatDate(representative.publishedAt)}
          </p>
          <span
            className={`score-badge shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${relevanceBadgeClass(
              representative.relevanceScore,
            )}`}
          >
            <span aria-hidden="true">연관성 {representative.relevanceScore}점</span>
            <span className="sr-only">
              기업 규제 및 애로 연관성 {representative.relevanceScore}점
            </span>
          </span>
        </div>

        <div className="mt-4 border-t border-slate-200 pt-4">
          {representative.summary ? (
            representative.summary.map((line, index) => (
              <p key={index} className="text-[15px] leading-6 text-slate-700">
                {line}
              </p>
            ))
          ) : (
            // PRD 5-2: 요약에 실패하면 문장을 지어내지 않고 이 문구만 남긴다
            <p className="text-[15px] leading-6 text-red-700">요약 실패</p>
          )}
        </div>

        <div className="mt-auto flex items-center gap-4 pt-5">
          <a
            href={representative.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={stopCardOpen}
            className="rounded text-sm font-semibold text-[#2563EB] transition duration-150 hover:opacity-80 active:scale-95 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
          >
            원문 보기
          </a>

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
        </div>

        {/* PRD 5-2: 펼치기는 카드 안에서만 일어난다. 별도 페이지로 이동하지 않는다 */}
        {related.length > 0 && (
          <div
            className={`grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${
              isExpanded ? 'mt-3 grid-rows-[1fr]' : 'grid-rows-[0fr]'
            }`}
          >
            <div className="relative overflow-hidden">
              {/* 펼치는 순간 상단을 따라 한 번 지나가는 컬러 라인 */}
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
                      · {item.press} · {formatDate(item.publishedAt)}
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
