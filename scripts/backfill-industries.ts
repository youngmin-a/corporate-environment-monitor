/**
 * 일회성 스크립트 — industries가 빈 배열인 기존 기사에 산업 분류를 채워 넣는다.
 *
 * 라우트가 아니라 CLI로만 실행한다: npm run backfill:industries
 * title + summary를 기준으로 classifyIndustries()를 돌리고, industries 컬럼만
 * 갱신한다. 제목·요약·URL 등 다른 컬럼은 건드리지 않는다.
 */
import { supabase } from '@/lib/supabase';
import { ALL_INDUSTRIES, classifyIndustriesSafe, type Industry } from '@/lib/industries';

type Row = {
  url: string;
  title: string;
  summary: string[] | null;
  industries: string[] | null;
};

async function main() {
  const { data, error, count: totalBefore } = await supabase
    .from('articles')
    .select('url, title, summary, industries', { count: 'exact' });
  if (error) throw error;

  const rows = (data ?? []) as Row[];
  const targets = rows.filter((row) => !row.industries || row.industries.length === 0);

  console.log(`실행 전 전체 기사 수: ${totalBefore ?? rows.length}건`);
  console.log(`산업 미분류(빈 배열) 대상: ${targets.length}건`);
  console.log('');

  const byIndustry = Object.fromEntries(ALL_INDUSTRIES.map((industry) => [industry, 0])) as Record<
    Industry,
    number
  >;
  let updated = 0;
  let stillUnclassified = 0;

  for (const row of targets) {
    const summaryText = row.summary ? row.summary.join(' ') : '';
    const industries = classifyIndustriesSafe(row.title, summaryText);

    if (industries.length === 0) {
      stillUnclassified += 1;
      continue;
    }

    const { error: updateError } = await supabase
      .from('articles')
      .update({ industries })
      .eq('url', row.url);
    if (updateError) throw updateError;

    updated += 1;
    industries.forEach((industry) => {
      byIndustry[industry] += 1;
    });
  }

  const { count: totalAfter } = await supabase
    .from('articles')
    .select('*', { count: 'exact', head: true });

  console.log('=== 백필 결과 ===');
  console.log(`새로 분류됨: ${updated}건 / 여전히 미분류(키워드 없음): ${stillUnclassified}건`);
  console.log(`실행 전 전체 기사 수: ${totalBefore ?? rows.length}건`);
  console.log(`실행 후 전체 기사 수: ${totalAfter ?? '확인 실패'}건`);
  console.log('산업별 분류 건수 (다중 산업 기사는 중복 집계):');
  for (const industry of ALL_INDUSTRIES) {
    console.log(`  ${industry}: ${byIndustry[industry]}건`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('백필 실패:', error);
    process.exit(1);
  });
