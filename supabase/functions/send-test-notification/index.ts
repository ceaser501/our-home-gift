// "알림 테스트" 버튼이 부르는 함수.
//
// 예전 테스트 버튼은 브라우저에서 직접 알림을 띄웠기 때문에, 알림을 꺼둔 상태에서도
// 무조건 알림이 떠서 "껐는데 왜 오지?" 하는 오해를 만들었다. 이 함수는 실제 발송과
// 똑같은 길을 지나간다: 서버가 저장된 구독 목록을 보고 웹푸시를 보낸다.
// 그래서 알림을 꺼두면 보낼 곳이 없어 아무것도 오지 않는다(그게 이 테스트의 목적이다).
//
// 실제 예약 발송(send-expiry-notifications)과 다른 점:
//   - 부른 사람 본인에게만 보낸다(가족 전체를 방해하지 않게).
//   - expiry_notified 표시를 건드리지 않아서 몇 번이든 다시 눌러볼 수 있다.
//   - 앱을 배경으로 돌릴 시간을 주려고 5초 뒤에 보낸다.

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3';

const SEND_DELAY_MS = 5000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function todayDateStr() {
  return new Date().toISOString().slice(0, 10);
}

function daysUntil(expiresAt, today) {
  const ms = new Date(`${expiresAt}T00:00:00Z`) - new Date(`${today}T00:00:00Z`);
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

Deno.serve(async (req) => {
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

  // 누가 눌렀는지는 로그인 토큰으로 확인한다(본인에게만 보내기 위해).
  const authHeader = req.headers.get('Authorization') || '';
  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data: userData, error: userError } = await admin.auth.getUser(authHeader.replace('Bearer ', ''));
  const user = userData?.user;
  if (userError || !user) return reply({ error: '로그인이 필요해요.' }, 401);

  const { data: subscriptions, error: subError } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', user.id);
  if (subError) return reply({ error: subError.message }, 500);

  // 알림을 꺼둔 상태. 보낼 곳이 없으니 아무것도 안 보낸다.
  if (!subscriptions || subscriptions.length === 0) {
    return reply({ sent: 0, reason: 'notifications_off' });
  }

  // 한 사람이 여러 가족에 속할 수 있어서, 내가 속한 가족 전체에서 가장 임박한 한 건을 고른다.
  const { data: memberships, error: memberError } = await admin
    .from('family_members')
    .select('family_id')
    .eq('user_id', user.id);
  if (memberError) return reply({ error: memberError.message }, 500);
  if (!memberships || memberships.length === 0) return reply({ sent: 0, reason: 'no_gifticon' });

  // 실제 발송과 같은 기준(미사용 + 유효기한 있는 것) 중 가장 임박한 한 건으로 보낸다.
  const today = todayDateStr();
  const { data: gifticons, error: gifticonError } = await admin
    .from('gifticons')
    .select('name, brand, expires_at, family_id')
    .in(
      'family_id',
      memberships.map((m) => m.family_id)
    )
    .eq('status', 'unused')
    .is('hidden_at', null)
    .not('expires_at', 'is', null)
    .gte('expires_at', today)
    .order('expires_at')
    .limit(1);
  if (gifticonError) return reply({ error: gifticonError.message }, 500);

  const target = gifticons?.[0];
  if (!target) return reply({ sent: 0, reason: 'no_gifticon' });

  const { data: family } = await admin.from('families').select('name').eq('id', target.family_id).single();

  const dday = daysUntil(target.expires_at, today);
  const [, month, day] = target.expires_at.split('-');
  const payload = JSON.stringify({
    title: `${family?.name ? `${family.name} · ` : ''}유효기한이 곧 만료돼요`,
    body: `${target.brand ? `${target.brand} · ` : ''}${target.name}\n${Number(month)}월 ${Number(day)}일까지 · ${
      dday === 0 ? '오늘까지예요' : `${dday}일 남았어요`
    }`,
  });

  // 앱을 배경으로 돌릴 시간을 준다. 브라우저가 잠들어도 이 요청은 서버에서 계속 진행된다.
  await new Promise((resolve) => setTimeout(resolve, SEND_DELAY_MS));

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  let sent = 0;
  const deadSubscriptionIds = [];
  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      );
      sent++;
    } catch (err) {
      if (err?.statusCode === 404 || err?.statusCode === 410) deadSubscriptionIds.push(sub.id);
    }
  }

  // 이미 없어진 구독은 정리해둔다(예전 주소로 계속 보내지 않도록).
  if (deadSubscriptionIds.length > 0) {
    await admin.from('push_subscriptions').delete().in('id', deadSubscriptionIds);
  }

  return reply({ sent, gifticon: target.name });
});
