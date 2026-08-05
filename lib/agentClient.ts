'use client';

import type { AgentChatRequest, AgentAnswerPayload } from '@/types/agent';

/**
 * 채팅 API를 호출하고 서버가 보내는 SSE 유사 스트림을 파싱한다.
 *
 * 새 패키지(ai SDK 등)를 추가하지 않고 fetch + ReadableStream만으로 구현했다.
 * 프로토콜: `data: <JSON>\n\n` 줄이 반복되고, JSON의 `type`이 `meta`·`token`·
 * `final`·`error` 중 하나다 (types/agent.ts의 AgentStreamEvent와 계약을 공유한다).
 */
export type AgentStreamHandlers = {
  onPhase?: (phase: 'searching' | 'analyzing', resultCount?: number) => void;
  onToken?: (text: string) => void;
  onFinal?: (payload: AgentAnswerPayload) => void;
  onError?: (message: string) => void;
};

export function streamAgentChat(request: AgentChatRequest, handlers: AgentStreamHandlers): AbortController {
  const controller = new AbortController();

  (async () => {
    try {
      const response = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        handlers.onError?.(data?.error ?? '요청을 처리하지 못했습니다.');
        return;
      }
      if (!response.body) {
        handlers.onError?.('응답을 받지 못했습니다.');
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';

        for (const raw of events) {
          const line = raw.trim();
          if (!line.startsWith('data:')) continue;
          const json = line.slice(5).trim();
          if (!json) continue;

          try {
            const event = JSON.parse(json) as { type: string; [key: string]: unknown };
            if (event.type === 'meta') {
              handlers.onPhase?.(event.phase as 'searching' | 'analyzing', event.resultCount as number | undefined);
            } else if (event.type === 'token') {
              handlers.onToken?.(event.text as string);
            } else if (event.type === 'final') {
              handlers.onFinal?.(event.payload as AgentAnswerPayload);
            } else if (event.type === 'error') {
              handlers.onError?.(event.message as string);
            }
          } catch {
            // 청크 경계에서 잘린 이벤트는 다음 read()에서 이어붙여지므로 무시한다
          }
        }
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      handlers.onError?.(error instanceof Error ? error.message : '네트워크 오류가 발생했습니다.');
    }
  })();

  return controller;
}
