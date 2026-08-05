'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArticleDetailDialog } from '@/components/ArticleDetailDialog';
import { AgentCommandAutocomplete } from '@/components/AgentCommandAutocomplete';
import { AgentMessageBody } from '@/components/AgentMessage';
import { AgentSourceCard } from '@/components/AgentSourceCard';
import { AgentSuggestedPrompts } from '@/components/AgentSuggestedPrompts';
import { AGENT_COMMANDS } from '@/lib/agentCommands';
import { streamAgentChat } from '@/lib/agentClient';
import { presetChips, removePresetChip } from '@/lib/agentPresetChips';
import { reviewStatusOf, usePersonalState } from '@/lib/personalState';
import type { Industry } from '@/lib/industries';
import type { SuggestedPrompt } from '@/lib/suggestedPrompts';
import type { AgentAnswerPayload, AgentFollowUp, AgentPreset } from '@/types/agent';
import type { EnrichedGroup } from '@/types/article';
import type { DetailOrigin } from '@/components/ArticleDetailDialog';

const MAX_MESSAGE_LENGTH = 600;

type AssistantMessage = {
  id: string;
  role: 'assistant';
  text: string;
  streaming: boolean;
  phase: 'idle' | 'searching' | 'analyzing' | 'streaming' | 'done' | 'error';
  sources: AgentAnswerPayload['sources'];
  referenceSources: AgentAnswerPayload['referenceSources'];
  sourceGroups: EnrichedGroup[];
  followUps: AgentFollowUp[];
  appliedFilters: AgentPreset;
  searchMetadata: AgentAnswerPayload['searchMetadata'] | null;
  insufficientEvidence: boolean;
  errorMessage: string | null;
};

type UserMessage = { id: string; role: 'user'; text: string };
type ChatMessage = UserMessage | AssistantMessage;

function makeId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

type Props = {
  open: boolean;
  onClose: () => void;
  currentIndustryScope: Industry[];
};

/**
 * 기업환경 AI 분석관 drawer/sheet.
 *
 * 별도 route를 만들지 않는다. 데스크톱은 오른쪽 drawer, 모바일은 하단 시트로
 * `.filter-dialog`/`.filter-drawer` 클래스 계열을 확장해 재사용한다(CLAUDE.md
 * "외부 라이브러리 최소화" 원칙과 일관되게 새 dialog 프레임워크를 쓰지 않는다).
 */
export function AgentPanel({ open, onClose, currentIndustryScope }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const inputId = useId();
  const abortRef = useRef<AbortController | null>(null);
  const personal = usePersonalState();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [activePreset, setActivePreset] = useState<AgentPreset>({});
  const [isBusy, setIsBusy] = useState(false);
  const [suggested, setSuggested] = useState<SuggestedPrompt[]>([]);
  const [detail, setDetail] = useState<{ group: EnrichedGroup; origin: DetailOrigin | null } | null>(null);
  const detailTriggerRef = useRef<HTMLElement | null>(null);
  const shouldRestoreFocusRef = useRef(false);

  const commandFilter = useMemo(() => {
    const match = /(?:^|\s)\/(\S*)$/.exec(draft);
    return match ? match[1] : null;
  }, [draft]);
  const [commandActiveIndex, setCommandActiveIndex] = useState(0);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  /**
   * 포커스 복귀는 dialog가 실제로 닫힌 뒤에만 안전하다 — 열려 있는 동안(top layer에
   * 있는 동안)에는 바깥 요소로 focus를 옮겨도 브라우저가 막는다. dialog의 native
   * 'close' 이벤트에 기대는 대신, 닫는 동작(버튼·backdrop·Escape) 각각에서 직접
   * `requestClose()`를 부르고 다음 tick(setTimeout 0)에 onClose를 실행한다 —
   * `.close()` 호출은 동기이므로 다음 tick이면 이미 top layer에서 빠진 뒤다.
   */
  const requestClose = useCallback(() => {
    dialogRef.current?.close();
    window.setTimeout(() => onClose(), 0);
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    // Escape는 브라우저 기본 동작(닫기)을 그대로 두고, 닫힌 뒤 onClose만 이어 부른다
    const handleCancel = () => window.setTimeout(() => onClose(), 0);
    dialog.addEventListener('cancel', handleCancel);
    return () => dialog.removeEventListener('cancel', handleCancel);
  }, [onClose]);

  // 패널을 열 때만 추천 질문을 불러온다 (LLM 호출 없음, 저장된 집계만 읽는다)
  useEffect(() => {
    if (!open) return;
    const industry = currentIndustryScope.length === 1 ? currentIndustryScope[0] : '';
    const controller = new AbortController();
    fetch(`/api/agent/suggestions${industry ? `?industry=${encodeURIComponent(industry)}` : ''}`, {
      signal: controller.signal,
    })
      .then((response) => response.json())
      .then((data) => setSuggested(data.prompts ?? []))
      .catch(() => {});
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  const sourceGroupIndex = useMemo(() => {
    const map = new Map<string, EnrichedGroup>();
    for (const message of messages) {
      if (message.role !== 'assistant') continue;
      for (const group of message.sourceGroups) map.set(group.representative.url, group);
    }
    return map;
  }, [messages]);

  function openSourceDetail(articleId: string, trigger: HTMLElement | null) {
    const group = sourceGroupIndex.get(articleId);
    if (!group) return;
    detailTriggerRef.current = trigger;
    setDetail({ group, origin: null });
  }

  function handleCloseDetail() {
    shouldRestoreFocusRef.current = true;
    setDetail(null);
  }

  useEffect(() => {
    if (detail || !shouldRestoreFocusRef.current) return;
    shouldRestoreFocusRef.current = false;
    const trigger = detailTriggerRef.current;
    (trigger?.isConnected ? trigger : inputRef.current)?.focus();
    detailTriggerRef.current = null;
  }, [detail]);

  const sendMessage = useCallback(
    (rawText: string, presetOverride?: AgentPreset) => {
      const text = rawText.trim();
      if (text.length === 0 || isBusy) return;

      if (text === '/새대화') {
        setMessages([]);
        setActivePreset({});
        setDraft('');
        return;
      }

      // setActivePreset은 비동기라 같은 이벤트 핸들러 안에서 곧바로 sendMessage를
      // 부르면 activePreset이 아직 갱신 전 값이다(추천/후속 질문 클릭 시). 그래서
      // 이번 턴에 실제로 쓸 조건은 클로저의 activePreset이 아니라 override를 직접
      // 합쳐서 계산한다.
      const presetForThisTurn = presetOverride ? { ...activePreset, ...presetOverride } : activePreset;

      const userMessage: UserMessage = { id: makeId(), role: 'user', text };
      const assistantId = makeId();
      const assistantMessage: AssistantMessage = {
        id: assistantId,
        role: 'assistant',
        text: '',
        streaming: true,
        phase: 'searching',
        sources: [],
        referenceSources: [],
        sourceGroups: [],
        followUps: [],
        appliedFilters: presetForThisTurn,
        searchMetadata: null,
        insufficientEvidence: false,
        errorMessage: null,
      };

      const previousQuery = [...messages].reverse().find((message): message is UserMessage => message.role === 'user')?.text;
      const previousArticleIds = [...messages]
        .reverse()
        .find((message): message is AssistantMessage => message.role === 'assistant')
        ?.sources.map((source) => source.articleId);

      setMessages((current) => [...current, userMessage, assistantMessage]);
      setDraft('');
      setIsBusy(true);

      const updateAssistant = (patch: Partial<AssistantMessage>) => {
        setMessages((current) =>
          current.map((message) => (message.id === assistantId ? { ...message, ...(patch as object) } : message)),
        );
      };

      abortRef.current?.abort();
      abortRef.current = streamAgentChat(
        {
          message: text,
          conversationContext: { previousQuery, previousArticleIds, appliedFilters: presetForThisTurn },
          currentIndustryScope,
        },
        {
          onPhase: (phase) => updateAssistant({ phase }),
          onToken: (chunk) => {
            updateAssistant({ phase: 'streaming' });
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantId && message.role === 'assistant'
                  ? { ...message, text: message.text + chunk }
                  : message,
              ),
            );
          },
          onFinal: (payload) => {
            updateAssistant({
              streaming: false,
              phase: 'done',
              text: payload.answer,
              sources: payload.sources,
              referenceSources: payload.referenceSources,
              sourceGroups: payload.sourceGroups,
              followUps: payload.suggestedFollowUps,
              appliedFilters: payload.appliedFilters,
              searchMetadata: payload.searchMetadata,
              insufficientEvidence: payload.insufficientEvidence,
            });
            setActivePreset(payload.appliedFilters);
            setIsBusy(false);
          },
          onError: (message) => {
            updateAssistant({ streaming: false, phase: 'error', errorMessage: message });
            setIsBusy(false);
          },
        },
      );
    },
    [activePreset, currentIndustryScope, isBusy, messages],
  );

  function handleSuggestedSelect(prompt: SuggestedPrompt) {
    sendMessage(prompt.prompt, prompt.preset);
  }

  function handleFollowUpSelect(followUp: AgentFollowUp) {
    sendMessage(followUp.prompt, followUp.preset);
  }

  function handleCommandSelect(id: string) {
    const beforeSlash = draft.slice(0, draft.length - (commandFilter?.length ?? 0) - 1);
    setDraft(`${beforeSlash}/${id} `);
    inputRef.current?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (commandFilter !== null) {
      const matches = AGENT_COMMANDS.filter((command) => command.id.startsWith(commandFilter));
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setCommandActiveIndex((index) => Math.min(index + 1, Math.max(0, matches.length - 1)));
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setCommandActiveIndex((index) => Math.max(index - 1, 0));
        return;
      }
      if (event.key === 'Enter' && matches[commandActiveIndex]) {
        event.preventDefault();
        handleCommandSelect(matches[commandActiveIndex].id);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setDraft((current) => current.slice(0, current.length - (commandFilter.length + 1)));
        return;
      }
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage(draft);
    }
  }

  const chips = presetChips(activePreset);

  return (
    <>
      <dialog
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => {
          if (event.target === dialogRef.current) requestClose();
        }}
        className="filter-dialog agent-dialog"
      >
        <div className="filter-drawer agent-drawer">
          <div className="agent-drawer__header">
            <div>
              <h2 id={titleId} className="text-base font-semibold text-[#1E3A5F]">
                기업환경 AI 분석관
              </h2>
              <p className="text-[12px] text-slate-500">수집된 기사를 검색하고 핵심 내용과 출처를 정리합니다.</p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setMessages([]);
                  setActivePreset({});
                }}
                className="agent-drawer__new-chat"
              >
                새 대화
              </button>
              <button type="button" onClick={requestClose} aria-label="AI 분석관 닫기" className="agent-drawer__close">
                ✕
              </button>
            </div>
          </div>

          {chips.length > 0 && (
            <div className="agent-preset-chips">
              {chips.map((chip) => (
                <button key={chip.key} type="button" onClick={() => setActivePreset((current) => removePresetChip(current, chip.key))} className="applied-chip">
                  {chip.label}
                  <span aria-hidden="true">✕</span>
                </button>
              ))}
            </div>
          )}

          <div ref={listRef} role="log" aria-live="polite" aria-label="AI 분석관 대화 내용" className="agent-message-list">
            {messages.length === 0 && (
              <div className="agent-empty">
                <p className="agent-empty__title">산업, 기업, 규제, 애로사항 또는 정책 이슈를 질문하세요.</p>
                <AgentSuggestedPrompts prompts={suggested} onSelect={handleSuggestedSelect} />
              </div>
            )}

            {messages.map((message) =>
              message.role === 'user' ? (
                <div key={message.id} className="agent-message agent-message--user">
                  <p>{message.text}</p>
                </div>
              ) : (
                <div key={message.id} className="agent-message agent-message--assistant">
                  {message.phase === 'searching' && <p className="agent-status">관련 기사를 찾고 있습니다.</p>}
                  {message.phase === 'analyzing' && <p className="agent-status">검색된 기사를 분석하고 있습니다.</p>}

                  {message.text && (
                    <div className="agent-message__body">
                      <AgentMessageBody
                        text={message.text}
                        onCitationClick={(index) => {
                          const source = message.sources.find((item) => item.citationIndex === index);
                          if (source) openSourceDetail(source.articleId, null);
                        }}
                      />
                    </div>
                  )}

                  {message.errorMessage && <p className="agent-status agent-status--error">{message.errorMessage}</p>}

                  {!message.streaming && message.sources.length > 0 && (
                    <details className="agent-sources" open>
                      <summary>답변에 사용된 기사 {message.sources.length}건</summary>
                      <ul>
                        {message.sources.map((source) => (
                          <AgentSourceCard key={source.articleId} source={source} onOpenDetail={(id) => openSourceDetail(id, null)} />
                        ))}
                      </ul>
                    </details>
                  )}

                  {!message.streaming && message.referenceSources.length > 0 && (
                    <details className="agent-sources agent-sources--reference">
                      <summary>참고 기사 {message.referenceSources.length}건 (직접 근거 아님)</summary>
                      <ul>
                        {message.referenceSources.map((source) => (
                          <AgentSourceCard key={source.articleId} source={source} onOpenDetail={(id) => openSourceDetail(id, null)} />
                        ))}
                      </ul>
                    </details>
                  )}

                  {!message.streaming && message.searchMetadata?.expansionApplied && (
                    <p className="agent-expansion-note">
                      검색 결과가 적어 유사 키워드와 관련 범위까지 확장했습니다 · {message.searchMetadata.expandedResultCount}건 검색
                    </p>
                  )}

                  {!message.streaming && message.followUps.length > 0 && (
                    <div className="agent-followups">
                      {message.followUps.map((followUp) => (
                        <button key={followUp.label} type="button" onClick={() => handleFollowUpSelect(followUp)} className="agent-followups__chip">
                          {followUp.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ),
            )}
          </div>

          <div className="agent-input-area">
            {commandFilter !== null && (
              <AgentCommandAutocomplete filter={commandFilter} activeIndex={commandActiveIndex} onSelect={handleCommandSelect} />
            )}
            <label htmlFor={inputId} className="sr-only">
              AI 분석관에게 질문
            </label>
            <div className="agent-input-row">
              <textarea
                ref={inputRef}
                id={inputId}
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value.slice(0, MAX_MESSAGE_LENGTH));
                  setCommandActiveIndex(0);
                }}
                onKeyDown={handleKeyDown}
                placeholder="산업, 기업, 규제, 애로사항 또는 정책 이슈를 질문하세요."
                rows={2}
                disabled={isBusy}
                className="agent-input"
              />
              <button type="button" onClick={() => sendMessage(draft)} disabled={isBusy || draft.trim().length === 0} className="agent-send">
                전송
              </button>
            </div>
            <p className="agent-input-hint">
              {draft.length}/{MAX_MESSAGE_LENGTH}자 · Enter로 전송, Shift+Enter로 줄바꿈
            </p>
          </div>
        </div>
      </dialog>

      {detail && (
        <ArticleDetailDialog
          key={detail.group.representative.url}
          group={detail.group}
          origin={detail.origin}
          searchTerm=""
          reviewStatus={reviewStatusOf(personal, detail.group.representative.url)}
          isBookmarked={Boolean(personal.bookmarks[detail.group.representative.url])}
          isInReport={personal.report.includes(detail.group.representative.url)}
          memo={personal.memos[detail.group.representative.url]?.text ?? ''}
          onClose={handleCloseDetail}
        />
      )}
    </>
  );
}
