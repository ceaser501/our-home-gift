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
// ── 대신 보라 액자에 넣는다 ─────────────────────────────────────────────────
// 원본 위에 보라 띠를 붙이고, 사진에 둘려 있던 테두리도 같은 보라로 칠한다. 둘이
// 이어져 하나의 액자가 된다. 카드 안쪽 — 바코드가 있는 자리 — 은 한 획도 안 건드리므로
// 매장에서 되는 것은 그대로고, 받는 사람은 이게 어디서 온 것인지 알게 된다.
//
// 테두리를 칠하는 이유는 카톡 선물함 캡처가 노란 액자를 달고 오기 때문이다. 그 노랑은
// 카카오의 것이라, 우리가 보낸 선물에 남의 브랜드가 둘려 있는 꼴이 된다.
//
// 칠하기로 안 되는 사진도 있다 — 흰 테두리는 일부러 건너뛰고(흰 종이에 찍은 사진을
// 덮을 수 있어서다), 테두리가 아예 없는 사진도 있다. 그래서 좌우·아래에 보라 여백을
// 함께 두른다. 여백은 원본을 한 픽셀도 안 건드리므로 어떤 사진이든 액자를 갖는다.

const BAND_TEXT = '모아콘에서 보낸 선물';
const BAND_SUB = '가족 기프티콘 서랍';

// 앱의 보라. client/public/invite.html과 화면 전체가 쓰는 값과 같다.
const VIOLET = '#5B4FE8';
const VIOLET_RGB = [0x5B, 0x4F, 0xE8];

// 너무 큰 원본은 줄여서 보낸다. 카톡이 어차피 다시 줄이고, 파일이 크면 보내는 데
// 시간이 걸린다. 바코드가 뭉개지지 않을 만큼은 남긴다.
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
    return await new Promise((resolve) => {
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
  } finally {
    URL.revokeObjectURL(src);
  }
}

/**
 * 원본 아래에 보라 띠를 붙인 그림을 만든다. 못 만들면 null.
 *
 * 받은 blob으로 그린다 — 주소로 한 번 더 받아오지 않는다. 같은 사진을 두 번 내려받는
 * 셈이고, 서명된 주소라 두 번째가 만료됐을 수도 있다.
 *
 * 띠 높이는 사진 너비를 따라간다. 고정 픽셀로 두면 작은 사진에서는 띠가 사진을
 * 덮고 큰 사진에서는 실오라기가 된다.
 */
export async function composeShareImage(blob) {
  // 그릴 자리부터 본다. 못 그리는 환경(시험의 jsdom, 아주 오래된 웹뷰)에서 사진을
  // 먼저 펼치면, 어차피 버릴 것을 펼치느라 시간만 쓴다.
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext?.('2d');
  if (!ctx) return null;

  const img = await decode(blob);
  if (!img) return null;

  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  if (!srcW || !srcH) return null;

  const scale = Math.min(1, MAX_EDGE / Math.max(srcW, srcH));
  const fullW = Math.max(1, Math.round(srcW * scale));
  const fullH = Math.max(1, Math.round(srcH * scale));

  // 줄인 원본을 한 장 따로 그려 두고, 위아래·좌우의 검은 여백을 잘라낸다.
  const src = document.createElement('canvas');
  src.width = fullW;
  src.height = fullH;
  const sctx = src.getContext('2d');
  if (!sctx) return null;
  sctx.imageSmoothingEnabled = true;
  sctx.imageSmoothingQuality = 'high';
  sctx.drawImage(img, 0, 0, fullW, fullH);
  const crop = trimLetterbox(sctx, fullW, fullH);
  const w = crop.w;
  const h = crop.h;

  // 띠는 사진 너비의 2할. 처음엔 1할 3푼이었는데 글자가 위에 붙어 보였고, 폰에서
  // 크게 열면 맨 윗줄이 카메라 구멍에 걸렸다.
  const band = Math.round(w * 0.2);

  // 좌우·아래에 보라 여백을 두른다.
  //
  // ── 왜 칠하기만으로는 모자란가 ────────────────────────────────────────────
  // 아래 paintFrame은 테두리가 있는 사진만 바꿀 수 있고, 게다가 흰 테두리는 일부러
  // 건너뛴다(흰 종이에 찍은 사진을 통째로 덮을 수 있어서다). 문자로 받아 저장한
  // 기프티콘이 딱 그렇다 — 테두리가 순백이라 위 띠만 보라고 나머지는 흰 채로 나갔다.
  //
  // 여백은 원본을 **한 픽셀도 안 건드린다.** 그냥 더 큰 보라 바탕에 얹을 뿐이라,
  // 테두리가 있든 없든 어떤 사진이든 보라 액자를 갖는다.
  //
  // 둘을 같이 쓴다. 칠하기가 되는 사진은 여백과 이어져 하나로 보이고, 안 되는 사진도
  // 액자는 갖는다.
  const pad = Math.round(w * 0.035);
  canvas.width = w + pad * 2;
  canvas.height = band + h + pad;

  // 바탕을 통째로 보라로 깔고 그 위에 사진을 얹는다. 위쪽 띠도 이걸로 함께 칠해진다.
  //
  // 띠가 위인 것은, 아래에 뒀더니 카톡 선물함 캡처의 '카카오톡 선물하기'와 바로 붙어서
  // 브랜드 이름이 아래쪽에 둘 겹쳐 보였기 때문이다. 위로 올리면 테두리와 이어져 하나의
  // 액자가 되고, 대화방에서 미리보기가 위부터 잘리는 것에도 유리하다.
  ctx.fillStyle = VIOLET;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(src, crop.x, crop.y, w, h, pad, band, w, h);

  // 사진 자체의 테두리도 같은 보라로. 못 칠하면 원본 그대로 두고 여백만 남는다.
  paintFrame(ctx, pad, band, w, h, VIOLET_RGB);

  // 글자는 '띠'가 아니라 '보라 덩어리'에 맞춰 놓는다.
  //
  // 액자를 칠하고 나면 띠와 사진 위쪽 테두리가 이어져서, 보이는 보라가 띠보다 두꺼워진다.
  // 실측: 카톡 캡처는 띠가 87px인데 보라 머리가 128px이었다(액자가 41px 더). 그런데
  // 글자는 87px 기준으로 놓여서 위에 붙어 보였다.
  //
  // 한가운데보다 조금 아래(55%)다. 위쪽은 폰에서 카메라 구멍과 상태 바가 덮는 자리라,
  // 딱 가운데여도 글자가 위로 붙어 보였다.
  //
  // 액자가 없는 사진(문자로 받은 것 등)은 두 값이 같아서 달라지는 것이 없다.
  const headerH = violetHeader(ctx, w, band, h, pad);
  const midY = headerH * 0.55;

  // 글자 크기와 두 줄 사이는 사진 너비를 따라간다 — 보라 머리가 두꺼워졌다고 글자까지
  // 커지면 액자 있는 사진만 글자가 커진다. 띠를 키울 때 글자는 그대로 두었다.
  const big = Math.round(w * 0.044);
  const small = Math.round(w * 0.03);
  const family =
    "'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', -apple-system, sans-serif";

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.fillStyle = '#FFFFFF';
  ctx.font = `700 ${big}px ${family}`;
  ctx.fillText(BAND_TEXT, canvas.width / 2, midY - w * 0.021);

  // 아랫줄은 한 단 흐리게. 같은 흰색으로 두면 두 줄이 한 덩어리로 뭉쳐 읽힌다.
  ctx.fillStyle = 'rgba(255,255,255,0.78)';
  ctx.font = `500 ${small}px ${family}`;
  ctx.fillText(BAND_SUB, canvas.width / 2, midY + w * 0.022);

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.92));
}

// 사진 위아래(와 좌우)의 검은 여백을 잘라낸다. 자를 것이 없으면 사진 전체.
//
// 기프티콘을 폰 화면째로 캡처해 두면 세로로 긴 화면에 맞춰 위아래가 까맣게 채워진다.
// 그 검은 덩어리가 보라 액자 안에 그대로 들어가서, 받는 사람에게는 사진이 덜 잘린
// 것처럼 보였다 — 2026-09-25에 실기에서 나왔다.
//
// 거의 모든 칸이 까만 줄만 자른다(1%까지는 압축 잡음으로 본다). 글자가 한 줄이라도
// 박힌 까만 머리는 내용이라 안 자른다. 다 자르고 3할도 안 남으면 까만 사진일 뿐이라
// 손대지 않는다.
export function trimLetterbox(ctx, w, h) {
  var whole = { x: 0, y: 0, w: w, h: h };
  var d;
  try {
    d = ctx.getImageData(0, 0, w, h).data;
  } catch {
    return whole;
  }
  var DARK = 40;
  var lit = function (o) { return d[o] > DARK || d[o + 1] > DARK || d[o + 2] > DARK; };
  var blackRow = function (y) {
    var n = 0;
    for (var x = 0; x < w; x++) if (lit((y * w + x) * 4) && ++n > w * 0.01) return false;
    return true;
  };
  var blackCol = function (x, top, bottom) {
    var n = 0, span = bottom - top + 1;
    for (var y = top; y <= bottom; y++) if (lit((y * w + x) * 4) && ++n > span * 0.01) return false;
    return true;
  };

  var top = 0, bottom = h - 1;
  while (top < bottom && blackRow(top)) top++;
  while (bottom > top && blackRow(bottom)) bottom--;
  var left = 0, right = w - 1;
  while (left < right && blackCol(left, top, bottom)) left++;
  while (right > left && blackCol(right, top, bottom)) right--;

  var cw = right - left + 1, ch = bottom - top + 1;
  if (cw < w * 0.3 || ch < h * 0.3) return whole;
  return { x: left, y: top, w: cw, h: ch };
}

// 위에서 보이는 보라가 어디까지인가. 띠 + 칠해진 사진 테두리.
//
// 띠 아래부터 한 줄씩 내려가며 보라가 아닌 픽셀이 처음 나오는 자리를 찾는다. 액자를
// 칠했으면 그만큼 더 내려가고, 안 칠했으면 띠에서 바로 멈춘다.
//
// 아무리 멀어도 띠의 두 배까지만 본다. 온통 보라에 가까운 사진에서 머리가 끝없이
// 길어지면 글자가 사진 한복판에 떨어진다.
export function violetHeader(ctx, w, band, imgH, xFrom) {
  var max = Math.min(imgH, band);
  var strip;
  try {
    // 사진이 놓인 자리만 본다. 좌우 여백은 늘 보라라 같이 세면 머리가 끝없이 길어진다.
    strip = ctx.getImageData(xFrom || 0, band, w, max);
  } catch {
    return band;
  }
  var d = strip.data;
  for (var y = 0; y < max; y++) {
    for (var x = 0; x < w; x++) {
      var o = (y * w + x) * 4;
      // 칠한 자리는 정확히 이 값이다. 그 밖은 전부 '내용'으로 본다.
      if (d[o] !== 0x5B || d[o + 1] !== 0x4F || d[o + 2] !== 0xE8) return band + y;
    }
  }
  return band + max;
}

// 사진 바깥 테두리를 보라로 칠한다. 칠했으면 true.
//
// ── 왜 ──────────────────────────────────────────────────────────────────────
// 카톡 선물함 캡처에는 노란 액자가 둘려 있다. 그 노랑은 카카오의 것이라, 우리가 보낸
// 선물에 남의 브랜드가 액자를 두르고 있는 꼴이 된다. 문자로 받아 저장한 것도 저마다
// 다른 색 테두리를 달고 온다.
//
// ── ⚠️ 여기가 유일하게 원본을 건드리는 자리다 ───────────────────────────────
// 이 기능의 약속은 '원본을 그대로 보낸다'였다. 바코드가 든 카드 안쪽을 한 픽셀이라도
// 칠하면 그 약속이 깨진다. 그래서 가장자리에서만 번져 들어가고(flood fill), 아래 넷 중
// 하나라도 어긋나면 **아무것도 안 칠하고 물러선다.**
//
//   1. 네 모서리 색이 서로 같아야 한다        — 액자가 아니면 색이 제각각이다
//   2. 흰색·검정에 가까우면 안 한다           — 사진 배경일 뿐일 수 있다
//   3. 번진 넓이가 절반을 넘으면 안 된다      — 액자는 테두리지 바탕이 아니다
//   4. 한가운데까지 번지면 안 된다            — 거기까지 갔으면 액자가 아니다
//
// 번진 자리가 다 액자는 아니다. 카드 위 상품 칸이 액자와 같은 색이면 거기까지 번진다.
// 그 칸은 남긴다(keepInside).
//
// 못 칠하면 그냥 원본 그대로 나간다. 띠는 위에 그대로 붙으므로 잃는 것이 없다.
export function paintFrame(ctx, x, y, w, h, rgb) {
  var img;
  try {
    img = ctx.getImageData(x, y, w, h);
  } catch {
    // 다른 곳에서 온 그림이면 꺼낼 수 없다. 칠하지 않는다.
    return false;
  }
  var d = img.data;
  var at = function (px, py) { return (py * w + px) * 4; };

  // 1. 네 모서리가 같은 색인가
  //
  // ⚠️ 맨 끝 픽셀에서 재지 않는다. 모서리는 둥글고, 안티앨리어싱과 jpeg 압축이 거기서
  // 제일 심하게 섞인다. 실제 카톡 캡처를 재봤더니 맨 끝 넷은 (248,220,59)부터
  // (117,100,134)까지 벌어졌는데, 3px만 안으로 들어가면 넷 다 (255,222,33) 언저리였다.
  //
  // 안쪽으로 들어가는 폭은 짧은 변의 1%다. 큰 사진일수록 섞이는 띠도 두꺼워서다.
  var TOL = 26;
  var pad = Math.max(2, Math.round(Math.min(w, h) * 0.01));
  if (w <= pad * 2 || h <= pad * 2) return false;

  var probes = [at(pad, pad), at(w - 1 - pad, pad), at(pad, h - 1 - pad), at(w - 1 - pad, h - 1 - pad)];
  var r = 0, g = 0, b = 0;
  for (var i = 0; i < probes.length; i++) {
    r += d[probes[i]]; g += d[probes[i] + 1]; b += d[probes[i] + 2];
  }
  r = Math.round(r / 4); g = Math.round(g / 4); b = Math.round(b / 4);

  for (var j = 0; j < probes.length; j++) {
    var c = probes[j];
    if (Math.abs(d[c] - r) > TOL || Math.abs(d[c + 1] - g) > TOL || Math.abs(d[c + 2] - b) > TOL) {
      return false;
    }
  }

  // 2. 흰색이나 검정에 가까우면 손대지 않는다
  var light = r > 232 && g > 232 && b > 232;
  var dark = r < 26 && g < 26 && b < 26;
  if (light || dark) return false;

  // 3~4. 가장자리에서 번져 들어간다
  //
  // ⚠️ 기준색이 아니라 **바로 옆 픽셀**과 견준다.
  //
  // 액자는 단색이 아니다. 실제 카톡 캡처를 재보니 카드 밑에 그림자가 깔려서, 같은
  // 노랑이 아래로 갈수록 (255,222,33)에서 (195,185,96)까지 흘렀다. 기준색 하나에
  // 매달리면 그 경사 중간에서 끊겨 노란 줄이 남는다 — 실제로 남았다.
  //
  // 옆 픽셀과 견주면 경사를 따라간다. 그러다 카드에 닿는 순간 색이 한 번에 99만큼
  // 튀어서 거기서 멈춘다. 경사는 한 칸에 4쯤이고 경계는 99라 사이가 넉넉하다.
  //
  // FAR는 그래도 너무 멀리 흘러가지 않게 두는 울타리다. 옆끼리만 견주면 완만한
  // 그라데이션을 타고 사진 속까지 걸어 들어갈 수 있다.
  var STEP = 30;
  var FAR = 90;

  var seen = new Uint8Array(w * h);
  // 좌표와 '어디서 왔는지'의 색을 함께 담는다. [x, y, r, g, b] 다섯 칸씩.
  var stack = [];
  for (var px = 0; px < w; px++) {
    stack.push(px, 0, r, g, b, px, h - 1, r, g, b);
  }
  for (var py = 0; py < h; py++) {
    stack.push(0, py, r, g, b, w - 1, py, r, g, b);
  }

  var hits = [];
  var limit = w * h * 0.5;
  var cx = (w / 2) | 0, cy = (h / 2) | 0;

  while (stack.length) {
    var pb = stack.pop(), pg = stack.pop(), pr2 = stack.pop();
    var sy = stack.pop(), sx = stack.pop();
    if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
    var key = sy * w + sx;
    if (seen[key]) continue;

    var o = key * 4;
    var cr = d[o], cg = d[o + 1], cb = d[o + 2];
    // 옆 픽셀과 견준다 — 경사를 따라가려고
    if (Math.abs(cr - pr2) > STEP || Math.abs(cg - pg) > STEP || Math.abs(cb - pb) > STEP) continue;
    // 울타리 — 너무 멀리까지 흘러가지 않게
    if (Math.abs(cr - r) > FAR || Math.abs(cg - g) > FAR || Math.abs(cb - b) > FAR) continue;

    seen[key] = 1;
    hits.push(o);
    if (hits.length > limit) return false;            // 3. 너무 넓다
    if (sx === cx && sy === cy) return false;          // 4. 한가운데까지 왔다

    stack.push(
      sx + 1, sy, cr, cg, cb,
      sx - 1, sy, cr, cg, cb,
      sx, sy + 1, cr, cg, cb,
      sx, sy - 1, cr, cg, cb
    );
  }

  // 5. 액자 안쪽에 갇힌 넓은 자리는 남긴다
  var keep = keepInside(seen, w, h);

  for (var k = 0; k < hits.length; k++) {
    var p = hits[k];
    if (keep && keep[p >> 2]) continue;
    d[p] = rgb[0]; d[p + 1] = rgb[1]; d[p + 2] = rgb[2]; d[p + 3] = 255;
  }
  ctx.putImageData(img, x, y);
  return true;
}

// 번진 자리 가운데 '액자'가 아니라 '사진의 바탕'인 곳을 골라낸다. 남길 곳 표시를
// 돌려주고, 남길 곳이 없으면 null.
//
// ── 왜 ──────────────────────────────────────────────────────────────────────
// 카톡 선물함 캡처는 상품 사진을 액자와 **같은 노랑** 위에 얹는다(상품 그림이 투명
// 배경이라서다). 번지기는 그 둘을 못 가른다 — 액자에서 시작해 상품 둘레를 다 돌아
// 들어가서, 치킨만 보라 바탕에 오려 붙인 꼴이 됐고 그림자는 누런 얼룩으로 남았다.
// 2026-09-25 실기(BBQ)에서 나왔다. 상품 바탕이 분홍이던 스타벅스는 괜찮았다.
//
// ── 어떻게 가르나 ───────────────────────────────────────────────────────────
// 안 번진 것들(카드, 상품)을 모두 감싸는 네모를 잡는다. 액자는 그 네모 **바깥**이다.
// 네모 안에서 번진 곳 중 넓은 덩어리는 사진의 바탕이라 남긴다.
//
// 좁은 덩어리는 칠한다. 카톡 카드 옆구리의 반달 홈이 그것이다 — 네모 안으로 파고든
// 액자라서, 남기면 보라 액자에 노란 반달이 박힌다.
//
// 남기는 바탕은 네모에 딱 맞춰 자르지 않고 액자 두께만큼 위(아래)로 넉넉히 둔다.
// 딱 맞추면 콜라 뚜껑이 노란 상자 윗변에 닿아 잘린 사진처럼 보인다.
function keepInside(seen, w, h) {
  // 네모는 안 번진 칸이 셋 이상인 줄과 칸으로만 잡는다. 액자에 박힌 압축 잡음 한두 점이
  // 네모를 끌어당기면, 그 사이의 액자가 '안쪽'이 되어 노란 줄로 남는다.
  var rows = new Uint32Array(h), cols = new Uint32Array(w);
  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      if (seen[y * w + x]) continue;
      rows[y]++;
      cols[x]++;
    }
  }
  var minX = 0, maxX = w - 1, minY = 0, maxY = h - 1;
  while (minY < h && rows[minY] < 3) minY++;
  while (maxY >= 0 && rows[maxY] < 3) maxY--;
  while (minX < w && cols[minX] < 3) minX++;
  while (maxX >= 0 && cols[maxX] < 3) maxX--;
  if (minX > maxX || minY > maxY) return null;

  var BIG = Math.pow(w * 0.08, 2);
  var margin = Math.max(Math.min(minX, w - 1 - maxX), Math.round(w * 0.03));
  var label = new Uint8Array(w * h);   // 1 = 이미 셈, 2 = 남긴다
  var any = false;
  var queue = [];

  for (var sy = minY; sy <= maxY; sy++) {
    for (var sx = minX; sx <= maxX; sx++) {
      var start = sy * w + sx;
      if (!seen[start] || label[start]) continue;

      // 한 덩어리를 모은다(네모 안에서만)
      var members = [start];
      var lo = sx, hi = sx, top = sy, bottom = sy;
      label[start] = 1;
      queue.length = 0;
      queue.push(start);
      while (queue.length) {
        var at = queue.pop();
        var ax = at % w, ay = (at - ax) / w;
        var next = [
          ax > minX ? at - 1 : -1,
          ax < maxX ? at + 1 : -1,
          ay > minY ? at - w : -1,
          ay < maxY ? at + w : -1,
        ];
        for (var n = 0; n < 4; n++) {
          var q = next[n];
          if (q < 0 || !seen[q] || label[q]) continue;
          label[q] = 1;
          queue.push(q);
          members.push(q);
          var qx = q % w, qy = (q - qx) / w;
          if (qx < lo) lo = qx;
          if (qx > hi) hi = qx;
          if (qy < top) top = qy;
          if (qy > bottom) bottom = qy;
        }
      }
      if (members.length < BIG) continue;

      any = true;
      for (var m = 0; m < members.length; m++) label[members[m]] = 2;

      // 네모 위(아래)로 넉넉히 — 덩어리가 네모의 그 변에 닿아 있을 때만
      var bands = [];
      if (top === minY) bands.push([Math.max(0, minY - margin), minY - 1]);
      if (bottom === maxY) bands.push([maxY + 1, Math.min(h - 1, maxY + margin)]);
      for (var b = 0; b < bands.length; b++) {
        for (var yy = bands[b][0]; yy <= bands[b][1]; yy++) {
          for (var xx = lo; xx <= hi; xx++) {
            if (seen[yy * w + xx]) label[yy * w + xx] = 2;
          }
        }
      }
    }
  }
  if (!any) return null;

  var keep = new Uint8Array(w * h);
  for (var i = 0; i < keep.length; i++) if (label[i] === 2) keep[i] = 1;
  return keep;
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
 * 폰의 공유 창을 연다. 무엇을 했는지 돌려준다 —
 * 'shared' | 'cancelled' | 'unsupported'
 *
 * 부르는 쪽이 화면에 무엇을 적을지 정한다.
 */
export async function shareGifticonImage({ url, name }) {
  // 사진은 한 번만 받아온다. 서명된 주소라 두 번째가 만료됐을 수도 있고, 같은 것을
  // 두 번 내려받을 이유도 없다.
  const original = await fetch(url).then((r) => r.blob());
  // 띠를 못 붙여도 보내는 일은 그대로 한다. 띠는 있으면 좋은 것이고, 기프티콘이
  // 건너가는 것이 이 기능이다.
  const blob = (await composeShareImage(original)) || original;
  const fileName = fileNameFor(name);

  if (isNativeApp()) {
    // 앱에서는 파일로 한 번 떨궈야 한다. 폰의 공유 창은 blob을 모르고 경로를 받는다.
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([
      import('@capacitor/filesystem'),
      import('@capacitor/share'),
    ]);
    const path = `share/${Date.now()}-${fileName}`;
    const { uri } = await Filesystem.writeFile({
      path,
      data: await blobToBase64(blob),
      directory: Directory.Cache,
      recursive: true,
    });
    try {
      await Share.share({ files: [uri], dialogTitle: '기프티콘 보내기' });
      return 'shared';
    } catch (err) {
      // 창을 닫은 것은 실패가 아니다.
      if (/cancel/i.test(err?.message || '')) return 'cancelled';
      throw err;
    }
    // 떨군 파일은 지우지 않는다. Cache라 폰이 알아서 치우고, 지우려 들면 받는 앱이
    // 아직 읽는 중일 때 빈 파일이 건너간다.
  }

  // 웹은 브라우저의 공유 창을 쓴다. 사진첩으로 바로 보내는 길이 이것뿐이다.
  const file = new File([blob], fileName, { type: blob.type || 'image/jpeg' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';
      throw err;
    }
  }

  return 'unsupported';
}
