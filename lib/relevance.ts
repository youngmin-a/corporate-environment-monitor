/**
 * 기업 규제·애로 연관성 점수 (PRD 5-1).
 *
 * 점수 규칙과 상한 숫자를 이 파일 한 곳에만 둔다 — 수집 파이프라인·조회·화면에
 * 같은 숫자를 다시 적지 않기 위해서다. 별도 AI 호출 없이 제목·발췌문과 산업 분류
 * 결과만으로 계산하는 순수 함수다.
 */
import type { Industry } from '@/lib/industries';

/** 이 점수 미만이면 요약·저장·목록 노출에서 모두 제외한다 */
export const MIN_RELEVANCE_SCORE = 60;

/** 한 번에 저장·요약하는 대표 기사 수이자 화면 기본 목록 상한 */
export const MAX_VISIBLE_ARTICLES = 30;

/**
 * 산업 미분류 기사는 이 점수 이상이면서 기업 부담·개선 요구가 있어야 통과시킨다.
 * 미분류 기사는 카드에 기본 이미지가 붙어 목록이 밋밋해지므로 문턱을 더 높였다.
 */
const UNCLASSIFIED_MIN_SCORE = 75;

/** 규제·제도 신호 — 제목에 있으면 +25, 발췌문에 있으면 +10 */
const REGULATION_SIGNALS = [
  '규제완화',
  '규제개선',
  '규제특례',
  '규제',
  '인허가',
  '허가',
  '승인',
  '인증',
  '심사',
  '신고',
  '등록',
  '행정처분',
  '시행령',
  '시행규칙',
  '제도개선',
  '기준 강화',
  '기준 완화',
] as const;

/**
 * 구체적인 기업 부담·사업 차질 — +25
 *
 * PRD의 예시는 "비용 부담"처럼 두 단어 복합어 위주인데, 네이버 발췌문이 100자
 * 남짓이라 그대로 두면 실제 기사에서 거의 걸리지 않았다(1200건 중 2건 통과).
 * 뜻이 같은 단일어와 행정 제재 표현을 함께 넣어 실제 기사 문장에 맞췄다.
 */
const BURDEN_SIGNALS = [
  // 비용·부담
  '비용 부담',
  '비용 증가',
  '부담 가중',
  '부담',
  '과징금',
  '벌금',
  '세 부담',
  // 지연·차질·중단
  '투자 지연',
  '투자 위축',
  '사업 지연',
  '사업 중단',
  '생산 차질',
  '수출 차질',
  '납기 차질',
  '공급망 차질',
  '절차 장기화',
  '승인 지연',
  '허가 지연',
  '지연',
  '차질',
  '중단',
  '위축',
  // 제재·처분
  '영업정지',
  '등록취소',
  '취소',
  '제재',
  '처분',
  '시정명령',
  '적발',
  // 진입·경쟁력
  '진입장벽',
  '시장 진입 제한',
  '경쟁력 저하',
  '걸림돌',
  '장벽',
  '애로',
  '어려움',
  // 자원 부족
  '인력난',
  '전력 부족',
  '용수 부족',
  '부지 부족',
] as const;

/**
 * 기업·업계의 직접적인 개선 요구 — +20
 * 부담 신호와 같은 이유로, "완화를 요청"뿐 아니라 실제 기사에서 흔한 단일어
 * ("완화", "지적", "필요성")까지 포함한다.
 */
const DEMAND_SIGNALS = [
  '요구',
  '건의',
  '촉구',
  '호소',
  '반발',
  '요청',
  '주장',
  '지적',
  '우려',
  '개선',
  '완화',
  '유예',
  '철회',
  '필요성',
  '제도 개선 필요',
] as const;

/** 기업·산업 주체가 명확함 — +10 */
const ACTOR_SIGNALS = [
  '기업',
  '기업들',
  '기업인',
  '중소기업',
  '중견기업',
  '업체',
  '업계',
  '산업계',
  '협회',
  '상공회의소',
  '제조사',
  '선사',
  '은행권',
  '금융권',
  '제약계',
  '바이오업계',
  '반도체업계',
] as const;

/** 감점 대상 유형 */
const POLITICS_SIGNALS = ['대선', '총선', '정당', '후보', '여야 공방', '정치권 비판'] as const;
const MARKET_SIGNALS = [
  '주가',
  '증시',
  '시황',
  '급등',
  '급락',
  '순매수',
  '영업이익',
  '매출 증가',
  '실적 발표',
] as const;
const EVENT_SIGNALS = [
  '전시회 개최',
  '박람회 개최',
  '업무협약',
  '임원 선임',
  '취임',
  '출간',
  '시상식',
  '만족도 조사',
] as const;
const OPINION_SIGNALS = ['사설', '칼럼', '기고', '전망한다', '내다봤다'] as const;

const SCORE_TITLE_REGULATION = 25;
const SCORE_DESCRIPTION_REGULATION = 10;
const SCORE_BURDEN = 25;
const SCORE_DEMAND = 20;
const SCORE_ACTOR = 10;
const SCORE_INDUSTRY = 10;

const PENALTY_POLITICS = -30;
const PENALTY_MARKET = -30;
const PENALTY_EVENT = -25;
const PENALTY_OPINION = -20;
const PENALTY_POLICY_ONLY = -20;

function includesAny(haystack: string, needles: readonly string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

/** 한 기사에서 판정한 신호들. 점수 계산과 통과 조건 판정이 같은 값을 공유한다 */
type Signals = {
  titleRegulation: boolean;
  descriptionRegulation: boolean;
  burden: boolean;
  demand: boolean;
  actor: boolean;
  industry: boolean;
  politics: boolean;
  market: boolean;
  event: boolean;
  opinion: boolean;
};

function detectSignals(title: string, description: string, industries: Industry[]): Signals {
  const both = `${title} ${description}`;

  return {
    titleRegulation: includesAny(title, REGULATION_SIGNALS),
    descriptionRegulation: includesAny(description, REGULATION_SIGNALS),
    burden: includesAny(both, BURDEN_SIGNALS),
    demand: includesAny(both, DEMAND_SIGNALS),
    actor: includesAny(both, ACTOR_SIGNALS),
    industry: industries.length > 0,
    politics: includesAny(both, POLITICS_SIGNALS),
    market: includesAny(both, MARKET_SIGNALS),
    event: includesAny(both, EVENT_SIGNALS),
    opinion: includesAny(both, OPINION_SIGNALS),
  };
}

function scoreFromSignals(signals: Signals): number {
  let score = 0;

  if (signals.titleRegulation) score += SCORE_TITLE_REGULATION;
  if (signals.descriptionRegulation) score += SCORE_DESCRIPTION_REGULATION;
  if (signals.burden) score += SCORE_BURDEN;
  if (signals.demand) score += SCORE_DEMAND;
  if (signals.actor) score += SCORE_ACTOR;
  if (signals.industry) score += SCORE_INDUSTRY;

  const hasConcreteImpact = signals.burden || signals.demand;

  if (signals.politics) score += PENALTY_POLITICS;
  if (signals.market) score += PENALTY_MARKET;
  if (signals.event) score += PENALTY_EVENT;
  // 사설·칼럼이라도 구체적 기업 부담과 개선 요구가 모두 있으면 감점하지 않는다
  if (signals.opinion && !(signals.burden && signals.demand)) score += PENALTY_OPINION;
  // 규제 신호만 있고 기업이 겪는 영향이 없으면 "정책 소개"로 보고 감점한다
  if ((signals.titleRegulation || signals.descriptionRegulation) && !hasConcreteImpact) {
    score += PENALTY_POLICY_ONLY;
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * 기업 규제·애로 연관성 점수 (0~100).
 * 기존 기사처럼 발췌문이 없으면 description 자리에 요약을 넣어 부른다.
 */
export function calculateRelevanceScore(
  title: string,
  description: string,
  industries: Industry[],
): number {
  return scoreFromSignals(detectSignals(title, description, industries));
}

/** 통과하지 못한 이유. 수집 로그·백필 보고에 그대로 쓴다 */
export type RelevanceRejection =
  | '규제·부담·요구 신호 없음'
  | '기업·산업 주체 없음'
  | '정치 기사'
  | '단순 주가·실적 기사'
  | '행사·인사·홍보 기사'
  | '기업 영향 없는 정책 소개'
  | '산업 키워드만 있고 기업 애로 없음'
  | '산업 미분류 + 75점 미만'
  | '60점 미만';

export type RelevanceResult = {
  score: number;
  /** 수집·노출 대상인지 */
  accepted: boolean;
  /** accepted가 false일 때만 채워진다 */
  rejection?: RelevanceRejection;
};

/**
 * 점수와 필수 통과 조건을 함께 판정한다 (PRD 5-1).
 *
 * 점수만 합산하면 "규제"라는 단어가 우연히 들어간 기사가 통과할 수 있어,
 * 아래 조건을 별도로 건다.
 *   1. 규제 신호·기업 부담·개선 요구 중 하나 이상
 *   2. 기업·업계 주체 또는 산업 분류 중 하나 이상
 * 정치·주가·행사 기사는 구체적 기업 부담이나 개선 요구가 없으면 점수와 무관하게 뺀다.
 */
export function evaluateRelevance(
  title: string,
  description: string,
  industries: Industry[],
): RelevanceResult {
  const signals = detectSignals(title, description, industries);
  const score = scoreFromSignals(signals);

  const hasConcreteImpact = signals.burden || signals.demand;
  const hasAnyRegulationSignal = signals.titleRegulation || signals.descriptionRegulation;

  const reject = (rejection: RelevanceRejection): RelevanceResult => ({
    score,
    accepted: false,
    rejection,
  });

  if (!hasAnyRegulationSignal && !hasConcreteImpact) return reject('규제·부담·요구 신호 없음');
  if (!signals.actor && !signals.industry) return reject('기업·산업 주체 없음');

  // 아래 세 유형은 기업이 겪는 구체적 부담·요구가 없으면 점수와 관계없이 뺀다
  if (signals.politics && !hasConcreteImpact) return reject('정치 기사');
  if (signals.market && !hasConcreteImpact) return reject('단순 주가·실적 기사');
  if (signals.event && !hasConcreteImpact) return reject('행사·인사·홍보 기사');

  // 규제 단어만 있고 기업 영향이 없으면 정책 소개·우연한 언급으로 본다
  if (hasAnyRegulationSignal && !hasConcreteImpact) return reject('기업 영향 없는 정책 소개');
  if (signals.industry && !hasAnyRegulationSignal && !hasConcreteImpact) {
    return reject('산업 키워드만 있고 기업 애로 없음');
  }

  if (!signals.industry && (score < UNCLASSIFIED_MIN_SCORE || !hasConcreteImpact)) {
    return reject('산업 미분류 + 75점 미만');
  }

  if (score < MIN_RELEVANCE_SCORE) return reject('60점 미만');

  return { score, accepted: true };
}

/** DB에서 읽은 값이 비었거나 이상해도 0~100 정수로 맞춰 준다 */
export function toRelevanceScore(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}
