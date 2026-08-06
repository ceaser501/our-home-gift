// ⚠️ 테스트 전용. 목데이터 기프티콘에 붙일 썸네일을 그려서 만든다.
// 실사용 배포 전에 client/src/sampleData.js와 함께 지운다.
//
// 왜 그림을 그리는가: 목록을 스크린샷으로 찍어 브로셔에 넣어야 하는데, 썸네일 자리가
// 전부 회색 상자면 화면이 비어 보인다. 실제로 쓸 때는 사용자가 올린 기프티콘 사진에서
// 상품 부분만 잘라낸 것이 들어가는 자리다.
//
// 실제 브랜드 로고나 상품 사진은 쓰지 않는다. 남의 상표를 우리 화면에 얹어 홍보물로
// 내보내는 셈이 되고, 브로셔는 밖으로 나가는 물건이라 더 조심해야 한다. 대신 무엇을
// 받았는지 알아볼 만한 그림을 직접 그린다 — 커피잔, 치킨, 피자, 케이크, 상품권 리본.
// 상호는 카드에 글자로 이미 적혀 있어서, 그림까지 브랜드를 흉내 낼 이유가 없다.
//
// SVG가 아니라 캔버스로 그려 PNG로 내보내는 이유: 이미지 버킷이 받는 형식이
// jpeg/png/webp/heic/heif로 제한돼 있다(supabase/schema.sql).

// 목록 썸네일은 화면에서 68px로 보인다. 고해상도 화면을 감안해도 이 정도면 넉넉하다.
const SIZE = 320;

// 분류마다 바탕색 한 쌍(위/아래)과 그림을 정해둔다. 색은 앱의 보라와 부딪히지 않게
// 채도를 낮춰 잡았다 — 목록에서 붉은 기한 칩이 가장 눈에 띄어야 한다.
const LOOKS = {
  coffee: { from: '#e8ddd0', to: '#d8c7b4', ink: '#6b5443', draw: drawCoffee },
  chicken: { from: '#f6e3d2', to: '#eccbab', ink: '#8a5626', draw: drawChicken },
  pizza: { from: '#f7e2d6', to: '#efc7b3', ink: '#9c4b2e', draw: drawPizza },
  cake: { from: '#f4dfe4', to: '#e8c3cd', ink: '#8f4f63', draw: drawCake },
  voucher: { from: '#dfe3ef', to: '#c6cee1', ink: '#4a5877', draw: drawVoucher },
  store: { from: '#dceae2', to: '#c0d8ca', ink: '#3f6b53', draw: drawStore },
  movie: { from: '#e0dfee', to: '#c8c5e2', ink: '#514c7d', draw: drawMovie },
};

function rounded(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---- 그림들. 좌표는 320×320 기준이고, 선을 굵게 잡아 68px로 줄여도 뭉개지지 않게 한다.
function drawCoffee(ctx, ink) {
  ctx.fillStyle = ink;
  // 컵 몸통(위가 넓은 사다리꼴)
  ctx.beginPath();
  ctx.moveTo(112, 116);
  ctx.lineTo(208, 116);
  ctx.lineTo(194, 232);
  ctx.quadraticCurveTo(192, 244, 180, 244);
  ctx.lineTo(140, 244);
  ctx.quadraticCurveTo(128, 244, 126, 232);
  ctx.closePath();
  ctx.fill();
  // 뚜껑
  rounded(ctx, 102, 98, 116, 26, 13);
  ctx.fill();
  // 김 두 줄
  ctx.strokeStyle = ink;
  ctx.lineWidth = 9;
  ctx.lineCap = 'round';
  for (const x of [140, 180]) {
    ctx.beginPath();
    ctx.moveTo(x, 78);
    ctx.quadraticCurveTo(x + 14, 62, x, 46);
    ctx.stroke();
  }
}

function drawChicken(ctx, ink) {
  ctx.fillStyle = ink;
  // 닭다리 살
  ctx.beginPath();
  ctx.ellipse(140, 132, 62, 54, -0.5, 0, Math.PI * 2);
  ctx.fill();
  // 뼈
  ctx.strokeStyle = ink;
  ctx.lineWidth = 22;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(168, 160);
  ctx.lineTo(218, 220);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(228, 232, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(206, 244, 18, 0, Math.PI * 2);
  ctx.fill();
}

function drawPizza(ctx, ink) {
  ctx.fillStyle = ink;
  // 한 조각(위가 좁은 삼각형)
  ctx.beginPath();
  ctx.moveTo(160, 76);
  ctx.lineTo(238, 226);
  ctx.quadraticCurveTo(160, 262, 82, 226);
  ctx.closePath();
  ctx.fill();
  // 토핑은 바탕색으로 뚫어서 표현한다(색을 하나 더 쓰지 않는다).
  ctx.globalCompositeOperation = 'destination-out';
  for (const [x, y, r] of [[148, 150, 15], [186, 186, 13], [136, 200, 12], [178, 128, 10]]) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

function drawCake(ctx, ink) {
  ctx.fillStyle = ink;
  // 몸통 2층
  rounded(ctx, 92, 158, 136, 78, 12);
  ctx.fill();
  rounded(ctx, 106, 118, 108, 46, 12);
  ctx.fill();
  // 초
  ctx.fillRect(154, 72, 12, 42);
  ctx.beginPath();
  ctx.ellipse(160, 62, 10, 15, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawVoucher(ctx, ink) {
  ctx.fillStyle = ink;
  // 상품권 몸통
  rounded(ctx, 74, 122, 172, 108, 14);
  ctx.fill();
  // 리본 세로띠 — 바탕색으로 뚫는다
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillRect(148, 122, 24, 108);
  ctx.globalCompositeOperation = 'source-over';
  // 리본 매듭
  ctx.beginPath();
  ctx.moveTo(160, 104);
  ctx.quadraticCurveTo(118, 66, 106, 92);
  ctx.quadraticCurveTo(98, 116, 160, 118);
  ctx.quadraticCurveTo(222, 116, 214, 92);
  ctx.quadraticCurveTo(202, 66, 160, 104);
  ctx.fill();
}

function drawStore(ctx, ink) {
  ctx.fillStyle = ink;
  // 차양
  rounded(ctx, 72, 96, 176, 40, 10);
  ctx.fill();
  // 가게 몸통
  ctx.fillRect(88, 142, 144, 98);
  // 문 — 뚫어서
  ctx.globalCompositeOperation = 'destination-out';
  rounded(ctx, 134, 172, 52, 68, 8);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
}

function drawMovie(ctx, ink) {
  ctx.fillStyle = ink;
  rounded(ctx, 66, 118, 188, 104, 14);
  ctx.fill();
  // 티켓 가운데 잘록한 자리 — 위아래를 반원으로 뚫는다
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(160, 118, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(160, 222, 22, 0, Math.PI * 2);
  ctx.fill();
  // 점선
  for (let y = 140; y < 206; y += 18) {
    ctx.fillRect(154, y, 12, 9);
  }
  ctx.globalCompositeOperation = 'source-over';
}

// 그림 하나를 PNG 파일로 만든다. 캔버스를 쓸 수 없는 곳(서버 렌더 등)에서는 null.
export async function makeSampleThumb(look) {
  const spec = LOOKS[look];
  if (!spec || typeof document === 'undefined') return null;

  try {
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // 바탕: 위에서 아래로 아주 옅게 흐른다. 단색이면 종이처럼 납작해 보인다.
    const bg = ctx.createLinearGradient(0, 0, 0, SIZE);
    bg.addColorStop(0, spec.from);
    bg.addColorStop(1, spec.to);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, SIZE, SIZE);

    // 그림은 살짝 투명하게 얹는다. 바탕과 대비가 너무 세면 68px에서 도장처럼 보인다.
    ctx.globalAlpha = 0.9;
    spec.draw(ctx, spec.ink);
    ctx.globalAlpha = 1;

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    canvas.width = 0;
    canvas.height = 0;
    if (!blob) return null;

    return new File([blob], `sample-${look}.png`, { type: 'image/png' });
  } catch {
    // 그림을 못 만들어도 기프티콘은 들어가야 한다. 썸네일만 비고 나머지는 그대로다.
    return null;
  }
}
