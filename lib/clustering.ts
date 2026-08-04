import type { EnrichedGroup, IssueCluster } from '@/types/article';

/**
 * 이슈 군집화.
 *
 * DB의 `group_id`는 "제목 2-gram 자카드 0.7 이상"이라 사실상 같은 기사를 받아쓴
 * 경우만 묶인다(PRD 5-1). 여기서는 그 위 단계로, **같은 정책 이슈를 다른 제목으로
 * 쓴 카드들**을 묶는다.
 *
 * 서로 다른 사안을 합치는 쪽이 못 묶는 쪽보다 훨씬 나쁘므로 보수적으로 판정한다.
 * 아래 조건을 **모두** 만족해야 같은 군집이다.
 *   1. 산업 분류가 겹친다 (둘 다 미분류면 묶지 않는다)
 *   2. 이슈 유형이 겹친다
 *   3. 제목에서 뽑은 의미 있는 명사가 2개 이상 겹친다
 *   4. 발행일 차이가 14일 이내다
 *
 * 조건 3의 "2개 이상"이 핵심이다 — 한 단어(예: '규제')만 같다는 이유로 묶으면
 * 전혀 다른 정책이 한 카드에 들어간다.
 */

/** 발행일이 이 이상 벌어지면 같은 이슈로 보지 않는다 */
const MAX_DAY_GAP = 14;

/** 제목 키워드가 이 개수 이상 겹쳐야 같은 이슈로 본다 */
const MIN_SHARED_KEYWORDS = 2;

/**
 * 어느 기사에나 나오는 흔한 말은 공통 키워드로 세지 않는다.
 * 이 목록이 비면 '기업'·'규제'만 같아도 묶여 버린다.
 */
const STOPWORDS = new Set([
  '기업', '기업들', '업계', '규제', '정부', '개선', '완화', '강화', '추진', '검토',
  '발표', '방안', '대책', '지원', '확대', '축소', '문제', '논란', '필요', '위해',
  '관련', '대한', '이번', '올해', '내년', '오늘', '국내', '한국', '단독', '종합',
  '인터뷰', '기자', '뉴스', '속보', '전망', '분석', '현장', '경제', '산업', '시장',
]);

/** 제목에서 의미 있는 두 글자 이상 낱말만 뽑는다 */
function titleKeywords(title: string): Set<string> {
  const words = title
    .replace(/[^가-힣A-Za-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 2 && !STOPWORDS.has(word))
    // 조사가 붙은 형태를 어느 정도 흡수하려고 앞 4글자만 비교한다
    .map((word) => (word.length > 4 ? word.slice(0, 4) : word));

  return new Set(words);
}

function daysBetween(a: string, b: string): number {
  const diff = new Date(a).getTime() - new Date(b).getTime();
  return Math.abs(diff) / (24 * 60 * 60 * 1000);
}

function intersection<T>(a: Set<T> | T[], b: Set<T> | T[]): T[] {
  const setB = b instanceof Set ? b : new Set(b);
  const listA = a instanceof Set ? [...a] : a;
  return listA.filter((item) => setB.has(item));
}

type Seed = {
  group: EnrichedGroup;
  keywords: Set<string>;
};

function isSameIssue(a: Seed, b: Seed): string[] | null {
  const industriesA = a.group.representative.industries;
  const industriesB = b.group.representative.industries;
  if (industriesA.length === 0 || industriesB.length === 0) return null;
  if (intersection(industriesA, industriesB).length === 0) return null;

  const issuesA = a.group.representative.classification.issueTypes;
  const issuesB = b.group.representative.classification.issueTypes;
  if (intersection(issuesA, issuesB).length === 0) return null;

  if (daysBetween(a.group.representative.publishedAt, b.group.representative.publishedAt) > MAX_DAY_GAP) {
    return null;
  }

  const shared = intersection(a.keywords, b.keywords);
  return shared.length >= MIN_SHARED_KEYWORDS ? shared : null;
}

/** 군집의 대표 카드: 직접 발언 > 점수 > 최신 순 (PRD의 대표 선정 기준을 따른다) */
function pickLead(members: EnrichedGroup[]): EnrichedGroup {
  return [...members].sort((a, b) => {
    const directA = a.representative.classification.evidenceType === 'company-direct' ? 1 : 0;
    const directB = b.representative.classification.evidenceType === 'company-direct' ? 1 : 0;
    if (directA !== directB) return directB - directA;
    if (a.representative.relevanceScore !== b.representative.relevanceScore) {
      return b.representative.relevanceScore - a.representative.relevanceScore;
    }
    return b.representative.publishedAt.localeCompare(a.representative.publishedAt);
  })[0];
}

function toCluster(members: EnrichedGroup[], sharedKeywords: string[]): IssueCluster {
  const lead = pickLead(members);
  const allArticles = members.flatMap((member) => [member.representative, ...member.related]);
  const dates = allArticles.map((article) => article.publishedAt).sort();

  return {
    id: lead.representative.url,
    lead,
    members,
    articleCount: allArticles.length,
    publisherCount: new Set(allArticles.map((article) => article.publisher)).size,
    highestScore: Math.max(...allArticles.map((article) => article.relevanceScore)),
    firstPublishedAt: dates[0],
    lastPublishedAt: dates[dates.length - 1],
    sharedKeywords,
  };
}

/**
 * 카드 목록을 이슈 군집으로 묶는다.
 * 아무와도 묶이지 않은 카드는 자기 혼자인 군집(members 1개)이 된다.
 */
export function buildIssueClusters(groups: EnrichedGroup[]): IssueCluster[] {
  const seeds: Seed[] = groups.map((group) => ({
    group,
    keywords: titleKeywords(group.representative.title),
  }));

  const assigned = new Array<number>(seeds.length).fill(-1);
  const buckets: { members: number[]; keywords: Set<string> }[] = [];

  seeds.forEach((seed, index) => {
    if (assigned[index] !== -1) return;

    const bucketIndex = buckets.length;
    buckets.push({ members: [index], keywords: new Set() });
    assigned[index] = bucketIndex;

    for (let other = index + 1; other < seeds.length; other += 1) {
      if (assigned[other] !== -1) continue;
      const shared = isSameIssue(seed, seeds[other]);
      if (!shared) continue;
      assigned[other] = bucketIndex;
      buckets[bucketIndex].members.push(other);
      shared.forEach((keyword) => buckets[bucketIndex].keywords.add(keyword));
    }
  });

  return buckets.map((bucket) =>
    toCluster(
      bucket.members.map((memberIndex) => seeds[memberIndex].group),
      [...bucket.keywords],
    ),
  );
}

/** 군집 중 실제로 여러 카드가 묶인 것만 (신규 이슈 지표 계산용) */
export function multiMemberClusters(clusters: IssueCluster[]): IssueCluster[] {
  return clusters.filter((cluster) => cluster.members.length > 1);
}
