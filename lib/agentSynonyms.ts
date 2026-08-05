import type { Industry } from '@/lib/industries';

/**
 * 검색어 확장용 도메인 동의어 사전과 인접 산업 지도.
 *
 * 벡터 임베딩 없이 검색 재현율을 높이기 위한 규칙 기반 확장 계층이다
 * (PRD 추가요구 6·9·16장). 사전은 실제 기사에 등장하는 표현 위주로 최소한만
 * 관리하고, 무한정 늘리지 않는다.
 */
export const DOMAIN_SYNONYMS: Record<string, readonly string[]> = {
  선박금융: ['해양금융', '신조선 금융', '중고선 금융', '선박 건조자금', '친환경 선박금융', '선수금환급보증', 'RG'],
  '기업 애로사항': ['기업 어려움', '경영 애로', '규제 부담', '제도 개선 요구', '기업 건의', '현장 애로', '애로사항'],
  '금융 접근성': ['자금 조달', '대출 접근', '보증', '담보 부족', '신용 공급', '민간금융 참여'],
  인력난: ['인력 부족', '구인난', '채용난', '외국인력'],
  탄소중립: ['넷제로', '온실가스 감축', '탄소국경조정', 'CBAM'],
  해운: ['해운업', '선사', '해운업계'],
  조선: ['조선업', '조선소', '선박 건조'],
  규제완화: ['규제 개선', '규제 특례', '규제 유예'],
  규제강화: ['규제 의무화', '기준 강화'],
  인허가: ['허가', '승인', '인가'],
  반도체: ['반도체 산업', '시스템반도체', '메모리반도체', '파운드리'],
} as const;

/**
 * 인접 산업 지도. 고정 사실이 아니라 "검색 결과가 부족할 때 넓혀볼 만한 후보"일
 * 뿐이며, 자동 확장 조건을 만족할 때만 적용한다(PRD 추가요구 11·16장).
 */
export const RELATED_INDUSTRIES: Record<Industry, readonly Industry[]> = {
  자동차: ['철강', '반도체', '에너지'],
  철강: ['자동차', '조선 및 해운', '에너지'],
  '조선 및 해운': ['금융', '에너지', '철강'],
  에너지: ['철강', '조선 및 해운', '자동차'],
  바이오: ['금융', '정보통신'],
  금융: ['조선 및 해운', '반도체', '바이오'],
  반도체: ['정보통신', '에너지', '금융'],
  정보통신: ['반도체', '금융', '바이오'],
};

/** 주어진 검색어에 동의어 사전을 적용해 확장한다. 원래 없던 표현을 지어내지 않는다 */
export function expandTermsWithSynonyms(terms: readonly string[]): string[] {
  const expanded = new Set(terms);

  for (const term of terms) {
    for (const [key, values] of Object.entries(DOMAIN_SYNONYMS)) {
      const related = key.includes(term) || term.includes(key) || values.some((value) => value.includes(term) || term.includes(value));
      if (!related) continue;
      expanded.add(key);
      values.forEach((value) => expanded.add(value));
    }
  }

  return [...expanded];
}
