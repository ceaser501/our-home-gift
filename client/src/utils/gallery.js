import { registerPlugin } from '@capacitor/core';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat } from '@zxing/library';
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

// 바코드를 읽을 크기.
//
// 처음에 1400으로 뒀다가 아무것도 못 찾았다. 1400은 imageAnalyze.js의 UPLOAD_EDGE,
// 즉 "보관할 크기"지 "읽을 크기"가 아니다. 사람이 직접 올릴 때는 MAX_ANALYZE_EDGE(2000)로
// 읽고, 작은 이미지는 MIN_ANALYZE_EDGE(1600)까지 오히려 키워서 읽는다 — 막대가 뭉개지면
// 인식이 안 되기 때문이다.
//
// 세로 스크린샷 1080x2400을 긴 변 1400으로 줄이면 가로가 630px이 된다. 그 안의 바코드는
// 500px 남짓이고, CODE128 막대 100여 개가 거기 들어가면 막대당 5px이라 읽히지 않는다.
// 2000으로 읽으면 가로 900px, 바코드 750px가 되어 직접 올릴 때와 같은 조건이 된다.
const READ_EDGE = 2000;

// 아니라고 한 사진을 기억해둔다. 안 그러면 훑을 때마다 같은 것을 계속 다시 묻는다.
const DISMISSED_KEY = 'moacon:gallery-dismissed';

// 여기까지는 이미 훑었다는 표시(초 단위 시각). 다음 번엔 이 이후에 담긴 사진만 본다.
//
// 이게 없으면 훑을 때마다 설치일 이후 전부를 다시 읽는다. 쓰는 날이 길어질수록 그 수가
// 계속 불어나서, 반년쯤 지나면 한 번 누를 때마다 수백 장을 다시 디코딩하게 된다.
// 바뀐 것만 보면 대개 몇 장이라 순식간에 끝난다.
const SCANNED_KEY = 'moacon:gallery-scanned-until';

function readScannedUntil() {
  const raw = Number(localStorage.getItem(SCANNED_KEY));
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

/**
 * 어디까지 봤는지 적어둔다.
 *
 * 훑기가 끝났다고 무조건 "지금까지 다 봤다"로 적으면 안 된다. 후보로 올려놨는데 사용자가
 * 등록도, 치우기도 하지 않은 것들이 있으면 그것들이 다음 번에 통째로 사라진다 — 앱이
 * 찾아준 걸 잃어버리는 셈이다. 그래서 남아 있는 후보 중 가장 오래된 것 직전까지만 적는다.
 * 사용자가 그것들을 처리하고 나면 표시가 저절로 앞으로 나아간다.
 */
export function rememberScannedUntil(seconds) {
  try {
    if (seconds > 0) localStorage.setItem(SCANNED_KEY, String(Math.floor(seconds)));
  } catch {
    // 저장이 막혀 있으면 다음에도 처음부터 훑을 뿐, 결과는 같다.
  }
}

// "설치 시점부터 다시 훑기". 치워둔 사진까지 되살려서 완전히 처음 상태로 되돌린다.
// 폴더 이름이 안 맞아 못 찾았거나, 실수로 치운 것을 되찾고 싶을 때 쓴다.
export function forgetScanHistory() {
  try {
    localStorage.removeItem(SCANNED_KEY);
    localStorage.removeItem(DISMISSED_KEY);
  } catch {
    // 지우지 못했으면 예전 기록이 그대로 쓰인다. 훑기는 그대로 된다.
  }
}

function readDismissed() {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

export function dismissImages(ids) {
  try {
    const kept = readDismissed();
    ids.forEach((id) => kept.add(String(id)));
    // 무한정 쌓이지 않게 최근 것만 남긴다. 오래된 사진은 어차피 기준 시각 밖으로 밀려난다.
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...kept].slice(-2000)));
  } catch {
    // 저장이 막혀 있으면 다음 번에 다시 묻게 될 뿐이다.
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

async function decodeBarcode(base64) {
  const image = await new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = `data:image/jpeg;base64,${base64}`;
  });

  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  canvas.getContext('2d').drawImage(image, 0, 0);

  try {
    const result = await new BrowserMultiFormatReader().decodeFromCanvas(canvas);
    return {
      code: result.getText(),
      codeType: result.getBarcodeFormat ? BarcodeFormat[result.getBarcodeFormat()] || null : null,
    };
  } catch {
    // 바코드가 없는 사진이다. 대부분 여기로 온다 — 오류가 아니라 정상적인 결과다.
    return null;
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

/**
 * 갤러리를 훑어 등록할 만한 후보를 돌려준다.
 *
 * isRegistered(code) — 이미 등록된 번호인지 묻는 함수. 화면 쪽에서 넘긴다.
 * onProgress({ scanned, total, found }) — 몇 장을 봤는지. 수십 초 걸릴 수 있어서,
 *   진행이 보이지 않으면 멈춘 것처럼 느껴진다.
 * fromInstall — true면 저장해둔 표시를 무시하고 설치 시점부터 다시 훑는다.
 */
export async function scanGallery({ isRegistered, onProgress, signal, fromInstall = false } = {}) {
  const status = await getGalleryStatus();
  if (!status.supported) return { supported: false, candidates: [] };
  if (!status.granted && !status.partial) return { ...status, candidates: [], needsPermission: true };

  // 0을 넘기면 네이티브가 설치 시각을 기준으로 삼는다. 설치 전부터 갤러리에 쌓여 있던
  // 사진까지 뒤지지 않기 위한 바닥이라, 어느 경우에도 그보다 앞으로는 가지 않는다.
  // since와 id는 문자열로 주고받는다. 숫자로 보내면 Capacitor가 32비트에 들어가는 값을
  // Integer로 파싱하는데, 네이티브의 call.getLong()은 정확히 Long일 때만 값을 돌려주고
  // 아니면 기본값을 준다. 그래서 사진을 한 장도 못 열고 있었다.
  const { images = [], since = 0, folders = [] } = await MoaconGallery.listImages({
    buckets: BUCKETS,
    limit: MAX_IMAGES,
    since: String(fromInstall ? 0 : readScannedUntil()),
  });

  const dismissed = readDismissed();
  const fresh = images.filter((image) => !dismissed.has(String(image.id)));

  const candidates = [];
  const seenCodes = new Set();
  // 왜 못 찾았는지 알려주기 위한 집계. 아무것도 안 나왔을 때 "사진이 없어서인지,
  // 바코드를 못 읽어서인지, 이미 다 등록된 것인지"를 구분할 수 있어야 한다.
  const tally = { read: 0, readFailed: 0, noBarcode: 0, alreadyHave: 0 };

  for (const [index, image] of fresh.entries()) {
    if (signal?.aborted) break;
    onProgress?.({ scanned: index, total: fresh.length, found: candidates.length });

    let read;
    try {
      read = await MoaconGallery.readImage({ id: String(image.id), maxEdge: READ_EDGE });
    } catch {
      // 한 장을 못 읽는다고 전체가 멈추면 안 된다. 너무 큰 사진이거나 지워진 것이다.
      tally.readFailed += 1;
      continue;
    }
    tally.read += 1;

    // decodeBarcode는 사진을 못 여는 경우 예외를 낸다. 이걸 잡지 않으면 그 한 장 때문에
    // 훑기 전체가 중단되고, 사용자에게는 이유 없이 "훑지 못했어요"만 뜬다.
    let found = null;
    try {
      found = await decodeBarcode(read.data);
    } catch {
      tally.readFailed += 1;
      continue;
    }
    if (!found?.code) {
      tally.noBarcode += 1;
      continue;
    }

    // 같은 기프티콘을 여러 장 캡처해둔 경우가 흔하다. 번호가 같으면 한 번만 보여준다.
    if (seenCodes.has(found.code)) continue;
    if (isRegistered && (await isRegistered(found.code))) {
      tally.alreadyHave += 1;
      continue;
    }
    seenCodes.add(found.code);

    candidates.push({
      id: image.id,
      name: image.name,
      bucket: image.bucket,
      addedAt: image.addedAt,
      code: found.code,
      codeType: found.codeType,
      // 미리보기와 등록에 그대로 쓴다. 다시 읽지 않기 위해 들고 있는다.
      data: read.data,
    });
  }

  onProgress?.({ scanned: fresh.length, total: fresh.length, found: candidates.length });
  // folders는 기준 시각 이후 기기에 있는 폴더 이름과 장수 전부다(우리가 고른 것 말고).
  // 폴더 이름이 안 맞아서 못 찾는 경우를 눈으로 확인할 수 있어야 한다 — 이름은 제조사와
  // 앱 버전마다 달라서, 목록에 없는 이름이 나오면 BUCKETS에 더해주면 된다.
  return { ...status, candidates, scanned: fresh.length, since, folders, tally };
}

// 후보를 등록 창에 넘길 수 있는 파일로 바꾼다.
export function candidateToFile(candidate) {
  const binary = atob(candidate.data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const name = (candidate.name || 'gifticon').replace(/\.[^.]+$/, '');
  return new File([bytes], `${name}.jpg`, { type: 'image/jpeg' });
}
