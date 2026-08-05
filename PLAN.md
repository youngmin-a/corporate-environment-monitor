# PLAN.md — 기업환경 모니터 개발 계획

*PRD.md에 정의된 기능 전체를 만들기 위한 작업 계획이다. 순서는 "먼저 되면 나머지가
쉬워지는 것"을 기준으로 정했다. 각 작업의 상세 규칙(숫자·조건)은 [PRD.md](PRD.md)와
[CLAUDE.md](CLAUDE.md)를 따른다.*

## 이번 사이클 목표

PRD의 must 기능 2개(일일 규제 기사 자동 수집, 기사 요약 카드)와 그에 딸린 모든 규칙·
예외 처리를 구현해, Vercel에 실제로 배포된 상태로 만든다.

## 성공 기준

- [ ] 화면에서 기사 목록(카드 5항목 + 관련 기사 펼치기)이 실제 데이터로 보인다.
- [ ] 네이버 API → 수집 규칙 10가지 → Claude 요약 → Supabase 저장이 한 흐름으로 동작한다.
- [ ] Vercel Cron이 매일 오전 8시(KST)에 자동으로 수집을 실행한다.
- [ ] 수동 새로고침이 5분 쿨다운과 하루 총합 40건 상한을 서버에서 강제한다.
- [ ] 예외 상황 6가지(0건, 요약 실패, 수집 실패, 며칠째 실패, 죽은 링크, 중복 오판)가
      화면에서 각각 PRD대로 동작한다.
- [ ] API 키가 클라이언트 코드 어디에도 노출되지 않는다.
- [ ] Vercel에 배포되어 실제 URL로 접속·확인할 수 있다.

## 작업 순서

1. Next.js 프로젝트를 만들고 빈 화면이 뜨는 것까지 확인한다.
2. `Article` 타입과 화면 확인용 샘플 기사 데이터를 만든다.
3. 기사 카드 컴포넌트를 만든다 (제목·언론사·발행일·요약·원문 링크 5가지).
4. 샘플 데이터로 기사 목록 화면을 만든다 (발행일 최신순, 0건일 때 안내 문구).
5. Supabase에 `articles`와 `collection_state`(단일 행, 쿨다운·일일상한·초회여부 저장용)
   테이블을 만들고 목록 화면이 `articles`에서 읽어오게 한다.
6. 네이버 뉴스 검색 API를 호출하는 서버 라우트를 만든다 (검색어 12개: 직접 규제 4 +
   산업 8, 필터 없이 원본 그대로).
7. 수집 규칙 중 관련성 점수제와 기간 필터를 붙인다 (점수 카테고리 6개, 최근 7일).
8. 수집 규칙 중 산업별 우선 목표(산업당 최대 3건) + 관련도 정렬과 하루 총합 40건
   자르기를 붙인다 (`collection_state.today_new_count`로 남은 여유분을 계산).
9. 수집 규칙 중 이미 수집한 URL 제외를 붙인다.
10. 제목 유사도 0.7로 중복 기사를 묶고, 카드에 "관련 기사 N건"을 표시·펼치게 한다.
11. 수집 시점에 원문 링크로 HEAD 요청을 보내 죽은 링크를 걸러낸다.
12. Claude API로 기사 1건을 요약하는 서버 라우트를 만든다.
13. 요약 길이 규칙 검증·재시도 1회·"요약 실패" 처리를 붙인다.
14. 수집 → 요약 → 저장을 하나의 흐름으로 연결한다.
15. 최초 실행 시 3개월 소급(상위 20건) 로직을 붙인다 (`collection_state.initial_backfill_done`으로 판단).
16. Vercel Cron을 붙여 매일 오전 8시(KST)에 자동 실행되게 한다.
17. 수동 새로고침 버튼을 만든다 (`collection_state.last_attempt_at` 기준 5분 쿨다운,
    하루 총합 40건은 서버에서 강제).
18. 화면 상단에 마지막 수집 성공 시각을 항상 표시한다 (`collection_state.last_success_at`).
19. 예외 상황을 처리한다 (수집 0건, 뉴스 API 장애, 요약 API 장애, 며칠째 실패 안내).
20. 90일이 지난 기사를 삭제하는 정리 작업을 붙인다.
21. 디자인을 적용한다 (네이비 #1E3A5F, 강조 #2563EB, 세로 스마트폰 기준).
22. Vercel에 배포하고 환경변수를 등록해 실제 동작을 확인한다.

## 산업 필터 추가 (사용자 요청, 기존 순서에 끼워 넣지 않음)

PRD 5-3에 정의된 고정형 산업 필터. 15~21번(3개월 소급, Cron, 예외 처리, 90일 삭제,
디자인, 배포)은 아직 그대로 미완료 상태이며, 이 작업이 그 순서를 대신하지 않는다.

1. `lib/industries.ts`에 `Industry`/`IndustryFilter` 타입, `INDUSTRY_KEYWORDS`,
   `classifyIndustries()` 순수 함수를 만든다.
2. `Article` 타입에 `industries: Industry[]`를 추가하고, 샘플 데이터에 산업 1개·
   복수 산업·미분류 사례를 각각 반영한다.
3. Supabase `articles`에 `industries text[] not null default '{}'` 컬럼을 추가한다
   (기존 테이블·데이터는 그대로 두고 컬럼만 추가).
4. 수집 파이프라인(14번)의 저장 직전 단계에 `classifyIndustries()` 호출을 끼워
   넣어 대표·관련 기사 모두에 `industries`를 채운다. 분류 오류가 나도 빈 배열로
   처리하고 수집 전체를 실패시키지 않는다.
5. 화면 상단에 산업 드롭다운(전체 + 고정 8개)을 추가하고, 선택값으로 이미 내려받은
   기사 목록을 클라이언트에서 걸러 보여준다. 서버 재호출은 없다.

## 수집 검색 구조·점수제 전환, 백필 (사용자 요청, 기존 순서에 끼워 넣지 않음)

산업 필터를 붙인 뒤에도 기존 기사 대부분이 `industries` 미분류였고, 검색어가 규제
키워드 위주라 산업별 기사가 잘 모이지 않았다. 이를 고치기 위해 검색·필터 구조를
바꾸고, 이미 쌓인 데이터를 새 규칙으로 맞추는 일회성 스크립트 두 개를 추가했다.
15~21번(3개월 소급, Cron, 예외 처리, 90일 삭제, 디자인, 배포) 순서를 대신하지 않는다.

1. `lib/naver.ts`의 검색어를 직접 규제 4개 + 산업 8개(총 12개)로 바꾼다.
2. `lib/collector.ts`에 "규제 키워드 10개 중 1개 이상" 필수 필터 대신 6개 카테고리
   관련성 점수제를 만든다. 산업 검색발 기사만 산업 분류 1개 이상 + 점수 3점 이상
   조건을 추가로 적용한다.
3. 운영 상한(40건)·백필 상한(80건)·산업당 우선 목표(3건)를 상수로 관리하고,
   `selectWithIndustryQuota()`로 산업별 우선 채우기 후 전체 관련도순으로 남은 자리를
   채운다.
4. `lib/pipeline.ts`의 `runCollection()`에 `mode: 'operational' | 'backfill'`을
   추가한다. backfill은 쿨다운·`today_new_count`를 건드리지 않고 80건까지 수집하며,
   Next.js 라우트가 아니라 `npm run backfill:collect`(`scripts/backfill-collect.ts`)
   로만 실행한다.
5. `scripts/backfill-industries.ts`(`npm run backfill:industries`)로 기존 기사 중
   `industries`가 빈 배열인 것만 `title + summary` 기준으로 재분류한다. 제목·요약·
   URL 등 다른 컬럼은 건드리지 않는다.
6. `app/page.tsx`에 `export const dynamic = 'force-dynamic'`을 추가해, Supabase
   데이터가 바뀐 뒤 화면이 빌드 시점 스냅샷 대신 매 요청마다 새로 반영되게 한다.

## 반응형 이미지 카드 UI (사용자 요청, 기존 순서에 끼워 넣지 않음)

기존 화면이 데스크톱에서도 430px 단일 열이라 넓은 화면을 못 쓰고 있었고, 카드가
텍스트만 있어 훑어보기 어려웠다. 수집·요약·분류·필터 규칙은 그대로 두고 화면만
바꾼다. 15~21번(3개월 소급, Cron, 예외 처리, 90일 삭제 등) 순서를 대신하지 않는다.

1. 전체 콘텐츠 컨테이너를 최대 1180px + 반응형 좌우 여백(16/24/32px)으로 바꾼다
   (`app/page.tsx`).
2. 헤더를 모바일 세로 / 데스크톱 좌우 배치로 바꾸고 짧은 설명 문구를 데스크톱에만
   넣는다 (당시 파일은 `trash-can/components/Header.tsx`로 옮겼고, 지금은
   `components/CommandCenter.tsx`가 그 역할을 이어받았다).
3. 기사 목록을 `grid-cols-1 md:grid-cols-2`로 바꾼다. 헤더·산업 필터는 전체 너비를
   유지한다 (당시 파일은 `trash-can/components/IndustryFilteredArticles.tsx`로 옮겼고,
   지금은 `components/Dashboard.tsx`가 그 역할을 흡수했다).
4. `lib/industries.ts`에 `INDUSTRY_IMAGES` 경로 매핑과 `getArticleImage()`를 만든다.
   새 DB 컬럼이나 API 라우트는 만들지 않는다.
5. `ArticleCard`에 16:9 이미지 영역(`next/image`, `fill`, `object-cover`)과 이미지 위
   그라데이션 + 제목 오버레이를 추가하고, 본문을 `flex flex-col` + `mt-auto`로 바꿔
   같은 행 카드의 링크 줄을 아래에 맞춘다.
6. 이미지 파일이 없을 때 `onError`로 CSS 그라데이션 대체 배경을 보여준다 (깨진
   이미지 아이콘 금지).
7. hover(카드 2px 상승·그림자·이미지 1.02배)와 포커스 링을 붙이고, `motion-reduce:`
   유틸리티와 `globals.css`의 전역 `prefers-reduced-motion` 규칙으로 동작 줄이기를
   처리한다.
8. 360 / 768 / 1024 / 1440px에서 레이아웃을 확인하고 타입 검사·lint·build를 돌린다.

## 연관성 점수제와 상단 UI 정리 (사용자 요청, 기존 순서에 끼워 넣지 않음)

기사가 100건을 넘어 목록 탐색 부담이 커졌고, 관련성이 낮은 기사도 같은 비중으로
노출되고 있었다. 기업 규제·애로 연관성을 0~100점으로 매겨 낮은 기사를 수집·요약
단계에서부터 걸러내고, 화면은 상단 영역만 정리한다. **기사 카드 디자인은 건드리지
않는다.**

1. `articles`에 `relevance_score smallint not null default 0 check (0~100)` 컬럼을
   추가한다 (새 테이블 없음). `Article` 타입에도 `relevanceScore`를 추가한다.
2. `lib/relevance.ts`에 `calculateRelevanceScore()`와 필수 통과 조건 판정,
   `MIN_RELEVANCE_SCORE = 60`·`MAX_VISIBLE_ARTICLES = 30` 상수를 모은다.
   점수 계산에 별도 AI 호출을 붙이지 않는다.
3. 수집 파이프라인 순서를 "산업 분류 → 점수 계산 → 필수 조건·60점 미만 제외 →
   링크 확인 → 중복 묶기 → 점수순 상위 30건 → 요약 → 저장"으로 바꾼다. 60점 미만은
   요약 API로 넘기지 않는다.
4. `getRecentArticleGroups()`를 60점 이상·점수 내림차순·상위 30건으로 바꾼다.
5. `scripts/backfill-relevance.ts`로 기존 기사 점수를 일회성 계산한다
   (`title + summary` 기준). 점수가 낮아도 행을 지우지 않고 화면에서만 숨긴다.
6. `ArticleCard`의 언론사 행 오른쪽에 점수 배지만 추가한다. 카드의 다른 요소는
   그대로 둔다.
7. 페이지 배경·헤더 패널·산업 선택 영역·새로고침 버튼을 Google Workspace 계열로
   정리하고, 서비스명을 `기업 환경 모니터링`으로 바꾼다.
8. 점수 함수를 대표 사례로 검증한 뒤 타입 검사·lint·build와 모바일·데스크톱 화면을
   확인한다.

> 이번 변경으로 이전의 `OPERATIONAL_DAILY_LIMIT`(40) · `BACKFILL_LIMIT`(80) ·
> `INDUSTRY_QUOTA_PER_INDUSTRY`(3) · `MIN_INDUSTRY_SEARCH_SCORE`(3)는
> `MIN_RELEVANCE_SCORE`·`MAX_VISIBLE_ARTICLES`로 대체된다. 산업별 우선 목표는
> "연관성 높은 순" 정렬과 충돌해 걷어낸다.

## 진입 인트로 (사용자 요청, 기존 순서에 끼워 넣지 않음)

별도 랜딩 페이지가 아니라 메인 화면 위에 덮는 overlay로 만든다.

1. `components/IntroOverlay.tsx`에 `visible → exiting → hidden` 상태를 두고,
   **페이지가 로드될 때마다** 띄운다. 사용자 요청으로 "세션당 1회" 기억
   (`sessionStorage`)은 걷어냈다.
2. 저장하는 값이 없으므로 서버·클라이언트가 항상 같은 화면을 그린다 — flash 방지용
   인라인 스크립트와 CSS 선차단 규칙도 함께 뺐다.
3. 등장(배경 → 제목 → 설명 → 버튼)은 900ms 안에 끝내고, 클릭 후 전환은 2,700ms
   다단계 모핑으로 진행한다.
4. 전환 중 중복 클릭·배경 스크롤을 막고, 종료 후 `[data-main-content]`로 포커스를
   옮긴 뒤 오버레이를 DOM에서 제거한다.
5. `prefers-reduced-motion`에서는 확대·이동을 빼고 180ms fade만 남긴다.
6. 인트로 배경에 컬러 웨이브 3층을 넣고, 클릭 후 전환을 원형 확대 대신 다층 컬러
   스윕(충격파 → 웨이브 1·2 → 블룸 → 스윕 → 메인 공개, 총 1,250ms)으로 바꾼다.
7. 메인에도 같은 색을 낮은 투명도로 이어받아 배경·헤더·필터·카드에 gradient와
   미세 테두리·빛만 더한다. 레이아웃과 기사 정보 구성은 그대로 둔다.
8. 인트로 전환을 2,700ms 다단계 모핑으로 늘린다(charging → expanding → flowing
   → dissolving → revealing). 단계는 단일 phase 상태로 관리하고, 인트로와 메인이
   약 420ms 겹치게 이어 붙인다.
9. `components/ArticleDetailDialog.tsx`를 만들어 카드 클릭 시 상세를 연다.
   native `<dialog>`로 focus trap·Escape를 얻고, 이미 로드된 데이터만 넘겨
   추가 요청 없이 표시한다. 원문은 새 탭 링크로만 연결한다.
10. 카드에 클릭 좌표 ripple·미세 출렁임·상세 확장 모핑을 붙인다. 원문 링크와
    관련 기사 버튼은 전파를 막아 상세가 같이 열리지 않게 한다.

## 순서를 정한 이유

- **1~5번을 먼저 둔 이유**: 화면과 저장소부터 만들어 두면, 이후 실제 데이터를 붙일 때
  "무엇이 새로 잘못됐는지"를 화면에서 바로 확인할 수 있다. API 키가 아직 없어도 진행할
  수 있다.
- **6~13번을 규칙 하나씩 나눈 이유**: 8가지 수집 규칙을 한 번에 넣으면 어느 규칙이
  기사를 걸러냈는지 구분할 수 없다. 필터를 하나씩 붙이며 결과를 눈으로 확인한다.
- **12~13번을 1건 요약부터 시작한 이유**: 40건짜리 파이프라인을 먼저 만들면 요약 하나가
  잘못됐을 때 디버깅 비용이 40배가 된다.
- **21번(디자인)을 뒤로 둔 이유**: 색과 레이아웃을 먼저 맞추면 기능이 바뀔 때마다 다시
  손봐야 한다. 카드 구조는 3번에서 이미 만들어 두므로 화면이 못생긴 채로 오래 가지는
  않는다.
- **22번(배포)이 마지막인 이유**: 배포는 앞의 모든 것이 로컬에서 동작을 확인한 뒤에
  하는 것이 안전하다.

## 대시보드 확장 (2026-08-05, 사용자 요청)

기존 목록 화면을 유지한 채 위·옆에 도구를 더한다. 수집·점수·요약·정렬은 손대지 않는다.

1. 파생 계층을 먼저 만든다: `lib/publishers.ts`(언론사명), `lib/classification.ts`
   (이슈·근거·긴급도·기관), `lib/relevance.ts`의 `explainRelevance()`(점수 근거),
   `lib/enrich.ts`(1회 계산), `lib/clustering.ts`(이슈 군집).
2. 개인 상태는 `lib/personalState.ts`에 localStorage로만 둔다. 로그인·서버 저장 없음.
3. 검색·필터·정렬·지표·인사이트 계산은 `lib/dashboard.ts` 순수 함수로 모으고
   화면에서 `useMemo`로 감싼다.
4. 화면은 `components/Dashboard.tsx`가 조율하고, CommandCenter·MetricCards·
   InsightStrip·FilterToolbar·FilterDrawer·InsightPanel·ReportPanel로 나눈다.
5. 확장 요약(`expanded_summary`)은 nullable 컬럼으로 추가하고, 수집 시 요약 호출
   **한 번**에서 함께 받는다. 기존 기사는 null로 두고 화면에서 fallback한다.
6. 새로고침 버튼을 `/api/collect`에 연결하고, 그동안 서버에서 강제되지 않던
   5분 쿨다운을 `lib/pipeline.ts`에 넣는다.

### 데이터·마이그레이션

- 마이그레이션: `supabase/migrations/20260805090000_add_expanded_summary_to_articles.sql`
  (nullable `text[]` 추가, 기본값 없음, rollback은 drop column).
- 이슈 유형·근거 유형·긴급도·기관은 **컬럼을 만들지 않는다.** 조회 결과에서 계산한다.
- 과거 기사에 확장 요약을 소급 생성하는 배치는 만들지 않는다 (근거 발췌문이 없다).

### 자기검증 도입 단계

1. `npm run typecheck` / `lint` / `build` 명령 정리 — 완료.
2. `npm run audit:quality` (로컬 실행, Markdown 보고서 + 기준선) — 완료.
3. GitHub Actions 수동 실행(`workflow_dispatch`) + artifact — 파일 추가 완료,
   **저장소에 push한 뒤 GitHub에서 한 번 실행해 확인해야 한다.**
4. 야간 schedule(03:00 KST) — 파일에는 등록, 실제 동작은 push 후 확인 필요.
5. Playwright 시각 회귀 — **도입하지 않았다.** 새 무거운 의존성이 필요해 보류.
6. 자동 수정·자동 PR — **도입하지 않았다.** 감사는 read-only다.

### 미구현으로 남은 것

- Vercel Cron(`vercel.json`) 미등록 → 자동 수집이 예약돼 있지 않다.
- 기사 데이터에 issueType·evidenceType 등을 저장하는 컬럼(현재는 조회 시 계산).

## 기업환경 AI 분석관 (2026-08-05, 사용자 요청)

1. 현재 구조 조사 — `Article`/`EnrichedArticle` 타입, `lib/classification.ts`가
   이미 이슈유형·근거유형·기업/기관/협회를 계산하고 있음을 확인. 새 컬럼 없이
   재사용하기로 결정.
2. 검색 계층: `lib/agentSynonyms.ts`(동의어·인접산업) → `lib/agentSearch.ts`
   (하이브리드 스코어링, 정밀→동의어→기간→인접산업 단계적 확장).
3. 질문 분석: `lib/agentQuery.ts` (json_schema strict, 실패 시 원문 질문 fallback).
4. 프롬프트: `lib/agentPrompt.ts` (시스템 프롬프트, CONTEXT 블록, 인용 추출,
   근거부족 안내문).
5. 서버 API: `app/api/agent/chat/route.ts`(스트리밍) ·
   `app/api/agent/suggestions/route.ts`(LLM 없는 규칙 기반 추천).
6. UI: `components/AgentEntryButton.tsx` · `AgentPanel.tsx` · `AgentMessage.tsx` ·
   `AgentSourceCard.tsx` · `AgentSuggestedPrompts.tsx` · `AgentCommandAutocomplete.tsx`.
7. 접근성·모션·반응형 확인 (360/768/1024/1440px, reduced-motion).
8. 빌드·타입·린트 검증.

### 데이터 변경

- 신규 컬럼 없음. `types/agent.ts`에 순수 타입만 추가.
- 마이그레이션 없음.

### 발견해서 함께 고친 것

- `AgentPanel`의 추천/후속 질문 클릭 시 `sendMessage`가 아직 갱신되지 않은
  `activePreset`을 클로저로 참조해 조건이 한 턴 늦게 반영되던 버그 — override를
  직접 합쳐서 계산하도록 수정.
- `AgentPanel` 닫기 시 원래 열려 있던 native `<dialog>`가 아직 top layer에 있는
  동안 진입 버튼에 focus를 옮기려다 실패하던 문제 — `dialog.close()` 호출 뒤
  다음 tick에서 focus를 옮기도록 수정.

### 완료하지 못한 것 / 추가 확인 필요

- 완료 기준 "근거가 없으면 답변을 생성하지 않는다"는 **완전히 충족되지 않았다.**
  검색이 느슨한 일반 단어(예: "규제") 일치만으로도 후보를 반환할 수 있어, 상당수
  비관련 질문에서도 모델 호출까지 진행된다. 다만 모델이 근거 부족을 스스로
  인지하고 사실을 지어내지 않는 2차 방어선은 실제 테스트로 확인했다.
- Escape 키의 실제 브라우저 동작은 이번 세션의 자동화 도구(CDP) 제약으로 직접
  검증하지 못했다 — 같은 `<dialog>` 패턴을 쓰는 기존 `FilterDrawer`도 동일한
  제약을 보여 환경 문제로 판단했다.

## 브랜딩·체크박스·전체 기사 탐색 (2026-08-05, 사용자 요청)

### 작업 순서

1. `public/재정경제부.svg` 존재·대소문자 확인 → `CommandCenter.tsx`에 배치.
2. `app/globals.css`의 `.select-checkbox`·`.card-select`·`.compact-row__check-wrap`
   추가/수정, `ArticleCard.tsx` 두 variant에 적용.
3. `lib/articles.ts`에 `getArticleGroupsPage()` 추가 (서버 페이지네이션).
4. `app/articles/{page,error}.tsx` + `components/{ArchiveControls,
   ArchiveListSection,ArchiveListSkeleton,ArticlesArchive}.tsx` 구현.
5. `lib/dashboard.ts` Metric에 `href` 추가, `MetricCards.tsx`에서 링크 렌더링.
6. AI 분석관 검색 범위가 이미 DB 전체를 보고 있는지 확인 — 코드 검토 + 31번째
   이후 기사로 실제 질의 테스트.
7. `npm run typecheck` → `lint` → `build` → `audit:quality`, 브라우저로
   360/768/1440px·체크박스·pagination·AI 검색 확인.

### 데이터 변경

- 신규 컬럼·마이그레이션 없음. `getArticleGroupsPage()`는 기존 `articles`
  테이블을 `range()`로 나눠 읽을 뿐이다.

### 완료하지 못한 것 / 추가 확인 필요

- `/articles` 조회 실패는 Next.js 표준 `error.tsx`로 처리했다 — count 쿼리와
  목록 쿼리를 한 번에 묶어 요청하므로 "count만 실패하고 목록은 성공"하는
  경우는 설계상 발생하지 않는다(원 요구사항의 그 세부 시나리오를 별도
  코드로 방어하지는 않았다).
- 페이지네이션 번호 버튼은 최대 7개(처음·끝·현재±2, 그 사이는 …)로 압축했다.
  현재 데이터 규모(6페이지 안팎)에서는 압축이 실제로 일어나지 않아 그 UI
  경로는 육안 확인만 했고 페이지 수가 훨씬 많아지는 경우까지 테스트하지
  못했다.
- Vercel 배포 후 프로덕션 환경에서의 실제 asset 경로·smoke test는 push 이후에만
  가능하다 — 로컬 프로덕션 빌드(`next build`)와 개발 서버 확인까지만 이 단계에서
  마쳤다.

## 기사 카드 체크박스 재디자인 (2026-08-05, 사용자 요청)

### 작업 순서

1. 현재 체크박스 구조 확인 — `components/ArticleCard.tsx`의 card/compact 두
   variant, `app/globals.css`의 `.card-select`·`.select-checkbox`. native
   `<input type="checkbox">`를 이미 쓰고 있고 선택 상태는 `Dashboard.tsx`·
   `ArticlesArchive.tsx`의 `selected: string[]` state가 관리한다.
2. 이벤트 충돌 점검 — 카드 `<article onClick>`이 상세를 열고, 체크박스를 감싼
   `<label onClick={stopCardOpen}>`이 `stopPropagation()`으로 막는다. 구조는
   그대로 두고 스타일만 바꾼다.
3. 시각 디자인 개선 — `.card-select`의 어두운 배경 제거, `.select-checkbox`를
   반투명 floating control로 재작성, hover·checked·focus-visible·disabled 정리.
4. 접근성 확인 — label-input 연결, `aria-label`, focus-visible.
5. 산업 이미지별 대비 테스트 — 9개 이미지 전부에 미선택·선택을 얹어 확인.
6. 반응형 테스트 — 360/768/1024/1440px.
7. `npm run typecheck` → `lint` → `build`.

### 데이터 변경

- 없음. CSS와 클래스명만 바뀌었고 선택 로직·상태 관리는 손대지 않았다.

### 작업 중 발견해서 함께 고친 것

- `backdrop-filter: blur(6px)` 바로 뒤에 `-webkit-backdrop-filter`를 같이 적으니
  Lightning CSS(Tailwind v4)가 두 선언을 합치면서 **둘 다 빌드 결과에서 사라졌다.**
  이 저장소의 다른 `backdrop-filter` 사용처처럼 접두사 없는 표준 속성만 남겨 해결했다.
- 테두리를 1.5px로 두면 dpr 1.25 화면에서 1 device px로 스냅돼 너무 얇았다 →
  1.75px(= 2 device px)로 조정.
- 클릭 영역을 40px로 키우면서 체크박스가 카드 모서리에서 21px까지 밀려나 있었다 →
  wrapper 오프셋을 4px(모바일 2px)로 줄여 보이는 여백을 13px로 맞췄다.

### 완료하지 못한 것 / 추가 확인 필요

- **키보드 Space 토글을 직접 실행해 확인하지 못했다.** 자동화 도구의 키 입력이
  빈 key(`""`)로 전달돼 브라우저가 스페이스로 인식하지 않았다. 대신 ① native
  `<input type="checkbox">`라는 점, ② 체크박스에 도달한 keydown의
  `defaultPrevented`가 false인 점, ③ 앱의 유일한 keydown 핸들러
  (`IntroOverlay`)가 인트로 표시 중 Tab에만 반응하고 그 외 키는 즉시 return하는
  점, ④ focus-visible이 실제로 동작하는 점까지 확인했다.
- **`:hover` 실제 포인터 상태도 자동화로 안정적으로 재현하지 못했다.** 대신
  빌드된 CSS에서 `.select-checkbox:hover` 규칙을 그대로 꺼내 적용한 모습을
  렌더링해 시각적으로 확인했다.
- **"관련 기사 N건" 버튼과의 충돌은 확인하지 못했다.** 현재 수집된 데이터에
  중복으로 묶인 기사가 없어 그 버튼이 화면에 존재하지 않았다.
- indeterminate 상태는 현재 기능에 없어 새로 만들지 않았다. disabled 상태도
  실제로 쓰는 곳은 없지만 스타일만 정의해 뒀다.
