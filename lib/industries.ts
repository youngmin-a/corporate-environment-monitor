/**
 * 산업 타입·선택지·키워드를 한 파일에서 관리한다 (PRD 5-3).
 *
 * 이 필터는 사용자가 만들거나 관리하는 태그가 아니다. 시스템이 정한 8개 산업을
 * 기준으로 기사 제목+발췌문에서 고정 키워드를 찾아 분류하는 고정형 필터다.
 */
export type Industry =
  | '자동차'
  | '철강'
  | '조선 및 해운'
  | '에너지'
  | '바이오'
  | '금융'
  | '반도체'
  | '정보통신';

export type IndustryFilter = '전체' | Industry;

/**
 * 산업별 분류 키워드. 제목+발췌문에 하나라도 포함되면 그 산업으로 분류한다.
 * 오분류 가능성이 큰 단독 키워드 "화학"·"수소"는 쓰지 않는다.
 */
export const INDUSTRY_KEYWORDS: Record<Industry, readonly string[]> = {
  자동차: ['자동차', '완성차', '전기차', '자율주행', '모빌리티', '자동차부품'],
  철강: ['철강', '제철', '강판', '후판', '열연', '냉연'],
  '조선 및 해운': ['조선', '조선소', '선박', '해운', '선사', '항만', '해양'],
  에너지: [
    '에너지',
    '석유화학',
    '화학산업',
    '화학업계',
    '정유',
    '정유사',
    '석유',
    '원유',
    'LNG',
    '천연가스',
    '도시가스',
    '발전소',
    '발전사업',
    '전력',
    '원전',
    '원자력',
    '태양광',
    '풍력',
    '수소에너지',
    '재생에너지',
    '신재생에너지',
  ],
  바이오: ['바이오', '제약', '제약사', '의약품', '의료기기', '임상시험', '신약'],
  금융: ['금융', '은행', '보험', '증권', '카드사', '핀테크', '대출'],
  반도체: ['반도체', '팹리스', '파운드리', '웨이퍼', '메모리반도체', '시스템반도체'],
  정보통신: [
    '정보통신',
    '통신사',
    '이동통신',
    '플랫폼',
    '소프트웨어',
    '클라우드',
    '데이터센터',
    '인공지능',
    'AI',
  ],
} as const;

/** 고정된 산업 순서. classifyIndustries()의 반환 순서이자 드롭다운 표시 순서다 */
export const ALL_INDUSTRIES: Industry[] = Object.keys(INDUSTRY_KEYWORDS) as Industry[];

/** 드롭다운 선택지. "전체"가 기본값이다 */
export const INDUSTRY_FILTER_OPTIONS: IndustryFilter[] = ['전체', ...ALL_INDUSTRIES];

/**
 * 제목+발췌문에서 산업별 키워드를 찾아 매칭되는 산업을 모두 반환한다.
 *
 * API·DB에 접근하지 않는 순수 함수다. 여러 산업에 해당하면 모두, 어디에도
 * 해당하지 않으면 빈 배열을 고정된 산업 순서로 돌려준다. 영문 키워드(AI, LNG 등)는
 * 대소문자 차이로 누락되지 않도록 소문자로 맞춰 비교한다.
 */
export function classifyIndustries(title: string, description: string): Industry[] {
  const haystack = `${title} ${description}`.toLowerCase();

  return ALL_INDUSTRIES.filter((industry) =>
    INDUSTRY_KEYWORDS[industry].some((keyword) => haystack.includes(keyword.toLowerCase())),
  );
}

/** 분류 오류가 나도 수집·백필 전체를 실패시키지 않도록 감싼 안전 버전 (PRD 5-3) */
export function classifyIndustriesSafe(title: string, description: string): Industry[] {
  try {
    return classifyIndustries(title, description);
  } catch (error) {
    console.warn('산업 분류 실패:', title, error);
    return [];
  }
}

/**
 * 산업별 대표 이미지 경로 (장식용). 기사 원문·언론사 사이트에서 이미지를 가져오지
 * 않고, 로컬 고정 이미지만 쓴다 — 저작권 문제를 피하고 기사 본문 크롤링 금지 원칙과
 * 일관되게 유지하기 위해서다. 파일은 `public/images/industries/`에 둔다.
 */
export const INDUSTRY_IMAGES: Record<Industry, string> = {
  자동차: '/images/industries/automotive.jpg',
  철강: '/images/industries/steel.jpg',
  '조선 및 해운': '/images/industries/shipbuilding-shipping.jpg',
  에너지: '/images/industries/energy.jpg',
  바이오: '/images/industries/bio.jpg',
  금융: '/images/industries/finance.jpg',
  반도체: '/images/industries/semiconductor.jpg',
  정보통신: '/images/industries/ict.jpg',
};

/**
 * 산업 미분류 기사, 또는 유효하지 않은 산업값일 때 쓰는 기본 이미지.
 * 아직 파일이 없다 — 없어도 ArticleCard가 CSS 그라데이션으로 대체한다.
 */
export const DEFAULT_ARTICLE_IMAGE = '/images/industries/default.jpg';

/**
 * 기사 카드에 쓸 대표 이미지 경로를 고른다.
 * 여러 산업에 해당하면 industries 배열의 첫 번째 산업 이미지를 쓰고,
 * 미분류(빈 배열)거나 매핑에 없는 값이면 기본 이미지로 대체한다.
 * 실제 파일 존재 여부는 이 함수가 판단하지 않는다 — 로딩 실패 시 CSS
 * 그라데이션으로 대체하는 처리는 ArticleCard(화면단)에서 한다.
 */
export function getArticleImage(industries: Industry[]): string {
  const primaryIndustry = industries[0];
  if (!primaryIndustry) return DEFAULT_ARTICLE_IMAGE;
  return INDUSTRY_IMAGES[primaryIndustry] ?? DEFAULT_ARTICLE_IMAGE;
}
