-- PRD 5-1: 기업 규제·애로 연관성 점수(0~100). 기존 테이블·데이터는 그대로 두고 컬럼만 추가한다.
-- 기본값 0으로 두고, 기존 기사는 scripts/backfill-relevance.ts로 한 번 채운다.
-- 60점 미만은 화면 목록에 노출하지 않되 행을 지우지는 않는다.
alter table articles
  add column relevance_score smallint not null default 0
    check (relevance_score between 0 and 100);

-- 조회는 항상 "60점 이상 → 점수 내림차순 → 발행일 최신순 → 상위 30건" 형태라
-- 정렬 컬럼 순서를 그대로 인덱스로 만든다.
create index articles_relevance_idx
  on articles (relevance_score desc, published_at desc);
