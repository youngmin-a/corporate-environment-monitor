import { classifyIndustriesSafe, type Industry } from '@/lib/industries';
import type { RawNewsEntry, SearchSource } from '@/lib/naver';
import { evaluateRelevance, type RelevanceRejection } from '@/lib/relevance';

/** PRD 5-1: 매일 수집은 최근 7일 이내 발행 기사만 */
export const RECENT_DAYS = 7;

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
  /** PRD 5-1 연관성 점수 0~100. 정렬·상한과 카드 배지에 쓴다 */
  score: number;
  /** PRD 5-3 고정 산업 분류 결과. 수집 시점에 한 번만 계산해 저장 시 그대로 재사용한다 */
  industries: Industry[];
};

/** 필터링 단계에서만 쓰는, 검색 출처와 연관성 판정이 붙은 후보 */
type CandidateWithSource = Candidate & {
  source: SearchSource;
  accepted: boolean;
  rejection?: RelevanceRejection;
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

/** 네이버 응답 항목 하나(과 출처)를 수집 후보로 변환한다 */
function toCandidate(entry: RawNewsEntry): CandidateWithSource | null {
  const { item, source } = entry;
  const publishedDate = new Date(item.pubDate);
  if (Number.isNaN(publishedDate.getTime())) return null;

  const title = stripHtml(item.title);
  const description = stripHtml(item.description);

  const industries = classifyIndustriesSafe(title, description);
  const relevance = evaluateRelevance(title, description, industries);

  return {
    url: item.link || item.originallink,
    title,
    press: pressFromLink(item.originallink || item.link),
    publishedAt: publishedDate.toISOString().slice(0, 10),
    description,
    score: relevance.score,
    industries,
    source,
    accepted: relevance.accepted,
    rejection: relevance.rejection,
  };
}

export type FilterOptions = {
  /** 기준 시각. 테스트에서 고정하기 위해 주입받는다 */
  now?: Date;
  /** 며칠 이내 기사만 남길지. 최초 소급 수집 때는 90일을 넘긴다 (PLAN 15번) */
  days?: number;
};

/** 연관성 판정에서 걸러진 사례 (보고용) */
export type ExcludedSample = {
  title: string;
  source: SearchSource;
  score: number;
  industries: Industry[];
  reason: string;
};

export type FilterResult = {
  candidates: Candidate[];
  /** 보고용 표본. 전체 목록이 아니라 앞에서부터 최대 몇 건만 담는다 */
  excludedSamples: ExcludedSample[];
};

const MAX_EXCLUDED_SAMPLES = 8;

/**
 * PRD 5-1 필터를 적용한다.
 *  1. 최근 N일 이내 발행
 *  2. 연관성 판정(필수 통과 조건 + 60점 미만 제외)을 통과한 기사만 남긴다.
 *     요약 API를 부르기 전에 걸러 비용을 쓰지 않기 위해 이 단계에서 처리한다.
 *
 * 같은 기사가 여러 검색어에 중복으로 걸리므로 URL 기준으로 한 번 합친다.
 * (제목 유사도 기반 중복 묶기는 PLAN 10번에서 따로 처리한다.)
 */
export function filterCandidates(entries: RawNewsEntry[], options: FilterOptions = {}): FilterResult {
  const now = options.now ?? new Date();
  const days = options.days ?? RECENT_DAYS;

  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffDate = cutoff.toISOString().slice(0, 10);
  const todayDate = now.toISOString().slice(0, 10);

  const byUrl = new Map<string, Candidate>();
  const excludedSamples: ExcludedSample[] = [];
  const sampledUrls = new Set<string>();

  for (const entry of entries) {
    const candidate = toCandidate(entry);
    if (!candidate) continue;
    if (candidate.publishedAt < cutoffDate) continue;
    // 발행일이 미래인 기사는 잘못된 데이터로 보고 버린다
    if (candidate.publishedAt > todayDate) continue;

    if (!candidate.accepted) {
      if (excludedSamples.length < MAX_EXCLUDED_SAMPLES && !sampledUrls.has(candidate.url)) {
        sampledUrls.add(candidate.url);
        excludedSamples.push({
          title: candidate.title,
          source: candidate.source,
          score: candidate.score,
          industries: candidate.industries,
          reason: candidate.rejection ?? '연관성 미달',
        });
      }
      continue;
    }

    if (!byUrl.has(candidate.url)) {
      byUrl.set(candidate.url, {
        url: candidate.url,
        title: candidate.title,
        press: candidate.press,
        publishedAt: candidate.publishedAt,
        description: candidate.description,
        score: candidate.score,
        industries: candidate.industries,
      });
    }
  }

  return { candidates: [...byUrl.values()], excludedSamples };
}

/**
 * PRD 5-1: 연관성 점수 높은 순으로 정렬한다. 동점이면 발행일 최신순.
 *
 * 상한(MAX_VISIBLE_ARTICLES)으로 자를 때와 중복 묶음의 대표 기사를 고를 때 이 순서를
 * 쓴다. 화면 목록도 같은 순서로 보여준다 (PRD 5-2).
 */
export function rankCandidates(candidates: Candidate[]): Candidate[] {
  return [...candidates].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
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
 * 입력은 관련도순(rankCandidates)으로 정렬된 상태여야 한다. 앞선 기사가 대표가 된다.
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

export type { RawNewsEntry, SearchSource };
