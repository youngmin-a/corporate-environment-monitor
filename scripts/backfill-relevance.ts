/**
 * 일회성 스크립트 — 기존 기사에 연관성 점수(relevance_score)를 채워 넣는다.
 *
 * 라우트가 아니라 CLI로만 실행한다: npm run backfill:relevance
 * `articles`에는 네이버 발췌문(description) 컬럼이 없으므로 `title + summary`를
 * 기준으로 계산한다. 요약이 없거나 "요약 실패"면 제목만 쓴다.
 *
 * 점수가 낮은 기존 기사도 **지우지 않는다.** 행은 그대로 두고 화면 조회에서만
 * 60점 미만을 숨긴다 (PRD 5-1).
 */
import { supabase } from '@/lib/supabase';
import { ALL_INDUSTRIES, type Industry } from '@/lib/industries';
import { calculateRelevanceScore, MIN_RELEVANCE_SCORE } from '@/lib/relevance';

type Row = {
  url: string;
  title: string;
  summary: string[] | null;
  industries: unknown;
  relevance_score: number | null;
};

function toIndustries(value: unknown): Industry[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Industry => ALL_INDUSTRIES.includes(item as Industry));
}

/** 요약이 없거나 실패 표시면 제목만으로 계산한다 */
function toDescription(summary: string[] | null): string {
  if (!summary || summary.length === 0) return '';
  const joined = summary.join(' ').trim();
  return joined === '요약 실패' ? '' : joined;
}

async function main() {
  const { data, error, count } = await supabase
    .from('articles')
    .select('url, title, summary, industries, relevance_score', { count: 'exact' });
  if (error) throw error;

  const rows = (data ?? []) as Row[];
  // 점수 규칙이 바뀌면 이미 계산된 행도 다시 매겨야 하므로 전체를 대상으로 한다
  const targets = rows;

  console.log(`전체 기존 기사 수: ${count ?? rows.length}건`);
  console.log(`점수 계산 대상(전체 재계산): ${targets.length}건\n`);

  const scored: { url: string; title: string; score: number; industries: Industry[] }[] = [];

  for (const row of targets) {
    const industries = toIndustries(row.industries);
    const score = calculateRelevanceScore(row.title, toDescription(row.summary), industries);

    const { error: updateError } = await supabase
      .from('articles')
      .update({ relevance_score: score })
      .eq('url', row.url);
    if (updateError) throw updateError;

    scored.push({ url: row.url, title: row.title, score, industries });
  }

  // 갱신 후 전체 분포를 다시 읽어 보고한다 (이번에 계산하지 않은 행까지 포함)
  const { data: allData } = await supabase
    .from('articles')
    .select('title, industries, relevance_score');
  const all = (allData ?? []) as Row[];

  const passed = all.filter((r) => (r.relevance_score ?? 0) >= MIN_RELEVANCE_SCORE);
  const hidden = all.filter((r) => (r.relevance_score ?? 0) < MIN_RELEVANCE_SCORE);
  const high = all.filter((r) => (r.relevance_score ?? 0) >= 80);
  const unclassifiedPassed = passed.filter((r) => toIndustries(r.industries).length === 0);

  const sorted = [...all].sort((a, b) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0));

  console.log('=== 백필 결과 ===');
  console.log(`이번에 점수를 계산한 기사: ${scored.length}건`);
  console.log(`전체 기존 기사 수: ${all.length}건 (삭제 없음)`);
  console.log(`${MIN_RELEVANCE_SCORE}점 이상(노출): ${passed.length}건`);
  console.log(`${MIN_RELEVANCE_SCORE}점 미만(숨김): ${hidden.length}건`);
  console.log(`80점 이상: ${high.length}건`);
  console.log(`산업 미분류이지만 통과한 기사: ${unclassifiedPassed.length}건`);

  console.log('\n--- 최고 점수 기사 3건 ---');
  sorted.slice(0, 3).forEach((r) => console.log(`  ${r.relevance_score}점 | ${r.title}`));
  console.log('\n--- 최저 점수 기사 3건 ---');
  sorted
    .slice(-3)
    .reverse()
    .forEach((r) => console.log(`  ${r.relevance_score}점 | ${r.title}`));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('연관성 점수 백필 실패:', error);
    process.exit(1);
  });
