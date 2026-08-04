# 기업환경 모니터

국내 기업 규제 관련 애로사항 기사를 매일 수집·요약해 보여주는 모바일 앱.
기획 내용은 [prd_lite.md](prd_lite.md)에 있다.

## 실행

```bash
npx expo start
```

휴대폰에 **Expo Go** 앱을 설치한 뒤 터미널에 뜨는 QR 코드를 찍으면 바로 확인할 수 있다.

## API 키 설정

요약은 Claude API로 만든다. [console.anthropic.com](https://console.anthropic.com)에서
키를 발급받아 `.env`에 아래 한 줄을 추가한다.

```
EXPO_PUBLIC_ANTHROPIC_API_KEY=sk-ant-...
```

키가 없으면 앱은 뜨지만 요약 자리에 "요약 실패"가 표시된다.

> ⚠️ `EXPO_PUBLIC_` 접두사가 붙은 값은 앱 번들에 그대로 들어간다.
> 지금은 개발·시연 단계라 이렇게 두었지만, 실제 배포 전에는 요약 호출을
> 서버로 옮기고 앱은 그 서버만 부르도록 바꿔야 한다.

## 폴더 구조

```
App.tsx                     메인 화면 (헤더 + 기사 목록)
src/
  types.ts                  Article 타입, Collector 인터페이스
  theme.ts                  색상·여백 값
  components/
    ArticleCard.tsx         요약 카드 한 장
  data/
    sampleArticles.ts       개발용 가짜 기사 데이터
  lib/
    collector.ts            수집 규칙 (기간·건수·키워드·중복)
    summarize.ts            Claude API 요약
    storage.ts              수집 기록 저장 (AsyncStorage)
```

## 지금 상태와 다음 단계

**샘플 데이터로 동작한다.** 실제 기사를 가져오려면 `src/data/sampleArticles.ts`의
`sampleCollector` 대신 같은 `Collector` 인터페이스를 구현한 모듈을 만들어
`App.tsx`에서 갈아끼우면 된다. 수집 규칙(`collector.ts`)과 화면은 그대로 쓸 수 있다.

후보로 검토했던 뉴스 소스:

- **네이버 뉴스 검색 API** — 무료, 신청 필요. 한 번에 최대 100건 제한
- **빅카인즈 API** — 한국언론진흥재단. 과거 기사 검색에 가장 적합하나 사용 승인 필요

### 아직 안 된 것

- **매일 오전 8시 자동 수집** — 지금은 앱을 연 시점에 "오늘 아직 수집 안 했고
  8시가 지났으면" 한 번 수집한다. 앱이 꺼져 있어도 정확히 8시에 돌게 하려면
  백그라운드 작업(`expo-background-task`)이나 서버 스케줄러가 필요하다.
