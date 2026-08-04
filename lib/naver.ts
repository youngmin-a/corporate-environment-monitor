/**
 * 네이버 검색 API는 개발자센터(openapi.naver.com)에서 NCP의 NAVER API HUB로
 * 이전됐다. 구 엔드포인트로 호출하면 401이 나므로 이 주소를 써야 한다.
 */
const NAVER_NEWS_SEARCH_URL = 'https://naverapihub.apigw.ntruss.com/search/v1/news';

/**
 * PRD 5-1: 검색어를 "직접 규제 검색"과 "산업 검색" 두 갈래로 나눈다.
 * 네이버 API가 OR 검색을 지원하지 않아 각각 별도로 호출한다.
 */
export type SearchSource = 'regulation' | 'industry';

/** 직접 규제 검색 4개 — 기업 규제·애로 사안을 좁게 겨냥한다 */
export const DIRECT_REGULATION_QUERIES = [
  '기업 규제',
  '기업 인허가',
  '기업 인증',
  '기업 애로',
] as const;

/** 산업 검색 8개 — 업종별로 넓게 수집한 뒤 관련성 점수(lib/collector.ts)로 거른다 */
export const INDUSTRY_SEARCH_QUERIES = [
  '자동차 업계',
  '철강 업계',
  '조선 해운 업계',
  '에너지 석유화학 업계',
  '바이오 제약 업계',
  '금융권',
  '반도체 업계',
  '정보통신 플랫폼 업계',
] as const;

/** 네이버 뉴스 검색 API 응답 항목 하나. 필드명은 API 원본 그대로 둔다 */
export type NaverNewsItem = {
  title: string;
  originallink: string;
  link: string;
  description: string;
  pubDate: string;
};

type NaverNewsResponse = {
  items: NaverNewsItem[];
};

function getCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('NAVER_CLIENT_ID / NAVER_CLIENT_SECRET가 .env에 없습니다.');
  }
  return { clientId, clientSecret };
}

/** 검색어 하나로 뉴스 검색 API를 한 번 호출한다. 최신순으로 최대 100건 받는다 */
async function searchNews(query: string): Promise<NaverNewsItem[]> {
  const { clientId, clientSecret } = getCredentials();

  const url = new URL(NAVER_NEWS_SEARCH_URL);
  url.searchParams.set('query', query);
  url.searchParams.set('display', '100');
  url.searchParams.set('sort', 'date');
  url.searchParams.set('format', 'json');

  const response = await fetch(url, {
    headers: {
      'X-NCP-APIGW-API-KEY-ID': clientId,
      'X-NCP-APIGW-API-KEY': clientSecret,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`네이버 뉴스 검색 API 오류 (${query}): ${response.status} ${body}`);
  }

  const data = (await response.json()) as NaverNewsResponse;
  return data.items;
}

/** 검색 결과 하나와, 어느 검색어 갈래에서 나왔는지를 함께 담는다 */
export type RawNewsEntry = { item: NaverNewsItem; source: SearchSource };

/**
 * PRD 5-1: 직접 규제 검색 4개 + 산업 검색 8개, 총 12회를 각각 별도 호출한다.
 * 네이버 API가 OR 검색을 지원하지 않아 한 번에 묶을 수 없다.
 *
 * 이 함수는 필터링을 하지 않고 호출 결과를 그대로 합쳐 돌려준다. 어느 검색어에서
 * 왔는지(source)만 표시해 두고, 기간·점수 필터·관련도 정렬·중복 묶기는
 * lib/collector.ts에서 다음 단계로 붙인다.
 */
export async function fetchAllCandidates(): Promise<RawNewsEntry[]> {
  const [regulationResults, industryResults] = await Promise.all([
    Promise.all(DIRECT_REGULATION_QUERIES.map((query) => searchNews(query))),
    Promise.all(INDUSTRY_SEARCH_QUERIES.map((query) => searchNews(query))),
  ]);

  return [
    ...regulationResults.flat().map((item) => ({ item, source: 'regulation' as const })),
    ...industryResults.flat().map((item) => ({ item, source: 'industry' as const })),
  ];
}
