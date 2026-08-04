import { supabase } from '@/lib/supabase';
import { OPERATIONAL_DAILY_LIMIT } from '@/lib/collector';
import type { CollectionState } from '@/types/article';

/** PRD 5-1: 수동 새로고침 쿨다운 (분) */
export const COOLDOWN_MINUTES = 5;

/** KST 기준 오늘 날짜 문자열 (예: "2026-08-04") */
export function todayKst(now: Date = new Date()): string {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

type StateRow = {
  last_attempt_at: string | null;
  last_success_at: string | null;
  today_date: string | null;
  today_new_count: number;
  initial_backfill_done: boolean;
};

function toState(row: StateRow): CollectionState {
  return {
    lastAttemptAt: row.last_attempt_at,
    lastSuccessAt: row.last_success_at,
    todayDate: row.today_date,
    todayNewCount: row.today_new_count,
    initialBackfillDone: row.initial_backfill_done,
  };
}

export async function readState(): Promise<CollectionState> {
  const { data, error } = await supabase
    .from('collection_state')
    .select('*')
    .eq('id', 1)
    .single();

  if (error) throw error;
  return toState(data as StateRow);
}

/**
 * 오늘 남은 수집 여유분.
 *
 * PRD 5-1의 "하루 총합 40건"은 수집 1회당이 아니라 그날 전체 기준이다.
 * 날짜가 바뀌었으면 카운터를 0으로 보고 상한을 그대로 돌려준다.
 */
export function remainingQuota(state: CollectionState, now: Date = new Date()): number {
  if (state.todayDate !== todayKst(now)) return OPERATIONAL_DAILY_LIMIT;
  return Math.max(0, OPERATIONAL_DAILY_LIMIT - state.todayNewCount);
}

/**
 * 쿨다운이 지났는지. 수동 새로고침에만 적용한다 (PRD 5-1).
 * 자동 수집(Cron)은 하루 1회뿐이라 쿨다운을 보지 않는다.
 */
export function isCooldownOver(state: CollectionState, now: Date = new Date()): boolean {
  if (!state.lastAttemptAt) return true;
  const elapsedMs = now.getTime() - new Date(state.lastAttemptAt).getTime();
  return elapsedMs >= COOLDOWN_MINUTES * 60 * 1000;
}

/** 쿨다운이 끝나기까지 남은 초 */
export function cooldownRemainingSeconds(
  state: CollectionState,
  now: Date = new Date(),
): number {
  if (!state.lastAttemptAt) return 0;
  const elapsedMs = now.getTime() - new Date(state.lastAttemptAt).getTime();
  return Math.max(0, Math.ceil((COOLDOWN_MINUTES * 60 * 1000 - elapsedMs) / 1000));
}

/** 수집을 시작할 때 호출. 성공 여부와 무관하게 쿨다운 시계를 돌린다 */
export async function markAttempt(now: Date = new Date()): Promise<void> {
  const { error } = await supabase
    .from('collection_state')
    .update({ last_attempt_at: now.toISOString() })
    .eq('id', 1);
  if (error) throw error;
}

/**
 * 수집이 끝났을 때 호출.
 * 부분 성공이어도 갱신한다 — 화면 상단의 "마지막 수집 성공 시각"이
 * 장애를 알아채는 유일한 수단이기 때문이다 (PRD 예외 처리).
 */
export async function markSuccess(
  savedCount: number,
  now: Date = new Date(),
): Promise<void> {
  const state = await readState();
  const today = todayKst(now);
  const baseCount = state.todayDate === today ? state.todayNewCount : 0;

  const { error } = await supabase
    .from('collection_state')
    .update({
      last_success_at: now.toISOString(),
      today_date: today,
      today_new_count: baseCount + savedCount,
    })
    .eq('id', 1);
  if (error) throw error;
}

/** 최초 3개월 소급 수집을 마쳤다고 표시한다 (PLAN 15번) */
export async function markInitialBackfillDone(): Promise<void> {
  const { error } = await supabase
    .from('collection_state')
    .update({ initial_backfill_done: true })
    .eq('id', 1);
  if (error) throw error;
}
