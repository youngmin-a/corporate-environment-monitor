'use client';

import { AGENT_COMMANDS } from '@/lib/agentCommands';

export function AgentCommandAutocomplete({
  filter,
  activeIndex,
  onSelect,
}: {
  filter: string;
  activeIndex: number;
  onSelect: (id: string) => void;
}) {
  const matches = AGENT_COMMANDS.filter((command) => command.id.startsWith(filter)).slice(0, 8);
  if (matches.length === 0) return null;

  return (
    <ul role="listbox" aria-label="명령어 자동완성" className="agent-command-list">
      {matches.map((command, index) => (
        <li key={command.id} role="option" aria-selected={index === activeIndex}>
          <button
            type="button"
            className={`agent-command-item ${index === activeIndex ? 'is-active' : ''}`}
            onClick={() => onSelect(command.id)}
          >
            <span className="agent-command-item__id">/{command.id}</span>
            <span className="agent-command-item__desc">{command.description}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
