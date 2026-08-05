// 초대 코드로 참여를 신청했을 때, 그 가족의 기존 구성원들에게 "누가 기다리고 있어요"를
// 알려준다. 신청은 승인해줄 사람이 앱을 열어봐야만 보이는데(헤더의 빨간 점), 언제 열어볼지
// 모르니 신청한 사람이 하염없이 기다리게 되기 때문이다.
//
// 부르는 쪽은 신청한 본인의 브라우저다. 남의 가족에 대고 마구 부를 수는 없게, 이 함수는
// "부른 사람이 그 가족에 실제로 신청을 넣어둔 상태인지"를 서버에서 다시 확인한다.
// 신청을 넣으려면 초대 코드가 맞아야 하므로, 코드를 모르면 이 알림도 만들 수 없다.
//
// 알림을 꺼둔 사람에게는 가지 않는다. 알림을 끄면 push_subscriptions에서 그 사람의 구독이
// 지워지고, 여기서는 그 목록에 있는 곳으로만 보내기 때문이다(따로 걸러낼 필요가 없다).

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3';
import { corsFor } from '../_shared/guard.ts';

Deno.serve(async (req) => {
  const corsHeaders = corsFor(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };
  const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: jsonHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:noreply@ourhomegift.app';

  if (!supabaseUrl || !serviceRoleKey || !vapidPublicKey || !vapidPrivateKey) {
    return reply({ error: '알림 서버 설정(VAPID 키 등)이 완료되지 않았어요.' }, 500);
  }

  const { familyId } = await req.json().catch(() => ({}));
  if (!familyId) return reply({ error: '어느 가족인지 알 수 없어요.' }, 400);

  // 누가 불렀는지는 로그인 토큰으로 확인한다.
  const authHeader = req.headers.get('Authorization') || '';
  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data: userData, error: userError } = await admin.auth.getUser(authHeader.replace('Bearer ', ''));
  const user = userData?.user;
  if (userError || !user) return reply({ error: '로그인이 필요해요.' }, 401);

  // 정말로 이 사람이 이 가족에 기다리고 있는 신청이 있는지 확인한다.
  // 없으면(이미 승인됐거나, 애초에 신청한 적이 없으면) 아무것도 보내지 않는다.
  const { data: request, error: requestError } = await admin
    .from('family_join_requests')
    .select('display_name')
    .eq('family_id', familyId)
    .eq('user_id', user.id)
    .eq('status', 'pending')
    .maybeSingle();
  if (requestError) return reply({ error: requestError.message }, 500);
  if (!request) return reply({ sent: 0, reason: 'no_pending_request' });

  const [{ data: family }, { data: memberships, error: memberError }] = await Promise.all([
    admin.from('families').select('name').eq('id', familyId).maybeSingle(),
    admin.from('family_members').select('user_id').eq('family_id', familyId),
  ]);
  if (memberError) return reply({ error: memberError.message }, 500);

  const memberIds = (memberships || []).map((m) => m.user_id).filter((id) => id !== user.id);
  if (memberIds.length === 0) return reply({ sent: 0, reason: 'no_members' });

  // 알림을 켜둔 사람만 여기에 남아 있다. 꺼둔 사람은 구독이 지워져서 자연히 빠진다.
  const { data: subscriptions, error: subError } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .in('user_id', memberIds);
  if (subError) return reply({ error: subError.message }, 500);
  if (!subscriptions || subscriptions.length === 0) return reply({ sent: 0, reason: 'notifications_off' });

  const payload = JSON.stringify({
    title: `${family?.name ? `${family.name} · ` : ''}참여 신청이 왔어요`,
    body: `${request.display_name}님이 참여를 기다리고 있어요.\n가족 구성원 목록에서 승인할 수 있어요.`,
    // 유효기한 알림과 다른 꼬리표를 달아야 서로 덮어쓰지 않는다.
    tag: 'family-join-request',
  });

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  let sent = 0;
  const deadSubscriptionIds = [];
  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
      sent++;
    } catch (err) {
      if (err?.statusCode === 404 || err?.statusCode === 410) deadSubscriptionIds.push(sub.id);
    }
  }

  if (deadSubscriptionIds.length > 0) {
    await admin.from('push_subscriptions').delete().in('id', deadSubscriptionIds);
  }

  return reply({ sent });
});
