// 계정 탈퇴. '가족 나가기'와 달리 계정 자체를 없앤다.
//
// 세 단계로 나뉜다. 앞의 두 개는 권한이 서로 달라서 한 곳에서 못 한다:
//   1) 데이터 정리 — purge_my_data() RPC. 로그인한 본인 자격으로 불러야 auth.uid()가
//      잡히므로 사용자 토큰을 그대로 실어 보낸다.
//   2) 사진 파일 삭제 — 스토리지는 SQL에서 못 지운다. 1)이 돌려준 경로를 여기서 지운다.
//   3) auth.users 행 삭제 — service role만 할 수 있다.
//
// 순서가 중요하다. 계정을 먼저 지우면 남은 데이터가 주인 없이 떠도는데, 그때는 이미
// 사용자 토큰이 죽어서 1)을 부를 수 없다.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsFor } from '../_shared/guard.ts';

// 스토리지 삭제는 한 번에 너무 많이 보내면 거절당해서 나눠 보낸다.
const REMOVE_CHUNK = 100;

Deno.serve(async (req) => {
  const corsHeaders = corsFor(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };
  const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: jsonHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return reply({ error: '서버 설정이 완료되지 않았어요.' }, 500);
  }

  const authHeader = req.headers.get('Authorization') || '';
  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data: userData, error: userError } = await admin.auth.getUser(authHeader.replace('Bearer ', ''));
  const user = userData?.user;
  if (userError || !user) return reply({ error: '로그인이 필요해요.' }, 401);

  // 본인 자격으로 데이터를 정리한다. 누구 계정인지는 토큰이 정하므로 남의 것은 지울 수 없다.
  const asUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: purged, error: purgeError } = await asUser.rpc('purge_my_data');
  if (purgeError) return reply({ error: purgeError.message || '데이터를 지우지 못했어요.' }, 500);

  // 사진은 못 지워도 계정 삭제까지는 진행한다. 여기서 멈추면 데이터만 지워지고 계정은
  // 남은 어중간한 상태가 되는데, 그게 더 나쁘다(다시 눌러도 지울 데이터가 없다).
  const paths = purged?.image_paths || [];
  let removedImages = 0;
  for (let i = 0; i < paths.length; i += REMOVE_CHUNK) {
    const chunk = paths.slice(i, i + REMOVE_CHUNK);
    const { error } = await admin.storage.from('gifticon-images').remove(chunk);
    if (!error) removedImages += chunk.length;
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) return reply({ error: deleteError.message || '계정을 지우지 못했어요.' }, 500);

  return reply({
    ok: true,
    deletedGifticons: purged?.deleted_gifticons ?? 0,
    deletedFamilies: purged?.deleted_families ?? 0,
    removedImages,
  });
});
