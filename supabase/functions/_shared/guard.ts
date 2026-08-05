// 돈이 나가는 함수(AI 호출, 카카오·TMAP 종량 요금) 앞에 두는 문지기.
//
// Supabase Edge Function의 기본값 verify_jwt = true는 인증이 아니다. anon key를 유효한
// JWT로 받아주는데, anon key는 브라우저 번들에 그대로 들어 있어서 누구나 꺼낼 수 있다.
// 즉 지금까지 이 함수들은 사실상 아무나 부를 수 있었고, 부를 때마다 우리 돈이 나갔다.
//
// 그래서 두 겹으로 막는다.
//   1) 진짜 로그인한 사용자인지 — 토큰으로 auth 서버에 물어본다. anon key로는 통과 못 한다.
//   2) 그 사람이 오늘 얼마나 썼는지 — 계정은 얼마든지 만들 수 있으니 인증만으로는 부족하다.

import { createClient } from 'npm:@supabase/supabase-js@2';

export function adminClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
}

// 로그인한 사람이면 { user, admin }, 아니면 { error, status }를 돌려준다.
export async function requireUser(req: Request) {
  const admin = adminClient();
  if (!admin) return { error: '서버 설정이 완료되지 않았어요.', status: 500 };

  const token = (req.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  if (!token) return { error: '로그인이 필요해요.', status: 401 };

  // anon key도 형식은 JWT라 여기까지는 온다. 하지만 그 토큰에는 사용자가 없어서
  // auth 서버가 사용자를 돌려주지 않는다. 그게 이 검사의 핵심이다.
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return { error: '로그인이 필요해요.', status: 401 };

  return { user: data.user, admin };
}

// 오늘 이 사람이 이 기능을 몇 번 썼는지 세고, 한도를 넘으면 막는다.
// 세는 일과 판단을 한 번의 쿼리로 하는 이유는, 나눠 하면 동시에 여러 번 부를 때
// 둘 다 "아직 여유 있음"으로 읽고 지나가기 때문이다.
export async function withinDailyLimit(admin, userId: string, action: string, limit: number) {
  const { data, error } = await admin.rpc('bump_api_usage', { uid: userId, act: action, max_per_day: limit });

  // 세는 데 실패했다고 기능을 막지는 않는다. 한도는 요금 사고를 막으려는 장치이지
  // 기능의 일부가 아니라서, 여기서 막으면 장애가 곧 서비스 중단이 된다.
  if (error) return { allowed: true, used: 0, limit };

  return data as { allowed: boolean; used: number; limit: number };
}

export function limitFromEnv(name: string, fallback: number) {
  const raw = Number(Deno.env.get(name));
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

export function tooManyMessage(used: number, limit: number) {
  return `오늘은 여기까지예요. 하루 ${limit}번까지 쓸 수 있어요(지금 ${used}번). 내일 다시 시도해주세요.`;
}
