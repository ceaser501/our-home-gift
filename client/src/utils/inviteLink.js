import { isNativeApp } from './browser';

// 초대 링크. 카톡으로 보내고, 눌러서 들어온 사람을 참여 화면까지 데려간다.
//
// ── 왜 링크인가 ──────────────────────────────────────────────────────────────
//
// 지금까지는 초대 코드 여섯 자리를 복사해서 불러주는 것이 전부였다. 받는 사람은 앱을
// 깔고, 로그인하고, '참여하기'를 찾아 들어가서, 여섯 글자를 옮겨 적어야 했다.
// 걸음마다 사람이 샌다.
//
// 링크는 그 걸음을 한 번으로 줄인다. 누르면 코드가 이미 박힌 참여 화면이 뜨고, 이름만
// 적으면 끝난다.
//
// 코드 복사는 그대로 둔다. 카톡을 안 쓰는 사람도 있고, 여섯 글자는 전화로도 불러줄 수
// 있다.
//
// ── 링크가 새면 ──────────────────────────────────────────────────────────────
//
// 단톡방에 잘못 붙을 수 있다. 그래서 링크는 '신청서를 대신 써주는 것'까지만 한다 —
// 들어오는 것은 여전히 대표가 승인해야 한다(request_join_family). 링크로 들어왔든
// 코드를 손으로 적었든 서버가 하는 일은 똑같다.

const PENDING_KEY = 'moacon:invite-code';
export const INVITE_PARAM = 'join';

// 앱은 화면을 안에 담아 https://localhost/ 로 연다. 그 주소로 초대 링크를 만들면 받는
// 사람 폰에서는 아무 데도 닿지 않는다. 링크에 쓸 주소는 늘 웹이다.
const WEB_ORIGIN = 'https://ceaser501.github.io/our-home-gift/';

/** 초대 링크. 받는 사람이 이 주소를 누르면 코드가 박힌 참여 화면으로 간다. */
export function inviteUrl(code) {
  return `${WEB_ORIGIN}?${INVITE_PARAM}=${encodeURIComponent(String(code || '').trim())}`;
}

/**
 * 주소에 실려 온 초대 코드를 꺼내 적어둔다.
 *
 * 적어두는 이유는 로그인 때문이다. 링크를 눌러 온 사람은 대개 로그인 전인데, 로그인은
 * 카카오·구글 화면을 다녀오는 길이라 그 사이에 주소가 통째로 갈린다. 여기서 붙들어두지
 * 않으면 돌아왔을 때 무엇 때문에 왔는지가 사라진다.
 *
 * 주소에서는 지운다(replaceState). 남겨두면 새로고침할 때마다 다시 참여 화면이 뜨고,
 * 이미 들어간 가족에 또 신청하려 든다.
 */
export function catchInviteFromUrl() {
  try {
    const url = new URL(window.location.href);
    const code = url.searchParams.get(INVITE_PARAM);
    if (!code) return null;

    const clean = code.trim().toUpperCase().slice(0, 12);
    if (clean) sessionStorage.setItem(PENDING_KEY, clean);

    url.searchParams.delete(INVITE_PARAM);
    window.history.replaceState({}, '', url.toString());
    return clean || null;
  } catch {
    return null;
  }
}

/** 붙들어둔 초대 코드. 없으면 빈 문자열. */
export function pendingInviteCode() {
  try {
    return sessionStorage.getItem(PENDING_KEY) || '';
  } catch {
    return '';
  }
}

/** 다 썼으면 놓는다. 신청을 마쳤거나, 이미 그 가족인 경우다. */
export function forgetInviteCode() {
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // 저장이 막혀 있으면 애초에 적히지도 않았다.
  }
}

// ── 카카오 ────────────────────────────────────────────────────────────────────
//
// JS 키는 화면 코드에 그대로 박히는 공개 값이다. 감추는 값이 아니라 카카오 개발자센터에
// 등록해둔 도메인에서만 먹히는 값이고, 실제 방어는 그 도메인 목록이 한다.
//
// 등록해둔 곳은 둘이다.
//   https://ceaser501.github.io   웹
//   https://localhost             앱(화면을 안에 담아 여는 주소)
const KAKAO_KEY = '2142934889b97f43cfc8c5cd69690f32';

// 판을 여럿 적어두고 되는 것을 쓴다.
//
// 카카오 CDN에는 '최신'을 가리키는 주소가 없다. 판 번호를 주소에 박아야 하는데, 한
// 번호만 적어두면 그게 없어진 날 초대가 통째로 멈춘다. 화면에는 아무 일도 안 일어난
// 것처럼 보이고, 무엇이 문제인지도 안 보인다 — 실제로 그렇게 한 번 막혔다.
const SDK_VERSIONS = ['2.7.5', '2.7.4', '2.7.2', '2.6.0'];
const sdkUrl = (version) => `https://t1.kakaocdn.net/kakao_js_sdk/${version}/kakao.min.js`;

let loading = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      script.remove();
      reject(new Error(src));
    };
    document.head.appendChild(script);
  });
}

/**
 * 카카오 SDK를 처음 쓸 때 한 번만 받아온다.
 *
 * 앱이 뜰 때 미리 받지 않는다. 초대는 어쩌다 한 번 하는 일이라, 모두에게 그 값을 물릴
 * 이유가 없다. 인터넷이 막혀 있으면 실패하는데, 그때는 부르는 쪽이 링크 복사로 물러선다.
 */
function loadKakao() {
  if (window.Kakao?.isInitialized?.()) return Promise.resolve(window.Kakao);
  if (loading) return loading;

  loading = (async () => {
    for (const version of SDK_VERSIONS) {
      try {
        await loadScript(sdkUrl(version));
      } catch {
        continue;
      }
      if (!window.Kakao) continue;
      if (!window.Kakao.isInitialized()) window.Kakao.init(KAKAO_KEY);
      return window.Kakao;
    }
    throw new Error('카카오를 불러오지 못했어요. 인터넷을 확인해주세요.');
  })().catch((err) => {
    // 다음에 다시 해볼 수 있게 놓아준다. 한 번 실패했다고 영영 막아둘 이유가 없다.
    loading = null;
    throw err;
  });

  return loading;
}

/**
 * 카톡이 실제로 앞으로 나왔는지 본다.
 *
 * 카카오 SDK는 실패를 알려주지 않는다. 보내는 데까지만 하고 조용히 끝나서, 앱 안에서
 * 아무 일도 안 일어나도 오류 하나 없이 지나간다 — 눌러도 무반응인 버튼이 그것이었다.
 *
 * 그래서 결과를 화면으로 잰다. 카톡이 뜨면 우리 화면이 가려지고(visibilitychange),
 * 안 뜨면 그대로 있다. 잠깐 기다려보고 그대로면 안 열린 것으로 친다.
 */
function wentToKakao(ms = 1400) {
  return new Promise((resolve) => {
    if (document.hidden) {
      resolve(true);
      return;
    }
    const done = (value) => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onHide);
      resolve(value);
    };
    const onHide = () => document.hidden && done(true);
    const timer = setTimeout(() => done(false), ms);
    document.addEventListener('visibilitychange', onHide);
  });
}

/**
 * 카톡으로 초대 카드를 보낸다.
 *
 * 열렸는지 아닌지를 돌려준다. 웹뷰가 카카오 SDK의 창 열기를 막는 경우가 있어서, 부르는
 * 쪽이 그때 다른 길로 물러설 수 있어야 한다.
 */
export async function shareToKakao({ familyName, code, image }) {
  const kakao = await loadKakao();
  const url = inviteUrl(code);
  const link = { mobileWebUrl: url, webUrl: url };

  // 판마다 이름이 다르다. 2판은 Share, 1판은 Link다.
  const send = kakao.Share?.sendDefault || kakao.Link?.sendDefault;
  if (!send) throw new Error('카카오 공유를 쓸 수 없어요. 아래 코드를 알려주세요.');

  try {
    send.call(kakao.Share || kakao.Link, {
      objectType: 'feed',
      content: {
        // 단톡방에서 보는 사람에게는 어느 가족인지가 먼저다. 그게 없으면 광고로 읽힌다.
        title: `${familyName} 가족에 초대받았어요`,
        // 코드를 첫 줄에 둔다. 카톡은 설명을 서너 줄에서 자르는데, 코드가 뒤에 있으면
        // '…'에 먹힌다. 링크를 안 누르고 코드만 옮겨 적는 사람도 있다.
        description: `초대 코드 ${code}\n코드를 입력하면 가족이 모아둔 기프티콘을 함께 볼 수 있어요.`,
        imageUrl: image,
        link,
      },
      buttons: [{ title: '모아콘 시작하기', link }],
    });
  } catch (err) {
    // 카카오가 내는 말을 그대로 올린다. 도메인이 안 맞거나 그림이 안 열릴 때 여기로
    // 온다 — '안 됐어요'로 뭉개면 무엇을 고쳐야 하는지 알 수가 없다.
    throw new Error(err?.message || '카톡으로 보내지 못했어요.');
  }

  return wentToKakao();
}

/**
 * 카톡 말고 다른 데로 보내기.
 *
 * 폰에서는 공유 창이 뜨고(문자·메일·아무 앱), 안 되는 곳에서는 주소를 복사한다.
 * 돌려주는 값은 무엇을 했는지다 — 부르는 쪽이 '복사했어요'를 띄울지 정한다.
 */
export async function shareInvite({ familyName, code }) {
  const url = inviteUrl(code);
  const text = `${familyName} 가족에 초대합니다. 초대 코드 ${code}`;

  // 앱에서는 폰의 공유 창을 네이티브로 연다.
  //
  // 안드로이드 웹뷰에는 navigator.share가 없다. 그래서 앱에서는 아래 웹 길이 통째로
  // 건너뛰어지고 '복사했어요'로 끝났는데, 초대는 보내는 일이지 복사하는 일이 아니다.
  // 이 창에는 카톡도 들어 있어서, 카카오 SDK가 막힌 날에도 카톡으로 보낼 수 있다.
  if (isNativeApp()) {
    try {
      const { Share } = await import('@capacitor/share');
      await Share.share({ title: '모아콘 가족 초대', text, url, dialogTitle: '초대 링크 보내기' });
      return 'shared';
    } catch (err) {
      // 사용자가 창을 닫은 것은 실패가 아니다.
      if (/cancel/i.test(err?.message || '')) return 'cancelled';
      // 그 밖의 실패는 아래 복사로 물러선다.
    }
  }

  if (navigator.share) {
    try {
      await navigator.share({ title: '모아콘 가족 초대', text, url });
      return 'shared';
    } catch (err) {
      // 사용자가 공유 창을 닫은 것은 실패가 아니다. 아무 말도 하지 않는다.
      if (err?.name === 'AbortError') return 'cancelled';
    }
  }

  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    return 'copied';
  } catch {
    throw new Error('링크를 복사하지 못했어요.');
  }
}

/** 앱에서는 카톡 공유가 더 나은 길이라 먼저 보여준다. 웹에서도 되지만 굳이 가리지 않는다. */
export function prefersKakao() {
  return isNativeApp() || /Android|iPhone|iPad/i.test(navigator.userAgent);
}
