-- PRD 5-2-1: 기사 상세 화면용 확장 요약(6~8문장).
-- 카드용 summary(3줄)는 그대로 두고 컬럼만 추가한다.
--
-- 타입은 기존 summary와 같은 text[]로 맞췄다. 문장 단위로 렌더링하고 stagger를
-- 주는 화면 요구가 있어, 저장 시점에 문장을 나눠 두는 편이 파싱 규칙을 새로
-- 만드는 것보다 안전하다.
--
-- nullable이며 기본값을 주지 않는다. 이 컬럼이 생기기 전에 수집된 기사는 null로
-- 남고, 상세 화면이 카드용 요약으로 대체한다 — 근거 데이터(발췌문)가 이미 없어서
-- 가짜 확장 요약을 만들어 넣지 않는다.
alter table articles
  add column if not exists expanded_summary text[];

-- rollback:
--   alter table articles drop column if exists expanded_summary;
