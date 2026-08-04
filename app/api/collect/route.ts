import { NextResponse } from 'next/server';
import { runCollection } from '@/lib/pipeline';

/**
 * 수집 파이프라인 진입점 (DESIGN.md 2-1).
 * Vercel Cron과 수동 새로고침이 함께 호출한다.
 */
export async function GET() {
  try {
    const result = await runCollection();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '알 수 없는 오류' },
      { status: 500 },
    );
  }
}
