import { getAllArticleGroupsForSearch } from '@/lib/articles';
import { expandTermsWithSynonyms, RELATED_INDUSTRIES } from '@/lib/agentSynonyms';
import { enrichGroup } from '@/lib/enrich';
import { ALL_INDUSTRIES, type Industry } from '@/lib/industries';
import type { AgentAnswerMode, AgentDateRange, AgentPreset, AgentSearchMetadata, AgentSource } from '@/types/agent';
import type { EnrichedGroup } from '@/types/article';

/**
 * 서버 전용 검색 계층. Supabase를 부르는 lib/articles.ts를 import하므로
 * **클라이언트 컴포넌트에서 절대 런타임 import하지 않는다.**
 *
 * 임베딩 기반 의미 검색(pgvector)은 쓰지 않는다 — 현재 데이터 규모(수백 건)에서는
 * "키워드 + 동의어 확장 + 메타데이터 필터 + 연관성 점수 + 최신성"을 조합한
 * 규칙 기반 하이브리드 스코어링만으로 충분하다는 판단이며, PRD 6장이 명시적으로
 * 허용한 대안 경로다. 데이터가 훨씬 커지면 이 파일의 scoreCandidate()만 교체해
 * 실제 임베딩 검색으로 넘어갈 수 있도록 인터페이스(RetrievalResult)를 분리해 뒀다.
 */

/** 후보 전체 조회는 60초 TTL로 캐싱한다 — 질문마다 전체 테이블을 다시 읽지 않는다 */
type CandidateCache = { expires: number; groups: EnrichedGroup[] };
let candidateCache: CandidateCache | null = null;
const CANDIDATE_TTL_MS = 60_000;

async function getCandidateGroups(): Promise<EnrichedGroup[]> {
  if (candidateCache && candidateCache.expires > Date.now()) return candidateCache.groups;
  const raw = await getAllArticleGroupsForSearch();
  const groups = raw.map(enrichGroup);
  candidateCache = { expires: Date.now() + CANDIDATE_TTL_MS, groups };
  return groups;
}

/** 테스트·재계산이 필요할 때만 쓰는 캐시 무효화 (현재는 호출하는 곳 없음, 향후 훅용) */
export function invalidateAgentSearchCache(): void {
  candidateCache = null;
}

const STOPWORDS = new Set([
  '해줘', '알려줘', '정리해줘', '요약해줘', '비교해줘', '찾아줘', '보여줘', '해서', '해줄래',
  '기사', '기사들', '최근', '관련', '대한', '그리고', '또는', '내용', '있는', '있어',
]);

function tokenize(text: string): string[] {
  return text
    .replace(/[^가-힣A-Za-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token));
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dateFloor(range: AgentDateRange): string | null {
  const now = new Date();
  switch (range) {
    case 'today':
      return isoDate(now);
    case '3d': {
      const d = new Date(now);
      d.setDate(d.getDate() - 3);
      return isoDate(d);
    }
    case '7d': {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      return isoDate(d);
    }
    case '30d': {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      return isoDate(d);
    }
    case '90d': {
      const d = new Date(now);
      d.setDate(d.getDate() - 90);
      return isoDate(d);
    }
    case 'this-month':
      return isoDate(new Date(now.getFullYear(), now.getMonth(), 1));
    case 'last-month':
      return isoDate(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    default:
      return null;
  }
}

function dateCeil(range: AgentDateRange): string | null {
  if (range === 'last-month') {
    const now = new Date();
    return isoDate(new Date(now.getFullYear(), now.getMonth(), 0));
  }
  return null;
}

/** 다음 단계로 넓힐 기간. 명시적 기간 잠금이 없을 때만 호출된다 */
function nextBroaderRange(range: AgentDateRange): AgentDateRange | null {
  if (range === 'all') return null;
  if (range === 'this-month' || range === 'last-month') return 'all';
  const order: AgentDateRange[] = ['today', '3d', '7d', '30d', '90d', 'all'];
  const index = order.indexOf(range);
  return index === -1 ? 'all' : (order[index + 1] ?? 'all');
}

/**
 * 기간 표현이 없는 질문의 기본 기간 (PRD 추가요구 18장).
 * "최근/요즘/현재"류는 30일, 명확한 시간 표현이 전혀 없으면 전체 기간을 기본값으로
 * 쓴다 — 현재 데이터 규모가 작아 전체 기간이어도 결과가 감당할 만한 크기다.
 */
function inferDefaultDateRange(question: string): AgentDateRange {
  if (/오늘/.test(question)) return 'today';
  if (/이번\s*주/.test(question)) return '7d';
  if (/이번\s*달/.test(question)) return 'this-month';
  if (/지난\s*달/.test(question)) return 'last-month';
  if (/최근|요즘|현재/.test(question)) return '30d';
  return 'all';
}

function withinScope(
  group: EnrichedGroup,
  industries: Industry[] | null,
  dateRange: AgentDateRange,
  minScore: number,
): boolean {
  const article = group.representative;
  if (dateRange !== 'all') {
    const floor = dateFloor(dateRange);
    const ceil = dateCeil(dateRange);
    if (floor && article.publishedAt < floor) return false;
    if (ceil && article.publishedAt > ceil) return false;
  }
  if (industries && industries.length > 0 && !industries.some((industry) => article.industries.includes(industry))) {
    return false;
  }
  if (article.relevanceScore < minScore) return false;
  return true;
}

/**
 * finalScore = keywordScore + metadataScore + relevanceScoreWeight + freshnessWeight
 * (PRD 5·37장의 하이브리드 점수 개념을 그대로 구현한다)
 */
function scoreCandidate(group: EnrichedGroup, terms: readonly string[], preset: AgentPreset): number {
  const article = group.representative;
  const titleLower = article.title.toLowerCase();
  const bodyLower = `${article.searchText} ${article.expandedSearchText}`;

  let keywordScore = 0;
  for (const term of terms) {
    const lower = term.toLowerCase();
    if (titleLower.includes(lower)) keywordScore += 3;
    else if (bodyLower.includes(lower)) keywordScore += 1;
  }

  let metadataScore = 0;
  if (preset.industries?.length && preset.industries.some((industry) => article.industries.includes(industry))) {
    metadataScore += 4;
  }
  if (preset.company && bodyLower.includes(preset.company.toLowerCase())) metadataScore += 5;
  if (preset.issueTypes?.length && preset.issueTypes.some((type) => article.classification.issueTypes.includes(type))) {
    metadataScore += 3;
  }
  if (preset.directStatementOnly && article.classification.evidenceType === 'company-direct') metadataScore += 3;

  const relevanceWeight = (article.relevanceScore / 100) * 3;

  const daysOld = (Date.now() - new Date(`${article.publishedAt}T00:00:00Z`).getTime()) / 86_400_000;
  const freshnessWeight = Math.max(0, 2 - daysOld / 30);

  return keywordScore + metadataScore + relevanceWeight + freshnessWeight;
}

type Scored = { group: EnrichedGroup; score: number };

function rescore(groups: EnrichedGroup[], terms: readonly string[], preset: AgentPreset, requireMatch: boolean): Scored[] {
  return groups
    .map((group) => ({ group, score: scoreCandidate(group, terms, preset) }))
    .filter((item) => !requireMatch || item.score > 0)
    .sort((a, b) => b.score - a.score);
}

export type RetrievalResult = {
  primary: EnrichedGroup[];
  supporting: EnrichedGroup[];
  reference: EnrichedGroup[];
  metadata: AgentSearchMetadata;
};

const TOPK_BY_MODE: Record<AgentAnswerMode, number> = {
  summary: 12,
  list: 15,
  compare: 16,
  timeline: 14,
  issues: 14,
  report: 18,
  'sources-only': 15,
};

/**
 * 검색 단계 1~3(PRD 추가요구 10장): 정밀 검색 → 동의어 확장 → 기간·인접산업 확장.
 * 사용자가 명시적으로 잠근 조건(기간·산업)은 자동으로 풀지 않는다(11장).
 */
export async function retrieveArticles(
  question: string,
  preset: AgentPreset,
  forceExpand: boolean,
): Promise<RetrievalResult> {
  const allGroups = await getCandidateGroups();
  const baseTerms = tokenize(question);

  const explicitDateLocked = Boolean(preset.dateRange && preset.dateRange !== 'all');
  const explicitIndustryLocked = Boolean(preset.industries?.length);

  let effectiveDateRange = preset.dateRange ?? inferDefaultDateRange(question);
  let effectiveIndustries = preset.industries?.length ? preset.industries : null;
  const minScore = preset.minScore ?? 0;

  const requireMatch = baseTerms.length > 0 || Boolean(preset.company);

  let scope = allGroups.filter((group) => withinScope(group, effectiveIndustries, effectiveDateRange, minScore));
  let scored = rescore(scope, baseTerms, preset, requireMatch);
  const initialResultCount = scored.length;

  let expansionApplied = false;
  const expansionTypes: string[] = [];

  const wantsExpansion = forceExpand || preset.searchMode === 'broad';
  const shouldAutoExpand = scored.length < 3 || wantsExpansion;

  if (shouldAutoExpand) {
    // 1단계: 동의어·유사 표현 확장
    const expandedTerms = expandTermsWithSynonyms(baseTerms);
    if (expandedTerms.length > baseTerms.length || wantsExpansion) {
      const rescored = rescore(scope, expandedTerms, preset, requireMatch);
      if (rescored.length > scored.length) {
        scored = rescored;
        expansionApplied = true;
        expansionTypes.push('synonym');
      }
    }

    // 2단계: 기간 확대 (사용자가 명시하지 않았을 때만)
    if (scored.length < 5 && !explicitDateLocked) {
      const nextRange = nextBroaderRange(effectiveDateRange);
      if (nextRange) {
        effectiveDateRange = nextRange;
        scope = allGroups.filter((group) => withinScope(group, effectiveIndustries, effectiveDateRange, minScore));
        const rescored = rescore(scope, expandTermsWithSynonyms(baseTerms), preset, requireMatch);
        if (rescored.length > scored.length) {
          scored = rescored;
          expansionApplied = true;
          expansionTypes.push('date-range');
        }
      }
    }

    // 3단계: 인접 산업 포함 (사용자가 산업을 명시하지 않았을 때만)
    if (scored.length < 5 && !explicitIndustryLocked && effectiveIndustries?.length) {
      const adjacent = [...new Set(effectiveIndustries.flatMap((industry) => RELATED_INDUSTRIES[industry] ?? []))];
      const widened = [...new Set([...effectiveIndustries, ...adjacent])];
      scope = allGroups.filter((group) => withinScope(group, widened, effectiveDateRange, minScore));
      const rescored = rescore(scope, expandTermsWithSynonyms(baseTerms), preset, requireMatch);
      if (rescored.length > scored.length) {
        effectiveIndustries = widened;
        scored = rescored;
        expansionApplied = true;
        expansionTypes.push('related-industry');
      }
    }
  }

  const topK = TOPK_BY_MODE[preset.answerMode ?? 'summary'];
  const limited = scored.slice(0, topK);

  const primaryCount = Math.min(8, limited.length === 0 ? 0 : Math.max(1, Math.ceil(limited.length * 0.6)));
  const primary = limited.slice(0, primaryCount).map((item) => item.group);
  const supporting = limited.slice(primaryCount).map((item) => item.group);

  const limitedUrls = new Set(limited.map((item) => item.group.representative.url));
  const reference = expansionApplied
    ? scored
        .slice(topK, topK + 5)
        .map((item) => item.group)
        .filter((group) => !limitedUrls.has(group.representative.url))
    : [];

  const metadata: AgentSearchMetadata = {
    searchMode: preset.searchMode ?? 'balanced',
    initialResultCount,
    expandedResultCount: scored.length,
    expansionApplied,
    expansionTypes,
    primarySourceCount: primary.length,
    supportingSourceCount: supporting.length,
    referenceSourceCount: reference.length,
    appliedIndustries: effectiveIndustries && effectiveIndustries.length > 0 ? effectiveIndustries : 'all',
    appliedDateRange: effectiveDateRange,
    directStatementOnly: Boolean(preset.directStatementOnly),
  };

  return { primary, supporting, reference, metadata };
}

/** primary+supporting에 인용 번호 1..N을 매기고, reference는 인용 불가(citationIndex null)로 둔다 */
export function toAgentSources(
  primary: EnrichedGroup[],
  supporting: EnrichedGroup[],
  reference: EnrichedGroup[],
): { citable: AgentSource[]; reference: AgentSource[] } {
  let index = 1;

  const toSource = (group: EnrichedGroup, tier: AgentSource['tier'], citationIndex: number | null): AgentSource => ({
    articleId: group.representative.url,
    title: group.representative.title,
    publisher: group.representative.publisher,
    publishedAt: group.representative.publishedAt,
    industries: group.representative.industries,
    relevanceScore: group.representative.relevanceScore,
    evidenceType: group.representative.classification.evidenceType,
    url: group.representative.url,
    tier,
    citationIndex,
  });

  const citable = [
    ...primary.map((group) => toSource(group, 'primary', index++)),
    ...supporting.map((group) => toSource(group, 'supporting', index++)),
  ];
  const referenceSources = reference.map((group) => toSource(group, 'reference', null));

  return { citable, reference: referenceSources };
}

export { ALL_INDUSTRIES };
