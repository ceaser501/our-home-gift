import { useId } from 'react';

// 앱 아이콘과 같은 그림(하트 매듭을 얹은 선물상자)을 화면 안에서 쓰는 버전.
// 런처 아이콘 파일(client/public/icon.svg)과 다른 점이 둘 있다.
//  - 여기서는 모서리를 직접 굴린다. 런처 아이콘은 iOS·안드로이드가 알아서 깎아주기 때문에
//    파일에 라운딩을 넣으면 두 번 깎여 지저분해지지만, 화면 안에 놓이는 로고는 아무도 안 깎아준다.
//  - 그레인(노이즈)은 뺐다. 28px짜리 헤더 로고에서는 보이지도 않으면서 필터 비용만 든다.
export default function Logo({ className }) {
  // 한 화면에 로고가 여러 개 놓여도 그라데이션 id가 부딪히지 않게 컴포넌트마다 다른 값을 쓴다.
  const id = useId();
  const bg = `${id}-bg`;
  const glow = `${id}-glow`;
  const lid = `${id}-lid`;
  const body = `${id}-body`;
  const ribbon = `${id}-ribbon`;

  return (
    <svg
      viewBox="0 0 512 512"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={bg} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8A5CFF" />
          <stop offset="1" stopColor="#E8579B" />
        </linearGradient>
        <radialGradient id={glow} cx="18%" cy="12%" r="78%">
          <stop offset="0" stopColor="#C79BFF" stopOpacity=".95" />
          <stop offset="1" stopColor="#C79BFF" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={lid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#FFF0F8" />
        </linearGradient>
        <linearGradient id={body} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFE7F3" />
          <stop offset="1" stopColor="#FFC9E2" />
        </linearGradient>
        {/* 리본은 색을 칠하지 않고 배경이 비쳐 보이도록 몸통을 파낸다. */}
        <mask id={ribbon}>
          <rect width="512" height="512" fill="#fff" />
          <rect x="248" y="256" width="16" height="150" fill="#000" />
        </mask>
      </defs>

      <rect width="512" height="512" rx="114" fill={`url(#${bg})`} />
      <rect width="512" height="512" rx="114" fill={`url(#${glow})`} />

      {/* 런처 아이콘은 안드로이드가 원형으로 깎아내는 걸 감안해 상자를 작게 그렸다.
          화면 안 로고는 아무도 깎지 않으므로 그 여백이 그대로 남아 상자가 작아 보인다.
          도형을 다시 그리는 대신 여기서만 키운다(그림 한가운데를 축으로). */}
      <g transform="translate(256 257) scale(1.2) translate(-256 -257)">
        {/* 몸통. 윗변은 각지게 둬야 뚜껑이 얹힌 것으로 읽힌다. */}
        <path
          d="M146 262H366V380A20 20 0 0 1 346 400H166A20 20 0 0 1 146 380Z"
          fill={`url(#${body})`}
          mask={`url(#${ribbon})`}
        />
        {/* 뚜껑. 몸통보다 넓게 빼서 턱을 만든다. */}
        <rect x="118" y="196" width="276" height="66" rx="18" fill={`url(#${lid})`} />
        {/* 하트 매듭. 아래 꼭짓점이 뚜껑을 파고들어 얹힌 것처럼 붙는다. */}
        <path
          d="M256 206C256 206 198 172 198 142C198 124 212 114 226 114C238 114 249 121 256 130C263 121 274 114 286 114C300 114 314 124 314 142C314 172 256 206 256 206Z"
          fill="#fff"
        />
      </g>
    </svg>
  );
}
