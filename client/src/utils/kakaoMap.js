// 카카오 지도 JS SDK를 필요할 때 한 번만 불러온다. 매장 상세를 열 때만 쓰는데
// 처음부터 번들에 넣어두면 앱이 무거워지므로, 열리는 순간 script 태그로 붙인다.
//
// JavaScript 키는 REST 키와 달리 브라우저에 노출되는 것이 전제인 키다(카카오
// 개발자센터에 등록한 사이트 도메인에서만 동작하도록 묶인다). 그래서 VITE_ 환경변수로
// 클라이언트에 넣어도 된다.

let loadPromise = null;

export function loadKakaoMap() {
  // 이미 로드돼 있으면(또는 테스트가 가짜를 심어뒀으면) 그대로 쓴다.
  if (typeof window !== 'undefined' && window.kakao?.maps?.Map) {
    return Promise.resolve(window.kakao);
  }

  const key = import.meta.env.VITE_KAKAO_JS_KEY;
  if (!key) return Promise.resolve(null);

  if (!loadPromise) {
    loadPromise = new Promise((resolve) => {
      const script = document.createElement('script');
      // autoload=false: SDK가 문서 로드 시점을 놓쳐도 kakao.maps.load()로 직접 초기화한다.
      script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${key}&autoload=false`;
      script.onload = () => window.kakao.maps.load(() => resolve(window.kakao));
      script.onerror = () => {
        // 실패를 기억해두면 네트워크가 돌아와도 영영 못 쓰니, 다음에 다시 시도하게 비운다.
        loadPromise = null;
        resolve(null);
      };
      document.head.appendChild(script);
    });
  }
  return loadPromise;
}
