/**
 * 네이버 검색 API는 개발자센터(openapi.naver.com)에서 NCP의 NAVER API HUB로
 * 이전됐다. 구 엔드포인트로 호출하면 401이 나므로 이 주소를 써야 한다.
 */
const NAVER_NEWS_SEARCH_URL = 'https://naverapihub.apigw.ntruss.com/search/v1/news';

/**
 * PRD 5-1: 규제 키워드 10개. "등"을 빼고 이 10개로 고정한다.
 * 검색 시 각 키워드 앞에 "기업"을 붙인다 — 부동산·방송·금융 규제 같은 무관한
 * 기사를 입구에서 걸러내기 위해서다.
 */
export const REGULATION_KEYWORDS = [
  '규제',
  '애로',
  '인허가',
  '행정처분',
  '기업부담',
  '규제개선',
  '심의',
  '인증',
  '검역',
  '시행규칙',
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

/**
 * PRD 5-1: 규제 키워드 10개 앞에 "기업"을 붙여 검색어 10개로 나눠 호출한다.
 * 네이버 API가 OR 검색을 지원하지 않아 한 번에 묶을 수 없다.
 *
 * 이 함수는 필터링을 하지 않고 10회 호출 결과를 그대로 합쳐 돌려준다 (PLAN 6번).
 * 기간·키워드 필터, 관련도 정렬, 중복 묶기는 lib/collector.ts에서 다음 단계로 붙인다.
 */
export async function fetchAllCandidates(): Promise<NaverNewsItem[]> {
  const results = await Promise.all(
    REGULATION_KEYWORDS.map((keyword) => searchNews(`기업 ${keyword}`)),
  );
  return results.flat();
}
