/**
 * 요청 제한 (PRD 29장).
 *
 * Vercel 서버리스는 인스턴스가 여러 개일 수 있어 이 모듈 스코프 Map은 **완벽한
 * 분산 rate limit이 아니다** — 각 warm 인스턴스가 자기 카운터만 본다. 로그인 없는
 * 5~10명 내부 도구 규모에서는 이 정도로 충분하다고 보고 구현했다. 완전한 분산
 * 제한이 필요해지면 Upstash Redis 같은 외부 저장소가 필요하며, 이번 범위에서는
 * 새 서비스를 추가하지 않는다.
 */

type Bucket = { count: number; windowStart: number; inFlight: boolean };

const buckets = new Map<string, Bucket>();
const WINDOW_MS = 5 * 60_000;
const MAX_PER_WINDOW = 12;

export function checkRateLimit(key: string): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.windowStart > WINDOW_MS) {
    buckets.set(key, { count: 1, windowStart: now, inFlight: bucket?.inFlight ?? false });
    return { allowed: true };
  }

  if (bucket.count >= MAX_PER_WINDOW) {
    return { allowed: false, retryAfterSeconds: Math.ceil((WINDOW_MS - (now - bucket.windowStart)) / 1000) };
  }

  bucket.count += 1;
  return { allowed: true };
}

/** 같은 사용자의 동시 요청 1개만 허용한다 (PRD 29장 "동시 요청 1개") */
export function acquireSlot(key: string): boolean {
  const bucket = buckets.get(key);
  if (bucket?.inFlight) return false;
  if (bucket) bucket.inFlight = true;
  else buckets.set(key, { count: 0, windowStart: Date.now(), inFlight: true });
  return true;
}

export function releaseSlot(key: string): void {
  const bucket = buckets.get(key);
  if (bucket) bucket.inFlight = false;
}
