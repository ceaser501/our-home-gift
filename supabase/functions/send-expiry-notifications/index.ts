// 유효기한이 7주(49일) 이내로 남은 미사용 기프티콘을 찾아서, 그 가족 구성원들이
// 브라우저에서 알림을 켜뒀다면(push_subscriptions) 웹푸시를 보낸다.
// pg_cron이 하루 두 번(오전 9시/오후 3시, KST) 이 함수를 호출한다.
// 같은 기프티콘을 반복해서 알려주지 않도록 gifticons.expiry_notified 플래그로
// 한 번만 보내고, expires_at이 바뀌면(DB 트리거로) 다시 알려줄 수 있게 초기화된다.

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3';
import { sendFcm, isFcmConfigured } from '../_shared/fcm.ts';

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
  // 이 함수는 pg_cron이 부르는 것이라 로그인 토큰이 없다. 그래서 CRON_SECRET으로만 지킨다.
  //
  // 두 가지를 고쳤다.
  // 1) 예전에는 `if (cronSecret && ...)`라서, 시크릿을 설정하지 않으면 조건 자체가 거짓이
  //    되어 검사를 통째로 건너뛰었다. 보안 검사는 설정이 빠졌을 때 열리는 쪽이 아니라
  //    막히는 쪽으로 넘어져야 한다.
  // 2) 예전에는 토큰을 주소 뒤(?token=...)에 붙여 보냈다. 주소는 함수 호출 기록과
  //    cron.job 테이블에 그대로 남아서, 비밀값을 여기저기 흘리고 다니는 셈이었다.
  //    헤더로 옮긴다.
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!cronSecret) {
    return new Response('CRON_SECRET이 설정되지 않아 발송을 중단했어요.', { status: 500 });
  }
  if (req.headers.get('x-cron-secret') !== cronSecret) {
    return new Response('unauthorized', { status: 401 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:noreply@ourhomegift.app';

  // 알림이 가는 길이 둘이다 — 브라우저 구독(웹푸시)과 파이어베이스 토큰(앱).
  // 둘 중 하나만 설정돼 있어도 그쪽으로는 보낸다. 둘 다 없을 때만 멈춘다.
  const webReady = Boolean(vapidPublicKey && vapidPrivateKey);
  if (!supabaseUrl || !serviceRoleKey || (!webReady && !isFcmConfigured())) {
    return new Response(JSON.stringify({ error: '서버 설정(VAPID 키 등)이 완료되지 않았어요.' }), { status: 500 });
  }

  if (webReady) webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const admin = createClient(supabaseUrl, serviceRoleKey);

  // 앱 안 알림(activities)에서 30일 지난 것을 지운다. 알림 발송과는 상관없는 일이지만,
  // 하루 두 번 꼬박꼬박 도는 일정이 이것뿐이라 여기에 얹는다. 이걸 위해 크론을 하나 더
  // 만들면 나중에 배포할 때 챙길 것만 늘어난다.
  //
  // 아래 발송 로직보다 먼저 부른다. 뒤에 두면 "알릴 기프티콘이 없어요"로 일찍 끝나는 날에는
  // 정리가 통째로 건너뛰어진다. 실패해도 발송은 그대로 진행한다.
  await admin.rpc('purge_old_activities');

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

  // 한 사람이 여러 가족에 속할 수 있어서, 알림을 보낼 곳은 구독에 적힌 가족이 아니라
  // "지금 이 가족에 누가 있는지"로 정한다. 구독은 기기 하나당 하나이고 사람에게 딸린 것이라,
  // 그 사람이 속한 모든 가족의 알림이 그 기기로 간다.
  const [{ data: memberships, error: memberError }, { data: families, error: familyError }] = await Promise.all([
    admin.from('family_members').select('family_id, user_id').in('family_id', familyIds),
    admin.from('families').select('id, name').in('id', familyIds),
  ]);
  if (memberError || familyError) {
    return new Response(JSON.stringify({ error: (memberError || familyError).message }), { status: 500 });
  }

  const familyNames = new Map((families || []).map((f) => [f.id, f.name]));
  const userIds = [...new Set((memberships || []).map((m) => m.user_id))];

  const [{ data: subscriptions, error: subError }, { data: nativeTokens, error: tokenError }] = await Promise.all([
    admin.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth').in('user_id', userIds),
    admin.from('native_push_tokens').select('user_id, token').in('user_id', userIds),
  ]);

  if (subError || tokenError) {
    return new Response(JSON.stringify({ error: (subError || tokenError).message }), { status: 500 });
  }

  // 사람 → 그 사람의 받을 곳, 그다음 가족 → 그 가족 사람들의 받을 곳.
  // 웹 구독과 앱 토큰이 같은 모양으로 접힌다.
  function groupByFamily(rows, pick) {
    const byUser = new Map();
    for (const row of rows || []) {
      if (!byUser.has(row.user_id)) byUser.set(row.user_id, []);
      byUser.get(row.user_id).push(pick(row));
    }
    const byFamily = new Map();
    for (const membership of memberships || []) {
      const mine = byUser.get(membership.user_id);
      if (!mine) continue;
      if (!byFamily.has(membership.family_id)) byFamily.set(membership.family_id, []);
      byFamily.get(membership.family_id).push(...mine);
    }
    return byFamily;
  }

  const subsByFamily = groupByFamily(webReady ? subscriptions : [], (row) => row);
  const tokensByFamily = groupByFamily(nativeTokens, (row) => row.token);

  let sentCount = 0;
  const notifiedIds = [];
  const deadSubscriptionIds = [];
  const deadTokens = [];

  for (const gifticon of gifticons) {
    const familySubs = subsByFamily.get(gifticon.family_id) || [];
    const familyTokens = tokensByFamily.get(gifticon.family_id) || [];
    // 아직 아무도 알림을 안 켜뒀으면 나중에 다시 시도
    if (familySubs.length === 0 && familyTokens.length === 0) continue;

    const dday = daysUntil(gifticon.expires_at, today);
    const [, month, day] = gifticon.expires_at.split('-');
    const remaining = dday === 0 ? '오늘까지예요' : `${dday}일 남았어요`;
    // 여러 가족에 속해 있으면 어느 가족 기프티콘인지가 중요해서 제목에 가족 이름을 붙인다.
    const familyName = familyNames.get(gifticon.family_id);
    const message = {
      title: `${familyName ? `${familyName} · ` : ''}유효기한이 곧 만료돼요`,
      // 연장할 수 있다는 걸 여기서 알린다. 연장이 필요한 바로 그 순간에 도착하는 말이라,
      // 앱 어딘가에 상시 안내를 두는 것보다 이 한 줄이 더 잘 가르쳐준다.
      // 어디를 눌러야 하는지까지 적어야 앱을 열고 나서 헤매지 않는다.
      body:
        `${gifticon.brand ? `${gifticon.brand} · ` : ''}${gifticon.name}\n` +
        `${Number(month)}월 ${Number(day)}일까지 · ${remaining}\n` +
        `기한은 늘릴 수도 있어요. 카드의 남은 기간 표시를 눌러보세요.`,
    };
    const payload = JSON.stringify(message);

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

    const fcm = await sendFcm(familyTokens, message);
    sentCount += fcm.sent;
    deadTokens.push(...fcm.dead);

    notifiedIds.push(gifticon.id);
  }

  if (notifiedIds.length > 0) {
    await admin.from('gifticons').update({ expiry_notified: true }).in('id', notifiedIds);
  }
  if (deadSubscriptionIds.length > 0) {
    await admin.from('push_subscriptions').delete().in('id', deadSubscriptionIds);
  }
  if (deadTokens.length > 0) {
    await admin.from('native_push_tokens').delete().in('token', deadTokens);
  }

  return new Response(JSON.stringify({ sent: sentCount, notifiedGifticons: notifiedIds.length }));
});
