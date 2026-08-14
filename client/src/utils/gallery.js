import { registerPlugin } from '@capacitor/core';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import { isNativeApp } from './browser';

// 갤러리를 훑어 아직 등록하지 않은 기프티콘을 찾아온다.
//
// 사진 목록을 얻고 한 장을 줄여 읽어오는 일만 네이티브가 한다(app/android/.../GalleryPlugin.java).
// 무엇이 기프티콘인지 가려내는 판단은 전부 여기서 한다.
//
// ── 왜 이렇게 걸러내나 ────────────────────────────────────────────────────────
// 다운로드와 스크린샷 폴더에 든 사진의 대부분은 기프티콘이 아니다. 전부 서버로 보내
// 글자를 읽히면 한 번 훑을 때마다 수백 장 분의 비용이 나간다. 그래서 서버에 묻기 전에
// 브라우저에서 공짜로 할 수 있는 것부터 한다.
//
//   1) 바코드/QR이 있는가        — zxing이 이 자리에서 읽는다. 대부분 여기서 걸러진다.
//   2) 이미 등록한 번호인가       — 있으면 건너뛴다.
//   3) 전에 아니라고 한 사진인가  — 한 번 치운 것은 다시 묻지 않는다.
//
// 여기까지 통과한 것만 사용자에게 보여주고, 사용자가 고른 것만 서버로 간다.
// 바코드를 못 읽는 기프티콘(QR만 있는 앱 전용, 화질이 나쁜 캡처)은 이 방식으로 못 잡는다.
// 그건 지금처럼 직접 올리면 된다 — 이 기능은 처음부터 거들기 위한 것이다.

const MoaconGallery = registerPlugin('MoaconGallery');

// 훑을 폴더.
//
// 실제 경로는 제조사·안드로이드 버전·앱 버전마다 다르다. 확인된 것만 적어두면:
//
//   다운로드   /storage/emulated/0/Download
//   카카오톡   /storage/emulated/0/DCIM/KakaoTalk        (스코프드 스토리지 이후)
//              /storage/emulated/0/Pictures/KakaoTalk    (그 이전)
//   스크린샷   /storage/emulated/0/DCIM/Screenshots      (삼성 One UI)
//              /storage/emulated/0/Pictures/Screenshots  (픽셀 등 순정)
//
// 그래서 경로로 찾지 않는다. MediaStore가 알려주는 폴더 이름(BUCKET_DISPLAY_NAME,
// 경로의 마지막 조각)으로 찾고, 정확히 같은지가 아니라 품고 있는지를 본다. 위 여섯 갈래가
// 전부 'Download' / 'KakaoTalk' / 'Screenshots' 하나로 모여서, 경로가 어디로 바뀌든 걸린다.
// 기기 언어가 한국어면 이름 자체가 한글일 수 있어서 한글도 함께 적어둔다.
//
// 이 셋 말고는 보지 않는다. 카메라 폴더(직접 찍은 사진)는 훑지 않는다.
export const FOLDERS = [
  { key: 'download', label: '다운로드', names: ['download', '다운로드'] },
  { key: 'kakaotalk', label: '카카오톡', names: ['kakaotalk', '카카오톡'] },
  { key: 'screenshot', label: '스크린샷', names: ['screenshot', '스크린샷'] },
];

const BUCKETS = FOLDERS.flatMap((folder) => folder.names);

// 네이티브의 matchesBucket과 같은 규칙이다(GalleryPlugin.java). 정확히 같은지가 아니라
// 품고 있는지를 본다. 규칙이 두 곳에 있는 건 좋지 않지만, 어느 폴더로 셀지는 화면에
// 보여줄 이름을 아는 쪽에서 정하는 게 맞아서 여기 둔다.
function matchesName(bucket, name) {
  const lower = String(bucket || '').toLowerCase();
  return lower.includes(name) || name.includes(lower);
}

/**
 * 기기에서 찾은 폴더 목록을, 우리가 보는 3개와 그 밖의 것으로 나눈다.
 *
 * 우리가 보는 폴더는 사진이 없어도 0장으로 남긴다. 목록에서 빠지면 "필터에서 걸러졌나"
 * 하고 의심하게 되는데, 실제로는 그냥 볼 게 없었던 것이다. 둘은 다른 이야기다.
 */
export function summarizeFolders(folders) {
  const counts = Object.fromEntries(FOLDERS.map((folder) => [folder.key, 0]));
  const others = [];

  (folders || []).forEach((found) => {
    const matched = FOLDERS.find((folder) => folder.names.some((name) => matchesName(found.name, name)));
    if (matched) counts[matched.key] += found.count;
    else others.push(found);
  });

  return {
    watched: FOLDERS.map((folder) => ({ label: folder.label, count: counts[folder.key] })),
    others,
  };
}

// 한 번에 살펴볼 최대 장수. 이보다 많으면 오래 걸려서 사용자가 멈춘 줄 안다.
const MAX_IMAGES = 200;
// 한 기프티콘에 대해 등록에 넘길 사진 수.
//
// 여러 장을 함께 넘기면 각 장에서 찾은 정보를 합쳐 채운다. 원본에만 유효기간이 있고
// 캡처에는 바코드만 있는 식이라, 한 장만 넘기면 빈칸이 남는다.
//
// 그렇다고 많을수록 좋은 것도 아니다. 목록 화면을 통째로 찍은 스크린샷에는 다른
// 기프티콘의 유효기간이 함께 찍혀 있어서, 그걸 이 기프티콘 것으로 읽어올 수 있다.
// 빈칸을 채우는 게 아니라 틀린 값을 채우는 쪽이라 없는 것보다 나쁘다.
// 그래서 수를 늘리기보다 아래 isOriginal로 믿을 만한 것을 앞에 두는 쪽을 택했다.
const IMAGES_PER_CODE = 3;
// 다만 고르기 전까지는 넉넉히 모아둔다. 같은 기프티콘 사진이 셋 넘게 있는 일은 흔하다 —
// 받은 원본, 계산대용 캡처, 남에게 보여주려 찍은 캡처.
const COLLECT_PER_CODE = 4;

// 원본이 담기는 폴더. 다운로드와 카카오톡에 담긴 것은 발행사가 만든 그림이라 상품명·금액·
// 유효기간이 다 적혀 있다. 스크린샷은 대개 바코드만 크게 띄워 찍은 것이라 그게 없다.
const ORIGINAL_KEYS = ['download', 'kakaotalk'];

// 바코드가 사진 가로폭의 이만큼은 차지해야 "바코드를 보여주려고 찍은 사진"으로 본다.
//
// 선물하기 화면을 캡처하면 바코드가 폭의 절반을 넘고, 문자로 온 쿠폰 이미지도 그쯤 된다.
// 반면 목록 화면을 통째로 찍은 스크린샷에서는 68px짜리 썸네일 안에 들어가 있어 15% 안팎이다.
// 그런 사진은 같은 바코드를 담고 있어도 읽을 정보가 없다 — 오히려 옆에 찍힌 다른
// 기프티콘의 유효기간을 이 기프티콘 것으로 읽어올 수 있어서 넣지 않느니만 못하다.
const MIN_BARCODE_COVERAGE = 0.25;

function isOriginal(bucket) {
  return FOLDERS.filter((folder) => ORIGINAL_KEYS.includes(folder.key)).some((folder) =>
    folder.names.some((name) => matchesName(bucket, name))
  );
}

// 바코드를 읽을 때의 크기.
//
// 처음에는 "작은 이미지면 키운다"를 크기 기준으로 판단했다. 기프티쇼 이미지(가로 660px)를
// 보고 기준을 하나 잡고, 카카오톡 쿠폰(800x1670)을 보고 또 하나 잡았다. 그런데 기프티콘을
// 내주는 곳은 카카오톡과 기프티쇼만이 아니다. 롯데·통신사 앱마다 크기가 제각각이라,
// 사례를 볼 때마다 숫자를 고치는 방식은 끝이 없다.
//
// 그래서 재지 않는다. 한 번 읽어보고, 안 되면 키워서 다시 읽는다. 바코드가 몇 픽셀인지는
// 읽어봐야 아는 것이라 미리 가늠할 수가 없다 — 가늠하지 않는 쪽이 맞다.
//
// 실패한 사진은 "바코드 없음"으로 기억해두므로(NO_BARCODE_KEY) 이 비용은 사진 한 장당
// 한 번만 든다.
// 네이티브에서 받아올 크기. 원본은 몇 MB라 그대로 넘기면 웹뷰가 버겁다.
// 아래 시도들이 이 안에서 줄이고 키우므로, 여기서는 넉넉히 받아만 둔다.
const READ_EDGE = 2000;

// 바코드를 읽는 세 가지 조건.
//
// 예전에는 두 번 시도했다. 1600으로 줄여 한 번, 못 찾으면 3200으로 키우고 정밀 탐색까지
// 켜서 또 한 번. 그런데 바코드가 없는 사진도 두 번째를 다 돌았다 — 밥 사진 스무 장이면
// 없는 것을 찾으려고 가장 무거운 작업을 스무 번 돌린 셈이다. 시간의 대부분이 거기 갔다.
//
// 그렇다고 두 번째를 없앨 수는 없었다. 첫 번째가 '줄이기만' 했기 때문이다. 기프티쇼에서
// 받은 가로 660px짜리 그림은 줄일 것이 없어 그대로 읽혔고, 막대가 뭉개져 못 읽었다.
// 그걸 살린 게 두 번째의 2배 확대였다.
//
// 그래서 나눈다. 작은 것을 키우는 일은 싸다 — 그건 첫 번째로 옮겼다(작으면 키우고 크면
// 줄여, 어느 쪽이든 1600에 맞춘다). 남은 정밀 탐색만 뒤로 미룬다.
const SHALLOW = { longEdge: 1600, tryHarder: false };

// 확인용. 읽어낸 값이 맞는지 다른 배율로 한 번 더 본다.
//
// 실제로 한 자리가 틀린 채 등록된 일이 있었다(스타벅스 교환권 7 → 2). 막대를 읽는 일은
// 사진을 줄여서 하기 때문에, 압축 자국에 한 칸이 뭉개지면 다른 숫자가 나온다. 형식에
// 검산 자리가 없으면 걸러지지도 않는다.
//
// 정밀 탐색은 쓰지 않는다. 여기서 필요한 건 '더 잘 읽는 것'이 아니라 '다른 조건으로도
// 같은 값이 나오는지'라서, 배율만 달리하면 목적을 이룬다. 예전에는 이 확인에 가장 무거운
// 조건을 썼는데 그럴 이유가 없었다.
const VERIFY = { longEdge: 2000, tryHarder: false };

// 정밀 탐색. 느린 대신 흐린 것을 살린다.
//
// 결과를 보여준 다음에 조용히 돈다. 찾는 능력은 그대로 두고 기다리는 자리만 옮긴 것이라,
// 놓치는 것은 없고 사용자는 먼저 목록을 본다.
//
// 한때 2400으로 내려볼까 했는데 그만뒀다. 무게를 줄이려던 것인데, 뒤에서 도는 이상
// 무거워도 사용자를 기다리게 하지 않는다. 놓치지 않는 것이 이 기능의 약속이라, 기다림을
// 만들지 않는 자리에서까지 찾는 힘을 깎을 이유가 없다.
const DEEP = { longEdge: 3200, tryHarder: true };

// 아니라고 한 사진을 기억해둔다. 안 그러면 훑을 때마다 같은 것을 계속 다시 묻는다.
const DISMISSED_KEY = 'moacon:gallery-dismissed';

// 바코드가 없다고 확인된 사진. 다음 훑기 때 다시 읽지 않는다.
//
// 기준선이 늘 설치일 0시라, 훑을 때마다 그 뒤의 사진을 처음부터 다시 본다. 그중
// 대부분은 기프티콘이 아닌데(밥 사진, 앱 캡처) 한 번 확인한 것을 매번 다시 디코딩하면
// 쓰는 날이 길어질수록 훑기가 계속 느려진다. 한 번 아니라고 확인된 것은 기억해둔다.
//
// 사진은 지워도 id가 재사용되지 않아서, 남은 기록이 다른 사진을 가릴 일은 없다.
const NO_BARCODE_KEY = 'moacon:gallery-no-barcode';

// 이 기록을 만든 판독기의 버전. 판독 방식을 고칠 때마다 올린다.
//
// 예전에는 못 읽던 사진을 지금은 읽을 수 있게 되는 일이 실제로 있었다(작은 이미지를
// 키워서 읽도록 고친 뒤). 그런데 "없음"으로 적힌 사진은 다시 읽지 않으니, 고쳐놓고도
// 그 사진들만 영영 안 나온다. 버전이 다르면 기록을 통째로 버리고 다시 읽는다.
const DECODER_VERSION = 4;

function readIdSet(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const saved = JSON.parse(raw);
    // 예전 형식(배열)과 판독기 버전이 다른 기록은 버린다.
    if (Array.isArray(saved)) return key === NO_BARCODE_KEY ? new Set() : new Set(saved);
    if (saved.version !== DECODER_VERSION) return new Set();
    return new Set(saved.ids);
  } catch {
    return new Set();
  }
}

function addIds(key, kept, ids) {
  try {
    ids.forEach((id) => kept.add(String(id)));
    // 무한정 쌓이지 않게 최근 것만 남긴다.
    const value = { version: DECODER_VERSION, ids: [...kept].slice(-4000) };
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 저장이 막혀 있으면 다음 번에 다시 읽게 될 뿐이다.
  }
}

// 앱을 열 때 자동으로 훑을지. 기본은 꺼둔다 — 사진을 보는 일이라 사용자가 켜는 게 맞다.
const AUTO_SCAN_KEY = 'moacon:gallery-auto-scan';

export function isAutoScanOn() {
  try {
    return localStorage.getItem(AUTO_SCAN_KEY) === '1';
  } catch {
    return false;
  }
}

export function setAutoScanOn(on) {
  try {
    localStorage.setItem(AUTO_SCAN_KEY, on ? '1' : '0');
  } catch {
    // 저장이 막혀 있으면 이번 실행에만 적용된다.
  }
}

export function dismissImages(ids) {
  addIds(DISMISSED_KEY, readIdSet(DISMISSED_KEY), ids);
}

// 잘못 치웠을 때 되돌린다.
//
// 치우기는 영구적이다 — 택배 송장이나 영수증처럼 기프티콘이 아닌 바코드는 갤러리에
// 남아 있는 한 훑을 때마다 계속 올라오기 때문이다. 그런데 그 영구적이라는 성질 때문에,
// 진짜 기프티콘에 X를 잘못 누르면 갤러리 훑기에 다시는 나오지 않는다.
// 손이 미끄러진 것을 되돌릴 방법은 있어야 한다.
// 건너뛰기로 쌓인 것이 몇 장인지. 화면에서 "왜 이 사진이 안 나오지"를 설명하려면
// 감춰둔 것이 있다는 사실 자체가 보여야 한다.
export function countSkipped() {
  return readIdSet(DISMISSED_KEY).size + readIdSet(NO_BARCODE_KEY).size;
}

/**
 * 건너뛰기 기록을 전부 지운다.
 *
 * 두 목록 다 훑기를 빠르고 조용하게 만들려고 둔 것인데, 한 번 들어가면 그 사진은 다시
 * 나오지 않는다. 바코드 판독이 나아지기 전에 "없음"으로 기록된 사진, 손이 미끄러져 치운
 * 사진은 그대로 묻힌다. 편의를 위한 장치에는 빠져나올 문이 있어야 한다.
 */
export function forgetSkipped() {
  try {
    localStorage.removeItem(DISMISSED_KEY);
    localStorage.removeItem(NO_BARCODE_KEY);
  } catch {
    // 지우지 못했으면 예전 기록이 그대로 쓰인다. 훑기 자체는 그대로 된다.
  }
}

export function undismissImages(ids) {
  try {
    const kept = readIdSet(DISMISSED_KEY);
    ids.forEach((id) => kept.delete(String(id)));
    localStorage.setItem(DISMISSED_KEY, JSON.stringify({ version: DECODER_VERSION, ids: [...kept] }));
  } catch {
    // 지우지 못했으면 그 사진은 다음 훑기에서 빠질 뿐, 직접 올리면 등록된다.
  }
}

// 안드로이드 앱에서만 된다.
//
// 브라우저에는 기기의 사진 폴더를 훑는 API가 없다. 아이폰은 앱이어도 안 된다 — iOS의
// 사진은 파일 경로로 접근하는 폴더가 아니라 사진 라이브러리(PHPhotoLibrary) 안의
// 자산이고, '스크린샷'도 폴더가 아니라 시스템이 자동으로 묶어주는 앨범이다. 읽으려면
// 별도의 iOS 플러그인이 필요한데 아직 없다. 그래서 여기서 미리 잘라, 아이폰에서
// 버튼만 보였다가 눌러야 안 된다는 걸 알게 되는 일이 없게 한다.
export function isGalleryScanSupported() {
  return isNativeApp() && window.Capacitor?.getPlatform?.() === 'android';
}

export async function getGalleryStatus() {
  if (!isGalleryScanSupported()) return { supported: false, granted: false, partial: false };
  const status = await MoaconGallery.getStatus();
  return { supported: true, ...status };
}

export async function requestGalleryAccess() {
  if (!isGalleryScanSupported()) return { supported: false, granted: false, partial: false };
  const status = await MoaconGallery.requestAccess();
  return { supported: true, ...status };
}

// 정밀 탐색. 느린 대신 잘 찾는다. 2차 시도에서만 쓴다 — 갤러리 훑기는 놓치면 그냥 없는
// 것이 되므로 한 번은 애써볼 값어치가 있지만, 모든 사진에 처음부터 걸 이유는 없다.
const HARD_HINTS = new Map([[DecodeHintType.TRY_HARDER, true]]);

/**
 * 바코드가 사진 가로폭의 얼마를 차지하는지(0~1).
 *
 * zxing이 알려주는 인식 좌표로 잰다. 1D 바코드는 스캔선의 양 끝 두 점, QR은 모서리
 * 세 점이 오는데, 어느 쪽이든 가로로 벌어진 폭이 바코드의 크기다.
 *
 * 재는 그림이 이미 배율 조정을 거쳤지만 비율이라 상관없다 — 바코드와 사진이 같이
 * 커지고 작아지기 때문이다.
 */
function barcodeCoverage(points, width) {
  if (!points || points.length === 0 || !width) return 0;
  const xs = points.map((point) => point.getX());
  return (Math.max(...xs) - Math.min(...xs)) / width;
}

async function loadImage(base64) {
  return new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = `data:image/jpeg;base64,${base64}`;
  });
}

// 작으면 키우고 크면 줄여, 어느 쪽이든 목표 크기에 맞춘다.
function scaleTo(width, height, longEdgeTarget) {
  return longEdgeTarget / Math.max(width, height);
}

async function decodeBarcode(base64, pass = SHALLOW) {
  const image = await loadImage(base64);
  const width = image.naturalWidth;
  const height = image.naturalHeight;

  const found = await decodeAt(image, width, height, scaleTo(width, height, pass.longEdge), pass.tryHarder);
  if (!found) return null;

  // 읽혔다고 바로 믿지 않는다. 조건을 바꿔 한 번 더 읽고, 두 번 다 같은 값일 때만 그대로
  // 쓴다. 갈리면 확인 쪽을 택한다. 두 번째로는 못 읽었다면 확인은 못 한 것이지만, 읽은
  // 것은 읽은 것이다.
  const again = await decodeAt(image, width, height, scaleTo(width, height, VERIFY.longEdge), VERIFY.tryHarder);
  if (!again) return found;
  return again.code === found.code ? found : again;
}

async function decodeAt(image, width, height, scale, tryHarder) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  try {
    const reader = new BrowserMultiFormatReader(tryHarder ? HARD_HINTS : undefined);
    const result = await reader.decodeFromCanvas(canvas);
    return {
      code: result.getText(),
      codeType: result.getBarcodeFormat ? BarcodeFormat[result.getBarcodeFormat()] || null : null,
      // 바코드가 이 사진에서 차지하는 가로 비율. 크기와 달리 비율은 발행사가 달라도
      // 뜻이 같다 — 바코드를 보여주려고 찍었는지, 어쩌다 한구석에 들어갔는지를 가른다.
      coverage: barcodeCoverage(result.getResultPoints?.(), canvas.width),
    };
  } catch {
    return null;
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

/**
 * 사진 목록을 훑어 후보를 모은다. 얕은 판과 깊은 판이 같은 이 함수를 쓴다.
 *
 * pass          — 어떤 조건으로 읽을지(SHALLOW / DEEP).
 * isRegistered  — 이미 등록된 번호인지 묻는 함수. 화면 쪽에서 넘긴다.
 * skipCodes     — 이미 후보로 잡아둔 번호. 깊은 판에서 같은 것을 또 만들지 않는다.
 */
async function collect({ images, pass, isRegistered, skipCodes, onProgress, onCandidate, signal }) {
  const candidates = [];
  // 바코드 값 → 그 값을 가진 후보. 같은 기프티콘의 사진 여러 장을 한 후보로 모은다.
  const seenCodes = new Map();
  // 이미 등록되어 있다고 확인된 번호. 사진이 아니라 번호로 모은다.
  //
  // 세는 단위가 중요하다. 예전에는 사진을 셌는데, 같은 기프티콘을 원본과 캡처로 두 장
  // 갖고 있으면 2로 세어졌다. 화면에는 그게 "이미 등록됨 3"으로 나가고, 읽는 사람은
  // 기프티콘 세 개로 받아들인다. 실제로는 하나일 수 있다.
  //
  // 같은 번호를 다시 묻지 않게 되는 것도 덤이다 — 예전에는 같은 기프티콘 사진마다
  // 서버에 한 번씩 물었다.
  const knownCodes = new Set();
  // 이 판에서 바코드를 못 찾은 사진. 얕은 판에서는 깊은 판으로 넘기고, 깊은 판에서는
  // '바코드 없음'으로 적어 다음부터 건너뛴다.
  const missed = [];
  let readFailed = 0;

  for (const [index, image] of images.entries()) {
    if (signal?.aborted) break;
    onProgress?.({ scanned: index, total: images.length, found: candidates.length });
    // 한 박자 쉬어 화면이 그려지게 한다. 바로 다음 사진을 읽어버리면 진행 표시를 바꿔놓고도
    // 그릴 틈이 없어서, 막대가 뚝뚝 끊겨 멈춘 것처럼 보인다.
    await new Promise((resolve) => setTimeout(resolve, 0));

    let read;
    try {
      read = await MoaconGallery.readImage({ id: String(image.id), maxEdge: READ_EDGE });
    } catch {
      // 한 장을 못 읽는다고 전체가 멈추면 안 된다. 너무 큰 사진이거나 지워진 것이다.
      readFailed += 1;
      continue;
    }

    // decodeBarcode는 사진을 못 여는 경우 예외를 낸다. 이걸 잡지 않으면 그 한 장 때문에
    // 훑기 전체가 중단되고, 사용자에게는 이유 없이 "훑지 못했어요"만 뜬다.
    let found = null;
    try {
      found = await decodeBarcode(read.data, pass);
    } catch {
      readFailed += 1;
      continue;
    }
    if (!found?.code) {
      missed.push(image);
      continue;
    }

    // 같은 기프티콘을 여러 장 갖고 있는 경우가 흔하다 — 카카오톡에서 받은 원본을
    // 저장해두고, 계산대에서 쓰려고 바코드만 크게 띄워 캡처해두는 식이다.
    //
    // 예전에는 두 번째 것을 그냥 버렸는데, 그러면 어느 한 장만 남는다. 바코드만 찍힌
    // 캡처에는 유효기간도 금액도 없어서, 그게 남으면 기한을 알 길이 없어진다.
    // 이제는 함께 들고 있다가 등록할 때 같이 넘긴다.
    const already = seenCodes.get(found.code);
    if (already) {
      if (already.images.length < COLLECT_PER_CODE) {
        already.images.push({ data: read.data, bucket: image.bucket, coverage: found.coverage });
      }
      continue;
    }
    // 얕은 판에서 이미 후보로 잡은 번호는 깊은 판에서 다시 만들지 않는다.
    if (skipCodes?.has(found.code)) continue;
    // 같은 번호를 이미 등록된 것으로 판정했으면 다시 묻지 않는다.
    if (knownCodes.has(found.code)) continue;
    if (isRegistered && (await isRegistered(found.code))) {
      knownCodes.add(found.code);
      continue;
    }

    const candidate = {
      id: image.id,
      name: image.name,
      bucket: image.bucket,
      addedAt: image.addedAt,
      code: found.code,
      codeType: found.codeType,
      // 미리보기와 등록에 그대로 쓴다. 다시 읽지 않기 위해 들고 있는다.
      // 같은 번호의 사진이 더 나오면 여기에 붙고, 마지막에 골라낸다.
      images: [{ data: read.data, bucket: image.bucket, coverage: found.coverage }],
    };
    seenCodes.set(found.code, candidate);
    candidates.push(candidate);
    // 찾자마자 알려준다. 화면은 이걸 받아 카드를 한 장씩 쌓는다 — 다 끝난 뒤에 한꺼번에
    // 보여주면 그동안 아무 일도 안 일어나는 것처럼 보인다.
    // 여기서 넘기는 images는 아직 고르기 전이라 원본 조각들이다. 화면은 첫 장만 미리보기로
    // 쓰고, 등록에 넘길 것은 아래에서 고른 뒤 다시 받는다.
    onCandidate?.(candidate);
  }

  // 모아둔 사진 중 등록에 넘길 것을 고른다.
  //
  // 목록은 최근 것부터 오는데, 그대로 앞에서 자르면 나중에 찍은 캡처만 남는다. 원본은
  // 받은 그날 담기고 캡처는 쓸 때 찍으니 원본이 늘 더 오래됐기 때문이다. 실제로 카카오톡
  // 원본이 이렇게 밀려나서, 거기 적힌 유효기간을 못 읽는 일이 있었다.
  candidates.forEach((candidate) => {
    // 바코드가 너무 작게 찍힌 것은 뺀다. 다만 그것밖에 없으면 그거라도 쓴다 —
    // 등록 자체가 막히는 것보다는 낫고, 바코드 번호는 이미 읽어놨다.
    const meaningful = candidate.images.filter((image) => image.coverage >= MIN_BARCODE_COVERAGE);
    const usable = meaningful.length > 0 ? meaningful : candidate.images;

    // 원본이 하나라도 있으면 캡처는 아예 보내지 않는다.
    //
    // 원본에는 상품명·금액·유효기간이 다 적혀 있어서 캡처가 더해줄 게 없다. 반면 해가 될
    // 수는 있다 — 목록 화면을 찍은 캡처에는 다른 기프티콘의 유효기간이 같이 찍혀 있고,
    // 실제로 그 날짜가 이 기프티콘의 기한으로 들어간 적이 있다.
    //
    // 빈칸으로 남는 것보다 틀린 값이 들어가는 쪽이 나쁘다. 기한이 틀리면 알림이 엉뚱한
    // 날에 오고, 정작 만료되는 날에는 아무 말이 없다.
    const originals = usable.filter((image) => isOriginal(image.bucket));
    const pool = originals.length > 0 ? originals : usable;

    const sorted = [...pool].sort((a, b) => b.coverage - a.coverage);
    candidate.images = sorted.slice(0, IMAGES_PER_CODE).map((image) => image.data);
  });

  onProgress?.({ scanned: images.length, total: images.length, found: candidates.length });
  return { candidates, missed, knownCodes, readFailed };
}

/**
 * 갤러리를 훑어 등록할 만한 후보를 돌려준다. 여기서는 가벼운 조건으로만 읽는다.
 *
 * 못 찾은 사진은 pending으로 함께 돌려준다. 화면이 결과를 보여준 뒤 deepScan으로
 * 한 번 더 뒤지라는 뜻이다 — 무거운 정밀 탐색이 사용자를 기다리게 하지 않도록.
 *
 * 여기서는 '바코드 없음'을 적지 않는다. 아직 다 본 것이 아니라서, 지금 적으면 깊은 판이
 * 그 사진들을 영영 못 본다.
 */
export async function scanGallery({ isRegistered, onProgress, onCandidate, signal } = {}) {
  // 얼마나 걸렸는지 잰다. "느리다"는 말을 들었을 때 어디가 느린지 알아야 고칠 데를
  // 고른다 — 사진을 훑는 것(폰이 하는 일)과 정보를 읽는 것(서버를 다녀오는 일)은
  // 고치는 방법이 완전히 다르다.
  const startedAt = Date.now();
  const status = await getGalleryStatus();
  if (!status.supported) return { supported: false, candidates: [] };
  if (!status.granted && !status.partial) return { ...status, candidates: [], needsPermission: true };

  // 0을 넘기면 네이티브가 설치 시각을 기준으로 삼는다. 설치 전부터 갤러리에 쌓여 있던
  // 사진까지 뒤지지 않기 위한 바닥이라, 어느 경우에도 그보다 앞으로는 가지 않는다.
  // 기준은 늘 설치한 날 0시다(네이티브가 0을 그렇게 해석한다). 훑을 때마다 같은 자리에서
  // 시작하므로 "언제부터 보는지"가 늘 같고, 사용자가 기준을 신경 쓸 일이 없다.
  //
  // id는 문자열로 주고받는다. 숫자로 보내면 Capacitor가 32비트에 들어가는 값을 Integer로
  // 파싱하는데, 네이티브의 call.getLong()은 정확히 Long일 때만 값을 돌려준다.
  const { images = [], since = 0, folders = [] } = await MoaconGallery.listImages({
    buckets: BUCKETS,
    limit: MAX_IMAGES,
    since: '0',
  });

  // 아니라고 치운 것과, 바코드가 없다고 이미 확인된 것은 읽지 않는다.
  const dismissed = readIdSet(DISMISSED_KEY);
  const noBarcode = readIdSet(NO_BARCODE_KEY);
  const fresh = images.filter(
    (image) => !dismissed.has(String(image.id)) && !noBarcode.has(String(image.id))
  );

  const { candidates, missed, knownCodes, readFailed } = await collect({
    images: fresh,
    pass: SHALLOW,
    isRegistered,
    onProgress,
    onCandidate,
    signal,
  });

  // 집계는 기프티콘 단위다. 찾아낸 서로 다른 번호가 몇 개고, 그중 몇 개가 이미 목록에
  // 있는가. 사진 단위 숫자는 사진첩 줄이 이미 말하고 있어서, 아래에서 또 세면 두 단위가
  // 섞여 "확인한 사진 4장 / 이미 등록됨 3장"이 기프티콘 세 개로 읽힌다.
  const tally = {
    readFailed,
    found: candidates.length + knownCodes.size,
    alreadyHave: knownCodes.size,
    elapsedMs: Date.now() - startedAt,
  };

  return { ...status, candidates, pending: missed, scanned: fresh.length, since, folders, tally };
}

/**
 * 얕은 판에서 못 찾은 사진을 정밀 탐색으로 한 번 더 뒤진다.
 *
 * 화면이 이미 결과를 보여준 뒤에 조용히 돈다. 여기서 나오는 것은 목록에 얹힌다.
 * 끝까지 돌았을 때만 '바코드 없음'을 적는다 — 중간에 그만두면 다음에 다시 본다.
 */
export async function deepScan({ pending, isRegistered, skipCodes, onProgress, onCandidate, signal } = {}) {
  if (!pending?.length) return { candidates: [], elapsedMs: 0 };
  const startedAt = Date.now();

  const { candidates, missed } = await collect({
    images: pending,
    pass: DEEP,
    isRegistered,
    skipCodes,
    onProgress,
    onCandidate,
    signal,
  });

  if (!signal?.aborted) {
    addIds(NO_BARCODE_KEY, readIdSet(NO_BARCODE_KEY), missed.map((image) => image.id));
  }

  return { candidates, elapsedMs: Date.now() - startedAt };
}

// 후보를 등록 창에 넘길 수 있는 파일들로 바꾼다.
//
// 같은 번호의 사진이 여러 장이면 전부 넘긴다. 등록 창은 여러 장을 받으면 각 장에서 찾은
// 정보를 합쳐 채우기 때문에, 바코드만 찍힌 캡처에 없는 유효기간을 원본 쪽에서 읽어온다.
export function candidateToFiles(candidate) {
  const base = (candidate.name || 'gifticon').replace(/\.[^.]+$/, '');
  return candidate.images.map((data, index) => {
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new File([bytes], `${base}${index ? `-${index + 1}` : ''}.jpg`, { type: 'image/jpeg' });
  });
}
