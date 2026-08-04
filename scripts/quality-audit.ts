/**
 * 품질 자기검증 (read-only).
 *
 * 정적 검사(타입·린트·빌드)와 저장된 기사 데이터의 형식 검사를 한 번에 돌리고,
 * 결과를 Markdown 보고서와 JSON 기준선으로 남긴다.
 *
 * 이 스크립트가 **하지 않는 것** (PRD 자기검증 원칙):
 *  - OpenAI 호출 (0회)
 *  - 기사 수집 API 호출 (0회)
 *  - Supabase 쓰기 (0회, select만 한다)
 *  - 코드·문서 자동 수정
 *  - 배포
 *
 * 실행: npm run audit:quality
 *       npm run audit:quality -- --skip-build   (빌드 없이 빠르게)
 */
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

type CheckStatus = 'pass' | 'fail' | 'skipped';

type Check = {
  name: string;
  status: CheckStatus;
  detail: string;
  /** 실패 심각도 */
  severity?: 'critical' | 'high' | 'medium' | 'low';
};

type Finding = {
  severity: 'critical' | 'high' | 'medium' | 'low';
  area: string;
  message: string;
  /** 관련 기사 url 등 */
  samples?: string[];
};

const ROOT = process.cwd();
const REPORT_DIR = join(ROOT, 'reports', 'nightly');
const BASELINE_PATH = join(ROOT, 'reports', 'quality-baseline.json');
const skipBuild = process.argv.includes('--skip-build');

const checks: Check[] = [];
const findings: Finding[] = [];

function run(name: string, command: string, severity: Check['severity'] = 'high'): Check {
  try {
    const output = execSync(command, { cwd: ROOT, stdio: 'pipe', encoding: 'utf8' });
    const check: Check = { name, status: 'pass', detail: output.trim().split('\n').slice(-3).join(' ') };
    checks.push(check);
    return check;
  } catch (error) {
    const message =
      error instanceof Error && 'stdout' in error
        ? String((error as { stdout?: Buffer }).stdout ?? error.message)
        : String(error);
    const check: Check = {
      name,
      status: 'fail',
      detail: message.trim().split('\n').slice(0, 12).join('\n'),
      severity,
    };
    checks.push(check);
    findings.push({ severity: severity ?? 'high', area: name, message: check.detail });
    return check;
  }
}

/* ── 1. 정적 검사 ─────────────────────────────────────────────── */

run('TypeScript', 'npx tsc --noEmit', 'critical');
run('ESLint', 'npx eslint .', 'high');
if (skipBuild) {
  checks.push({ name: 'production build', status: 'skipped', detail: '--skip-build 옵션' });
} else {
  run('production build', 'npx next build', 'critical');
}

/* ── 2. 문서와 코드 일치 ──────────────────────────────────────── */

function checkDocsMatchCode() {
  const docs = ['PRD.md', 'DESIGN.md', 'PLAN.md', 'CLAUDE.md'].filter((file) =>
    existsSync(join(ROOT, file)),
  );

  const missing: string[] = [];
  for (const doc of docs) {
    const text = readFileSync(join(ROOT, doc), 'utf8');
    // 문서에 적힌 파일 경로가 실제로 있는지 확인한다
    const paths = [...text.matchAll(/`((?:app|lib|components|scripts|types|supabase)\/[\w./-]+)`/g)].map(
      (match) => match[1],
    );
    for (const path of new Set(paths)) {
      if (!existsSync(join(ROOT, path))) missing.push(`${doc} → ${path}`);
    }
  }

  if (missing.length === 0) {
    checks.push({ name: '문서-코드 경로 일치', status: 'pass', detail: `${docs.length}개 문서 확인` });
  } else {
    checks.push({
      name: '문서-코드 경로 일치',
      status: 'fail',
      detail: missing.join('\n'),
      severity: 'medium',
    });
    findings.push({
      severity: 'medium',
      area: '문서',
      message: '문서에 적힌 경로가 저장소에 없습니다.',
      samples: missing.slice(0, 10),
    });
  }
}

checkDocsMatchCode();

/* ── 3. package.json 스크립트 존재 확인 ───────────────────────── */

function checkScripts() {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>;
  };
  const required = ['build', 'lint', 'typecheck', 'audit:quality'];
  const missing = required.filter((name) => !pkg.scripts[name]);

  checks.push({
    name: 'package scripts',
    status: missing.length === 0 ? 'pass' : 'fail',
    detail: missing.length === 0 ? required.join(', ') : `없는 스크립트: ${missing.join(', ')}`,
    severity: 'medium',
  });
}

checkScripts();

/* ── 4. 기사 데이터 품질 (select만, 자격 증명이 있을 때만) ────── */

type ArticleRow = {
  url: string;
  title: string;
  press: string;
  published_at: string;
  collected_at: string;
  summary: string[] | null;
  expanded_summary: string[] | null;
  industries: string[] | null;
  relevance_score: number;
  group_id: string | null;
};

async function checkArticleData() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    checks.push({
      name: '기사 데이터 품질',
      status: 'skipped',
      detail: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY가 없어 건너뜁니다 (CI 기본값).',
    });
    return;
  }

  const { createClient } = await import('@supabase/supabase-js');
  const client = createClient(url, key, { auth: { persistSession: false } });

  // 읽기 전용. 이 스크립트는 어떤 경우에도 insert/update/delete를 하지 않는다.
  const { data, error } = await client
    .from('articles')
    .select('*')
    .order('published_at', { ascending: false })
    .limit(500);

  if (error) {
    checks.push({ name: '기사 데이터 품질', status: 'fail', detail: error.message, severity: 'high' });
    findings.push({ severity: 'high', area: '데이터', message: `조회 실패: ${error.message}` });
    return;
  }

  const rows = (data ?? []) as ArticleRow[];
  const representatives = rows.filter((row) => row.group_id === null);
  const problems: Finding[] = [];

  const push = (severity: Finding['severity'], message: string, samples: string[]) => {
    if (samples.length > 0) {
      problems.push({ severity, area: '데이터', message, samples: samples.slice(0, 5) });
    }
  };

  const seen = new Set<string>();
  const duplicates = rows.filter((row) => (seen.has(row.url) ? true : (seen.add(row.url), false)));
  push('high', 'URL이 중복된 행이 있습니다.', duplicates.map((row) => row.url));

  push(
    'medium',
    '요약이 없는 대표 기사입니다 (요약 실패로 표시됩니다).',
    representatives.filter((row) => !row.summary || row.summary.length === 0).map((row) => row.url),
  );

  push(
    'low',
    '확장 요약이 아직 없는 대표 기사입니다 (상세 화면이 카드 요약으로 대체합니다).',
    representatives
      .filter((row) => !row.expanded_summary || row.expanded_summary.length === 0)
      .map((row) => row.url),
  );

  push(
    'medium',
    '확장 요약이 카드 요약과 같은 문장을 그대로 반복합니다.',
    representatives
      .filter((row) => {
        if (!row.expanded_summary || !row.summary) return false;
        const cardSet = new Set(row.summary.map((line) => line.trim()));
        return row.expanded_summary.some((line) => cardSet.has(line.trim()));
      })
      .map((row) => row.url),
  );

  push(
    'medium',
    '확장 요약 안에 같은 문장이 반복됩니다.',
    representatives
      .filter((row) => {
        if (!row.expanded_summary) return false;
        return new Set(row.expanded_summary).size !== row.expanded_summary.length;
      })
      .map((row) => row.url),
  );

  push(
    'high',
    '연관성 점수가 유효 범위(0~100)를 벗어났습니다.',
    rows.filter((row) => row.relevance_score < 0 || row.relevance_score > 100).map((row) => row.url),
  );

  push(
    'high',
    '발행일이 미래입니다.',
    rows.filter((row) => row.published_at > new Date().toISOString().slice(0, 10)).map((row) => row.url),
  );

  // 매핑되지 않은 도메인만 후보로 올린다 (이미 이름이 붙은 도메인은 정상이다)
  const { hasPublisherName } = await import('../lib/publishers');
  push(
    'low',
    '언론사가 도메인으로만 표시됩니다 (lib/publishers.ts 매핑 추가 후보).',
    [...new Set(rows.filter((row) => !hasPublisherName(row.press)).map((row) => row.press))],
  );

  push(
    'low',
    '산업이 분류되지 않은 대표 기사입니다.',
    representatives.filter((row) => !row.industries || row.industries.length === 0).map((row) => row.url),
  );

  findings.push(...problems);

  checks.push({
    name: '기사 데이터 품질',
    status: problems.some((problem) => problem.severity === 'high' || problem.severity === 'critical')
      ? 'fail'
      : 'pass',
    detail:
      `대표 ${representatives.length}건 / 전체 ${rows.length}건 검사 · ` +
      `확장 요약 보유 ${representatives.filter((row) => row.expanded_summary?.length).length}건`,
    severity: 'medium',
  });
}

/* ── 5. 보고서 작성 ───────────────────────────────────────────── */

function severityRank(severity: Finding['severity']): number {
  return { critical: 0, high: 1, medium: 2, low: 3 }[severity];
}

async function main() {
  await checkArticleData();

  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const commit = (() => {
    try {
      return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
    } catch {
      return 'unknown';
    }
  })();

  const summary = {
    date,
    commit,
    node: process.version,
    checks: checks.map(({ name, status }) => ({ name, status })),
    findingCounts: {
      critical: findings.filter((finding) => finding.severity === 'critical').length,
      high: findings.filter((finding) => finding.severity === 'high').length,
      medium: findings.filter((finding) => finding.severity === 'medium').length,
      low: findings.filter((finding) => finding.severity === 'low').length,
    },
  };

  const previous = existsSync(BASELINE_PATH)
    ? (JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as typeof summary)
    : null;

  const lines: string[] = [
    '# Nightly Quality Audit',
    '',
    '## 실행 정보',
    '',
    `- 실행 일시: ${now.toISOString()}`,
    `- commit: ${commit}`,
    `- Node: ${process.version}`,
    '',
    '## 검사 결과',
    '',
    '| 검사 | 결과 | 비고 |',
    '| --- | --- | --- |',
    ...checks.map(
      (check) =>
        `| ${check.name} | ${check.status === 'pass' ? '✅ pass' : check.status === 'skipped' ? '⏭ skipped' : '❌ fail'} | ${check.detail
          .replace(/\n/g, ' ')
          .slice(0, 160)} |`,
    ),
    '',
    '## 발견된 문제',
    '',
  ];

  if (findings.length === 0) {
    lines.push('발견된 문제가 없습니다.', '');
  } else {
    [...findings]
      .sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
      .forEach((finding) => {
        lines.push(`- **[${finding.severity}] ${finding.area}** — ${finding.message}`);
        if (finding.samples?.length) {
          lines.push(`  - 예: ${finding.samples.join(', ')}`);
        }
      });
    lines.push('');
  }

  lines.push('## 전일 대비 변화', '');
  if (!previous) {
    lines.push('이전 기준선이 없어 이번 결과를 기준선으로 저장합니다.', '');
  } else {
    (['critical', 'high', 'medium', 'low'] as const).forEach((severity) => {
      const before = previous.findingCounts[severity];
      const after = summary.findingCounts[severity];
      const diff = after - before;
      lines.push(`- ${severity}: ${before} → ${after} (${diff > 0 ? `+${diff}` : diff})`);
    });
    lines.push('');
  }

  lines.push(
    '## 자동 수정',
    '',
    '이 감사는 코드·데이터를 수정하지 않습니다 (read-only).',
    '',
    '## 다음 작업',
    '',
    '- 위 문제 중 critical/high 항목은 사람이 확인해야 합니다.',
    '- 확장 요약 누락은 신규 수집분부터 자동으로 채워집니다.',
    '',
  );

  mkdirSync(REPORT_DIR, { recursive: true });
  const reportPath = join(REPORT_DIR, `${date}.md`);
  writeFileSync(reportPath, lines.join('\n'), 'utf8');

  mkdirSync(join(ROOT, 'reports'), { recursive: true });
  writeFileSync(BASELINE_PATH, JSON.stringify(summary, null, 2), 'utf8');

  console.log(lines.join('\n'));
  console.log(`\n보고서: ${reportPath}`);

  const failed = checks.filter((check) => check.status === 'fail');
  if (failed.length > 0) {
    console.error(`\n실패한 검사 ${failed.length}건: ${failed.map((check) => check.name).join(', ')}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('감사 실행 실패:', error);
  process.exit(1);
});
