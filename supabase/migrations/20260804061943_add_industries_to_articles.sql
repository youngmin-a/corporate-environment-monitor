-- PRD 5-3: 산업 필터. 기존 테이블·데이터는 그대로 두고 컬럼만 추가한다.
alter table articles add column industries text[] not null default '{}';
