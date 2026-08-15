// 카카오 지도 JS SDK를 필요할 때 한 번만 불러온다. 매장 상세를 열 때만 쓰는데
// 처음부터 번들에 넣어두면 앱이 무거워지므로, 열리는 순간 script 태그로 붙인다.
//
// JavaScript 키는 REST 키와 달리 브라우저에 노출되는 것이 전제인 키다(카카오
// 개발자센터에 등록한 사이트 도메인에서만 동작하도록 묶인다). 그래서 VITE_ 환경변수로
// 클라이언트에 넣어도 된다.

let loadPromise = null;

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
      const script = document.createElement('script');
      // autoload=false: SDK가 문서 로드 시점을 놓쳐도 kakao.maps.load()로 직접 초기화한다.
      script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${key}&autoload=false`;
      script.onload = () => window.kakao.maps.load(() => resolve({ kakao: window.kakao, reason: null }));
      script.onerror = () => {
        // 실패를 기억해두면 네트워크가 돌아와도 영영 못 쓰니, 다음에 다시 시도하게 비운다.
        loadPromise = null;
        // script 태그는 401인지 네트워크가 끊긴 건지 알려주지 않는다. 다만 등록 안 된
        // 도메인에서 부르는 것이 압도적으로 흔하므로, 지금 주소를 그대로 보여준다.
        resolve({
          kakao: null,
          reason: `카카오 지도를 불러오지 못했어요. 개발자센터 → 플랫폼 → Web 에 ${window.location.origin} 이(가) 등록돼 있어야 해요.`,
        });
      };
      document.head.appendChild(script);
    });
  }
  return loadPromise;
}
