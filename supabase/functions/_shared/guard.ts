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

// 어느 사이트에서 부를 수 있게 할지. 예전에는 전부 '*'였다. 인증이 붙은 지금은 남의 사이트가
// 불러도 로그인 토큰이 없어 통과하지 못하지만, 굳이 열어둘 이유도 없다.
//
// 브라우저가 보낸 Origin이 목록에 있으면 그 값을 그대로 돌려준다. '*'를 쓰지 않는 이유는,
// 나중에 쿠키나 인증 정보를 함께 보내야 할 때 '*'로는 안 되기 때문이다.
// (ALLOWED_ORIGINS에 쉼표로 나눠 적는다. 설정이 없으면 예전처럼 전부 허용한다 — 이건
//  막는 장치가 아니라 정리하는 장치라, 설정 누락으로 앱이 통째로 멈추는 편이 더 나쁘다.)
function allowedOrigins(): string[] {
  return (Deno.env.get('ALLOWED_ORIGINS') || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function corsFor(req: Request) {
  const allowed = allowedOrigins();
  const origin = req.headers.get('Origin') || '';
  const value = allowed.length === 0 ? '*' : allowed.includes(origin) ? origin : allowed[0];

  return {
    'Access-Control-Allow-Origin': value,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    // 허용 주소가 여럿이면 응답이 Origin에 따라 달라진다. 이걸 알려주지 않으면
    // 중간 캐시가 한 사람 응답을 다른 사람에게 그대로 돌려줄 수 있다.
    Vary: 'Origin',
  };
}

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
//
// 사람별 상한과 전체 상한을 함께 본다. 계정은 이메일만 있으면 새로 만들 수 있어서
// 사람별 상한만으로는 계정을 갈아치우는 것을 막지 못한다. 하루에 나갈 수 있는 요금의
// 천장을 정하는 건 전체 상한 쪽이다.
export async function withinDailyLimit(admin, userId: string, action: string, limit: number, totalLimit: number) {
  const { data, error } = await admin.rpc('bump_api_usage', {
    uid: userId,
    act: action,
    max_per_day: limit,
    max_total_per_day: totalLimit,
  });

  // 세는 데 실패했다고 기능을 막지는 않는다. 한도는 요금 사고를 막으려는 장치이지
  // 기능의 일부가 아니라서, 여기서 막으면 장애가 곧 서비스 중단이 된다.
  if (error) return { allowed: true, reason: null, used: 0, limit };

  return data as { allowed: boolean; reason: string | null; used: number; limit: number };
}

export function limitFromEnv(name: string, fallback: number) {
  const raw = Number(Deno.env.get(name));
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

// 내가 많이 쓴 것과, 전체가 많이 쓴 것은 사용자에게 할 말이 다르다.
// 후자는 사용자 잘못이 아니라서 "네가 많이 썼다"고 하면 안 된다.
export function tooManyMessage(usage: { reason: string | null; used: number; limit: number }) {
  if (usage.reason === 'total') {
    return '오늘은 이 기능을 쓰는 사람이 너무 많아 잠시 쉬어가요. 내일 다시 시도해주세요.';
  }
  return `오늘은 여기까지예요. 하루 ${usage.limit}번까지 쓸 수 있어요(지금 ${usage.used}번). 내일 다시 시도해주세요.`;
}
