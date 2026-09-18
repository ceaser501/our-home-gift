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
// 영영 안 끝나고, 화면은 '준비 중…'에 갇힌다. 소셜 로그인에서 같은 모양으로 갇힌
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
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));

  const band = Math.round(w * 0.13);
  canvas.width = w;
  canvas.height = h + band;

  // 띠가 위다.
  //
  // 아래에 뒀더니 카톡 선물함 캡처의 '카카오톡 선물하기'와 바로 붙어서, 브랜드 이름이
  // 아래쪽에 둘 겹쳐 보였다. 위로 올리면 테두리와 이어져 하나의 보라 액자가 되고,
  // 대화방에서 미리보기가 위부터 잘리는 것에도 유리하다.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, band, w, h);

  // 사진 테두리를 띠와 같은 보라로. 못 칠하면 원본 그대로 둔다.
  paintFrame(ctx, 0, band, w, h, VIOLET_RGB);

  ctx.fillStyle = VIOLET;
  ctx.fillRect(0, 0, w, band);

  // 글자 크기도 너비를 따라간다.
  const big = Math.round(band * 0.34);
  const small = Math.round(band * 0.23);
  const family =
    "'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', -apple-system, sans-serif";

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.fillStyle = '#FFFFFF';
  ctx.font = `700 ${big}px ${family}`;
  ctx.fillText(BAND_TEXT, w / 2, band * 0.40);

  // 아랫줄은 한 단 흐리게. 같은 흰색으로 두면 두 줄이 한 덩어리로 뭉쳐 읽힌다.
  ctx.fillStyle = 'rgba(255,255,255,0.78)';
  ctx.font = `500 ${small}px ${family}`;
  ctx.fillText(BAND_SUB, w / 2, band * 0.73);

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.92));
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
  var TOL = 26;
  var c0 = at(0, 0);
  var r = d[c0], g = d[c0 + 1], b = d[c0 + 2];
  var corners = [at(w - 1, 0), at(0, h - 1), at(w - 1, h - 1)];
  for (var i = 0; i < corners.length; i++) {
    var c = corners[i];
    if (Math.abs(d[c] - r) > TOL || Math.abs(d[c + 1] - g) > TOL || Math.abs(d[c + 2] - b) > TOL) {
      return false;
    }
  }

  // 2. 흰색이나 검정에 가까우면 손대지 않는다
  var light = r > 232 && g > 232 && b > 232;
  var dark = r < 26 && g < 26 && b < 26;
  if (light || dark) return false;

  // 3~4. 가장자리에서 번져 들어간다
  var seen = new Uint8Array(w * h);
  var stack = [];
  for (var px = 0; px < w; px++) { stack.push(px, 0, px, h - 1); }
  for (var py = 0; py < h; py++) { stack.push(0, py, w - 1, py); }

  var hits = [];
  var limit = w * h * 0.5;
  var cx = (w / 2) | 0, cy = (h / 2) | 0;

  while (stack.length) {
    var sy = stack.pop(), sx = stack.pop();
    if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
    var key = sy * w + sx;
    if (seen[key]) continue;
    var o = key * 4;
    if (Math.abs(d[o] - r) > TOL || Math.abs(d[o + 1] - g) > TOL || Math.abs(d[o + 2] - b) > TOL) continue;

    seen[key] = 1;
    hits.push(o);
    if (hits.length > limit) return false;            // 3. 너무 넓다
    if (sx === cx && sy === cy) return false;          // 4. 한가운데까지 왔다

    stack.push(sx + 1, sy, sx - 1, sy, sx, sy + 1, sx, sy - 1);
  }

  for (var k = 0; k < hits.length; k++) {
    var p = hits[k];
    d[p] = rgb[0]; d[p + 1] = rgb[1]; d[p + 2] = rgb[2]; d[p + 3] = 255;
  }
  ctx.putImageData(img, x, y);
  return true;
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
