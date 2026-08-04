import { REGULATION_KEYWORDS, type NaverNewsItem } from '@/lib/naver';

/** PRD 5-1: 매일 수집은 최근 7일 이내 발행 기사만 */
export const RECENT_DAYS = 7;

/** PRD 5-1: 하루 총합 상한 (수집 1회당이 아니라 그날 전체 기준) */
export const DAILY_LIMIT = 20;

/** 네이버 응답을 우리 형식으로 정리한 수집 후보 */
export type Candidate = {
  /** PRD 5-2: 네이버 링크를 우선 쓰고, 없을 때만 언론사 원문으로 연결한다 */
  url: string;
  title: string;
  press: string;
  /** ISO 날짜 (예: "2026-08-04") */
  publishedAt: string;
  /** 발췌문. 요약 생성에만 쓰고 화면에는 표시하지 않는다 */
  description: string;
  /** 매칭된 규제 키워드 종류 수 — PRD 5-1의 "관련도" */
  relevance: number;
};

/** 네이버 응답의 <b> 강조 태그와 HTML 엔티티를 걷어낸다 */
function stripHtml(text: string): string {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    // &amp;는 다른 엔티티를 되살리지 않도록 마지막에 처리한다
    .replace(/&amp;/g, '&')
    .trim();
}

/**
 * 원문 링크 도메인에서 언론사를 짐작한다.
 * 네이버 검색 API가 언론사명을 따로 주지 않아 도메인으로 대신한다.
 */
function pressFromLink(originallink: string): string {
  try {
    return new URL(originallink).hostname.replace(/^www\./, '');
  } catch {
    return '알 수 없음';
  }
}

/** PRD 5-1: 매칭된 규제 키워드의 "종류 수" */
export function countKeywords(title: string, description: string): number {
  const haystack = `${title} ${description}`;
  return REGULATION_KEYWORDS.filter((keyword) => haystack.includes(keyword)).length;
}

/** 네이버 응답 항목 하나를 수집 후보로 변환한다 */
export function toCandidate(item: NaverNewsItem): Candidate | null {
  const publishedDate = new Date(item.pubDate);
  if (Number.isNaN(publishedDate.getTime())) return null;

  const title = stripHtml(item.title);
  const description = stripHtml(item.description);

  return {
    url: item.link || item.originallink,
    title,
    press: pressFromLink(item.originallink || item.link),
    publishedAt: publishedDate.toISOString().slice(0, 10),
    description,
    relevance: countKeywords(title, description),
  };
}

export type FilterOptions = {
  /** 기준 시각. 테스트에서 고정하기 위해 주입받는다 */
  now?: Date;
  /** 며칠 이내 기사만 남길지. 최초 소급 수집 때는 90일을 넘긴다 (PLAN 15번) */
  days?: number;
};

/**
 * PRD 5-1의 필터 두 가지를 적용한다.
 *  1. 제목·발췌문에 규제 키워드 10개 중 1개 이상
 *  2. 최근 N일 이내 발행
 *
 * 같은 기사가 검색어 10개에 중복으로 걸리므로 URL 기준으로 한 번 합친다.
 * (제목 유사도 기반 중복 묶기는 PLAN 10번에서 따로 처리한다.)
 */
export function filterCandidates(
  items: NaverNewsItem[],
  options: FilterOptions = {},
): Candidate[] {
  const now = options.now ?? new Date();
  const days = options.days ?? RECENT_DAYS;

  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffDate = cutoff.toISOString().slice(0, 10);
  const todayDate = now.toISOString().slice(0, 10);

  const byUrl = new Map<string, Candidate>();

  for (const item of items) {
    const candidate = toCandidate(item);
    if (!candidate) continue;
    if (candidate.relevance === 0) continue;
    if (candidate.publishedAt < cutoffDate) continue;
    // 발행일이 미래인 기사는 잘못된 데이터로 보고 버린다
    if (candidate.publishedAt > todayDate) continue;

    if (!byUrl.has(candidate.url)) byUrl.set(candidate.url, candidate);
  }

  return [...byUrl.values()];
}

/**
 * PRD 5-1: 관련도 높은 순으로 정렬한다.
 * 관련도 = 매칭된 규제 키워드의 종류 수, 동점이면 발행일 최신순.
 *
 * 20건으로 자를 때만 이 순서를 쓴다. 화면 목록은 발행일 최신순 고정이다 (PRD 5-2).
 */
export function rankCandidates(candidates: Candidate[]): Candidate[] {
  return [...candidates].sort((a, b) => {
    if (b.relevance !== a.relevance) return b.relevance - a.relevance;
    return b.publishedAt.localeCompare(a.publishedAt);
  });
}

/** PRD 5-1: 제목 유사도가 이 값 이상이면 같은 사안으로 본다 */
export const TITLE_SIMILARITY_THRESHOLD = 0.7;

/** 비교용으로 제목에서 공백과 문장부호를 걷어낸다 */
function normalizeTitle(title: string): string {
  return title.replace(/[\s"'“”‘’·…\-–—,.()[\]「」『』<>|]/g, '');
}

function bigrams(text: string): Set<string> {
  const result = new Set<string>();
  for (let i = 0; i < text.length - 1; i += 1) result.add(text.slice(i, i + 2));
  return result;
}

/** 두 제목의 글자 2-gram 자카드 유사도 (0~1) */
export function titleSimilarity(a: string, b: string): number {
  const setA = bigrams(normalizeTitle(a));
  const setB = bigrams(normalizeTitle(b));
  if (setA.size === 0 || setB.size === 0) return a === b ? 1 : 0;

  let shared = 0;
  setA.forEach((gram) => {
    if (setB.has(gram)) shared += 1;
  });
  return shared / (setA.size + setB.size - shared);
}

/** 대표 기사 하나와 거기 묶인 기사들 */
export type CandidateGroup = {
  representative: Candidate;
  related: Candidate[];
};

/**
 * PRD 5-1: 제목 유사도 0.7 이상이면 같은 사안으로 보고 대표 기사에 묶는다.
 * **지우지 않는다** — 유사도가 빗나가 잘못 묶여도 기사가 사라지지 않게 하기 위해서다.
 *
 * 입력은 관련도순으로 정렬된 상태여야 한다. 앞선 기사가 대표가 된다.
 */
export function groupDuplicates(ranked: Candidate[]): CandidateGroup[] {
  const groups: CandidateGroup[] = [];

  for (const candidate of ranked) {
    const match = groups.find(
      (group) =>
        titleSimilarity(group.representative.title, candidate.title) >=
        TITLE_SIMILARITY_THRESHOLD,
    );
    if (match) {
      match.related.push(candidate);
    } else {
      groups.push({ representative: candidate, related: [] });
    }
  }

  return groups;
}

/**
 * PRD 5-1: 수집 시점에 원문 링크로 HEAD 요청을 보내 죽은 링크를 걸러낸다.
 *
 * 열람 시점의 삭제까지 막지는 못하지만, 비용 없이 상당수를 거를 수 있다.
 * HEAD를 막아둔 사이트가 있어 네트워크 오류는 '살아있음'으로 본다 —
 * 멀쩡한 기사를 지우는 쪽이 더 나쁘기 때문이다.
 */
export async function isLinkAlive(url: string, timeoutMs = 5000): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    });
    return response.status < 400;
  } catch {
    return true;
  }
}
