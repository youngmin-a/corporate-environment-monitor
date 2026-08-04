/**
 * 언론사 표시 이름.
 *
 * 네이버 검색 API는 언론사명을 따로 주지 않아 `lib/collector.ts`가 원문 링크의
 * 도메인을 그대로 press에 넣는다(예: `mt.co.kr`). 화면에서는 사람이 읽는 이름을
 * 우선 보여주되, **매핑에 없는 도메인은 추정하지 않고 도메인 그대로 표시한다.**
 *
 * 여기 있는 값은 도메인 소유 언론사가 확실한 것만 손으로 적은 목록이다.
 */

/** 도메인 → 언론사명. www. 를 뗀 hostname 기준이다 */
const PUBLISHER_NAMES: Record<string, string> = {
  'n.news.naver.com': '네이버뉴스',
  'news.naver.com': '네이버뉴스',
  'yna.co.kr': '연합뉴스',
  'www.yna.co.kr': '연합뉴스',
  'yonhapnews.co.kr': '연합뉴스',
  'newsis.com': '뉴시스',
  'news1.kr': '뉴스1',
  'mt.co.kr': '머니투데이',
  'news.mt.co.kr': '머니투데이',
  'mk.co.kr': '매일경제',
  'hankyung.com': '한국경제',
  'sedaily.com': '서울경제',
  'fnnews.com': '파이낸셜뉴스',
  'edaily.co.kr': '이데일리',
  'asiae.co.kr': '아시아경제',
  'heraldcorp.com': '헤럴드경제',
  'etnews.com': '전자신문',
  'dt.co.kr': '디지털타임스',
  'ddaily.co.kr': '디지털데일리',
  'zdnet.co.kr': 'ZDNet 코리아',
  'inews24.com': '아이뉴스24',
  'chosun.com': '조선일보',
  'biz.chosun.com': '조선비즈',
  'donga.com': '동아일보',
  'joongang.co.kr': '중앙일보',
  'hani.co.kr': '한겨레',
  'khan.co.kr': '경향신문',
  'seoul.co.kr': '서울신문',
  'kmib.co.kr': '국민일보',
  'segye.com': '세계일보',
  'munhwa.com': '문화일보',
  'hankookilbo.com': '한국일보',
  'kbs.co.kr': 'KBS',
  'news.kbs.co.kr': 'KBS',
  'imnews.imbc.com': 'MBC',
  'sbs.co.kr': 'SBS',
  'news.sbs.co.kr': 'SBS',
  'ytn.co.kr': 'YTN',
  'yonhapnewstv.co.kr': '연합뉴스TV',
  'mbn.co.kr': 'MBN',
  'wowtv.co.kr': '한국경제TV',
  'newsway.co.kr': '뉴스웨이',
  'ajunews.com': '아주경제',
  'g-enews.com': '글로벌이코노믹',
  'ekn.kr': '에너지경제',
  'e2news.com': '이투뉴스',
  'electimes.com': '전기신문',
  'energy-news.co.kr': '에너지신문',
  'dailypharm.com': '데일리팜',
  'medipana.com': '메디파나뉴스',
  'yakup.com': '약업신문',
  'docdocdoc.co.kr': '청년의사',
  'bosa.co.kr': '의학신문',
  'thebell.co.kr': '더벨',
  'businesspost.co.kr': '비즈니스포스트',
  'ceoscoredaily.com': 'CEO스코어데일리',
  'newsprime.co.kr': '프라임경제',
  'metroseoul.co.kr': '메트로신문',
  'kukinews.com': '쿠키뉴스',
  'nocutnews.co.kr': '노컷뉴스',
  'ohmynews.com': '오마이뉴스',
  'pressian.com': '프레시안',
  'mediatoday.co.kr': '미디어오늘',
  'shinailbo.co.kr': '신아일보',
  'ekoreanews.co.kr': '한국우편신문',
  'kyunghyang.com': '경향신문',
  'sisajournal.com': '시사저널',
  'weekly.chosun.com': '주간조선',
  'economist.co.kr': '이코노미스트',
  'mediapen.com': '미디어펜',
  'ebn.co.kr': 'EBN',
  'iusm.co.kr': '유에스엠',
  'industrynews.co.kr': '인더스트리뉴스',
  'kidd.co.kr': '산업일보',
  'the-pr.co.kr': '더피알',
  'lawtimes.co.kr': '법률신문',
  'ftoday.co.kr': '파이낸셜투데이',
  'fntimes.com': '한국금융신문',
  'insnews.co.kr': '한국보험신문',
  'thescoop.co.kr': '더스쿠프',
  'newstomato.com': '뉴스토마토',
  'dailian.co.kr': '데일리안',
  'ohmynews.co.kr': '오마이뉴스',
  'sisain.co.kr': '시사IN',
  'greenpostkorea.co.kr': '그린포스트코리아',
  'enviornmentkorea.co.kr': '환경일보',
  'todayenergy.kr': '투데이에너지',
  'gasnews.com': '가스신문',
  'steelmarket.co.kr': '스틸마켓',
  'snmnews.com': '철강금속신문',
  'kmaritimenews.com': '해양한국',
  'shippingnewsnet.com': '쉬핑뉴스넷',
  'autodaily.co.kr': '오토데일리',
  'motorgraph.com': '모터그래프',
  'thelec.kr': '디일렉',
  'hellot.net': '헬로티',
};

/**
 * 화면에 보여줄 언론사 이름.
 * 매핑에 없으면 저장된 값(대개 도메인)을 그대로 돌려준다 — 임의로 추정하지 않는다.
 *
 * `biz.heraldcorp.com`처럼 하위 도메인이 붙은 경우 상위 도메인 매핑을 따라간다.
 * 같은 언론사의 섹션 도메인이라 이름이 달라지지 않기 때문이다. 다만 `biz.chosun.com`
 * (조선비즈)처럼 이름이 다른 곳은 위 목록에 직접 적어 두었고, 그 값이 먼저 쓰인다.
 */
export function publisherName(press: string): string {
  if (!press) return '알 수 없음';
  const key = press.trim().toLowerCase().replace(/^www\./, '');

  const exact = PUBLISHER_NAMES[key] ?? PUBLISHER_NAMES[press.trim()];
  if (exact) return exact;

  const labels = key.split('.');
  for (let start = 1; start < labels.length - 1; start += 1) {
    const parent = labels.slice(start).join('.');
    const found = PUBLISHER_NAMES[parent];
    if (found) return found;
  }

  return press;
}

/** 매핑된 이름과 원본 도메인이 다를 때만 도메인을 보조 표기로 보여준다 */
export function publisherDomain(press: string): string | null {
  const name = publisherName(press);
  return name === press ? null : press;
}

/** 언론사명이 매핑돼 있는지 (데이터 품질 감사에서 쓴다) */
export function hasPublisherName(press: string): boolean {
  return publisherName(press) !== press;
}
