import { ISSUE_TYPE_LABELS } from '@/lib/classification';
import type { EnrichedArticle } from '@/types/article';

/**
 * 브리핑(보고서) 만들기.
 *
 * **AI를 부르지 않는다.** 이미 저장된 요약과 메타데이터만 조합해 초안을 만든다.
 * 사용자가 요약 수준을 고르고, 상세를 골라도 확장 요약이 없는 기사는 카드 요약으로
 * 대체한다 — 없는 문장을 만들지 않는다.
 */

export type ReportFormat = 'daily-briefing' | 'by-industry' | 'issue-list' | 'source-list';
export type SummaryLevel = 'short' | 'expanded';

export const REPORT_FORMAT_LABELS: Record<ReportFormat, string> = {
  'daily-briefing': '일일 기업환경 브리핑',
  'by-industry': '산업별 동향',
  'issue-list': '규제·애로사항 목록',
  'source-list': '출처 목록',
};

export const SUMMARY_LEVEL_LABELS: Record<SummaryLevel, string> = {
  short: '간략 요약 (3줄)',
  expanded: '상세 요약 (확장 요약 우선)',
};

function summaryLines(article: EnrichedArticle, level: SummaryLevel): string[] {
  if (level === 'expanded' && article.expandedSummary && article.expandedSummary.length > 0) {
    return article.expandedSummary;
  }
  return article.summary ?? ['(요약 없음)'];
}

function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${year}. ${Number(month)}. ${Number(day)}.`;
}

function articleBlock(article: EnrichedArticle, level: SummaryLevel): string {
  const issueLabels = article.classification.issueTypes
    .map((type) => ISSUE_TYPE_LABELS[type])
    .join(', ');

  return [
    `**${article.title}**`,
    `- 출처: ${article.publisher} (${formatDate(article.publishedAt)}) · 연관성 ${article.relevanceScore}점` +
      (issueLabels ? ` · ${issueLabels}` : ''),
    ...summaryLines(article, level).map((line) => `- ${line}`),
    `- 원문: ${article.url}`,
  ].join('\n');
}

export type ReportInput = {
  title: string;
  articles: EnrichedArticle[];
  format: ReportFormat;
  level: SummaryLevel;
  generatedAt?: Date;
};

export function buildMarkdown({
  title,
  articles,
  format,
  level,
  generatedAt = new Date(),
}: ReportInput): string {
  const header = [
    `# ${title.trim() || REPORT_FORMAT_LABELS[format]}`,
    '',
    `작성일: ${formatDate(generatedAt.toISOString().slice(0, 10))} · 기사 ${articles.length}건`,
    '',
  ];

  if (articles.length === 0) {
    return [...header, '선택한 기사가 없습니다.'].join('\n');
  }

  if (format === 'source-list') {
    return [
      ...header,
      '## 참고 기사',
      '',
      ...articles.map(
        (article, index) =>
          `${index + 1}. ${article.title} — ${article.publisher}, ${formatDate(article.publishedAt)}\n   ${article.url}`,
      ),
    ].join('\n');
  }

  if (format === 'by-industry') {
    const byIndustry = new Map<string, EnrichedArticle[]>();
    articles.forEach((article) => {
      const key = article.industries[0] ?? '산업 미분류';
      byIndustry.set(key, [...(byIndustry.get(key) ?? []), article]);
    });

    return [
      ...header,
      ...[...byIndustry.entries()].flatMap(([industry, items]) => [
        `## ${industry} (${items.length}건)`,
        '',
        ...items.map((article) => `${articleBlock(article, level)}\n`),
      ]),
    ].join('\n');
  }

  if (format === 'issue-list') {
    return [
      ...header,
      '## 규제·애로사항',
      '',
      ...articles.map(
        (article) =>
          `- [${article.classification.issueTypes.map((type) => ISSUE_TYPE_LABELS[type]).join('/') || '분류 없음'}] ` +
          `${article.title} (${article.publisher}, ${formatDate(article.publishedAt)}, ${article.relevanceScore}점)`,
      ),
    ].join('\n');
  }

  // 일일 기업환경 브리핑
  return [
    ...header,
    '## 1. 주요 동향',
    '',
    ...articles.slice(0, 3).map((article) => `${articleBlock(article, level)}\n`),
    '## 2. 그 밖의 기사',
    '',
    ...articles.slice(3).map((article) => `${articleBlock(article, level)}\n`),
    '## 3. 검토 필요사항',
    '',
    '- ',
    '',
    '## 4. 참고 기사',
    '',
    ...articles.map((article, index) => `${index + 1}. ${article.title} — ${article.url}`),
  ].join('\n');
}

/** 엑셀에서 열었을 때 한글이 깨지지 않도록 BOM을 붙인다 */
export const CSV_BOM = '﻿';

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function buildCsv(articles: EnrichedArticle[]): string {
  const header = [
    '제목',
    '언론사',
    '발행일',
    '수집일',
    '연관성점수',
    '산업',
    '이슈유형',
    '요약',
    '원문링크',
  ];

  const rows = articles.map((article) =>
    [
      article.title,
      article.publisher,
      article.publishedAt,
      article.collectedAt.slice(0, 10),
      String(article.relevanceScore),
      article.industries.join(' / '),
      article.classification.issueTypes.map((type) => ISSUE_TYPE_LABELS[type]).join(' / '),
      (article.summary ?? []).join(' '),
      article.url,
    ].map(csvCell),
  );

  return CSV_BOM + [header.map(csvCell), ...rows].map((row) => row.join(',')).join('\r\n');
}
