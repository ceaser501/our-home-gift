// 카카오 지도 JS SDK를 필요할 때 한 번만 불러온다. 매장 상세를 열 때만 쓰는데
// 처음부터 번들에 넣어두면 앱이 무거워지므로, 열리는 순간 script 태그로 붙인다.
//
// JavaScript 키는 REST 키와 달리 브라우저에 노출되는 것이 전제인 키다(카카오
// 개발자센터에 등록한 사이트 도메인에서만 동작하도록 묶인다). 그래서 VITE_ 환경변수로
// 클라이언트에 넣어도 된다.

import { isNativeApp } from './browser';

let loadPromise = null;

// script 태그의 onerror는 "안 됐다"만 알려준다. 401인지, 인터넷이 끊긴 건지, 주소를
// 잘못 적은 건지 구별이 안 된다. 도메인을 등록했는데도 계속 안 되는 상황에서는 그
// 구별이 전부라서, 앱에서는 한 번 더 물어본다.
//
// CapacitorHttp는 웹뷰가 아니라 네이티브가 부른다. 그래서 CORS에 막히지 않고 상태
// 코드와 본문을 그대로 읽을 수 있다. 대신 웹뷰가 보내던 Referer가 안 실리므로 직접
// 넣는다 — 카카오가 도메인을 판정하는 근거가 그 헤더다.
// CapacitorHttp는 응답이 JSON이면 responseType과 무관하게 객체로 바꿔서 준다. 그걸
// String()에 넣었더니 화면에 "[object Object]"만 찍혔다 — 정작 알고 싶던 말이 그 안에
// 들어 있었는데. 객체면 풀어서 적는다.
function describe(data) {
  if (!data) return '';
  const text =
    typeof data === 'string' ? data : data.message || data.msg || data.errorType || JSON.stringify(data);
  const trimmed = String(text).replace(/\s+/g, ' ').trim().slice(0, 200);
  return trimmed ? ` ${trimmed}` : '';
}

async function askWhy(src) {
  if (!isNativeApp()) return null;
  try {
    const { CapacitorHttp } = await import('@capacitor/core');
    const res = await CapacitorHttp.get({
      url: src,
      headers: { Referer: `${window.location.origin}/` },
      responseType: 'text',
    });
    if (res.status >= 200 && res.status < 300) {
      // 주소로는 받아지는데 웹뷰에서만 막힌다는 뜻이다. 도메인 문제가 아니다.
      return `주소로는 받아지는데(${res.status}) 화면에서만 막혀요.`;
    }
    return `카카오가 ${res.status}로 돌려줬어요.${describe(res.data)}`;
  } catch (err) {
    return `카카오 주소에 닿지 못했어요. ${err?.message || ''}`.trim();
  }
}

// 왜 안 떴는지를 같이 돌려준다.
//
// 예전에는 실패하면 그냥 null이었다. 앱에서 지도가 안 나오는데 화면에는 "키와 도메인
// 등록이 필요해요"만 떠서, 키가 없는 건지 도메인이 안 맞는 건지 알 길이 없었다.
// 실제로는 후자였다 — 앱은 화면을 https://localhost 에서 여는데(Capacitor 기본값)
// 개발자센터에는 github.io만 등록돼 있었다.
//
// 그래서 "어느 주소를 등록해야 하는지"를 화면이 직접 말하게 한다. 그게 다음에 할 일이다.
export function loadKakaoMap() {
  // 이미 로드돼 있으면(또는 테스트가 가짜를 심어뒀으면) 그대로 쓴다.
  if (typeof window !== 'undefined' && window.kakao?.maps?.Map) {
    return Promise.resolve({ kakao: window.kakao, reason: null });
  }

  const key = import.meta.env.VITE_KAKAO_JS_KEY;
  if (!key) {
    return Promise.resolve({ kakao: null, reason: '카카오 JavaScript 키(VITE_KAKAO_JS_KEY)가 없어요.' });
  }

  if (!loadPromise) {
    loadPromise = new Promise((resolve) => {
      // 어떤 길로 끝나든 약속은 반드시 한 번 끝나야 한다.
      //
      // 예전에는 onload 안에서 window.kakao를 바로 팠다. 카카오가 도메인을 거절하면
      // 오류 본문이 스크립트로 실려 와서 onload가 불리는데 window.kakao는 없다 —
      // 그 줄에서 터지고, onerror도 안 불리니 약속이 영영 안 끝났다. 화면은 「지도를
      // 불러오는 중…」에 그대로 멈췄고 이유조차 못 보여줬다. 아이폰에서 그랬다.
      let settled = false;
      const done = (value) => {
        if (settled) return;
        settled = true;
        if (value.kakao === null) loadPromise = null; // 다음에 다시 시도할 수 있게
        clearTimeout(timer);
        resolve(value);
      };

      // 스크립트가 성공도 실패도 아닌 채로 멈추는 경우까지 받아낸다.
      //
      // 그냥 "응답하지 않아요"로 끝내면 무엇을 고쳐야 하는지 알 수 없다 — 인터넷이 느린
      // 건지, 도메인이 안 맞아 카카오가 막은 건지 구별이 안 된다. 그래서 여기서도
      // 네이티브로 한 번 더 물어보고(askWhy), 지금 주소와 함께 적는다. 주소가 틀렸으면
      // 그 한 줄로 바로 드러난다.
      const timer = setTimeout(async () => {
        const why = await askWhy(script.src);
        done({
          kakao: null,
          reason:
            `카카오 지도가 응답하지 않아요. 지금 주소는 ${window.location.origin} 이에요.` +
            (why ? ` ${why}` : ''),
        });
      }, 10000);

      const script = document.createElement('script');
      // autoload=false: SDK가 문서 로드 시점을 놓쳐도 kakao.maps.load()로 직접 초기화한다.
      script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${key}&autoload=false`;
      script.onload = async () => {
        if (window.kakao?.maps?.load) {
          window.kakao.maps.load(() => done({ kakao: window.kakao, reason: null }));
          return;
        }
        // 받아지긴 했는데 SDK가 아니다. 거의 언제나 도메인 거절이라 이유를 물어본다.
        const why = await askWhy(script.src);
        done({
          kakao: null,
          reason:
            `카카오 지도를 불러오지 못했어요. 지금 주소는 ${window.location.origin} 이에요.` +
            (why ? ` ${why}` : ''),
        });
      };
      script.onerror = async () => {
        const why = await askWhy(script.src);
        done({
          kakao: null,
          reason:
            `카카오 지도를 불러오지 못했어요. 지금 주소는 ${window.location.origin} 이에요.` +
            (why ? ` ${why}` : ''),
        });
      };
      document.head.appendChild(script);
    });
  }
  return loadPromise;
}
