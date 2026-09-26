// 사용기한이 7일 안으로 남은 미사용 기프티콘을 찾아서, 그 가족 구성원들에게 **하루
// 한 번** 알린다. 사람마다 고른 시각(notification_settings.expiry_hour, 기본 오전 9시)에
// 보낸다. pg_cron이 매시 정각에 부르고, 이 함수가 "지금이 이 사람의 시각인가"를 가린다.
//
// 같은 날 알릴 기프티콘이 여럿이면 한 알림으로 묶는다. 다섯 개라고 다섯 번 울리면 끈다.
// 하루 한 번은 expiry_push_log(사람, 날짜)로 지킨다.
//
// 2026-09-27에 규칙을 바꿨다. 예전에는 49일 안으로 들어오면 기프티콘마다 딱 한 번이었다
// (gifticons.expiry_notified). 정작 마감 직전에는 아무 말이 없었다.

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3';
import { sendFcm, isFcmConfigured } from '../_shared/fcm.ts';

// D-7부터 D-day까지. 오늘이 마지막 날이면 0.
const EXPIRY_WINDOW_DAYS = 7;
const DEFAULT_HOUR = 9;
// 기록은 며칠만 들고 있으면 된다. 오늘 보냈는지만 보니까.
const LOG_KEEP_DAYS = 14;

// 한국시간 기준 오늘 날짜와 지금 시(정시). 기프티콘 기한은 한국 날짜로 적혀 있다.
function nowKst() {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return { today: kst.toISOString().slice(0, 10), hour: kst.getUTCHours() };
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

function remainingText(dday) {
  return dday === 0 ? '오늘까지' : `${dday}일 남음`;
}

// 한 사람에게 갈 한 통. 기한이 가까운 것부터.
//
// 하나면 예전처럼 자세히, 여럿이면 앞의 셋만 줄로 적고 나머지는 개수로 접는다.
// 알림 창은 몇 줄 안 보여준다.
export function buildMessage(items) {
  const sorted = [...items].sort((a, b) => a.dday - b.dday);
  if (sorted.length === 1) {
    const g = sorted[0];
    const [, month, day] = g.expires_at.split('-');
    const remaining = g.dday === 0 ? '오늘까지예요' : `${g.dday}일 남았어요`;
    return {
      title: `${g.familyName ? `${g.familyName} · ` : ''}유효기한이 곧 만료돼요`,
      // 연장할 수 있다는 걸 여기서 알린다. 연장이 필요한 바로 그 순간에 도착하는 말이라,
      // 앱 어딘가에 상시 안내를 두는 것보다 이 한 줄이 더 잘 가르쳐준다.
      body:
        `${g.brand ? `${g.brand} · ` : ''}${g.name}\n` +
        `${Number(month)}월 ${Number(day)}일까지 · ${remaining}\n` +
        `기한은 늘릴 수도 있어요. 카드의 남은 기간 표시를 눌러보세요.`,
    };
  }
  const shown = sorted.slice(0, 3).map((g) => `${g.brand ? `${g.brand} · ` : ''}${g.name} · ${remainingText(g.dday)}`);
  const rest = sorted.length - shown.length;
  return {
    title: `기프티콘 ${sorted.length}개가 곧 만료돼요`,
    body: shown.join('\n') + (rest > 0 ? `\n외 ${rest}개` : ''),
  };
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

  const { today, hour } = nowKst();

  // 앱 안 알림(activities)에서 30일 지난 것을 지운다. 알림 발송과는 상관없는 일인데
  // 여기 얹혀 있던 것이다. 이제 매시간 도니까 하루에 한 번(오전 9시)만 한다.
  //
  // 아래 발송 로직보다 먼저 부른다. 뒤에 두면 "알릴 기프티콘이 없어요"로 일찍 끝나는 날에는
  // 정리가 통째로 건너뛰어진다. 실패해도 발송은 그대로 진행한다.
  if (hour === DEFAULT_HOUR) {
    await admin.rpc('purge_old_activities');
    await admin.from('expiry_push_log').delete().lt('sent_on', addDays(today, -LOG_KEEP_DAYS));
  }

  const windowEnd = addDays(today, EXPIRY_WINDOW_DAYS);

  const { data: gifticons, error } = await admin
    .from('gifticons')
    .select('id, name, brand, expires_at, family_id')
    .eq('status', 'unused')
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

  const [{ data: memberships, error: memberError }, { data: families, error: familyError }] = await Promise.all([
    admin.from('family_members').select('family_id, user_id').in('family_id', familyIds),
    admin.from('families').select('id, name').in('id', familyIds),
  ]);
  if (memberError || familyError) {
    return new Response(JSON.stringify({ error: (memberError || familyError).message }), { status: 500 });
  }

  const familyNames = new Map((families || []).map((f) => [f.id, f.name]));
  const allUserIds = [...new Set((memberships || []).map((m) => m.user_id))];

  // 지금이 그 사람의 시각인가, 오늘 이미 받았나.
  const [{ data: settings, error: settingError }, { data: sentToday, error: logError }] = await Promise.all([
    admin.from('notification_settings').select('user_id, expiry_hour').in('user_id', allUserIds),
    admin.from('expiry_push_log').select('user_id').eq('sent_on', today).in('user_id', allUserIds),
  ]);
  if (settingError || logError) {
    return new Response(JSON.stringify({ error: (settingError || logError).message }), { status: 500 });
  }
  const hourOf = new Map((settings || []).map((row) => [row.user_id, row.expiry_hour]));
  const already = new Set((sentToday || []).map((row) => row.user_id));
  const userIds = allUserIds.filter((id) => (hourOf.get(id) ?? DEFAULT_HOUR) === hour && !already.has(id));
  if (userIds.length === 0) {
    return new Response(JSON.stringify({ sent: 0, message: '지금 시각에 받을 사람이 없어요.' }));
  }

  const [{ data: subscriptions, error: subError }, { data: nativeTokens, error: tokenError }] = await Promise.all([
    webReady
      ? admin.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth').in('user_id', userIds)
      : Promise.resolve({ data: [], error: null }),
    admin.from('native_push_tokens').select('user_id, token').in('user_id', userIds),
  ]);
  if (subError || tokenError) {
    return new Response(JSON.stringify({ error: (subError || tokenError).message }), { status: 500 });
  }

  // 사람 → 그 사람이 속한 가족들의 알릴 기프티콘. 한 사람이 여러 가족에 속할 수 있어서
  // 가족마다가 아니라 사람마다 모은다 — 그래야 한 통으로 묶인다.
  const familiesOf = new Map();
  for (const m of memberships || []) {
    if (!familiesOf.has(m.user_id)) familiesOf.set(m.user_id, new Set());
    familiesOf.get(m.user_id).add(m.family_id);
  }
  const items = gifticons.map((g) => ({
    ...g,
    dday: daysUntil(g.expires_at, today),
    familyName: familyNames.get(g.family_id),
  }));

  let sentCount = 0;
  const reached = [];
  const deadSubscriptionIds = [];
  const deadTokens = [];

  for (const userId of userIds) {
    const mine = familiesOf.get(userId) || new Set();
    const list = items.filter((g) => mine.has(g.family_id));
    const subs = (subscriptions || []).filter((row) => row.user_id === userId);
    const tokens = (nativeTokens || []).filter((row) => row.user_id === userId).map((row) => row.token);
    // 알림을 안 켜둔 사람은 적지도 않는다. 나중에 켜면 그날 시각부터 받는다.
    if (list.length === 0 || (subs.length === 0 && tokens.length === 0)) continue;

    const message = buildMessage(list);
    const payload = JSON.stringify(message);

    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
        sentCount++;
      } catch (err) {
        const statusCode = err?.statusCode;
        if (statusCode === 404 || statusCode === 410) deadSubscriptionIds.push(sub.id);
      }
    }

    const fcm = await sendFcm(tokens, message);
    sentCount += fcm.sent;
    deadTokens.push(...fcm.dead);

    reached.push(userId);
  }

  if (reached.length > 0) {
    await admin.from('expiry_push_log').upsert(
      reached.map((user_id) => ({ user_id, sent_on: today })),
      { onConflict: 'user_id,sent_on', ignoreDuplicates: true }
    );
  }
  if (deadSubscriptionIds.length > 0) {
    await admin.from('push_subscriptions').delete().in('id', deadSubscriptionIds);
  }
  if (deadTokens.length > 0) {
    await admin.from('native_push_tokens').delete().in('token', deadTokens);
  }

  return new Response(JSON.stringify({ sent: sentCount, people: reached.length, hour, today }));
});
