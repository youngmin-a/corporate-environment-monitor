'use client';

import { useState } from 'react';
import type { ArticleGroup } from '@/types/article';

/** "2026-08-03" → "8.3" */
function formatDate(iso: string): string {
  const [, month, day] = iso.split('-');
  return `${Number(month)}.${Number(day)}`;
}

type Props = { group: ArticleGroup };

/**
 * 기사 카드 한 장.
 *
 * PRD 5-2: 카드에 표시하는 것은 제목 / 언론사 / 발행일 / 요약 / 원문 링크 5가지와,
 * 묶인 기사가 있을 때만 "관련 기사 N건"이다. 그 외 정보는 넣지 않는다.
 */
export function ArticleCard({ group }: Props) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { representative, related } = group;

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 transition-[box-shadow,transform] duration-150 hover:-translate-y-px hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0">
      <h2 className="text-base font-bold leading-6 text-[#1E3A5F]">
        {representative.title}
      </h2>

      <p className="mt-2 text-[13px] text-slate-500">
        {representative.press} · {formatDate(representative.publishedAt)}
      </p>

      <div className="mt-3 border-t border-slate-200 pt-3">
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

      <div className="mt-3 flex items-center gap-4">
        <a
          href={representative.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-semibold text-[#2563EB] transition-transform duration-150 active:scale-95 motion-reduce:transition-none"
        >
          원문 보기
        </a>

        {related.length > 0 && (
          <button
            type="button"
            onClick={() => setIsExpanded((previous) => !previous)}
            aria-expanded={isExpanded}
            className="flex items-center gap-1 text-sm text-slate-500 transition-transform duration-150 active:scale-95 motion-reduce:transition-none"
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
                    className="text-slate-600 underline decoration-slate-300 underline-offset-2"
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
    </article>
  );
}
