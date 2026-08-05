'use client';

import type { SuggestedPrompt } from '@/lib/suggestedPrompts';

export function AgentSuggestedPrompts({
  prompts,
  onSelect,
}: {
  prompts: SuggestedPrompt[];
  onSelect: (prompt: SuggestedPrompt) => void;
}) {
  if (prompts.length === 0) return null;

  return (
    <div role="group" aria-label="추천 질문" className="agent-suggested">
      {prompts.map((prompt, index) => (
        <button
          key={prompt.id}
          type="button"
          className="agent-suggested__chip"
          style={{ ['--chip-index' as string]: String(index) }}
          onClick={() => onSelect(prompt)}
        >
          {prompt.label}
        </button>
      ))}
    </div>
  );
}
