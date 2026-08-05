'use client';

/**
 * AI 답변 텍스트를 안전하게 렌더링한다.
 *
 * `dangerouslySetInnerHTML`을 쓰지 않는다 — 문자열을 잘라 React 엘리먼트 트리로만
 * 만들기 때문에, 모델 출력이나 기사 제목에 `<script>` 같은 문자열이 섞여 있어도
 * React가 항상 텍스트로 이스케이프한다(HTML 출력 escape는 이 구조 자체로 보장된다).
 * `**굵게**` · `- 목록` · `## 소제목` 정도의 최소 서식과 `[n]` 인용 번호만 처리한다.
 */

function renderInline(text: string, onCitationClick: (index: number) => void, keyPrefix: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|\[\d+\])/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;

  while ((match = regex.exec(text))) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    const token = match[0];

    if (token.startsWith('**')) {
      parts.push(<strong key={`${keyPrefix}-b-${i}`}>{token.slice(2, -2)}</strong>);
    } else {
      const index = Number(token.slice(1, -1));
      parts.push(
        <button key={`${keyPrefix}-c-${i}`} type="button" className="agent-citation" onClick={() => onCitationClick(index)}>
          {token}
        </button>,
      );
    }

    lastIndex = match.index + token.length;
    i += 1;
  }

  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

export function AgentMessageBody({ text, onCitationClick }: { text: string; onCitationClick: (index: number) => void }) {
  const lines = text.split('\n');
  const blocks: React.ReactNode[] = [];
  let listBuffer: string[] = [];
  let key = 0;

  const flushList = () => {
    if (listBuffer.length === 0) return;
    const items = listBuffer;
    blocks.push(
      <ul key={`list-${key++}`} className="agent-message__list">
        {items.map((item, index) => (
          <li key={index}>{renderInline(item, onCitationClick, `li-${key}-${index}`)}</li>
        ))}
      </ul>,
    );
    listBuffer = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
      listBuffer.push(trimmed.slice(2));
      continue;
    }
    flushList();
    if (trimmed.startsWith('## ')) {
      blocks.push(
        <h4 key={`h-${key++}`} className="agent-message__heading">
          {trimmed.slice(3)}
        </h4>,
      );
    } else if (trimmed.length > 0) {
      blocks.push(
        <p key={`p-${key++}`} className="agent-message__paragraph">
          {renderInline(trimmed, onCitationClick, `p-${key}`)}
        </p>,
      );
    }
  }
  flushList();

  return <>{blocks}</>;
}
