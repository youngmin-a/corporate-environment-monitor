import type { Industry } from '@/lib/industries';
import type { Article, ArticleGroup } from '@/types/article';

/**
 * 화면 확인용 가짜 기사 데이터. 실제 보도 내용이 아니다.
 * 링크도 example.com으로 두어 진짜 기사와 헷갈리지 않게 했다.
 *
 * 화면의 여러 상태를 한 번에 볼 수 있도록 일부러 섞어 두었다.
 *  - 중복으로 묶인 기사(관련 기사 N건)
 *  - 요약에 실패한 기사
 *  - 요약이 3줄이 아닌 1~2줄인 기사
 *  - 산업 미분류(1001) / 복수 산업(1010) / 단일 산업(1011~1013) 기사 (PRD 5-3)
 */
const article = (
  url: string,
  title: string,
  press: string,
  publishedAt: string,
  summary: string[] | null,
  groupId: string | null = null,
  industries: Industry[] = [],
  relevanceScore = 75,
): Article => ({
  url,
  title,
  press,
  publishedAt,
  summary,
  collectedAt: '2026-08-04T08:00:00+09:00',
  groupId,
  industries,
  relevanceScore,
});

export const sampleGroups: ArticleGroup[] = [
  {
    representative: article(
      'https://example.com/news/1001',
      '중소 제조업체 "환경 인허가 절차만 8개월"…현장 애로 호소',
      '연합뉴스(샘플)',
      '2026-08-03',
      [
        '경기 중소 제조업체들이 환경 인허가에',
        '평균 8개월이 걸린다고 호소했다.',
        '서류 보완 반복이 주된 원인으로 꼽혔다.',
      ],
    ),
    related: [
      article(
        'https://example.com/news/1002',
        '중소 제조업체 "환경 인허가에 8개월"…애로 호소',
        '파이낸셜뉴스(샘플)',
        '2026-08-03',
        null,
        'https://example.com/news/1001',
      ),
      article(
        'https://example.com/news/1003',
        '"환경 인허가 8개월" 중소 제조업체 현장 애로',
        '이데일리(샘플)',
        '2026-08-02',
        null,
        'https://example.com/news/1001',
      ),
    ],
  },
  {
    representative: article(
      'https://example.com/news/1010',
      '핀테크 업계, 망분리 규제 완화 요구…"클라우드 전환 걸림돌"',
      '디지털타임스(샘플)',
      '2026-08-02',
      [
        '핀테크 기업들이 금융권 망분리 규제로',
        '클라우드 전환이 막힌다고 밝혔다.',
      ],
      null,
      // 복수 산업 사례: "핀테크"(금융) + "클라우드"(정보통신) 둘 다 매칭
      ['금융', '정보통신'],
    ),
    related: [],
  },
  {
    representative: article(
      'https://example.com/news/1011',
      '재생에너지 사업자 "계통 연계 인허가 대기 2년"',
      '에너지경제(샘플)',
      '2026-08-01',
      [
        '태양광·풍력 사업자의 계통 연계 대기가',
        '2년까지 늘어 수익성이 악화됐다.',
        '제도 개선 요구가 이어지고 있다.',
      ],
      null,
      // 단일 산업 사례: "태양광"·"풍력"·"재생에너지" → 에너지
      ['에너지'],
    ),
    related: [],
  },
  {
    representative: article(
      'https://example.com/news/1012',
      '의료기기 업체 "품목 허가 심사 지연으로 시장 진입 늦어져"',
      '메디컬타임즈(샘플)',
      '2026-07-31',
      // 요약 실패 사례 — 화면에 "요약 실패"로 표시된다
      null,
      null,
      // 단일 산업 사례: "의료기기" → 바이오
      ['바이오'],
    ),
    related: [],
  },
  {
    representative: article(
      'https://example.com/news/1013',
      '조선 기자재 업계 "안전 인증 중복 규제로 납기 지연"',
      '부산일보(샘플)',
      '2026-07-30',
      [
        '조선 기자재 업체들이 유사 안전 인증을',
        '중복으로 받아 납기가 밀린다고 밝혔다.',
      ],
      null,
      // 단일 산업 사례: "조선" → 조선 및 해운
      ['조선 및 해운'],
    ),
    related: [
      article(
        'https://example.com/news/1014',
        '조선 기자재 "중복 안전 인증에 납기 지연" 지적',
        '전자신문(샘플)',
        '2026-07-30',
        null,
        'https://example.com/news/1013',
        ['조선 및 해운'],
      ),
    ],
  },
];

/** 샘플 데이터일 때 화면 상단에 보여줄 마지막 수집 성공 시각 */
export const sampleLastSuccessAt = '2026-08-04T08:00:00+09:00';
