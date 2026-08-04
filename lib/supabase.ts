import { createClient } from '@supabase/supabase-js';

/**
 * 서버 전용 Supabase 클라이언트.
 *
 * `NEXT_PUBLIC_` 접두사를 쓰지 않는다 — 이 프로젝트는 화면(Server Component)이
 * 서버에서 직접 데이터를 읽어 내려주는 구조라, 클라이언트 번들에 키가 들어갈 이유가
 * 없다. Route Handler(API 라우트)와 Server Component에서만 import한다 (CLAUDE.md 보안).
 */
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error(
    'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY가 .env에 없습니다.',
  );
}

export const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});
