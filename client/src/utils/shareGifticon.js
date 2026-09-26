import { isNativeApp } from './browser';

// 기프티콘을 앱 밖으로 보낸다. 카톡이든 문자든, 폰의 공유 창이 받아준다.
//
// ── 왜 필요한가 ──────────────────────────────────────────────────────────────
// 모아콘을 안 쓰는 사람에게 기프티콘을 넘겨줄 일이 있다. 지금은 그때 앱을 나가서
// 사진첩을 뒤지거나, 바코드 창을 다시 캡처한다. 원본을 우리가 들고 있는데도 그렇다.
//
// ── 왜 바코드를 다시 안 그리나 ──────────────────────────────────────────────
// 우리는 code와 code_type으로 막대를 다시 그릴 수 있다(BarcodeModal). 그런데 그렇게
// 만든 그림을 남에게 보내는 것은 다른 이야기다. 기프티콘에 따라 막대 말고도 교환처
// 안내나 쿠폰번호가 같이 찍혀 있어야 받아주는 곳이 있어서, 막대만 새로 그려 보내면
// 매장에서 안 되는 경우가 생긴다.
//
// **한 장이라도 안 되면 그건 '선물했는데 못 썼다'가 된다.** 기프티콘에서 제일 나쁜
// 실패라, 원본을 그대로 보낸다.
//
// ── 대신 연보라 액자에 넣는다 ───────────────────────────────────────────────
// 원본 위에 로고와 '모아콘에서 보낸 선물' 띠를 붙이고, 둘레에 같은 연보라 여백을 두른다.
// 받는 사람은 이게 어디서 온 것인지 알게 된다.
//
// 연보라인 것은 로고 때문이다. 로고가 보라 사각형이라 진한 보라 띠 위에서는 묻혔다.
// 초대 화면 머리와 같은 색이다.
//
// ── 원본은 **자르기만** 한다 ────────────────────────────────────────────────
// 늘리거나 줄여서 모양을 바꾸지 않는다. 바코드가 뭉개진다. 잘라내는 것은 둘이다.
//
//   - 폰 화면째 캡처한 것의 위아래 검은 여백 (trimLetterbox)
//   - 카톡 선물함 캡처의 노란 액자 (cropFrame) — 카카오의 노랑이라, 우리가 보낸 선물에
//     남의 브랜드가 둘려 있는 꼴이 된다
//
// 자르는 자리는 카드 바깥뿐이다. 카드 안쪽 — 바코드가 있는 자리 — 은 한 획도 안 건드린다.

const BAND_TEXT = '모아콘에서 보낸 선물';
const BAND_SUB = '가족 기프티콘 서랍';

// 초대 화면 머리와 같은 연보라(index.css --accent)와 글자색.
const FRAME = '#F0EFFF';
const FRAME_RGB = [0xF0, 0xEF, 0xFF];
const INK = '#1C1E27';
const INK_SOFT = '#6B6E7E';

// 너무 큰 원본은 줄여서 보낸다. 카톡이 어차피 다시 줄이고, 파일이 크면 보내는 데
// 시간이 걸린다. 바코드가 뭉개지지 않을 만큼은 남긴다. 가로세로 비율은 그대로다.
const MAX_EDGE = 1400;

// 사진을 그릴 수 있는 꼴로 펼친다. 못 펼치면 null — 띠 없이 원본을 보낸다.
//
// ⚠️ 여기에 시간 제한이 있는 이유.
//
// <img>는 주소가 잘못됐을 때 onload도 onerror도 안 오는 경우가 있다. 그러면 이 함수가
// 영영 안 끝나고, 화면은 '잠시만 기다려 주세요…'에 갇힌다. 소셜 로그인에서 같은 모양으로 갇힌
// 적이 있다(LoginScreen). 돌아오지 않는 길은 만들지 않는다.
async function decode(blob) {
  try {
    if (typeof createImageBitmap === 'function') return await createImageBitmap(blob);
  } catch {
    // 아래 <img>로 내려간다.
  }
  const src = URL.createObjectURL(blob);
  try {
    return await loadImage(src);
  } finally {
    URL.revokeObjectURL(src);
  }
}

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    const done = (value) => {
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => done(null), 5000);
    img.onload = () => done(img);
    img.onerror = () => done(null);
    img.src = src;
  });
}

// 앱 로고. 화면 안 로고(Logo.jsx)와 같은 그림으로, 모서리가 이미 둥글다.
// 한 번 받아 두고 다시 쓴다. 못 받으면 로고 없이 글자만 그린다.
let logoPromise = null;
function loadLogo() {
  if (!logoPromise) {
    const base = (import.meta.env && import.meta.env.BASE_URL) || '/';
    logoPromise = loadImage(`${base}icon.svg`);
  }
  return logoPromise;
}

/**
 * 원본을 연보라 액자에 넣은 그림을 만든다. 못 만들면 null.
 *
 * 받은 blob으로 그린다 — 주소로 한 번 더 받아오지 않는다. 같은 사진을 두 번 내려받는
 * 셈이고, 서명된 주소라 두 번째가 만료됐을 수도 있다.
 */
export async function composeShareImage(blob) {
  // 그릴 자리부터 본다. 못 그리는 환경(시험의 jsdom, 아주 오래된 웹뷰)에서 사진을
  // 먼저 펼치면, 어차피 버릴 것을 펼치느라 시간만 쓴다.
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext?.('2d');
  if (!ctx) return null;

  const [img, logo] = await Promise.all([decode(blob), loadLogo()]);
  if (!img) return null;

  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  if (!srcW || !srcH) return null;

  // 줄일 때도 가로세로를 같은 배율로 줄인다. 모양은 그대로다.
  const scale = Math.min(1, MAX_EDGE / Math.max(srcW, srcH));
  const fullW = Math.max(1, Math.round(srcW * scale));
  const fullH = Math.max(1, Math.round(srcH * scale));

  const src = document.createElement('canvas');
  src.width = fullW;
  src.height = fullH;
  const sctx = src.getContext('2d');
  if (!sctx) return null;
  sctx.imageSmoothingEnabled = true;
  sctx.imageSmoothingQuality = 'high';
  sctx.drawImage(img, 0, 0, fullW, fullH);

  // 자르기 둘. 먼저 검은 여백, 그 안에서 카톡 액자.
  const box = trimLetterbox(sctx, fullW, fullH);
  const inner = cropFrame(sctx, box.x, box.y, box.w, box.h, FRAME_RGB);
  if (inner) {
    box.x += inner.x;
    box.y += inner.y;
    box.w = inner.w;
    box.h = inner.h;
  }
  const w = box.w;
  const h = box.h;

  // ── 크기의 기준 ──────────────────────────────────────────────────────────
  // 띠·여백·글자를 사진 너비만 따라가게 두었더니, 세로로 긴 사진에서 글자가 작았다.
  // 받는 쪽은 사진을 화면(또는 말풍선)에 **통째로 맞춰** 보는데, 긴 사진은 높이에 맞춰
  // 줄어들어서 너비 기준 글자가 같이 작아진다.
  //
  // 그래서 기준을 '너비'와 '높이를 1.6으로 나눈 것' 중 큰 쪽으로 잡는다. 1.6은 대화방
  // 말풍선이 세로로 받아주는 비율쯤이다. 너무 길쭉한 사진에서 글자가 사진 폭을 넘지
  // 않게 너비의 1.6배에서 멈춘다.
  const unit = Math.min(w * 1.6, Math.max(w, h / 1.6));

  const pad = Math.round(unit * 0.035);
  const band = Math.round(unit * 0.2);
  canvas.width = w + pad * 2;
  canvas.height = band + h + pad;

  ctx.fillStyle = FRAME;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(src, box.x, box.y, w, h, pad, band, w, h);

  drawHeader(ctx, canvas.width, band, unit, logo);

  return new Promise((resolve) => canvas.toBlob((out) => resolve(out), 'image/jpeg', 0.92));
}

// 머리: [로고] 모아콘에서 보낸 선물 / 가족 기프티콘 서랍
//
// 로고는 두 줄을 합친 높이로 왼쪽에 서고, 글자는 그 오른쪽에 왼쪽 맞춤으로 선다.
// 묶음 전체를 가운데에 놓는다. 글자가 폭을 넘치면 묶음째 줄인다.
//
// 세로로는 띠의 한가운데보다 조금 아래(55%)다. 위쪽은 폰에서 카메라 구멍과 상태 바가
// 덮는 자리라, 딱 가운데여도 글자가 위로 붙어 보였다.
function drawHeader(ctx, width, band, unit, logo) {
  const family =
    "'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', -apple-system, sans-serif";
  let big = unit * 0.05;
  let small = unit * 0.034;

  const measure = () => {
    ctx.font = `700 ${big}px ${family}`;
    const t1 = ctx.measureText(BAND_TEXT).width;
    ctx.font = `500 ${small}px ${family}`;
    const t2 = ctx.measureText(BAND_SUB).width;
    const lineGap = big * 0.3;
    const logoSize = logo ? Math.round(big + lineGap + small) : 0;
    const gap = logo ? big * 0.5 : 0;
    return { textW: Math.max(t1, t2), logoSize, gap, lineGap, total: logoSize + gap + Math.max(t1, t2) };
  };

  let m = measure();
  const room = width * 0.86;
  if (m.total > room) {
    const k = room / m.total;
    big *= k;
    small *= k;
    m = measure();
  }

  const blockH = big + m.lineGap + small;
  const top = band * 0.55 - blockH / 2;
  const left = (width - m.total) / 2;

  if (logo) ctx.drawImage(logo, left, top, m.logoSize, m.logoSize);

  const textX = left + m.logoSize + m.gap;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  ctx.fillStyle = INK;
  ctx.font = `700 ${big}px ${family}`;
  ctx.fillText(BAND_TEXT, textX, top - big * 0.05);

  // 아랫줄은 한 단 흐리게. 같은 색으로 두면 두 줄이 한 덩어리로 뭉쳐 읽힌다.
  ctx.fillStyle = INK_SOFT;
  ctx.font = `500 ${small}px ${family}`;
  ctx.fillText(BAND_SUB, textX, top + big + m.lineGap - small * 0.05);
}

// 사진 위아래의 검은 여백을 잘라낸다. 자를 것이 없으면 사진 전체.
//
// 기프티콘을 폰 화면째로 캡처해 두면 세로로 긴 화면에 맞춰 위아래가 까맣게 채워진다.
// 그 검은 덩어리가 액자 안에 그대로 들어가서 사진이 덜 잘린 것처럼 보였다.
//
// **자르기만 한다.** 남은 부분은 한 픽셀도 안 바뀌고, 사진 비율만 달라진다.
//
// 거의 모든 칸이 까만 줄만 자른다(1%까지는 압축 잡음으로 본다). 글자가 한 줄이라도
// 박힌 까만 머리는 내용이라 안 자른다. 다 자르고 3할도 안 남으면 까만 사진일 뿐이라
// 손대지 않는다.
export function trimLetterbox(ctx, w, h) {
  const whole = { x: 0, y: 0, w, h };
  let d;
  try {
    d = ctx.getImageData(0, 0, w, h).data;
  } catch {
    return whole;
  }
  const DARK = 40;
  const blackRow = (y) => {
    let n = 0;
    for (let o = y * w * 4, end = o + w * 4; o < end; o += 4) {
      if ((d[o] > DARK || d[o + 1] > DARK || d[o + 2] > DARK) && ++n > w * 0.01) return false;
    }
    return true;
  };

  let top = 0;
  let bottom = h - 1;
  while (top < bottom && blackRow(top)) top++;
  while (bottom > top && blackRow(bottom)) bottom--;

  const ch = bottom - top + 1;
  if (ch < h * 0.3) return whole;
  return { x: 0, y: top, w, h: ch };
}

// 사진 바깥에 둘린 액자를 찾아, 잘라낼 자리를 돌려준다. 못 찾으면 null.
// 돌려주는 자리는 (x, y) 기준의 상대 좌표다.
//
// ── 왜 ──────────────────────────────────────────────────────────────────────
// 카톡 선물함 캡처에는 노란 액자가 둘려 있다. 처음에는 그 노랑을 보라로 칠했는데,
// 칠한 액자만큼 사진이 작아 보였고, 위쪽에 칠한 자리가 띠와 이어져 머리가 붕 떴다.
// 액자를 잘라내면 카드가 여백까지 꽉 차서 다른 기프티콘과 같은 크기로 보인다.
//
// ── ⚠️ 원본을 건드리는 자리다 ───────────────────────────────────────────────
// 바코드가 든 카드 안쪽을 한 픽셀이라도 바꾸면 '원본을 그대로 보낸다'는 약속이 깨진다.
// 그래서 가장자리에서만 번져 들어가고(flood fill), 아래 넷 중 하나라도 어긋나면
// **아무것도 안 하고 물러선다.**
//
//   1. 네 모서리 색이 서로 같아야 한다        — 액자가 아니면 색이 제각각이다
//   2. 흰색·검정에 가까우면 안 한다           — 사진 배경일 뿐일 수 있다
//   3. 번진 넓이가 절반을 넘으면 안 된다      — 액자는 테두리지 바탕이 아니다
//   4. 한가운데까지 번지면 안 된다            — 거기까지 갔으면 액자가 아니다
//
// ── 번진 곳이 다 액자는 아니다 ──────────────────────────────────────────────
// 카톡은 상품 사진을 액자와 **같은 노랑** 위에 얹는다(상품 그림이 투명 배경). 번지기는
// 그 둘을 못 가른다 — 상품 둘레를 다 돌아 들어간다. 그래서 안 번진 것들(카드, 상품)을
// 감싸는 네모를 잡고, 그 안의 넓은 덩어리는 사진의 바탕으로 보고 남긴다. 상품 칸 위로는
// 액자 두께만큼 노랑을 더 남긴다 — 딱 맞추면 콜라 뚜껑이 윗변에 닿아 잘린 사진처럼 보인다.
//
// 네모 안의 좁은 덩어리(카드 옆구리의 반달 홈, 둥근 모서리 바깥)는 액자다. 자르고 나면
// 거기만 노랗게 남으므로 바탕색(rgb)으로 칠한다.
export function cropFrame(ctx, x, y, w, h, rgb) {
  let img;
  try {
    img = ctx.getImageData(x, y, w, h);
  } catch {
    // 다른 곳에서 온 그림이면 꺼낼 수 없다. 손대지 않는다.
    return null;
  }
  const d = img.data;
  const n = w * h;

  // 1. 네 모서리가 같은 색인가
  //
  // ⚠️ 맨 끝 픽셀에서 재지 않는다. 모서리는 둥글고, 안티앨리어싱과 jpeg 압축이 거기서
  // 제일 심하게 섞인다. 실제 카톡 캡처를 재봤더니 맨 끝 넷은 (248,220,59)부터
  // (117,100,134)까지 벌어졌는데, 3px만 안으로 들어가면 넷 다 (255,222,33) 언저리였다.
  const TOL = 26;
  const inset = Math.max(2, Math.round(Math.min(w, h) * 0.01));
  if (w <= inset * 2 || h <= inset * 2) return null;

  const probes = [
    (inset * w + inset) * 4,
    (inset * w + w - 1 - inset) * 4,
    ((h - 1 - inset) * w + inset) * 4,
    ((h - 1 - inset) * w + w - 1 - inset) * 4,
  ];
  let r = 0, g = 0, b = 0;
  for (const p of probes) { r += d[p]; g += d[p + 1]; b += d[p + 2]; }
  r = Math.round(r / 4); g = Math.round(g / 4); b = Math.round(b / 4);
  for (const p of probes) {
    if (Math.abs(d[p] - r) > TOL || Math.abs(d[p + 1] - g) > TOL || Math.abs(d[p + 2] - b) > TOL) return null;
  }

  // 2. 흰색이나 검정에 가까우면 손대지 않는다
  if ((r > 232 && g > 232 && b > 232) || (r < 26 && g < 26 && b < 26)) return null;

  // 3~4. 가장자리에서 번져 들어간다
  //
  // ⚠️ 기준색이 아니라 **바로 옆 픽셀**과 견준다. 액자는 단색이 아니다 — 카드 밑에
  // 그림자가 깔려서 같은 노랑이 (255,222,33)에서 (195,185,96)까지 흐른다. 옆 픽셀과
  // 견주면 그 경사를 따라가고, 카드에 닿는 순간 색이 한 번에 크게 튀어서 거기서 멈춘다.
  // FAR는 완만한 그라데이션을 타고 사진 속까지 걸어 들어가지 않게 두는 울타리다.
  //
  // 속도: 폰에서 이 한 단계가 3초 가까이 걸렸다(공유가 느리던 까닭). 한 칸에 다섯 값씩
  // 쌓던 것을 '어디로, 어디서' 두 정수만 쌓게 바꾸고, 판 밖이나 이미 번진 칸은 아예
  // 쌓지 않는다.
  const STEP = 30;
  const FAR = 90;
  const seen = new Uint8Array(n);
  const stack = [];
  for (let px = 0; px < w; px++) stack.push(px, -1, (h - 1) * w + px, -1);
  for (let py = 0; py < h; py++) stack.push(py * w, -1, py * w + w - 1, -1);

  const limit = n * 0.5;
  const center = ((h / 2) | 0) * w + ((w / 2) | 0);
  let count = 0;

  while (stack.length) {
    const from = stack.pop();
    const i = stack.pop();
    if (seen[i]) continue;
    const o = i * 4;
    const cr = d[o], cg = d[o + 1], cb = d[o + 2];
    let pr = r, pg = g, pb = b;
    if (from >= 0) { const f = from * 4; pr = d[f]; pg = d[f + 1]; pb = d[f + 2]; }
    if (Math.abs(cr - pr) > STEP || Math.abs(cg - pg) > STEP || Math.abs(cb - pb) > STEP) continue;
    if (Math.abs(cr - r) > FAR || Math.abs(cg - g) > FAR || Math.abs(cb - b) > FAR) continue;

    seen[i] = 1;
    if (++count > limit) return null;          // 3. 너무 넓다
    if (i === center) return null;             // 4. 한가운데까지 왔다

    const cx = i % w;
    if (cx > 0 && !seen[i - 1]) stack.push(i - 1, i);
    if (cx < w - 1 && !seen[i + 1]) stack.push(i + 1, i);
    if (i >= w && !seen[i - w]) stack.push(i - w, i);
    if (i < n - w && !seen[i + w]) stack.push(i + w, i);
  }
  if (!count) return null;

  // ── 안 번진 것들을 감싸는 네모 ─────────────────────────────────────────────
  // 안 번진 칸이 셋 이상인 줄과 칸으로만 잡는다. 액자에 박힌 압축 잡음 한두 점이
  // 네모를 끌어당기면 그 사이 액자가 '안쪽'이 되어 노란 줄로 남는다.
  const rows = new Uint32Array(h);
  const cols = new Uint32Array(w);
  for (let i = 0; i < n; i++) {
    if (seen[i]) continue;
    rows[(i / w) | 0]++;
    cols[i % w]++;
  }
  let minX = 0, maxX = w - 1, minY = 0, maxY = h - 1;
  while (minY < h && rows[minY] < 3) minY++;
  while (maxY >= 0 && rows[maxY] < 3) maxY--;
  while (minX < w && cols[minX] < 3) minX++;
  while (maxX >= 0 && cols[maxX] < 3) maxX--;
  if (minX > maxX || minY > maxY) return null;

  // ── 네모 안의 번진 덩어리를 나눈다 ────────────────────────────────────────
  // 넓으면 사진의 바탕(남긴다), 좁으면 액자 조각(칠한다).
  const BIG = Math.pow(w * 0.08, 2);
  const margin = Math.max(Math.min(minX, w - 1 - maxX), Math.round(w * 0.03));
  const keep = new Uint8Array(n);   // 1 = 셈, 2 = 남긴다
  const queue = new Int32Array(n);
  let top = minY, bottom = maxY;

  for (let sy = minY; sy <= maxY; sy++) {
    for (let sx = minX; sx <= maxX; sx++) {
      const start = sy * w + sx;
      if (!seen[start] || keep[start]) continue;

      let head = 0, tail = 0;
      queue[tail++] = start;
      keep[start] = 1;
      let lo = sx, hi = sx, cTop = sy, cBottom = sy;
      while (head < tail) {
        const at = queue[head++];
        const ax = at % w, ay = (at / w) | 0;
        if (ax < lo) lo = ax;
        if (ax > hi) hi = ax;
        if (ay < cTop) cTop = ay;
        if (ay > cBottom) cBottom = ay;
        if (ax > minX && seen[at - 1] && !keep[at - 1]) { keep[at - 1] = 1; queue[tail++] = at - 1; }
        if (ax < maxX && seen[at + 1] && !keep[at + 1]) { keep[at + 1] = 1; queue[tail++] = at + 1; }
        if (ay > minY && seen[at - w] && !keep[at - w]) { keep[at - w] = 1; queue[tail++] = at - w; }
        if (ay < maxY && seen[at + w] && !keep[at + w]) { keep[at + w] = 1; queue[tail++] = at + w; }
      }
      if (tail < BIG) continue;

      for (let q = 0; q < tail; q++) keep[queue[q]] = 2;
      // 네모 위(아래)로 넉넉히 — 덩어리가 네모의 그 변에 닿아 있을 때만
      if (cTop === minY) {
        const from = Math.max(0, minY - margin);
        for (let yy = from; yy < minY; yy++) for (let xx = lo; xx <= hi; xx++) keep[yy * w + xx] = 2;
        top = Math.min(top, from);
      }
      if (cBottom === maxY) {
        const to = Math.min(h - 1, maxY + margin);
        for (let yy = maxY + 1; yy <= to; yy++) for (let xx = lo; xx <= hi; xx++) keep[yy * w + xx] = 2;
        bottom = Math.max(bottom, to);
      }
    }
  }

  // 잘라낼 네모 안의 액자 조각만 바탕색으로 칠한다
  for (let yy = top; yy <= bottom; yy++) {
    for (let xx = minX; xx <= maxX; xx++) {
      const i = yy * w + xx;
      if (!seen[i] || keep[i] === 2) continue;
      const o = i * 4;
      d[o] = rgb[0]; d[o + 1] = rgb[1]; d[o + 2] = rgb[2]; d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, x, y);
  return { x: minX, y: top, w: maxX - minX + 1, h: bottom - top + 1 };
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      // data:image/jpeg;base64,XXXX 에서 뒤쪽만 쓴다.
      const text = String(reader.result || '');
      resolve(text.slice(text.indexOf(',') + 1));
    };
    reader.onerror = () => reject(new Error('사진을 준비하지 못했어요.'));
    reader.readAsDataURL(blob);
  });
}

// 파일 이름. 받는 사람 사진첩에 남는 이름이라 상품명을 넣는다.
//
// 경로에 쓸 수 없는 글자는 털어낸다. 한글은 그대로 둔다 — 안드로이드도 아이폰도 받는다.
function fileNameFor(name) {
  const clean = String(name || '기프티콘')
    .replace(/[\\/:*?"<>|]/g, '')
    .trim()
    .slice(0, 40);
  return `${clean || '기프티콘'}.jpg`;
}

/**
 * 보낼 파일을 미리 만든다. 사진 받기 + 액자 넣기 + (앱이면) 파일로 떨구기까지.
 *
 * ── 왜 미리 만드나 ──────────────────────────────────────────────────────────
 * 브라우저는 '누른 직후'에만 공유 창을 열어준다(사용자 활성화, 크롬은 5초쯤이고
 * 사파리는 더 짧다). 누르고 나서 사진을 받고 액자를 그리다 보면 그 시간이 지나서
 * 공유 창이 안 떴다. 다시 누르면 그때는 사진이 캐시에 있어 빨리 끝나니 창이 떴다 —
 * 2026-09-26 실기에서 "한 번 더 누르니 된다"로 나왔다.
 *
 * 그래서 ⋯ 메뉴가 열릴 때 미리 만들어 두고, 누르는 순간에는 창만 연다.
 */
export async function prepareShareImage({ url, name }) {
  // 사진은 한 번만 받아온다. 서명된 주소라 두 번째가 만료됐을 수도 있고, 같은 것을
  // 두 번 내려받을 이유도 없다.
  const original = await fetch(url).then((r) => r.blob());
  // 띠를 못 붙여도 보내는 일은 그대로 한다. 띠는 있으면 좋은 것이고, 기프티콘이
  // 건너가는 것이 이 기능이다.
  const blob = (await composeShareImage(original)) || original;
  const fileName = fileNameFor(name);

  if (isNativeApp()) {
    // 앱에서는 파일로 한 번 떨궈야 한다. 폰의 공유 창은 blob을 모르고 경로를 받는다.
    // 떨군 파일은 지우지 않는다. Cache라 폰이 알아서 치우고, 지우려 들면 받는 앱이
    // 아직 읽는 중일 때 빈 파일이 건너간다.
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const { uri } = await Filesystem.writeFile({
      path: `share/${Date.now()}-${fileName}`,
      data: await blobToBase64(blob),
      directory: Directory.Cache,
      recursive: true,
    });
    return { uri };
  }
  return { file: new File([blob], fileName, { type: blob.type || 'image/jpeg' }) };
}

/**
 * 미리 만든 파일로 폰의 공유 창을 연다. 무엇을 했는지 돌려준다 —
 * 'shared' | 'cancelled' | 'unsupported' | 'expired'
 *
 * 'expired'는 브라우저가 '누른 직후가 아니다'라며 막은 것이다. 파일은 준비됐으니
 * 한 번 더 누르면 바로 열린다. 부르는 쪽이 화면에 무엇을 적을지 정한다.
 */
export async function sharePrepared(prepared) {
  if (prepared.uri) {
    const { Share } = await import('@capacitor/share');
    try {
      await Share.share({ files: [prepared.uri], dialogTitle: '기프티콘 보내기' });
      return 'shared';
    } catch (err) {
      // 창을 닫은 것은 실패가 아니다.
      if (/cancel/i.test(err?.message || '')) return 'cancelled';
      throw err;
    }
  }

  // 웹은 브라우저의 공유 창을 쓴다. 사진첩으로 바로 보내는 길이 이것뿐이다.
  const { file } = prepared;
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';
      if (err?.name === 'NotAllowedError') return 'expired';
      throw err;
    }
  }
  return 'unsupported';
}

// 만들고 바로 보낸다. 미리 만들 틈이 없는 곳에서 쓴다.
export async function shareGifticonImage({ url, name }) {
  return sharePrepared(await prepareShareImage({ url, name }));
}
