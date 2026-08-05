'use client';

import type { AgentSource } from '@/types/agent';

export function AgentSourceCard({ source, onOpenDetail }: { source: AgentSource; onOpenDetail: (articleId: string) => void }) {
  return (
    <li className="agent-source-card">
      {source.citationIndex !== null && <span className="agent-source-card__index">[{source.citationIndex}]</span>}
      <div className="agent-source-card__body">
        <button type="button" className="agent-source-card__title" onClick={() => onOpenDetail(source.articleId)}>
          {source.title}
        </button>
        <p className="agent-source-card__meta">
          {source.publisher} · {source.publishedAt} · {source.industries.join(', ') || '산업 미분류'} · 연관성 {source.relevanceScore}점
          {source.evidenceType === 'company-direct' && ' · 기업 직접 발언'}
        </p>
      </div>
      <a href={source.url} target="_blank" rel="noopener noreferrer" className="agent-source-card__link">
        원문 열기
      </a>
    </li>
  );
}
