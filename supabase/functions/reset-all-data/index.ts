// ⚠️ 테스트 전용 함수입니다. 가족/구성원/기프티콘/알림구독/가입계정을 전부 지웁니다.
// 로그인하지 않은 상태에서도 지울 수 있어야 해서 service role 권한으로 동작하며,
// RESET_TOKEN이 맞아야만 실행됩니다. 실사용 배포 전에는 이 함수를 삭제하세요.
//
// 관리자 명단(admin_users)에 있는 계정만 예외로 남깁니다. 아래 삭제 부분에 이유를 적어뒀습니다.

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const resetToken = Deno.env.get('RESET_TOKEN');

  if (!supabaseUrl || !serviceRoleKey || !resetToken) {
    return new Response(JSON.stringify({ error: '초기화 기능이 설정되지 않았어요.' }), { status: 500, headers: jsonHeaders });
  }

  let token = null;
  try {
    ({ token } = await req.json());
  } catch {
    // 본문이 없으면 아래에서 401로 걸린다.
  }
  if (token !== resetToken) {
    return new Response(JSON.stringify({ error: '초기화 권한이 없어요.' }), { status: 401, headers: jsonHeaders });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const deleted = {};

  try {
    // 업로드된 이미지 파일 전부 삭제
    const { data: files } = await admin.storage.from('gifticon-images').list('', { limit: 1000 });
    const folders = (files || []).map((f) => f.name);
    for (const folder of folders) {
      const { data: inner } = await admin.storage.from('gifticon-images').list(folder, { limit: 1000 });
      const paths = (inner || []).map((f) => `${folder}/${f.name}`);
      if (paths.length) await admin.storage.from('gifticon-images').remove(paths);
    }
    deleted.imageFolders = folders.length;

    // 테이블 데이터 삭제 (families를 지우면 family_members/push_subscriptions는 cascade)
    const { count: gifticonCount } = await admin
      .from('gifticons')
      .delete({ count: 'exact' })
      .not('id', 'is', null);
    deleted.gifticons = gifticonCount ?? 0;

    const { count: familyCount } = await admin
      .from('families')
      .delete({ count: 'exact' })
      .not('id', 'is', null);
    deleted.families = familyCount ?? 0;

    // 가입 계정 삭제 — 단, 관리자 명단에 있는 계정은 남긴다.
    //
    // admin_users.user_id는 auth.users를 on delete cascade로 참조한다
    // (supabase/admin-stats.sql:22). 그래서 계정을 지우면 관리자 명단까지 함께
    // 사라지고, 초기화 한 번에 아무도 관리자 화면에 들어오지 못하게 된다.
    // 다시 넣으려면 SQL editor를 열어야 한다 — 초기화는 자주 누르는 버튼이라
    // 그때마다 그 일을 반복하게 된다.
    //
    // 계정만 남기고 그 계정이 만든 가족·기프티콘은 위에서 이미 지웠다. 다시 로그인하면
    // 가족을 새로 만드는 화면부터 시작한다 — 초기화의 뜻은 그대로 지켜진다.
    const { data: admins } = await admin.from('admin_users').select('user_id');
    const keep = new Set((admins || []).map((row) => row.user_id));

    const { data: usersData } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const users = (usersData?.users || []).filter((user) => !keep.has(user.id));
    for (const user of users) {
      await admin.auth.admin.deleteUser(user.id);
    }
    deleted.users = users.length;
    deleted.keptAdmins = keep.size;

    return new Response(JSON.stringify({ ok: true, deleted }), { headers: jsonHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : '초기화에 실패했어요.', deleted }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
