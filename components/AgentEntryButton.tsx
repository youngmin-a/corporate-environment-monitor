'use client';

import { forwardRef } from 'react';

/**
 * AI 분석관 진입 버튼.
 *
 * 우측 하단 고정 버튼으로 둔다 — Command Center 헤더는 이미 통계·새로고침으로
 * 밀도가 높아 여기 더 얹지 않는다. 다중 선택 시 뜨는 하단 action-bar와 겹치지
 * 않도록, 그 bar가 보이는 동안은 `liftForActionBar`로 위치를 올려 준다.
 */
export const AgentEntryButton = forwardRef<HTMLButtonElement, { onClick: () => void; liftForActionBar: boolean }>(
  function AgentEntryButton({ onClick, liftForActionBar }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        className={`agent-entry-button ${liftForActionBar ? 'is-lifted' : ''}`}
      >
        <span aria-hidden="true" className="agent-entry-button__icon">
          ✦
        </span>
        AI 분석
      </button>
    );
  },
);
