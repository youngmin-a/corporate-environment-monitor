import { NextRequest, NextResponse } from 'next/server';
import { getAllArticleGroupsForSearch } from '@/lib/articles';
import { enrichGroups } from '@/lib/enrich';
import { ALL_INDUSTRIES, type Industry } from '@/lib/industries';
import { buildSuggestedPrompts, CATEGORY_PROMPTS } from '@/lib/suggestedPrompts';

/**
 * 추천 질문 API (PRD 추가요구 4·22장).
 *
 * OpenAI를 호출하지 않는다 — 이미 저장된 기사에서 계산한 산업·기업 집계로만
 * 규칙 기반 추천을 만든다. 산업 필터가 바뀌거나 패널을 열 때마다 불러도 비용이
 * 들지 않는다.
 */
export async function GET(request: NextRequest) {
  const industryParam = request.nextUrl.searchParams.get('industry');
  const industry = industryParam && ALL_INDUSTRIES.includes(industryParam as Industry) ? (industryParam as Industry) : null;

  try {
    const raw = await getAllArticleGroupsForSearch();
    const groups = enrichGroups(raw);
    const prompts = buildSuggestedPrompts(groups, industry);
    return NextResponse.json({ prompts, categories: CATEGORY_PROMPTS });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '추천 질문을 불러오지 못했습니다.' },
      { status: 500 },
    );
  }
}
