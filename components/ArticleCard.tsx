'use client';

import { useState } from 'react';
import Image from 'next/image';
import { getArticleImage } from '@/lib/industries';
import type { ArticleGroup } from '@/types/article';

/** "2026-08-03" → "8.3" */
function formatDate(iso: string): string {
  const [, month, day] = iso.split('-');
  return `${Number(month)}.${Number(day)}`;
}

type Props = { group: ArticleGroup };

/**
 * 연관성 점수 배지 (PRD 5-2).
 * 카드에는 점수만 작게 보여주고, 산정 근거·키워드는 넣지 않는다.
 * 60점 미만은 애초에 목록에 오지 않으므로 회색이 사실상 최하 등급이다.
 */
function relevanceBadgeClass(score: number): string {
  if (score >= 80) return 'bg-[#E8F0FE] text-[#1A73E8]';
  if (score >= 70) return 'bg-[#F1F5FD] text-[#4C7DD9]';
  return 'bg-slate-100 text-slate-500';
}

/**
 * 기사 카드 한 장.
 *
 * PRD 5-2: 카드에 표시하는 것은 제목 / 언론사 / 발행일 / 요약 / 원문 링크 5가지와,
 * 묶인 기사가 있을 때만 "관련 기사 N건"이다. 그 외 정보는 넣지 않는다 — 산업 배지·
 * 관련도 점수 등은 여전히 표시하지 않는다. 상단 이미지는 장식용(산업별 대표 이미지)
 * 이며 기사 본문·원문 이미지를 크롤링한 것이 아니다.
 */
export function ArticleCard({ group }: Props) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const { representative, related } = group;
  const imageSrc = getArticleImage(representative.industries);

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md motion-reduce:transform-none motion-reduce:transition-none">
      <div className="relative aspect-video overflow-hidden bg-slate-200">
        {imageFailed ? (
          // 이미지 파일이 없거나 로딩에 실패하면 깨진 아이콘 대신 브랜드 색 그라데이션으로 대체한다
          <div className="absolute inset-0 bg-gradient-to-br from-[#1E3A5F] to-[#2563EB]" />
        ) : (
          <Image
            src={imageSrc}
            alt=""
            fill
            sizes="(max-width: 767px) 100vw, 50vw"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:transform-none motion-reduce:transition-none"
            onError={() => setImageFailed(true)}
          />
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />

        <h2 className="absolute inset-x-0 bottom-0 line-clamp-3 p-5 text-lg font-bold leading-snug text-white">
          {representative.title}
        </h2>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[13px] text-slate-500">
            {representative.press} · {formatDate(representative.publishedAt)}
          </p>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${relevanceBadgeClass(
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
            className="rounded text-sm font-semibold text-[#2563EB] transition duration-150 hover:opacity-80 active:scale-95 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
          >
            원문 보기
          </a>

          {related.length > 0 && (
            <button
              type="button"
              onClick={() => setIsExpanded((previous) => !previous)}
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
            <div className="overflow-hidden">
              <ul className="space-y-2 border-t border-slate-200 pt-3">
                {related.map((item) => (
                  <li key={item.url} className="text-sm leading-5">
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
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
