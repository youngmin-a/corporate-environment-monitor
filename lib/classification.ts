/**
 * 기사 성격 분류 (이슈 유형·근거 유형·긴급도·정책 단계·언급 기관).
 *
 * 설계 원칙은 `lib/industries.ts`·`lib/relevance.ts`와 같다.
 *  - **별도 AI 호출을 하지 않는다.** 저장된 제목과 요약만 보는 순수 함수다.
 *  - 새 DB 컬럼을 만들지 않는다. 조회한 기사에서 그때그때 계산한다.
 *  - 확실하지 않으면 값을 만들지 않는다 (null 또는 빈 배열).
 *
 * 기관·협회는 "회사 이름처럼 보이는 단어"를 뽑는 방식이 아니라, 아래에 손으로 적은
 * **고정 명칭 목록에 실제로 등장할 때만** 인정한다 — 임의 추정을 막기 위해서다.
 */

export type IssueType =
  | 'business-difficulty'
  | 'regulation-tightening'
  | 'regulation-relaxation'
  | 'regulatory-uncertainty'
  | 'licensing'
  | 'tax'
  | 'finance'
  | 'labor'
  | 'infrastructure'
  | 'environment'
  | 'trade'
  | 'certification'
  | 'government-support'
  | 'overseas-regulation';

export type EvidenceType =
  | 'company-direct'
  | 'association-direct'
  | 'government'
  | 'assembly'
  | 'expert'
  | 'media-analysis';

export type Urgency = 'critical' | 'high' | 'medium' | 'low';

export type PolicyStage =
  | 'problem-raised'
  | 'under-review'
  | 'announced'
  | 'legislative-notice'
  | 'bill-proposed'
  | 'scheduled'
  | 'in-effect';

export type GeographicScope = 'domestic' | 'overseas';

export const ISSUE_TYPE_LABELS: Record<IssueType, string> = {
  'business-difficulty': '기업 애로',
  'regulation-tightening': '규제 강화',
  'regulation-relaxation': '규제 완화',
  'regulatory-uncertainty': '규제 불확실성',
  licensing: '인허가',
  tax: '세제',
  finance: '금융 접근성',
  labor: '인력',
  infrastructure: '입지·전력·용수',
  environment: '환경',
  trade: '수출입',
  certification: '기술·인증',
  'government-support': '정부 지원',
  'overseas-regulation': '해외 규제',
};

export const EVIDENCE_TYPE_LABELS: Record<EvidenceType, string> = {
  'company-direct': '기업 직접 발언',
  'association-direct': '협회·단체 발언',
  government: '정부 발표',
  assembly: '국회 발언',
  expert: '전문가 발언',
  'media-analysis': '언론 분석',
};

export const URGENCY_LABELS: Record<Urgency, string> = {
  critical: '매우 높음',
  high: '높음',
  medium: '보통',
  low: '낮음',
};

export const POLICY_STAGE_LABELS: Record<PolicyStage, string> = {
  'problem-raised': '문제 제기',
  'under-review': '검토',
  announced: '발표',
  'legislative-notice': '입법예고',
  'bill-proposed': '법안 발의',
  scheduled: '시행 예정',
  'in-effect': '시행 중',
};

/** 이슈 유형 키워드. 앞에 있는 유형이 먼저 판정되며, 여러 유형에 걸릴 수 있다 */
const ISSUE_KEYWORDS: Record<IssueType, readonly string[]> = {
  'overseas-regulation': ['EU ', '미국 규제', '해외 규제', '수출 규제', 'IRA', '탄소국경', 'CBAM', '중국 규제', '관세'],
  'business-difficulty': ['애로', '어려움', '호소', '걸림돌', '차질', '위축', '부담 가중', '인력난'],
  'regulation-relaxation': ['규제 완화', '규제완화', '규제 개선', '규제개선', '규제 특례', '규제특례', '완화', '유예', '철회'],
  'regulation-tightening': ['규제 강화', '기준 강화', '의무화', '처벌 강화', '과징금', '제재', '시정명령', '행정처분'],
  'regulatory-uncertainty': ['불확실', '모호', '해석 논란', '기준 부재', '가이드라인 부재'],
  licensing: ['인허가', '허가', '승인', '신고', '등록', '심의', '입지 승인'],
  tax: ['세제', '세액공제', '법인세', '관세', '세 부담', '조세'],
  finance: ['대출', '자금 조달', '보증', '금융 지원', '투자 유치', '상장', '자본규제'],
  labor: ['인력', '고용', '근로시간', '주 52시간', '중대재해', '노동', '외국인력'],
  infrastructure: ['전력', '용수', '부지', '클러스터', '송전', '변전', '단지 조성'],
  environment: ['환경', '탄소', '배출', '온실가스', '폐기물', '수질', '대기오염'],
  trade: ['수출', '수입', '통관', '무역', '공급망'],
  certification: ['인증', '표준', '시험', '적합성', 'KC', '형식승인'],
  'government-support': ['지원 방안', '지원책', '예산 지원', '보조금', '육성', '진흥', '인센티브'],
};

/** 근거 유형 키워드 */
const EVIDENCE_KEYWORDS: Record<EvidenceType, readonly string[]> = {
  'company-direct': ['기업들은', '업체는', '기업 관계자', '업계 관계자', '대표는', 'CEO는', '사장은', '기업은'],
  'association-direct': ['협회', '연합회', '상공회의소', '경제단체', '중소기업중앙회', '경총', '전경련', '무역협회'],
  government: ['정부는', '부처', '장관', '차관', '청은', '위원회는', '발표했다', '밝혔다고'],
  assembly: ['국회', '의원', '상임위', '국정감사', '법안 발의'],
  expert: ['교수', '연구원', '전문가', '연구위원'],
  'media-analysis': ['분석했다', '전망된다', '풀이된다', '지적된다'],
};

/** 정책 단계 키워드 */
const STAGE_KEYWORDS: Record<PolicyStage, readonly string[]> = {
  'in-effect': ['시행 중', '시행됐', '시행된', '적용 중', '이미 시행'],
  scheduled: ['시행 예정', '내년부터', '다음 달부터', '시행을 앞두', '적용 예정'],
  'bill-proposed': ['법안 발의', '발의했', '개정안 발의'],
  'legislative-notice': ['입법예고', '행정예고', '의견 수렴'],
  announced: ['발표했', '확정했', '내놨', '공개했'],
  'under-review': ['검토', '추진한다', '논의', '협의'],
  'problem-raised': ['요구', '건의', '촉구', '호소', '지적', '반발'],
};

/**
 * 정부기관 고정 목록. 여기 적힌 정확한 명칭이 본문에 있을 때만 인정한다.
 */
const AGENCIES: readonly string[] = [
  '기획재정부', '재정경제부', '산업통상자원부', '산업부', '중소벤처기업부', '중기부',
  '금융위원회', '금융감독원', '공정거래위원회', '공정위', '환경부', '고용노동부',
  '국토교통부', '해양수산부', '과학기술정보통신부', '과기정통부', '보건복지부',
  '식품의약품안전처', '식약처', '농림축산식품부', '방송통신위원회', '개인정보보호위원회',
  '원자력안전위원회', '관세청', '국세청', '특허청', '조달청', '산업통상부',
  '국무조정실', '규제개혁위원회', '대통령실', '국회', '감사원', '한국은행',
];

/** 경제단체·협회 고정 목록 */
const ASSOCIATIONS: readonly string[] = [
  '대한상공회의소', '한국경제인협회', '전국경제인연합회', '한국무역협회', '중소기업중앙회',
  '한국경영자총협회', '경총', '한국산업연합포럼', '한국반도체산업협회', '한국자동차모빌리티산업협회',
  '한국철강협회', '한국조선해양플랜트협회', '한국석유화학협회', '한국제약바이오협회',
  '한국바이오협회', '은행연합회', '금융투자협회', '생명보험협회', '손해보험협회',
  '한국인터넷기업협회', '벤처기업협회', '이노비즈협회', '한국전지산업협회', '한국해운협회',
];

/** 대기업·주요 기업 고정 목록 (이 목록에 있는 이름만 "언급 기업"으로 센다) */
const COMPANIES: readonly string[] = [
  '삼성전자', '삼성바이오로직스', '삼성SDI', 'SK하이닉스', 'SK이노베이션', 'SK텔레콤',
  'LG에너지솔루션', 'LG전자', 'LG화학', 'LG디스플레이', '현대자동차', '기아',
  '현대모비스', '현대제철', '포스코', 'HD현대', '한화오션', '삼성중공업', '한화솔루션',
  '롯데케미칼', 'GS칼텍스', 'S-OIL', 'HMM', '대한항공', 'KT', 'LG유플러스',
  '네이버', '카카오', '쿠팡', '셀트리온', '유한양행', '한미약품', '녹십자', '대웅제약',
  '두산에너빌리티', '효성', '고려아연', '에코프로', 'LS일렉트릭', '한국전력',
];

function matched(haystack: string, needles: readonly string[]): string[] {
  return needles.filter((needle) => haystack.includes(needle));
}

/** 기사 하나에서 뽑아낸 분류 결과 */
export type ArticleClassification = {
  issueTypes: IssueType[];
  evidenceType: EvidenceType | null;
  urgency: Urgency;
  policyStage: PolicyStage | null;
  geographicScope: GeographicScope;
  /** 큰따옴표 안의 발언이 실제로 있는지 */
  directQuote: boolean;
  agencies: string[];
  associations: string[];
  companies: string[];
};

/** 긴급도 판정용 신호 */
const CRITICAL_SIGNALS = ['시행 예정', '유예 종료', '즉시 시행', '영업정지', '전면 금지', '수출 중단'];
const HIGH_SIGNALS = ['입법예고', '의무화', '과징금', '투자 지연', '생산 차질', '공급망 차질', '인력난'];

/**
 * 제목과 요약 텍스트로 기사 성격을 분류한다.
 *
 * @param title 기사 제목
 * @param body  요약을 이어 붙인 본문 텍스트 (저장된 summary/expandedSummary)
 */
export function classifyArticle(title: string, body: string): ArticleClassification {
  const text = `${title} ${body}`;

  const issueTypes = (Object.keys(ISSUE_KEYWORDS) as IssueType[]).filter(
    (type) => matched(text, ISSUE_KEYWORDS[type]).length > 0,
  );

  const evidenceType =
    (Object.keys(EVIDENCE_KEYWORDS) as EvidenceType[]).find(
      (type) => matched(text, EVIDENCE_KEYWORDS[type]).length > 0,
    ) ?? null;

  const policyStage =
    (Object.keys(STAGE_KEYWORDS) as PolicyStage[]).find(
      (stage) => matched(text, STAGE_KEYWORDS[stage]).length > 0,
    ) ?? null;

  const agencies = matched(text, AGENCIES);
  const associations = matched(text, ASSOCIATIONS);
  const companies = matched(text, COMPANIES);

  let urgency: Urgency = 'low';
  if (matched(text, CRITICAL_SIGNALS).length > 0) urgency = 'critical';
  else if (matched(text, HIGH_SIGNALS).length > 0) urgency = 'high';
  else if (issueTypes.length > 0) urgency = 'medium';

  return {
    issueTypes,
    evidenceType,
    urgency,
    policyStage,
    geographicScope: issueTypes.includes('overseas-regulation') ? 'overseas' : 'domestic',
    directQuote: /["“][^"”]{6,}["”]/.test(text),
    agencies,
    associations,
    companies,
  };
}

/** 분류에서 이슈 유형이 하나도 안 잡혔을 때 카드에 붙일 대표 유형은 없다고 본다 */
export function primaryIssueType(classification: ArticleClassification): IssueType | null {
  return classification.issueTypes[0] ?? null;
}

export const ALL_ISSUE_TYPES = Object.keys(ISSUE_KEYWORDS) as IssueType[];
export const ALL_EVIDENCE_TYPES = Object.keys(EVIDENCE_KEYWORDS) as EvidenceType[];
export const ALL_URGENCIES: Urgency[] = ['critical', 'high', 'medium', 'low'];
