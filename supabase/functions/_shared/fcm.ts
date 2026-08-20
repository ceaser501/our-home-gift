// 앱으로 알림을 보내는 길(FCM). 웹의 web-push와 짝이다.
//
// 웹은 브라우저 구독으로, 앱은 파이어베이스 토큰으로 받는다. 발송 함수 두 개
// (send-test-notification, send-expiry-notifications)가 양쪽으로 같이 보낸다.
//
// FCM에 보내려면 구글이 발급한 접근 토큰이 있어야 한다. 예전에 있던 "서버 키" 한 줄로
// 보내는 방식은 2024년에 없어졌고, 지금은 서비스 계정 열쇠로 서명한 JWT를 구글에 주고
// 한 시간짜리 접근 토큰을 받아 쓴다. 그 과정을 여기 한 곳에 모아둔다.
//
// 필요한 설정: FCM_SERVICE_ACCOUNT — 파이어베이스 콘솔에서 받은 서비스 계정 JSON 전체.
// 설정이 없으면 isFcmConfigured()가 거짓이고, 발송 함수는 웹만 보내고 넘어간다.

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

function serviceAccount(): ServiceAccount | null {
  const raw = Deno.env.get('FCM_SERVICE_ACCOUNT');
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function isFcmConfigured(): boolean {
  return serviceAccount() !== null;
}

function base64url(bytes: Uint8Array | string): string {
  const binary =
    typeof bytes === 'string' ? bytes : Array.from(bytes, (b) => String.fromCharCode(b)).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// PEM(-----BEGIN PRIVATE KEY-----)을 WebCrypto가 아는 형태로 바꾼다.
// JSON 안에서는 줄바꿈이 \n 두 글자로 들어 있어서 먼저 되돌려야 한다.
async function importKey(pem: string): Promise<CryptoKey> {
  const body = pem
    .replace(/\\n/g, '\n')
    .replace(/-----[^-]+-----/g, '')
    .replace(/\s/g, '');
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, [
    'sign',
  ]);
}

// 받아온 접근 토큰은 한 시간 쓸 수 있다. 기프티콘 여러 건을 보내는 동안 매번 새로
// 받아오면 발송보다 토큰 받는 데 시간을 더 쓴다. 함수가 살아 있는 동안만 들고 있는다.
let cached: { token: string; expiresAt: number } | null = null;

async function accessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.expiresAt > now + 60) return cached.token;

  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    await importKey(sa.private_key),
    new TextEncoder().encode(`${header}.${claim}`)
  );
  const jwt = `${header}.${claim}.${base64url(new Uint8Array(signature))}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  const body = await res.json();
  if (!res.ok || !body.access_token) {
    throw new Error(`FCM 접근 토큰을 받지 못했어요: ${body.error_description || body.error || res.status}`);
  }

  cached = { token: body.access_token, expiresAt: now + (body.expires_in || 3600) };
  return cached.token;
}

// 폰 토큰 여러 개로 같은 알림을 보낸다.
// 돌려주는 dead는 이제 없는 토큰들 — 부른 쪽에서 표에서 지운다. 안 지우면 앱을 지운
// 폰으로 매번 보내다가 실패하는 일이 영영 반복된다(웹 구독의 404/410과 같은 사정).
export async function sendFcm(
  tokens: string[],
  message: { title: string; body: string }
): Promise<{ sent: number; dead: string[] }> {
  const sa = serviceAccount();
  if (!sa || tokens.length === 0) return { sent: 0, dead: [] };

  const token = await accessToken(sa);
  const url = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;

  let sent = 0;
  const dead: string[] = [];

  for (const target of tokens) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            token: target,
            // notification으로 보내야 앱이 꺼져 있어도 폰이 알림을 띄운다.
            // data로만 보내면 앱이 살아 있을 때만 받는다 — 유효기한 알림은 앱을 안 켠
            // 사람에게 알리는 게 목적이라 그러면 의미가 없다.
            notification: { title: message.title, body: message.body },
            android: { priority: 'HIGH', notification: { sound: 'default' } },
            // iOS는 이 블록이 있어야 소리가 나고 잠금화면에 뜬다. 아이폰 앱을 아직
            // 안 냈지만, 낼 때 서버를 다시 손대지 않도록 지금 같이 적어둔다.
            apns: {
              headers: { 'apns-priority': '10' },
              payload: { aps: { sound: 'default' } },
            },
          },
        }),
      });

      if (res.ok) {
        sent++;
        continue;
      }

      const err = await res.json().catch(() => null);
      const status = err?.error?.status;
      // UNREGISTERED = 앱을 지웠거나 토큰이 갈렸다. INVALID_ARGUMENT = 토큰이 아예 틀렸다.
      if (res.status === 404 || status === 'UNREGISTERED' || status === 'INVALID_ARGUMENT') {
        dead.push(target);
      }
    } catch {
      // 한 대가 실패해도 나머지는 보낸다.
    }
  }

  return { sent, dead };
}
