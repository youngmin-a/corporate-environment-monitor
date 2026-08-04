-- PRD.md 8번 "저장 테이블 구조"를 그대로 옮긴 스키마.
-- 두 테이블 모두 서버 코드(API 라우트)에서만 접근한다 (CLAUDE.md 보안 규칙).

create table articles (
  url text primary key,
  title text not null,
  press text not null,
  published_at date not null,
  -- 요약 3줄. 요약 실패 시 null이며, 문장을 지어내지 않는다 (PRD 5-2).
  summary text[],
  collected_at timestamptz not null default now(),
  -- 중복 묶음의 대표 기사 url. 대표 기사 자신은 null (PRD 5-1).
  group_id text references articles (url) on delete set null
);

create index articles_published_at_idx on articles (published_at desc);
create index articles_group_id_idx on articles (group_id);

-- 단일 행 상태 테이블. Vercel은 서버리스라 실행 간 메모리가 남지 않으므로,
-- 쿨다운·하루 상한·마지막 성공 시각·초회 여부를 여기 저장해 둔다 (DESIGN.md 2-1-1).
create table collection_state (
  id integer primary key default 1,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  today_date date,
  today_new_count integer not null default 0,
  initial_backfill_done boolean not null default false,
  constraint collection_state_single_row check (id = 1)
);

-- 앱은 항상 UPDATE만 하도록, 시작 시점에 행을 하나 미리 넣어 둔다.
insert into collection_state (id) values (1);
