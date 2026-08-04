import type { Industry } from '@/lib/industries';

/**
 * 기사 한 건.
 *
 * Supabase `articles` 테이블의 한 행과 그대로 대응한다.
 * 컬럼 정의는 PRD.md 8번을 따른다.
 */
export type Article = {
  /** 원문 링크. 고유 키이자 중복 판정 기준 (PRD 5-1) */
  url: string;
  title: string;
  /** 언론사 이름 */
  press: string;
  /** 발행일 (ISO 8601 날짜, 예: "2026-08-03") */
  publishedAt: string;
  /**
   * 카드용 요약 3줄. 요약에 실패했으면 null이며, 화면에 "요약 실패"로 표시한다.
   * 문장을 지어내서 채우지 않는다 (PRD 5-2).
   */
  summary: string[] | null;
  /**
   * 상세 화면용 확장 요약 6~8문장. 카드에는 쓰지 않는다.
   *
   * 수집 시점의 요약 호출 한 번에서 summary와 함께 받아 저장한다 — 상세를 열 때
   * 새로 만들지 않는다. 이 컬럼이 생기기 전에 수집된 기사는 null이며, 그때는
   * 상세 화면이 카드용 요약으로 대체한다 (지어내지 않는다).
   */
  expandedSummary: string[] | null;
  /** 수집 시각 (ISO 8601) */
  collectedAt: string;
  /**
   * 중복 묶음의 대표 기사 URL.
   * 자기 자신이 대표면 null. 값이 있으면 그 기사에 묶인 상태다 (PRD 5-1).
   */
  groupId: string | null;
  /**
   * 시스템이 정한 8개 산업 중 이 기사가 해당하는 것들 (PRD 5-3).
   * 사용자가 만드는 태그가 아니라 키워드 기반 고정 분류이며, 없으면 빈 배열이다.
   */
  industries: Industry[];
  /**
   * 기업 규제·애로 연관성 점수 0~100 (PRD 5-1).
   * DB의 `relevance_score`와 대응하며, 값이 없거나 이상하면 0으로 본다.
   * 60점 미만 기사는 목록에 노출하지 않는다.
   */
  relevanceScore: number;
};

/**
 * 화면에서만 쓰는 파생 정보를 붙인 기사.
 *
 * DB에 컬럼을 새로 만들지 않고, 조회한 기사에서 `lib/classification.ts`·
 * `lib/relevance.ts`·`lib/publishers.ts`의 순수 함수로 한 번만 계산한다.
 */
export type EnrichedArticle = Article & {
  /** 사람이 읽는 언론사명. 매핑에 없으면 원본 값(도메인) 그대로다 */
  publisher: string;
  /** publisher가 매핑된 이름일 때만 채워지는 원본 도메인 */
  domain: string | null;
  classification: import('@/lib/classification').ArticleClassification;
  scoreReasons: import('@/lib/relevance').ScoreReason[];
  /** 검색용으로 미리 소문자화해 이어 붙인 텍스트 (매 렌더마다 다시 만들지 않는다) */
  searchText: string;
  /** 확장 요약에만 들어 있는 내용까지 검색되도록 별도로 둔다 */
  expandedSearchText: string;
};

/**
 * 화면에 카드 한 장으로 그릴 단위.
 * 대표 기사 하나에 중복으로 묶인 기사들이 딸려 있는 형태다.
 */
export type ArticleGroup = {
  /** 대표 기사. 요약은 이 기사에 대해서만 만든다 (PRD 5-2) */
  representative: Article;
  /** 같은 사안으로 묶인 나머지 기사들. 제목과 링크만 쓴다 */
  related: Article[];
};

/** ArticleGroup에 파생 정보를 붙인 형태. 화면은 이 타입만 다룬다 */
export type EnrichedGroup = {
  representative: EnrichedArticle;
  related: EnrichedArticle[];
};

/**
 * 같은 사안을 다룬 기사 묶음(=대표 기사 카드) 여러 개를 하나로 본 이슈 군집.
 *
 * DB의 group_id(제목 자카드 0.7 이상)보다 한 단계 위다 — 서로 다른 언론사가
 * 다른 제목으로 쓴 같은 정책 이슈를 묶는다. 잘못 합치는 쪽이 못 묶는 쪽보다
 * 위험하므로 보수적으로 판정한다 (lib/clustering.ts).
 */
export type IssueCluster = {
  id: string;
  /** 이 군집의 대표 카드 (가장 근거가 강한 것) */
  lead: EnrichedGroup;
  /** lead를 포함한 모든 카드 */
  members: EnrichedGroup[];
  /** 군집 안 기사 총 건수 (대표 + 묶인 기사 모두) */
  articleCount: number;
  /** 서로 다른 언론사 수 */
  publisherCount: number;
  highestScore: number;
  firstPublishedAt: string;
  lastPublishedAt: string;
  /** 군집을 묶은 근거가 된 공통 키워드 */
  sharedKeywords: string[];
};

/**
 * 수집 상태. Supabase `collection_state` 테이블(단일 행)과 대응한다.
 *
 * Vercel은 서버리스라 실행이 끝나면 메모리가 사라진다. 쿨다운·하루 상한·마지막 성공
 * 시각·최초 소급 여부를 이 테이블에 저장해 두고 매 실행마다 읽는다 (PRD 8번).
 */
export type CollectionState = {
  /** 수집을 시작한 시각. 성공 여부와 무관하게 갱신되며, 5분 쿨다운의 기준이 된다 */
  lastAttemptAt: string | null;
  /** 마지막으로 수집이 끝난 시각. 화면 상단에 표시한다 */
  lastSuccessAt: string | null;
  /** todayNewCount가 어느 날짜(KST) 기준인지 */
  todayDate: string | null;
  /** 오늘 새로 저장한 대표 기사 수. 하루 총합 20건 상한에 쓴다 */
  todayNewCount: number;
  /** 최초 3개월 소급 수집을 이미 마쳤는지 */
  initialBackfillDone: boolean;
};
