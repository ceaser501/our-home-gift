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
  // 폴더를 모르는 사진은 어느 폴더도 아니다.
  //
  // 이 줄이 없으면 빈 이름이 모든 폴더에 걸린다 — 'download'.includes('') 가 참이라서다.
  // 직접 고른 사진(+)에는 폴더가 없어서, 그 사진들이 통째로 '원본 폴더에서 나온 것'으로
  // 판정됐다. 원본을 가리는 규칙이 늘 참이 되니 아무것도 가리지 못했다.
  if (!lower) return false;
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

/**
 * 이 사진을 다 훑기 전에 서버로 보내도 되는가.
 *
 * 상품명·금액·유효기간을 읽히는 일은 서버를 다녀오는 일이라 한 건에 3~4초가 든다.
 * 예전에는 그걸 훑기가 다 끝난 뒤에야 시작했다 — 어느 사진을 보낼지가 다 훑어야
 * 정해졌기 때문이다. 그래서 첫 결과가 나오기까지 훑는 시간이 통째로 앞에 붙었다.
 *
 * 그런데 그 '다 훑어야 정해진다'가 모든 사진에 해당하지는 않는다.
 *
 *   카카오톡·다운로드 — 발행사가 만든 그림 자체다. 상품명·금액·유효기간이 다 적혀
 *     있고, 같은 기프티콘의 더 나은 사진이 뒤에 나올 수가 없다. 뒤에 원본이 하나 더
 *     나와도 같은 종이라 읽히는 값이 같다. 기다릴 이유가 없다.
 *
 *   스크린샷 — 기다려야 한다. 원본은 받은 그날 담기고 캡처는 쓸 때 찍으니, 목록을
 *     최근 것부터 훑으면 캡처가 먼저 나오고 원본이 뒤에 온다. 캡처만 보고 일찍
 *     보내면 유효기간이 없는 그림을 읽히게 된다 — 실제로 겪은 사고다.
 *
 * 바코드가 너무 작게 찍힌 것도 기다린다. 아래에서 고를 때 탈락할 수 있는 그림이라,
 * 지금 보내면 고른 결과와 다른 것을 읽게 된다.
 *
 * 정리하면, 사고가 나는 경우만 골라서 기다린다. 나머지는 찾는 즉시 보낸다.
 */
function canReadEarly(bucket, coverage, codeType) {
  return isOriginal(bucket) && bigEnough(coverage, codeType);
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

// 바코드를 읽는 두 판.
//
// 조건의 핵심은 배율이고, 배율은 아래 barcodeScaleLadder가 정한다. 여기서는 사다리를
// 몇 단까지 내려가 볼지만 가른다 — 훑기는 짧게(사진 수백 장을 지나가야 한다), 정밀은
// 끝까지 + 마지막에 tryHarder 한 번.
const SHALLOW = { deep: false, tryHarder: false };

// 정밀 탐색. 느린 대신 흐린 것을 살린다. 훑기 결과를 보여준 다음에 조용히 돈다.
const DEEP = { deep: true, tryHarder: true };

// 고른 사진을 볼 때. 정밀 탐색에 마지막 판 하나를 더 얹는다.
//
// lastResort — 다 실패했을 때 무거운 판독기(wasm)를 한 번 더 부른다.
//
// 원래 그 판으로 가는 문은 "막대처럼 보이는가"(looksLikeBarcode)였다. 그 자를 QR은
// 통과하지 못한다 — 세로줄이 아니라 네모 격자라서다. 그래서 썬키스트 QR이 마지막
// 판까지 가보지도 못하고 그냥 '바코드 없음'이 됐다.
//
// 고른 사진에만 건다. 사진첩 훑기의 두 번째 판(deepScan)은 얕은 판이 못 읽은 것을
// 통째로 다시 보는데, 첫 훑기에서 그건 밥 사진 수백 장이다. 장마다 무거운 판독기를
// 부르면 훑기가 끝나지 않는다. 고른 사진은 사람이 골라온 몇 장뿐이라 값이 싸고,
// 아이폰에는 훑기가 없어서 이 길이 유일한 길이다.
//
// minEdge — 작은 그림은 이만큼 키워서도 한 번 본다.
//
// 이 한 줄이 QR을 갈랐다. 한 장으로 올리는 길은 읽기 전에 그림을 1600px까지 키우는데
// (imageAnalyze의 analyzeScale), 여러 장 길에는 키우는 법이 아예 없었다. 1200px짜리
// 사진이면 한 장 길은 1600까지 올려보고 여러 장 길은 1200을 넘겨본 적이 없다.
//
// 막대는 그래도 읽힌다 — 굵은 세로줄이라 줄여도 남는다. QR은 작은 네모칸이 격자로
// 붙어 있어서 줄이면 칸 경계가 사라진다. 키워야 읽히고, 키울 때 보간을 끄면
// (decodeAt의 imageSmoothingEnabled) 원본 픽셀이 그대로 복제돼 격자가 또렷해진다.
//
// 같은 썬키스트 QR이 한 장으로는 읽히고 여러 장에 섞으면 안 읽힌 이유가 이것이다.
const PICKED = { deep: true, tryHarder: true, lastResort: true, minEdge: 1600 };

// 어떤 배율들로 읽어볼지. 큰 쪽부터 차례로 줄여 본다.
//
// ── 왜 축소인가 (2026-08-20, 실물로 잰 결과) ─────────────────────────────────
// 실제 카카오 카드 6장(800x1670 PNG)을 zxing에 배율별로 넣어봤다.
//
//   원본(1x)          : 6장 전부 실패
//   2배 확대          : 6장 전부 실패
//   0.96~0.7 축소     : 4장 읽힘
//   0.45 축소         : 나머지 2장까지 전부 읽힘
//
// 카드의 바코드는 모듈이 4~5px에 경계가 안티앨리어싱으로 뭉개져 있는데, zxing은 그
// 뭉개진 경계를 원본 크기에서 못 가른다. 줄이면 이웃 픽셀이 평균되면서 막대가 다시
// 또렷해진다. "확대가 살린다"고 믿고 2배·3배를 돌리던 것이 오답이었다 — 수기등록이
// 7장 중 1장만 잡던 원인이 정확히 이것이다(훑기는 1600에 맞추느라 우연히 0.96으로
// 줄여서 읽었고, 정밀은 2배로 키워서 죽였다).
//
// 확대는 정말 작은 그림(기프티쇼 450px류)을 위해 맨 뒤에만 남긴다. 축소는 캔버스가
// 작아져 오히려 싸다 — 실측으로 한 장 전부 실패해도 200ms(훑기)/600ms(정밀)이다.
//
// 검증 스크립트: 판독기 패턴표로 합성한 카드 + 실물 8장 전부로 돌려 확인했다.
// 여기 숫자를 바꾸면 그 실측부터 다시 해야 한다.
export function barcodeScaleLadder(longEdge, deep = false) {
  // 크기를 모르는 그림(시험의 가짜 캔버스 등)은 원본 한 번만 본다.
  if (!(longEdge > 0)) return [1];
  const targets = deep ? [1600, 1150, 900, 750, 640] : [1600, 1150, 750];
  const factors = [];
  for (const target of targets) {
    const factor = target / longEdge;
    // 1에 바짝 붙은 축소는 원본과 같은 판이라 건너뛴다.
    if (factor < 0.98) factors.push(factor);
  }
  factors.push(1);
  // 작은 그림만 키워본다. 큰 그림의 확대는 실측에서 전부 실패했고 캔버스만 커진다.
  if (longEdge < 900) {
    factors.push(0.7);
    factors.push(2);
    if (deep) factors.push(3);
  }
  return factors;
}

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
const DECODER_VERSION = 14;

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
    // '바코드 없음'에 딸린 막대 기억은 잃지 않는다(아래 rememberNoBarcode 참고).
    if (key === NO_BARCODE_KEY) value.bars = readBarsRemembered();
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 저장이 막혀 있으면 다음 번에 다시 읽게 될 뿐이다.
  }
}

// '바코드 없음'으로 적힌 것 중, 막대로 보이던 사진들({ id, bucket }).
//
// 왜 따로 적나: 못 읽은 사진은 다음부터 건너뛰는데(NO_BARCODE_KEY), 그러면 "막대로
// 보이는데 못 읽은 사진이 카카오톡 사진첩에 1장 있어요" 안내를 만들 재료도 함께
// 사라진다. 배스킨라빈스 카드가 첫 훑기에는 안내에 나오고 두 번째부터는 안 나오던
// 것이 이것이다. 건너뛰더라도 안내는 계속 나와야 하므로, 어느 사진첩의 몇 장이
// 막대로 보였는지를 마커에 같이 둔다.
export function readBarsRemembered() {
  try {
    const saved = JSON.parse(localStorage.getItem(NO_BARCODE_KEY) || 'null');
    if (!saved || Array.isArray(saved) || saved.version !== DECODER_VERSION) return [];
    return Array.isArray(saved.bars) ? saved.bars : [];
  } catch {
    return [];
  }
}

// 정밀 탐색까지 끝난 못 읽은 사진들을 적는다. 막대로 보인 것은 사진첩 이름과 함께.
export function rememberNoBarcode(missed) {
  const remembered = readBarsRemembered();
  const known = new Set(remembered.map((entry) => String(entry.id)));
  missed.forEach((image) => {
    if (image.bars && !known.has(String(image.id))) {
      // 파일 이름도 같이 남긴다. 건너뛴 사진은 다음 훑기에서 읽지 않으므로 이름을 알
      // 방법이 여기밖에 없는데, 갤러리에서 그 사진을 찾으려면 이름이 있어야 한다.
      remembered.push({
        id: String(image.id),
        bucket: image.bucket || null,
        name: image.name || null,
        // 진단용. 다음 훑기에는 이 사진을 읽지 않으므로 치수도 여기서만 남는다.
        hint: image.hint || null,
      });
    }
  });
  try {
    const kept = readIdSet(NO_BARCODE_KEY);
    missed.forEach((image) => kept.add(String(image.id)));
    const ids = [...kept].slice(-4000);
    const keptIds = new Set(ids);
    localStorage.setItem(
      NO_BARCODE_KEY,
      JSON.stringify({
        version: DECODER_VERSION,
        ids,
        // id 목록에서 밀려난 것은 막대 기억도 같이 버린다.
        bars: remembered.filter((entry) => keptIds.has(String(entry.id))).slice(-200),
      })
    );
  } catch {
    // 저장이 막혀 있으면 다음 번에 다시 읽게 될 뿐이다.
  }
}

// '바코드 없음'을 몇 장 모아서 적을지.
//
// 한 장마다 적으면 목록 통째를 그만큼 다시 쓴다. 다 끝나고 한 번만 적으면 중간에
// 그만뒀을 때 한 장도 안 남는다. 그 사이 어딘가다 — 최악이라도 일곱 장을 잃는다.
const MARK_BATCH = 8;

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

// 자동 훑기는 앱을 연 그 한 번만 돈다.
//
// 앱 웹뷰에는 탭이 없어서 약관 같은 바깥 링크가 이 화면을 통째로 갈아끼우고 나간다.
// 뒤로가기로 돌아오면 앱이 처음부터 다시 열리는데, 그게 "앱을 연 것"으로 세어져서
// 약관 한 번 보고 올 때마다 훑기 창이 다시 떴다. 사진 수백 장을 다시 읽는다.
//
// sessionStorage에 적는다. 새로고침은 넘어가고 웹뷰가 죽으면 지워지는 자리라,
// "앱을 연 한 번"과 수명이 같다. localStorage에 적으면 다음 날 열어도 안 돌고,
// 메모리에만 두면 새로고침에 지워져서 지금과 같아진다.
const AUTO_SCAN_RAN = 'moacon:auto-scan-ran';

// 지금 자동으로 열어야 하는지. 읽기만 한다 — 적는 것은 markAutoScanRan이 따로 한다.
// (StrictMode는 useState 초기값을 두 번 부른다. 여기서 적으면 두 번째에 false가 된다.)
export function autoScanDue() {
  if (!isGalleryScanSupported() || !isAutoScanOn()) return false;
  try {
    return sessionStorage.getItem(AUTO_SCAN_RAN) !== '1';
  } catch {
    // 못 읽으면 연다. 한 번 더 도는 것이 아예 안 도는 것보다 낫다.
    return true;
  }
}

export function markAutoScanRan() {
  try {
    sessionStorage.setItem(AUTO_SCAN_RAN, '1');
  } catch {
    // 못 적으면 돌아올 때마다 다시 뜬다 — 고치기 전 모습이다.
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

// 앱 설정 화면을 열 수 있는가. 안드로이드 앱에서만 된다.
export function canOpenAppSettings() {
  return isGalleryScanSupported();
}

/**
 * 이 앱의 설정 화면을 연다. 열었으면 true.
 *
 * 권한을 거절한 사람에게 "설정에서 허용해주세요"라고만 적으면, 그 설정이 어디 있는지를
 * 스스로 찾아야 한다. 제조사마다 메뉴 이름과 깊이가 달라서 글로 적는 것으로는 모자란다.
 *
 * 못 열었을 때 false를 돌려주는 이유는, 부르는 쪽이 적어둔 경로 안내를 그대로 두기
 * 위해서다 — 버튼이 안 먹었다고 안내까지 사라지면 갈 길이 아예 없어진다.
 */
export async function openAppSettings() {
  if (!canOpenAppSettings()) return false;
  try {
    await MoaconGallery.openAppSettings();
    return true;
  } catch {
    return false;
  }
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
// 판독기가 알려주는 QR 자리는 무늬 '가운데'라 실제보다 짧다. 되돌릴 몫.
// (칸수에 따라 0.67~0.83. 기프티콘 QR은 대개 25~33칸이라 그 가운데를 쓴다.)
const QR_FINDER = 0.75;

/**
 * 코드가 이 사진에서 얼마나 큰가. 0~1. 못 재면 null(=모름).
 *
 * 막대는 가로만 잰다. 세로 길이는 규격이 아니라 그리는 사람 마음이라 뜻이 없다.
 *
 * QR은 한 몫을 되돌려줘야 한다. 판독기가 알려주는 자리는 세 모서리 무늬의 **가운데**라,
 * 실제 QR보다 좌우로 3.5칸씩 짧게 재진다. 21칸짜리면 실제의 0.67, 33칸짜리면 0.79로
 * 나온다. 기프티콘 QR은 대개 25~33칸이라 0.72~0.79 — 그 몫을 QR_FINDER로 되돌린다.
 *
 * 이 한 줄을 안 두면 가로의 30%를 차지하는 멀쩡한 QR이 0.225로 재어져 자(0.25)에 걸린다.
 * 썬키스트가 그랬다. 카드가 걷혀서 화면에서는 "QR을 못 읽는다"로 보였는데, 실은 읽어놓고
 * 작다고 버린 것이었다.
 *
 * 되돌린 값은 실제 크기의 어림이라 딱 맞지는 않는다. 다만 틀리는 방향이 하나뿐이다 —
 * 조금 크게 잡힌다. 여기서 크게 잡으면 목록 캡처 속 썸네일이 통과할 수 있고, 작게 잡으면
 * 멀쩡한 QR이 사라진다. 사라지는 쪽이 나쁘다.
 */
function barcodeCoverage(points, width, height, codeType) {
  if (!points || points.length === 0 || !width) return null;
  const xs = points.map((point) => point.getX()).filter((n) => Number.isFinite(n));
  if (xs.length === 0) return null;
  let spread = Math.max(...xs) - Math.min(...xs);

  if (codeType === 'QR_CODE' || codeType === 'DATA_MATRIX') {
    // 네모라 세로로도 같은 크기다. 무늬가 셋뿐이라 한쪽이 짧게 나올 수 있어 큰 쪽을 쓴다.
    const ys = points.map((point) => point.getY()).filter((n) => Number.isFinite(n));
    if (ys.length > 0) spread = Math.max(spread, Math.max(...ys) - Math.min(...ys));
    // 재는 자리가 무늬 가운데라 짧다. 그 몫을 되돌린다.
    spread /= QR_FINDER;
    // 네모난 코드는 사진의 짧은 변에 견준다. 세로로 긴 기프티콘 캡처에서 세로에 견주면
    // 같은 QR이 절반으로 작아진다.
    return spread / (Math.min(width, height || width) || width);
  }

  return spread / width;
}

// 네모난 코드의 자. 막대와 따로 둔다.
//
// 0.25는 막대를 재서 정한 값이다. 실측이 남아 있다 — 스타벅스 원본 0.477, 캡처 0.512.
// 막대는 카드 가로를 거의 다 쓰기 때문에 그렇게 나온다.
//
// QR은 네모라 그 자를 댈 수가 없다. 같은 카드에 같은 크기로 박혀 있어도 가로만 놓고
// 보면 막대의 절반이다. 썬키스트가 0.226으로 재어져 걸렸는데, 1080px 화면에서 244px
// 짜리 QR이다 — 계산대에 내밀면 그냥 읽히는 크기다.
//
// 이 자가 막으려는 것은 "목록 화면을 통째로 찍은 캡처"다. 거기 실린 QR은 훨씬 작다 —
// 모아콘 목록의 썸네일이 62px(5.7%)이고, 두 배로 큰 목록이어도 11.5%다.
// 0.15면 그 둘 사이가 넉넉히 갈린다. 위로도 아래로도 여유가 있다.
const MIN_SQUARE_COVERAGE = 0.15;

/**
 * 이 사진의 코드가 쓸 만한 크기인가.
 *
 * 못 잰 것(null)은 통과시킨다. 모른다는 것과 작다는 것은 다르다 — 모름을 작음으로
 * 치면, 자리를 안 알려주는 판독기가 읽어낸 건은 전부 버려진다.
 */
function bigEnough(coverage, codeType) {
  if (coverage == null) return true;
  const floor = codeType === 'QR_CODE' || codeType === 'DATA_MATRIX' ? MIN_SQUARE_COVERAGE : MIN_BARCODE_COVERAGE;
  return coverage >= floor;
}

async function loadImage(src) {
  return new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = src;
  });
}

// 네이티브가 주는 base64에는 접두사가 없다.
// 네이티브는 늘 JPEG로 줄여서 넘긴다(GalleryPlugin.readImage).
const asDataUrl = (base64) => `data:image/jpeg;base64,${base64}`;

// 예전에 확대(2·3·4배) 사다리를 넣었다가 뺀 적이 있다 — 그때는 증거 없이 넣었고,
// 확대는 캔버스가 커져 정밀 탐색이 12초에서 42초가 됐다. 지금 사다리는 반대로 축소
// 쪽이라 캔버스가 작아지고(실패해도 장당 0.2~0.6초), 배율마다 실물로 재서 넣었다.
// 근거는 barcodeScaleLadder 위 주석에 있다.

// 그림의 크기.
//
// 두 가지가 온다. <img>는 naturalWidth를, ImageBitmap과 캔버스는 width를 갖는다.
// 고른 사진은 ImageBitmap으로 펼치므로(readPickedFile) 여기서 갈라줘야 한다 —
// 안 가르면 undefined가 배율 계산에 들어가 캔버스가 1px이 된다.
function sizeOf(image) {
  return {
    width: image.naturalWidth || image.width || 0,
    height: image.naturalHeight || image.height || 0,
  };
}

async function decodeBarcode(read, pass = SHALLOW) {
  // 원본 그림을 들려 보냈으면 그걸로 읽는다.
  //
  // 직접 고른 사진이 그렇다. 그 전에는 여기서 read.data — 2000px으로 줄여 JPEG로 구운
  // 사본 — 을 도로 펼쳐 읽었는데, 그러면 줄이기 한 번과 JPEG 한 번을 거친 그림에
  // 아래 사다리가 또 줄이기를 건다. 막대는 그걸 견디지만 QR은 못 견딘다. QR은 잘고
  // 네모난 칸이 격자로 붙어 있어서 JPEG의 8×8 블록이 칸 경계를 뭉개고, 그러면 격자가
  // 안 읽힌다. 실제로 같은 썬키스트 QR이 한 장으로 올리면 읽히고(그 길은 캔버스에서
  // 바로 읽는다) 여러 장에 섞으면 안 읽혔다.
  //
  // read.data는 그대로 둔다. 그건 모델에게 보낼 그림이라 JPEG가 맞다.
  const image = read.image || (await loadImage(asDataUrl(read.data)));
  const { width, height } = sizeOf(image);
  const longEdge = Math.max(width, height);

  // 사다리의 맨 윗단을 2000px으로 묶는다.
  //
  // 사본으로 읽던 시절에는 사본이 이미 2000px이라 '원본 그대로(배율 1)'가 곧 2000px이었다.
  // 이제 원본을 그대로 받으니 그 단이 4000px 캔버스가 될 수 있는데, 그건 앞단이 다 실패한
  // 사진에서만 도는 단이라 느려지는 쪽이 하필 기프티콘이 아닌 사진들이다.
  const cap = READ_EDGE / longEdge;
  const steps = barcodeScaleLadder(longEdge, pass.deep);
  // 작은 그림을 규격 크기까지 키워보는 단. 맨 뒤에 둔다 — 앞단에서 읽히는 사진이
  // 대부분이라, 여기까지 오는 것은 그 사진들이 아니다.
  if (pass.minEdge && longEdge < pass.minEdge) steps.push(pass.minEdge / longEdge);
  const rungs = [...new Set(steps.map((f) => Math.min(f, cap)))];

  let found = null;
  let usedFactor = 1;
  for (const factor of rungs) {
    found = await decodeAt(image, width, height, factor, false);
    if (found) {
      usedFactor = factor;
      break;
    }
  }
  // 사다리가 다 실패했을 때만 정밀(tryHarder)을 한 번. tryHarder는 1차원 판독기를 맨
  // 뒤로 미뤄서 성공해도 느리다 — 사다리 단마다 켜면 실패 사진마다 그 값을 곱으로 낸다.
  if (!found && pass.tryHarder) {
    const factor = Math.min(1, 900 / longEdge);
    found = await decodeAt(image, width, height, factor, true);
    usedFactor = factor;
  }
  // 못 읽었으면 막대가 있기라도 한지 본다. 사진을 이미 열어둔 이 자리가 제일 싸다.
  let bars = false;
  let hint = null;
  if (!found) {
    hint = { size: `${width}×${height}` };
    bars = looksLikeBarcode(image, hint);
    // 막대가 보이는데 못 읽었으면 무거운 판독기를 한 번 부른다.
    // QR은 그 자를 통과 못 하므로, 고른 사진에서는 막대가 안 보여도 한 번 부른다(PICKED).
    if (bars || pass.lastResort) found = await decodeWithWasm(image, width, height);
  }

  if (!found) {
    // hint는 진단용이다. 출시 때는 이 return을 예전 한 줄로 되돌린다.
    //   return { code: null, bars: looksLikeBarcode(image) };
    return { code: null, bars, hint: bars ? hint : null };
  }

  // 읽을 것이 있는 사진인지도 같이 재둔다. 어느 사진을 대표로 보낼지 고를 때 쓴다.
  // 사진을 이미 열어둔 자리라 여기서 재는 게 제일 싸다.
  const rich = infoRichness(image);

  // 읽혔다고 바로 믿지 않는다. 배율을 바꿔 한 번 더 읽고, 두 번 다 같은 값일 때만 그대로
  // 쓴다. 갈리면 확인 쪽을 택한다(실제로 한 자리가 틀린 채 등록된 일이 있었다 — 7이 2로.
  // ITF처럼 검산 자리가 없는 형식은 걸러지지도 않는다). 두 번째로는 못 읽었다면 확인은
  // 못 한 것이지만, 읽은 것은 읽은 것이다.
  // 마지막 판(wasm)이 읽어낸 건은 여기서 다시 확인하지 않는다. 이 확인은 zxing-js가
  // 한 자리를 잘못 읽는 것을 잡으려고 둔 것인데, 저쪽은 애초에 zxing-js가 못 읽은
  // 사진이라 배율만 바꿔 다시 물어봐도 늘 빈손으로 돌아온다.
  if (found.viaWasm) return { ...found, rich };

  // 읽혔다고 바로 믿지 않는다. 배율을 바꿔 한 번 더 읽고, 두 번 다 같은 값일 때만 그대로
  // 쓴다. 갈리면 확인 쪽을 택한다(실제로 한 자리가 틀린 채 등록된 일이 있었다 — 7이 2로.
  // ITF처럼 검산 자리가 없는 형식은 걸러지지도 않는다). 두 번째로는 못 읽었다면 확인은
  // 못 한 것이지만, 읽은 것은 읽은 것이다.
  const again = await decodeAt(image, width, height, usedFactor * 0.85, false);
  const chosen = !again || again.code === found.code ? found : again;
  return { ...chosen, rich };
}

// zxing-wasm이 쓰는 형식 이름을 우리(zxing-js) 이름으로 옮긴다. 화면이 바코드를 다시
// 그릴 때 이 이름으로 규격을 고르므로(BarcodeModal), 갈리면 계산대에서 못 쓴다.
const WASM_FORMATS = {
  Code128: 'CODE_128',
  Code39: 'CODE_39',
  Code93: 'CODE_93',
  Codabar: 'CODABAR',
  'EAN-13': 'EAN_13',
  'EAN-8': 'EAN_8',
  'UPC-A': 'UPC_A',
  'UPC-E': 'UPC_E',
  ITF: 'ITF',
  QRCode: 'QR_CODE',
  DataMatrix: 'DATA_MATRIX',
  PDF417: 'PDF_417',
  Aztec: 'AZTEC',
};

// wasm에 넘길 그림의 긴 변. 원본 그대로 넘겨도 되지만 큰 사진은 값만 커진다.
const WASM_EDGE = 1600;

let wasmRead = null;

/**
 * 마지막 판. zxing-cpp를 WebAssembly로 부른다.
 *
 * ── 왜 판독기가 둘인가 ────────────────────────────────────────────────────
 * 실물 두 장으로 확인했다. 스타벅스 카드(662×1440)와 스마일콘 배스킨(404×677)은
 * zxing-js로는 어떤 배율·어떤 이진화·바코드만 잘라내도 안 읽힌다. 배율 사다리 전부,
 * HybridBinarizer와 GlobalHistogramBinarizer 둘 다, 띠만 잘라 1·2·3배로 키운 스물넷,
 * 형식을 CODE_128로 못박고 Code128Reader를 직접 부른 것까지 — 전부 빈손이었다.
 * 같은 파일을 zxing-cpp는 원본 크기 그대로 40밀리초에 읽는다. 배율이나 여백 문제가
 * 아니라 판독기의 한계다.
 *
 * 그렇다고 zxing-js를 걷어내지는 않는다. 지금 잘 읽히는 수백 장이 그것으로 읽힌 것이고,
 * 갈아치우면 그 수백 장이 다시 시험 대상이 된다. 못 읽은 사진에만 이쪽을 부른다.
 *
 * ── 값 ────────────────────────────────────────────────────────────────
 * 여기까지 오는 사진은 막대가 보이는데 못 읽은 것뿐이다. 실물 훑기에서 쉰여덟 장 중
 * 넷이었다. 밥 사진은 막대가 안 보여서 이 줄을 아예 지나가지 않는다.
 * 판독 자체는 장당 40~50밀리초로 오히려 사다리(200~600밀리초)보다 싸다.
 *
 * 판독기는 1MB짜리 wasm이라 여기서 처음 필요할 때만 받아온다. 앱을 열기만 하고
 * 훑지 않는 사람은 이걸 내려받지 않는다.
 */
async function decodeWithWasm(image, width, height) {
  try {
    if (!wasmRead) {
      const [reader, wasmUrl] = await Promise.all([
        import('zxing-wasm/reader'),
        import('zxing-wasm/reader/zxing_reader.wasm?url').then((m) => m.default),
      ]);
      // 기본값은 CDN에서 받아온다. 앱은 인터넷 없이도 돌아야 하므로 같이 넣은 파일을 쓴다.
      reader.prepareZXingModule({ overrides: { locateFile: () => wasmUrl } });
      wasmRead = reader.readBarcodes;
    }

    const scale = Math.min(1, WASM_EDGE / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    // 크기를 먼저 챙긴다. 아래에서 캔버스를 비우고 나면 canvas.width가 0이 되는데,
    // 예전에는 그걸로 코드 크기를 나누고 있었다(0으로 나눠 Infinity).
    const readWidth = canvas.width;
    const readHeight = canvas.height;
    canvas.width = 0;
    canvas.height = 0;

    // 기본값 그대로 쓴다. 스마일콘은 tryHarder·tryInvert·tryDownscale을 다 켠 판에서만
    // 읽혔다 — 빠른 판으로는 여기서도 못 읽는다. 어차피 드물게 오는 길이라 값을 아낄
    // 자리가 아니다.
    const found = await wasmRead(pixels, { maxNumberOfSymbols: 1 });
    const hit = found?.[0];
    if (!hit?.text) return null;

    // 위 barcodeCoverage와 같은 자를 쓴다. 자리를 안 알려주면 null(모름)이 되고,
    // 모름은 아래에서 통과한다 — 읽어낸 것을 못 쟀다고 버리면 안 된다.
    const corners = [
      hit.position?.topLeft,
      hit.position?.topRight,
      hit.position?.bottomLeft,
      hit.position?.bottomRight,
    ]
      .filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y))
      .map((p) => ({ getX: () => p.x, getY: () => p.y }));
    const wasmType = WASM_FORMATS[hit.format] || null;

    return {
      code: hit.text,
      codeType: wasmType,
      coverage: barcodeCoverage(corners, readWidth, readHeight, wasmType),
      // 확인 판독을 건너뛰라는 표시. 위에서 쓴다.
      viaWasm: true,
    };
  } catch {
    // 못 받아왔거나(인터넷·용량) 여기서 터졌으면 못 읽은 것으로 둔다. 이 길은 덤이라
    // 실패해도 앞의 결과가 달라지지 않는다.
    return null;
  }
}

async function decodeAt(image, width, height, scale, tryHarder) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  // 키울 때는 보간을 끈다. 정수배로 키우므로 원본 픽셀이 그대로 복제되고, 검정과 흰색
  // 사이에 없던 회색이 끼지 않는다. 줄일 때는 반대다 — 여러 픽셀을 하나로 모아야 하니
  // 보간이 있어야 막대가 통째로 사라지지 않는다.
  ctx.imageSmoothingEnabled = scale <= 1;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  try {
    const reader = new BrowserMultiFormatReader(tryHarder ? HARD_HINTS : undefined);
    const result = await reader.decodeFromCanvas(canvas);
    // 크기를 재는 자가 형식에 따라 다르다(QR은 몫을 되돌린다). 먼저 꺼내둔다 —
    // 아래 객체 안에서 codeType을 쓰면 그건 속성 이름이지 값이 아니다.
    const codeType = result.getBarcodeFormat ? BarcodeFormat[result.getBarcodeFormat()] || null : null;
    return {
      code: result.getText(),
      codeType,
      // 바코드가 이 사진에서 차지하는 가로 비율. 크기와 달리 비율은 발행사가 달라도
      // 뜻이 같다 — 바코드를 보여주려고 찍었는지, 어쩌다 한구석에 들어갔는지를 가른다.
      coverage: barcodeCoverage(result.getResultPoints?.(), canvas.width, canvas.height, codeType),
    };
  } catch {
    return null;
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

// ── 이 사진에 읽을 것이 있는가 ────────────────────────────────────────────
//
// 발행사가 만든 카드에는 상품명·금액·유효기간이 브랜드 색과 함께 꽉 차 있다.
// 앱 화면을 찍은 캡처는 흰 바탕에 검은 글자고, 계산대용으로 바코드만 크게 띄운 캡처는
// 여백에 막대 하나다. 같은 기프티콘의 사진이 여러 장일 때 어느 것을 모델에게 보낼지가
// 이 값으로 갈린다.
//
// 두 가지를 더해서 본다.
//   잉크 — 가장 흔한 밝기(=배경)를 빼고 남는 비율. 글자와 그림이 얼마나 차 있는가.
//          밝기가 몇 이하인지로 세지 않는 이유는 다크 모드다 — 검은 바탕에 흰 막대인
//          캡처를 "어두운 픽셀"로 세면 온통 잉크로 잡혀 정보가 꽉 찬 사진으로 둔갑한다.
//   색   — 색이 있는 픽셀 비율. 앱 화면에는 뒤로가기·검색·닫기 같은 무채색 UI가 넓고,
//          발행 카드는 브랜드 색으로 덮여 있다.
//
// ── 넣었다가 뺀 것: 우상단 모서리 ──
// "우측 최상단에 X가 있으면 스크린샷"이라는 생각으로 그 자리의 색 비율을 재봤다.
// 실측은 그럴듯했다 — 스크린샷 0.000, 앱 화면 캡처 0.000, 발행 원본 0.310~1.000.
// 그런데 최저였던 기프티쇼 카드의 픽셀을 찍어보니 오른쪽 가장자리가 세로로 전부
// 흰색이었다. 0.310은 5% 띠가 우연히 빨강 블록 끄트머리를 문 값이고, 여백이 조금만
// 넓었으면 0이다. 반대 방향도 있다 — 카톡 선물함처럼 헤더가 노란 앱 화면을 캡처하면
// 그 자리가 색으로 차서 스크린샷이 원본을 이긴다.
// 한 자리만 보는 규칙은 양쪽으로 뒤집힌다. 다시 넣지 않는다.
//
// ── 실측 (2026-08-20, 태수님이 올린 실물) ──
//                                 색      잉크     합
//   스벅 원본 800x1670           0.436   0.587   1.023
//   같은 기프티콘 선물하기 캡처   0.160   0.344   0.504   ← 갈라야 하는 짝
//   교촌 원본                    0.288   0.390   0.678
//   라떼 원본                    0.436   0.560   0.996
//   투썸 원본                    0.283   0.435   0.718
//   카드1618 원본                0.515   0.576   1.091
//   giftishow 450 원본           0.253   0.472   0.725
//   카톡이 줄여 보낸 배스킨       0.417   0.490   0.907
//   바코드만 크게 띄운 캡처       0.03    0.031   0.06
//   같은 것, 다크 모드            0.03    0.136   0.17
//
// 잉크만으로는 아슬아슬했다 — 원본 최저가 0.350인데 갈라야 할 캡처가 0.344다. 태수님이
// 올린 스벅은 0.587이라 갈렸지만 교촌이었으면 뒤집혔다. 색을 더하면 원본 최저 0.678,
// 캡처 0.504로 벌어진다. 그래도 넉넉하지는 않다 — 그래서 이 판단으로 사진을 버리지
// 않는다. 순서만 정하고, 틀려도 값이 사라지지 않게 둔다(아래 pool 참고).
//
// 이 숫자를 바꾸려면 위 실측부터 다시 해야 한다 — 재던 스크립트는 scratchpad/repro다.

// 이보다 낮으면 읽을 것이 없는 사진으로 본다. 다크 모드 바코드 캡처(0.17)와
// 갈라야 할 캡처(0.504) 사이.
const MIN_RICHNESS = 0.35;

// 이만큼도 차이 안 나면 같은 종류의 사진으로 보고 순서를 coverage에 넘긴다.
// 실측에서 갈라야 했던 두 장은 0.174 벌어져 있었다(원본 최저 0.678 ↔ 캡처 0.504).
const RICHNESS_TIE = 0.10;

const RICHNESS_WIDTH = 240;

function infoRichness(image) {
  const source = sizeOf(image);
  const width = Math.min(RICHNESS_WIDTH, source.width || RICHNESS_WIDTH);
  const scale = width / (source.width || width);
  const height = Math.max(1, Math.round((source.height || width) * scale));

  const canvasWidth = Math.max(1, width);
  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  // jsdom에는 2d 컨텍스트가 없다. 시험에서는 재지 않는다 — 값이 없으면 부르는 쪽이
  // "모른다"로 보고 넘어간다.
  if (!ctx) return undefined;
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  let data;
  try {
    data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  } catch {
    return undefined;
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }

  const hist = new Uint32Array(256);
  const total = data.length / 4;
  let colored = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    // 정수로 내려야 한다. 소수 자리가 남으면 배열이 아니라 이름표로 들어가서 아무 데도
    // 안 쌓이고, 히스토그램이 통째로 0이 된다.
    hist[((r * 299 + g * 587 + b * 114) / 1000) | 0] += 1;
    if (Math.max(r, g, b) - Math.min(r, g, b) > COLOR_EDGE) colored += 1;
  }
  let peak = 0;
  for (let value = 1; value < 256; value += 1) if (hist[value] > hist[peak]) peak = value;

  let background = 0;
  for (let value = Math.max(0, peak - 12); value <= Math.min(255, peak + 12); value += 1) {
    background += hist[value];
  }
  const ink = 1 - background / total;
  return ink + colored / total;
}

// 이만큼 벌어져야 "색이 있다"고 본다. 사진 압축이 남기는 색 얼룩은 이 아래다.
const COLOR_EDGE = 30;

// ── 막대가 있는지만 본다 (읽지는 않는다) ──────────────────────────────────
//
// 읽는 것과 있는지 보는 것은 다른 일이다. 막대 굵기를 하나하나 재서 숫자로 바꾸려면
// 막대 하나가 두세 픽셀은 돼야 하는데, 카톡이 404픽셀로 줄여 보낸 카드는 1.4픽셀이라
// 어떤 배율로 키워도 안 된다(실제로 1·2·3·4·6배를 다 재봤다). 그런데 사람 눈에는 그
// 카드에도 바코드가 보인다. 읽을 수 없을 뿐이다.
//
// 그 "보인다"를 흉내낸다. 밝기가 자주 뒤집히는 가로줄이 세로로 연달아 있고, 뒤집히는
// 자리가 위아래로 비슷하면 막대다.
//
// 마지막 조건이 핵심이다. 글자가 빽빽한 줄도 밝기는 자주 뒤집히지만 줄마다 자리가
// 다르다. 바코드는 위아래가 거의 같은 자리에서 뒤집힌다 — 그게 밥 사진·문서 캡처와
// 갈리는 지점이다.
//
// 휴리스틱이라 줄무늬 옷이나 블라인드를 짚을 수 있고, 아주 흐린 것은 놓친다.
// 이 값으로 무엇을 지우거나 등록하지 않는다. "여기 있을지도 모른다"고 말할 뿐이다.
const BARS_WIDTH = 240;
const BARS_MAX_HEIGHT = 480;
// 한 줄에서 밝기가 이만큼 뒤집히면 빽빽한 줄로 본다. 바코드는 수십 번 뒤집힌다.
const BARS_MIN_EDGES = 18;
// 그런 줄이 세로로 이만큼 이어져야 막대로 본다. 글자 한 줄은 이만큼 안 이어진다.
const BARS_MIN_ROWS = 6;
// 위아래 줄의 뒤집히는 자리가 이만큼 겹쳐야 한다.
//
// 0.6으로 뒀다가 올렸다. 뒤집히는 자리가 촘촘하면(240픽셀에 여든 곳쯤) 아무 상관 없는
// 두 줄도 우연히 일고여덟은 겹친다 — 굵기가 제각각인 무작위 줄무늬 두 개로 재보니 0.7이
// 나왔다. 진짜 막대는 위아래가 거의 그대로 겹쳐서 1에 가깝다. 그 사이를 갈라야 한다.
const BARS_MATCH = 0.85;

function edgesOfRow(data, offset, width) {
  // 그 줄의 평균보다 밝은지 어두운지로 가른다. 조명이 고르지 않아도 줄 단위로 보면
  // 기울기가 작아서, 줄마다 제 평균을 쓰는 것으로 충분하다.
  let sum = 0;
  const gray = new Array(width);
  for (let x = 0; x < width; x += 1) {
    const i = offset + x * 4;
    const value = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
    gray[x] = value;
    sum += value;
  }
  const mean = sum / width;

  const edges = [];
  let dark = gray[0] < mean;
  for (let x = 1; x < width; x += 1) {
    const nowDark = gray[x] < mean;
    if (nowDark !== dark) {
      edges.push(x);
      dark = nowDark;
    }
  }
  return edges;
}

function overlapRatio(a, b) {
  if (a.length === 0 || b.length === 0) return 0;
  let matched = 0;
  let j = 0;
  for (const x of a) {
    while (j < b.length && b[j] < x) j += 1;
    if (j < b.length && b[j] === x) matched += 1;
  }
  return matched / a.length;
}

/**
 * out을 주면 막대를 찾은 자리의 치수를 채워 넣는다(진단용. 출시 전에 뺀다).
 *
 * 왜 못 읽었는지는 막대 굵기 하나가 거의 다 말해준다. 카톡이 404픽셀로 줄여 보낸
 * 카드는 막대 하나가 1.4픽셀이라 어떤 배율로도 못 읽고, 3픽셀쯤 나오는데도 못 읽었다면
 * 굵기 말고 다른 데 원인이 있다는 뜻이다. 화면에서 그 둘을 갈라 보려고 재둔다.
 */
export function looksLikeBarcode(image, out = null) {
  try {
    const source = sizeOf(image);
    const scale = Math.min(1, BARS_WIDTH / source.width);
    const width = Math.max(1, Math.round(source.width * scale));
    const height = Math.min(BARS_MAX_HEIGHT, Math.max(1, Math.round(source.height * scale)));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0, width, height);
    const { data } = ctx.getImageData(0, 0, width, height);
    canvas.width = 0;
    canvas.height = 0;

    let run = 0;
    let previous = null;
    for (let y = 0; y < height; y += 1) {
      const edges = edgesOfRow(data, y * width * 4, width);
      const dense = edges.length >= BARS_MIN_EDGES;
      const aligned = dense && previous && overlapRatio(edges, previous) >= BARS_MATCH;
      run = aligned ? run + 1 : dense ? 1 : 0;
      if (run >= BARS_MIN_ROWS) {
        // 진단용. 여기 이 if 안쪽만 빼면 예전으로 돌아간다.
        if (out) {
          // 이 캔버스는 240픽셀로 줄인 것이라, 원본 픽셀로 되돌려 재야 뜻이 있다.
          const back = source.width / width;
          const first = edges[0];
          const last = edges[edges.length - 1];
          out.span = Math.round(((last - first) / width) * 100);
          // 뒤집히는 자리 사이가 막대(또는 빈칸) 하나다. '모듈'이라고 적었었는데 그건
          // 틀린 말이다 — 막대 하나는 모듈 한 칸일 수도 네 칸일 수도 있다.
          out.gap = Math.round(((last - first) / edges.length) * back * 10) / 10;
          // 막대 양옆에 남은 빈 자리. 규격은 막대 열 칸을 요구하는데, 이게 좁으면
          // 굵기가 충분해도 판독기가 시작을 못 잡는다.
          out.quiet = Math.round((Math.min(first, width - last) / width) * 100);
        }
        return true;
      }
      previous = dense ? edges : null;
    }
    return false;
  } catch {
    // 못 보면 모르는 것으로 둔다. 이 값으로 막는 것이 없으므로 안전한 쪽이 없음이다.
    return false;
  }
}

// 사진첩에서 한 장 가져오기. 네이티브가 줄여서 base64로 준다.
//
// 한때 판마다 화질을 달리 줬다. 정밀 탐색만 95로 올려 얇은 막대를 살려보려던 것인데,
// 그 카드는 어떤 화질로도 안 읽혀서 되돌렸다. 이제 세 판이 다 같은 값이라 네이티브
// 기본값(85)에 맡긴다.
// 진단용으로 그림까지 들고 갈 사진 수. 출시 전에 이 상수와 쓰는 자리를 함께 뺀다.
const DIAG_SHOTS = 12;

function readFromGallery(image) {
  return MoaconGallery.readImage({ id: String(image.id), maxEdge: READ_EDGE });
}

/**
 * 사진 목록을 훑어 후보를 모은다. 얕은 판과 깊은 판이 같은 이 함수를 쓴다.
 *
 * pass          — 어떤 조건으로 읽을지(SHALLOW / DEEP).
 * isRegistered  — 이미 등록된 번호인지 묻는 함수. 화면 쪽에서 넘긴다.
 * skipCodes     — 이미 후보로 잡아둔 번호. 깊은 판에서 같은 것을 또 만들지 않는다.
 * read          — 사진 하나를 base64로 가져오는 함수. 어디서 오는지만 다르고
 *                 묶는 규칙은 같아서, 그 한 걸음만 밖에서 넘겨받는다.
 *                 사진첩은 네이티브에게 묻고, 직접 고른 사진은 브라우저에서 줄인다.
 */
async function collect({ images, read: readImage, pass, isRegistered, skipCodes, onProgress, onCandidate, onMissed, signal, rescueMissed = false }) {
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
  // ── 진단용. 출시 전에 뺀다 ────────────────────────────────────────────────
  // 못 읽은 사진이 어느 것인지 화면에서 눈으로 보려고, 막대처럼 보인 것만 읽어둔 그림을
  // 함께 들고 간다. 이름과 사진첩만으로는 갤러리에서 찾아 열기까지가 멀다.
  // 전부 들고 가지 않는 이유는 아래 push 자리에 적어뒀다.
  let diagShots = 0;

  for (const [index, image] of images.entries()) {
    if (signal?.aborted) break;
    onProgress?.({ scanned: index, total: images.length, found: candidates.length });
    // 한 박자 쉬어 화면이 그려지게 한다. 바로 다음 사진을 읽어버리면 진행 표시를 바꿔놓고도
    // 그릴 틈이 없어서, 막대가 뚝뚝 끊겨 멈춘 것처럼 보인다.
    await new Promise((resolve) => setTimeout(resolve, 0));

    let read;
    try {
      read = await readImage(image, pass);
    } catch {
      // 한 장을 못 읽는다고 전체가 멈추면 안 된다. 너무 큰 사진이거나 지워진 것이다.
      readFailed += 1;
      continue;
    }

    // decodeBarcode는 사진을 못 여는 경우 예외를 낸다. 이걸 잡지 않으면 그 한 장 때문에
    // 훑기 전체가 중단되고, 사용자에게는 이유 없이 "훑지 못했어요"만 뜬다.
    let found = null;
    try {
      found = await decodeBarcode(read, pass);
    } catch {
      readFailed += 1;
      continue;
    } finally {
      // 바코드를 읽고 나면 펼쳐둔 원본은 더 쓸 데가 없다. 요즘 폰 사진은 한 장에 수십
      // MB라, 놓지 않으면 고른 장수만큼 그대로 쌓인다. (finally는 위 continue보다 먼저
      // 돈다 — 못 읽은 사진도 여기서 놓인다.)
      read.release?.();
      read.image = null;
    }
    if (!found?.code) {
      // 막대로 보이는지를 함께 들고 간다. 화면이 "여기 있을지도 모른다"고 말할 때 쓴다.
      //
      // 그림(base64)은 들고 가지 않는다. 한때는 직접 고른 사진일 때 들고 가서 화면이
      // 서버에 물어봤는데, 이제 못 읽은 사진은 아무 데도 안 쓰고 버린다. 한 장에 수백
      // KB라, 안 쓸 것을 들고 있으면 고른 장수만큼 그대로 쌓인다.
      //
      // 막대처럼 보인 것 몇 장만 예외로 남긴다(진단용. 출시 전에 뺀다).
      const bars = Boolean(found?.bars);
      const withShot = bars && diagShots < DIAG_SHOTS;
      if (withShot) diagShots += 1;
      // hint는 진단용이다(왜 못 읽었는지 재둔 치수). 출시 때 함께 뺀다.
      const shot = { ...image, bars, hint: found?.hint || null, ...(withShot ? { data: read.data } : null) };
      missed.push(shot);
      // 한 장씩 알려준다. 부르는 쪽이 '이 사진은 봤다'를 그때그때 적어두기 위해서다 —
      // 다 끝난 뒤에 한꺼번에 적으면 중간에 그만뒀을 때 한 장도 안 남는다.
      onMissed?.(shot);
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
      if (already.shots.length < COLLECT_PER_CODE) {
        already.shots.push({ data: read.data, bucket: image.bucket, coverage: found.coverage, rich: found.rich });
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
      // 고르기 전의 사진 조각들. 같은 번호의 사진이 더 나오면 여기에 붙고,
      // 훑기가 끝나면 아래에서 골라 images로 옮긴다.
      shots: [{ data: read.data, bucket: image.bucket, coverage: found.coverage, rich: found.rich }],
      // 화면이 곧바로 쓰는 미리보기. 아래에서 고른 결과로 갈아끼워진다.
      //
      // 예전에는 여기에도 위의 조각 객체를 그대로 넣었는데, 화면은 이걸 base64 문자열로
      // 알고 쓴다. 그래서 훑는 동안 올라온 카드의 사진이 전부 깨져 검은 칸으로 보였다.
      images: [read.data],
      // 다 훑기를 기다리지 않고 지금 보내도 되는지. 위 canReadEarly가 정한다.
      readyNow: canReadEarly(image.bucket, found.coverage, found.codeType),
    };
    seenCodes.set(found.code, candidate);
    candidates.push(candidate);
    // 찾자마자 알려준다. 화면은 이걸 받아 카드를 한 장씩 쌓고, readyNow인 것은 그
    // 자리에서 읽기까지 건다 — 다 끝난 뒤에 한꺼번에 보여주면 그동안 아무 일도 안
    // 일어나는 것처럼 보인다.
    onCandidate?.(candidate);
  }

  // 바코드가 없는 사진은 여기서 아무 데도 붙이지 않는다.
  //
  // 한때 후보가 하나뿐이면 그 건에 붙였다. 원본 하나에 금액이 적힌 정보 캡처 하나 —
  // 흔한 모양이고 대개 맞았다. 그런데 그 전제가 틀렸다. 바코드 없이 번호만 인쇄된
  // 기프티콘이 있다(파인트 아이스크림 쿠폰). 그것도 "후보가 하나뿐"인 자리에 걸려서,
  // 서로 다른 기프티콘 둘이 한 건으로 저장됐다 — 파인트의 상품명과 기한이 스타벅스
  // 것으로 들어가고 파인트는 아예 없던 것이 됐다.
  //
  // 곁가지인지 딴 물건인지는 그림만 봐서는 못 가른다. 번호가 인쇄돼 있는지를 봐야 하고,
  // 그건 서버가 사진을 읽어야 안다. 그래서 붙이는 판단을 서버가 답한 뒤로 미룬다 —
  // 화면(GalleryScanSheet)이 못 읽은 사진을 후보로 세워 물어보고, 번호가 없는 것으로
  // 밝혀지면 그때 접는다.

  // 모아둔 사진 중 등록에 넘길 것을 고른다.
  //
  // 목록은 최근 것부터 오는데, 그대로 앞에서 자르면 나중에 찍은 캡처만 남는다. 원본은
  // 받은 그날 담기고 캡처는 쓸 때 찍으니 원본이 늘 더 오래됐기 때문이다. 실제로 카카오톡
  // 원본이 이렇게 밀려나서, 거기 적힌 유효기간을 못 읽는 일이 있었다.
  candidates.forEach((candidate) => {
    // 바코드가 너무 작게 찍힌 것은 뺀다. 다만 그것밖에 없으면 그거라도 쓴다 —
    // 등록 자체가 막히는 것보다는 낫고, 바코드 번호는 이미 읽어놨다.
    const meaningful = candidate.shots.filter((shot) => bigEnough(shot.coverage, candidate.codeType));
    const usable = meaningful.length > 0 ? meaningful : candidate.shots;

    // 쓸 만한 크기의 사진이 하나도 없다는 표시. 번호는 제대로 읽혔지만(막대에는 검산
    // 자리가 있다) 그 사진으로는 상품명도 기한도 읽을 수가 없다.
    //
    // 앱 화면을 통째로 찍은 캡처가 여기 걸린다. 68px짜리 썸네일 안의 막대도 zxing은
    // 읽어낸다. 그런데 그 그림에는 다른 기프티콘이 같이 찍혀 있어서, 모델이 옆칸의
    // 금액과 기한을 이 기프티콘 것으로 읽어온다 — 실제로 스타벅스 쿠폰에 BBQ의
    // 26,500원과 2026.11.04가 들어갔다.
    //
    // 빼는 판단은 여기서 하지 않는다. 훑기는 이걸 빼고 등록하지만, 몇 건인지 세는 쪽
    // (등록 화면이 다건으로 넘길지 정할 때)은 이것도 한 건으로 세야 한다. 안 그러면
    // 작게 찍힌 다른 기프티콘이 통째로 옆 건에 합쳐진다.
    candidate.tooSmall = meaningful.length === 0;

    // 읽을 것이 없어 보이는 사진은 뒤로 민다.
    const informative = usable.filter((shot) => !(shot.rich < MIN_RICHNESS));
    const readable = informative.length > 0 ? informative : usable;

    // 원본이 하나라도 있으면 캡처는 아예 보내지 않는다.
    //
    // 원본에는 상품명·금액·유효기간이 다 적혀 있어서 캡처가 더해줄 게 없다. 반면 해가 될
    // 수는 있다 — 목록 화면을 찍은 캡처에는 다른 기프티콘의 유효기간이 같이 찍혀 있고,
    // 실제로 그 날짜가 이 기프티콘의 기한으로 들어간 적이 있다.
    //
    // 빈칸으로 남는 것보다 틀린 값이 들어가는 쪽이 나쁘다. 기한이 틀리면 알림이 엉뚱한
    // 날에 오고, 정작 만료되는 날에는 아무 말이 없다.
    const originals = readable.filter((shot) => isOriginal(shot.bucket));

    // 폴더를 모를 때(직접 고른 사진)는 아무것도 버리지 않는다.
    //
    // 어느 것이 원본인지 그림만 보고 맞히는 규칙(richness)을 뒀지만, 그 규칙은 틀릴 수
    // 있다 — 기프티쇼 카드처럼 발행사가 만든 것인데도 흰 바탕에 검은 글자뿐인 그림이
    // 있고(색 0.253으로 원본 중 최저), 앱 화면이 다크 모드면 또 값이 달라진다.
    //
    // 그래서 규칙이 틀려도 잃는 게 없게 한다. 순서만 그 규칙으로 정하고, 바코드가
    // 제대로 찍힌 사진은 다 보낸다. 모델은 여러 장을 한 번에 보고 빈칸을 서로 채운다 —
    // 원본에만 있는 유효기간은 원본에서, 캡처에만 있는 것은 캡처에서 읽는다.
    // 순서가 뒤집혀도 값이 사라지지 않는다.
    //
    // 이래도 되는 이유는 위 coverage 거름망이다. 목록 화면을 통째로 찍은 캡처처럼 다른
    // 기프티콘이 같이 찍힌 그림은 바코드가 작게 나와서 이미 빠져 있다.
    const pool = originals.length > 0 ? originals : rescueMissed ? usable : readable;

    // 순서도 그림이 얼마나 차 있는지로 정한다.
    //
    // 거름망만으로는 모자랐다. 태수님이 올린 스타벅스 두 장을 재보니 —
    //   원본 카드(800x1670)        잉크 0.587, coverage 0.477
    //   선물하기 스크린샷(1032x2000) 잉크 0.344, coverage 0.512
    // 둘 다 거름망은 통과하는데 coverage로 줄을 세우면 스크린샷이 앞선다. 그런데 유효기간
    // (2027년 2월 25일)은 원본에만 적혀 있다. "원본을 놔두고 스크린샷을 잡는다"가 이 줄이었다.
    //
    // 잉크가 엇비슷하면 예전처럼 coverage로 가른다. 같은 종류의 사진 둘 중에서는 바코드가
    // 크게 찍힌 쪽이 낫다.
    const sorted = [...pool].sort((a, b) => {
      if (a.rich != null && b.rich != null && Math.abs(b.rich - a.rich) > RICHNESS_TIE) return b.rich - a.rich;
      return (b.coverage ?? 1) - (a.coverage ?? 1);
    });
    candidate.images = sorted.slice(0, IMAGES_PER_CODE).map((shot) => shot.data);
    // 다 골랐으면 나머지 조각은 놓는다. 한 장이 수백 KB라 후보 몇 개만 되어도 쌓인다.
    candidate.shots = null;
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
    read: readFromGallery,
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
    // 번호는 읽혔지만 그 사진으로는 상품명·기한을 읽을 수 없는 것.
    tooSmall: candidates.filter((c) => c.tooSmall).length,
  };

  // 지난 훑기에서 "막대로 보이는데 못 읽음"으로 적힌 사진들. 이번에는 건너뛰었지만
  // 안내에는 계속 나와야 한다(readBarsRemembered 주석 참고).
  const barsRemembered = readBarsRemembered().filter((entry) => !dismissed.has(String(entry.id)));

  return { ...status, candidates, pending: missed, scanned: fresh.length, since, folders, tally, barsRemembered };
}

/**
 * 얕은 판에서 못 찾은 사진을 정밀 탐색으로 한 번 더 뒤진다.
 *
 * 화면이 이미 결과를 보여준 뒤에 조용히 돈다. 여기서 나오는 것은 목록에 얹힌다.
 * 끝까지 돌았을 때만 '바코드 없음'을 적는다 — 중간에 그만두면 다음에 다시 본다.
 */
export async function deepScan({ pending, isRegistered, skipCodes, onProgress, onCandidate, signal } = {}) {
  if (!pending?.length) return { candidates: [] };

  // 막대처럼 보이는 사진을 앞에 세운다.
  //
  // 거르지는 않는다. 한때 이 자를 문으로 썼다가 QR 기프티콘이 통째로 사라진 적이 있다 —
  // looksLikeBarcode는 세로줄을 보는데 QR은 네모 격자라서 그 자를 못 통과한다.
  // 순서만 바꾼다. 총 시간은 같지만, 건질 것이 있으면 앞쪽에서 나온다.
  const ordered = [...pending].sort((a, b) => Number(Boolean(b.bars)) - Number(Boolean(a.bars)));

  // '바코드 없음'을 한 장씩 남긴다.
  //
  // 예전에는 이 판이 끝까지 돌았을 때만 한꺼번에 적었다. 그런데 이 판이 제일 느린
  // 자리다 — 첫 훑기에서는 밥 사진 수백 장을 원본 크기로 다시 본다. 그게 끝나기 전에
  // 창을 닫거나 앱을 끄면 한 장도 안 남고, 다음에 켜면 또 처음부터 128장을 읽었다.
  //
  // 이제 본 만큼 남는다. 매 장 쓰지는 않고 모아서 쓴다 — localStorage에 넣는 값이
  // 목록 통째라, 장마다 쓰면 그 값이 개수만큼 곱해진다.
  let batch = [];
  const flush = () => {
    if (batch.length === 0) return;
    rememberNoBarcode(batch);
    batch = [];
  };

  const { candidates } = await collect({
    images: ordered,
    read: readFromGallery,
    pass: DEEP,
    isRegistered,
    skipCodes,
    onProgress,
    onCandidate,
    onMissed: (image) => {
      batch.push(image);
      if (batch.length >= MARK_BATCH) flush();
    },
    signal,
  });

  // 중간에 그만둔 경우에도 적는다. 여기까지는 실제로 정밀하게 본 사진들이다.
  flush();

  return { candidates };
}

// 후보를 등록 창에 넘길 수 있는 파일들로 바꾼다.
//
// 같은 번호의 사진이 여러 장이면 전부 넘긴다. 등록 창은 여러 장을 받으면 각 장에서 찾은
// 정보를 합쳐 채우기 때문에, 바코드만 찍힌 캡처에 없는 유효기간을 원본 쪽에서 읽어온다.
/**
 * 직접 고른 사진 여러 장을 같은 규칙으로 묶는다.
 *
 * 사진첩 훑기와 다른 점은 사진이 어디서 오는가 하나뿐이라, 묶는 규칙은 collect()를
 * 그대로 쓴다. 같은 번호끼리 한 건으로, 바코드가 너무 작게 찍힌 건 빼고, 이미 등록된
 * 번호는 걸러낸다. 규칙을 두 벌로 두면 "훑으면 묶이는데 직접 올리면 안 묶인다" 같은
 * 일이 생긴다.
 *
 * 아이폰에는 이 길밖에 없다. 사진첩을 훑을 수 없기 때문이다(isGalleryScanSupported).
 *
 * 기본은 정밀 탐색이다. 훑기가 얕게 시작하는 이유는 대부분이 기프티콘이 아닌 사진
 * 수백 장이라서인데, 여기 오는 것은 사람이 골라온 몇 장이다. 애써 볼 값어치가 있고
 * 몇 장뿐이라 오래 걸리지도 않는다.
 *
 * quick을 주면 얕게만 본다. "이 사진들이 몇 건인가"만 알면 되는 자리 — 한 건짜리
 * 등록 화면이 다건으로 넘길지 정할 때 — 를 위한 것이다. 거기서 무거운 판을 돌리면
 * 사진 두 장을 골랐을 뿐인데 몇 초를 서 있게 된다.
 */
export async function groupImages(files, { isRegistered, onProgress, onCandidate, signal, quick = false, skipCodes } = {}) {
  const images = (files || []).map((file, index) => ({
    id: `pick-${index}`,
    name: file.name || `사진 ${index + 1}.jpg`,
    // 폴더를 모른다. 원본인지 캡처인지 가릴 근거가 없으니 아무 쪽으로도 치우치지 않게
    // 비워둔다 — 그러면 아래 고르기에서 전부 같은 자격으로 겨루고, 바코드가 크게 찍힌
    // 순서로 뽑힌다. 사람이 직접 골라온 사진이라 폴더로 짐작할 이유도 적다.
    bucket: null,
    addedAt: Math.floor((file.lastModified || Date.now()) / 1000),
    file,
  }));

  const { candidates, missed, knownCodes, readFailed } = await collect({
    images,
    read: readPickedFile,
    pass: quick ? SHALLOW : PICKED,
    isRegistered,
    skipCodes,
    // 골라 온 사진 몇 장뿐이라, 어느 것이 원본인지 고르는 규칙(richness)으로 버리지
    // 않는다. 바코드가 읽힌 사진은 다 보내고 모델이 빈칸을 서로 채우게 둔다.
    rescueMissed: true,
    onProgress,
    onCandidate,
    signal,
  });

  return {
    candidates,
    // 바코드를 못 찾은 사진. 여기서 끝나는 사진들이다 — 어느 건에도 붙이지 않는다.
    // 등록 창이 이것들만 한 번 더 정밀하게 읽어보고(UploadSheet), 그래도 못 읽으면
    // 떼어낸 뒤 몇 장을 뺐는지 말해준다. 그래서 원본 파일을 그대로 달고 있다.
    missed,
    scanned: images.length,
    tally: {
      readFailed,
      found: candidates.length + knownCodes.size,
      alreadyHave: knownCodes.size,
      // 뺀 사진을 두 갈래로 나눠 센다. 화면이 하는 말이 달라서다.
      //   noCode    — 바코드가 아예 없는 사진. 어느 기프티콘 것인지 몰라서 뺐다.
      //   unreadable — 막대는 보이는데 못 읽은 사진. 기프티콘일 텐데 우리가 놓친 것이라,
      //               직접 등록으로 올려달라고 해야 한다. 카톡이 404픽셀로 줄여 보낸
      //               배스킨 카드가 여기 걸린다.
      noCode: missed.filter((image) => !image.bars).length,
      unreadable: missed.filter((image) => image.bars).length,
      tooSmall: candidates.filter((c) => c.tooSmall).length,
    },
  };
}

// 고른 파일 한 장을 읽는다. 네이티브의 readImage가 하던 일을 브라우저에서 한다.
//
// 둘을 돌려준다.
//   data  — 2000px으로 줄여 JPEG로 구운 base64. 모델에게 보낼 그림이다.
//   image — 펼친 원본. 바코드는 이걸로 읽는다(decodeBarcode 주석 참고) —
//           줄이고 구운 사본으로 읽으면 QR이 뭉개진다.
//
// createImageBitmap을 먼저 쓴다. 파일에서 바로 펼친 그림이라 blob 주소에 매이지 않고,
// 주소를 거둔 뒤에도 그릴 수 있다.
//
// 한때 <img>를 넘기면서 blob 주소는 finally에서 바로 거뒀다. 규격상으로는 이미 펼친
// 그림이 그대로 남아야 하는데, 웹뷰는 화면에 붙지 않은 <img>의 픽셀을 메모리가 아쉬우면
// 버리고 주소로 다시 받아온다. 주소가 없으면 거기서 그리기가 터지고, 그러면 그 사진은
// '바코드 없음'도 아니고 '읽기 실패'가 되어 목록에서 통째로 사라진다 —
// 되묻는 창까지 안 뜬 이유가 이것이었다.
//
// release는 다 읽고 나서 부르는 것이다(collect). 한 장에 수십 MB라 바로 놓아야 한다.
async function readPickedFile(image) {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(image.file);
    return {
      data: shrinkToData(bitmap, bitmap.width, bitmap.height),
      image: bitmap,
      release: () => bitmap.close?.(),
    };
  }

  // createImageBitmap이 없는 환경(오래된 웹뷰, 시험)에서는 <img>로 간다. 이때는 주소를
  // 여기서 거두지 않는다 — 위에 적은 이유 그대로다.
  const url = URL.createObjectURL(image.file);
  let loaded;
  try {
    loaded = await loadImage(url);
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
  return {
    data: shrinkToData(loaded, loaded.naturalWidth, loaded.naturalHeight),
    image: loaded,
    release: () => URL.revokeObjectURL(url),
  };
}

// 모델에게 보낼 그림. 2000px으로 줄여 JPEG base64로.
//
// 화질을 아끼지 않는다. 등록에 넘길 때 여기서 한 번 더 줄여 보내니 눌린 자국 위에 또
// 눌리는 셈이다. 한글은 획 하나로 갈린다 — 같은 투썸 쿠폰이 직접 올릴 때는 상품명이
// 읽혔는데 훑기로는 못 읽혔고, 그림이 달라서가 아니라 사본이 나빠서였다. 요금은 픽셀
// 수로 매겨지므로 화질을 올려도 값은 그대로다.
function shrinkToData(source, width, height) {
  const scale = Math.min(1, READ_EDGE / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  // 훑기가 넘겨주는 것과 같은 모양 — 접두사 없는 base64.
  const data = canvas.toDataURL('image/jpeg', 0.95).split(',')[1];
  canvas.width = 0;
  canvas.height = 0;
  return data;
}

// 정밀 탐색은 원본 바이트를 그대로 받아오므로 그 조각이 PNG일 수 있다. 이름과 형식을
// jpg로 못 박아두면 내용과 어긋난 파일이 되고, 그 이름이 스토리지 경로에까지 따라간다.
// (브라우저는 내용을 보고 읽어주므로 화면이 깨지진 않지만, 기대고 있을 이유가 없다.)
export function candidateToFiles(candidate) {
  const base = (candidate.name || 'gifticon').replace(/\.[^.]+$/, '');
  return candidate.images.map((data, index) => {
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new File([bytes], `${base}${index ? `-${index + 1}` : ''}.jpg`, { type: 'image/jpeg' });
  });
}
