/**
 * 일회성 스크립트 — 새 검색 구조(직접 규제 4 + 산업 8)로 최대 BACKFILL_LIMIT(80)건까지
 * 한 번에 수집한다. 운영 수집의 쿨다운·하루 상한(today_new_count)을 건드리지 않는다.
 *
 * 라우트가 아니라 CLI로만 실행한다: npm run backfill:collect
 * 반복 실행을 자동화하지 않는다 — 필요하면 사람이 다시 명령을 실행한다.
 */
import { runCollection } from '@/lib/pipeline';

async function main() {
  console.log('=== 일회성 백필 수집 시작 (쿨다운·하루 상한 미적용, 최대 80건) ===');
  const result = await runCollection('backfill');

  console.log(`저장된 대표 기사(신규 사안): ${result.saved}건`);
  if (result.skipped) console.log(`건너뜀: ${result.skipped}`);

  if (result.stats) {
    const { raw, filtered, unseen, alive, groups, summaryFailed, byIndustry, excludedSamples } =
      result.stats;
    console.log('');
    console.log('=== 파이프라인 단계별 건수 ===');
    console.log(`네이버 원본 응답: ${raw}건`);
    console.log(`기간·점수제 필터 통과: ${filtered}건`);
    console.log(`기수집 URL 제외 후: ${unseen}건`);
    console.log(`링크 확인(HEAD) 통과: ${alive}건`);
    console.log(`중복 묶음 수(=대표 기사 후보): ${groups}건`);
    console.log(`요약 실패: ${summaryFailed}건`);

    console.log('');
    console.log('=== 산업별 대표 기사 수 (다중 산업은 중복 집계) ===');
    for (const [industry, count] of Object.entries(byIndustry)) {
      console.log(`  ${industry}: ${count}건`);
    }

    console.log('');
    console.log(`=== 제외된 기사 표본 (산업 검색발, 점수/산업 미달) — ${excludedSamples.length}건 ===`);
    excludedSamples.forEach((sample) => {
      console.log(`  [${sample.reason}] ${sample.title} (점수 ${sample.score})`);
    });
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('백필 수집 실패:', error);
    process.exit(1);
  });
