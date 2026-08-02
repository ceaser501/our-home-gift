// 유효기한이 7주(49일) 이내로 남은 미사용 기프티콘을 찾아서, 그 가족 구성원들이
// 브라우저에서 알림을 켜뒀다면(push_subscriptions) 웹푸시를 보낸다.
// pg_cron이 하루 두 번(오전 9시/오후 3시, KST) 이 함수를 호출한다.
// 같은 기프티콘을 반복해서 알려주지 않도록 gifticons.expiry_notified 플래그로
// 한 번만 보내고, expires_at이 바뀌면(DB 트리거로) 다시 알려줄 수 있게 초기화된다.

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3';

const EXPIRY_WINDOW_DAYS = 49;

function todayDateStr() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysUntil(expiresAt, today) {
  const ms = new Date(`${expiresAt}T00:00:00Z`) - new Date(`${today}T00:00:00Z`);
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (cronSecret && url.searchParams.get('token') !== cronSecret) {
    return new Response('unauthorized', { status: 401 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:noreply@ourhomegift.app';

  if (!supabaseUrl || !serviceRoleKey || !vapidPublicKey || !vapidPrivateKey) {
    return new Response(JSON.stringify({ error: '서버 설정(VAPID 키 등)이 완료되지 않았어요.' }), { status: 500 });
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const today = todayDateStr();
  const windowEnd = addDays(today, EXPIRY_WINDOW_DAYS);

  const { data: gifticons, error } = await admin
    .from('gifticons')
    .select('id, name, brand, expires_at, family_id')
    .eq('status', 'unused')
    .eq('expiry_notified', false)
    .not('expires_at', 'is', null)
    .gte('expires_at', today)
    .lte('expires_at', windowEnd);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
  if (!gifticons || gifticons.length === 0) {
    return new Response(JSON.stringify({ sent: 0, message: '알릴 기프티콘이 없어요.' }));
  }

  const familyIds = [...new Set(gifticons.map((g) => g.family_id))];
  const { data: subscriptions, error: subError } = await admin
    .from('push_subscriptions')
    .select('id, family_id, endpoint, p256dh, auth')
    .in('family_id', familyIds);

  if (subError) {
    return new Response(JSON.stringify({ error: subError.message }), { status: 500 });
  }

  const subsByFamily = new Map();
  for (const sub of subscriptions || []) {
    if (!subsByFamily.has(sub.family_id)) subsByFamily.set(sub.family_id, []);
    subsByFamily.get(sub.family_id).push(sub);
  }

  let sentCount = 0;
  const notifiedIds = [];
  const deadSubscriptionIds = [];

  for (const gifticon of gifticons) {
    const familySubs = subsByFamily.get(gifticon.family_id) || [];
    if (familySubs.length === 0) continue; // 아직 아무도 알림을 안 켜뒀으면 나중에 다시 시도

    const dday = daysUntil(gifticon.expires_at, today);
    const payload = JSON.stringify({
      title: '유효기한이 곧 만료돼요',
      body: `${gifticon.brand ? `[${gifticon.brand}] ` : ''}${gifticon.name} · D-${dday} · ${gifticon.expires_at}까지`,
    });

    for (const sub of familySubs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
        sentCount++;
      } catch (err) {
        const statusCode = err?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          deadSubscriptionIds.push(sub.id);
        }
      }
    }

    notifiedIds.push(gifticon.id);
  }

  if (notifiedIds.length > 0) {
    await admin.from('gifticons').update({ expiry_notified: true }).in('id', notifiedIds);
  }
  if (deadSubscriptionIds.length > 0) {
    await admin.from('push_subscriptions').delete().in('id', deadSubscriptionIds);
  }

  return new Response(JSON.stringify({ sent: sentCount, notifiedGifticons: notifiedIds.length }));
});
