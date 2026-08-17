import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import { CATEGORY_KEYS } from '../constants';
import { analyzeGifticonImages } from '../api';
import { readCachedInfo, writeCachedInfo } from './scanCache';

// 기프티콘 이미지에서 정보를 뽑는 과정은 두 갈래다.
//   1) 바코드/QR: 브라우저에서 zxing이 바로 읽는다. 매장에서 스캔할 크롭 이미지도 여기서 만든다.
//   2) 상품명·상호·금액·유효기간: 이미지를 서버(analyze-gifticon)로 보내 모델이 읽는다.
// 예전에는 2)도 브라우저에서 tesseract로 처리했는데, 한글 인식이 자주 틀렸고 학습 데이터를
// 메모리에 올리느라 사진 여러 장을 한꺼번에 넣으면 앱이 종료되는 일도 있었다.

// 요즘 폰 사진은 1200만 화소가 넘어서 원본 그대로 디코딩하면 메모리를 크게 잡아먹는다.
// 바코드 인식용으로는 이 크기면 충분하다.
const MAX_ANALYZE_EDGE = 2000;
// 너무 작은 이미지는 막대가 뭉개져서 인식률이 떨어진다. 이 정도까지는 키워서 읽는다.
const MIN_ANALYZE_EDGE = 1600;
// 서버로 보낼 이미지 크기이자, 스토리지에 보관할 크기.
//
// 예전에는 사용자가 고른 파일을 원본 그대로 보관했다. 요즘 폰 캡처는 한 장에 1~2MB라
// 기프티콘 하나가 1.5MB를 넘게 차지했고, 무료 스토리지 1GB가 700건이면 찼다.
// 원본 화질이 필요한 곳은 없다 — 바코드는 따로 잘라 저장하고, 목록은 썸네일을 쓰고,
// 사진 보기는 폰 화면에 띄우는 게 전부다. 그래서 이 크기로 줄인 것을 보관한다.
// (한 건 1.5MB → 150KB 안팎)
const UPLOAD_EDGE = 1400;
// 목록 썸네일은 화면에서 68px로 보인다. 고해상도 화면과 나중에 크게 쓸 여지를 감안해도
// 이 정도면 넉넉하고, 원본을 그대로 두는 것보다 훨씬 가볍게 받는다.
const THUMB_EDGE = 480;

// 바코드를 읽기 좋은 크기로 맞추는 배율. 큰 것은 줄이고, 작은 것은 오히려 키운다 —
// 막대가 뭉개지면 아무리 선명한 사진이어도 못 읽는다.
// 갤러리 훑기(client/src/utils/gallery.js)도 이 함수를 쓴다. 판독 조건이 두 곳에서
// 달라지면 "직접 올리면 되는데 갤러리로는 안 되는" 일이 생긴다 — 실제로 그랬다.
export function analyzeScale(longEdge) {
  if (longEdge > MAX_ANALYZE_EDGE) return MAX_ANALYZE_EDGE / longEdge;
  if (longEdge < MIN_ANALYZE_EDGE) return Math.min(2, MIN_ANALYZE_EDGE / longEdge);
  return 1;
}

function drawScaled(source, width, height, scale) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function toAnalyzeCanvas(file) {
  let source;
  let width;
  let height;

  if (typeof createImageBitmap === 'function') {
    source = await createImageBitmap(file);
    width = source.width;
    height = source.height;
  } else {
    const url = URL.createObjectURL(file);
    try {
      source = await loadImage(url);
      width = source.naturalWidth;
      height = source.naturalHeight;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  const canvas = drawScaled(source, width, height, analyzeScale(Math.max(width, height)));
  source.close?.();
  return canvas;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// 보관용과 모델용은 크기가 같고 화질만 다르다. 한 번 줄여서 두 벌을 뽑는다.
//
// 예전에는 한 벌로 둘 다 했다. 보관 용량을 줄이려고 0.82로 눌러둔 것을 모델도 같이
// 봤는데, 그 값은 "목록 썸네일과 사진 보기에 충분한가"를 보고 정한 것이지 "글자를 읽을
// 수 있는가"를 보고 정한 것이 아니었다.
//
// 한글은 획 하나로 갈린다. 떠/따, 반/밤, 올/울. 압축 자국이 그 획 위에 앉으면 모델이
// 다른 글자로 읽는다. 실제로 "떠먹는 스트로베리"가 "따먹는"과 "뚜렛는"으로, "황금올리브
// 반반"이 "황올반"과 "황올밤"으로 갈려 나왔다. 같은 사진인데 부를 때마다 다르게 읽혔다.
//
// 화질을 올려도 요금은 그대로다. 이미지 토큰은 픽셀 수로만 매겨지고 파일 크기는 세지
// 않는다. 늘어나는 건 올려 보내는 바이트뿐이라, 여기서 아낄 이유가 없었다.
const STORAGE_QUALITY = 0.82;
const ANALYZE_QUALITY = 0.95;

// 모델에게 보낼 사본의 긴 변. 보관용(1400)보다 크게 잡는다.
//
// 여기가 천장인 이유가 있다. 이미지 토큰은 픽셀 수로 매겨지는데, 대략 115만 화소 또는
// 긴 변 1568픽셀을 넘기면 보내봐야 저쪽에서 다시 줄인다. 더 키우면 올리는 시간만 늘고
// 모델이 보는 그림은 같다. 그래서 줄여서 손해 안 보는 가장 큰 값이 이 값이다.
//
// 세로로 긴 캡처는 이래도 폭이 700픽셀 언저리다. 화소 상한이 폭을 묶어버려서 더 넓힐
// 방법이 없다. 글자를 더 키우려면 결국 필요한 부분만 잘라 보내야 하는데, 그건 다음 일이다.
const ANALYZE_EDGE = 1568;

async function toBlobAt(canvas, edge, quality) {
  const scale = Math.min(1, edge / Math.max(canvas.width, canvas.height));
  const scaled = scale < 1 ? drawScaled(canvas, canvas.width, canvas.height, scale) : canvas;
  const blob = await new Promise((resolve) => scaled.toBlob(resolve, 'image/jpeg', quality));

  if (scaled !== canvas) {
    scaled.width = 0;
    scaled.height = 0;
  }

  return blob;
}

async function toOutputBlobs(canvas) {
  return {
    storage: await toBlobAt(canvas, UPLOAD_EDGE, STORAGE_QUALITY),
    analyze: await toBlobAt(canvas, ANALYZE_EDGE, ANALYZE_QUALITY),
  };
}

async function toUploadPayload(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());

  // btoa는 문자열만 받는데 한 번에 다 넘기면 인자 수 제한에 걸려서 나눠서 이어 붙인다.
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }

  return { mediaType: 'image/jpeg', data: btoa(binary) };
}

// 보관할 파일 이름. 확장자가 실제 내용과 맞아야 한다 — 스토리지에 올릴 때 이름에서
// 확장자를 떼어 쓰기 때문에(client/src/api.js), 아이폰에서 고른 .heic을 그대로 두면
// 내용은 JPEG인데 이름만 heic인 파일이 올라간다.
function storageName(file) {
  const base = (file.name || 'gifticon').replace(/\.[^.]+$/, '');
  return `${base || 'gifticon'}.jpg`;
}

const HARD_HINTS = new Map([[DecodeHintType.TRY_HARDER, true]]);

// 막대를 읽는다. 한 번 못 읽으면 정밀 탐색으로 한 번 더 본다.
//
// 여기서 못 읽으면 대신 쓸 것이 인쇄된 숫자를 모델이 눈으로 읽은 값뿐인데, 그건 검산
// 자리가 없어서 6을 5로 읽어도 그냥 5가 된다. 매장에서 안 찍히는 번호가 저장되고,
// 그걸 뒤늦게 알아볼 방법도 없다. 그러니 넘기기 전에 애는 써봐야 한다.
//
// 애초에 한 번만 보고 있었다. 사진첩 훑기 쪽은 얕게 본 뒤 못 읽은 것만 정밀 탐색으로
// 다시 보는데(gallery.js의 DEEP), 등록 화면에는 그 두 번째가 없었다. 정밀 탐색은 느려서
// 모든 사진에 처음부터 걸 이유는 없지만, 못 읽은 사진 한 장에는 걸 값어치가 있다.
async function readCanvas(canvas, hints) {
  const reader = new BrowserMultiFormatReader(hints);
  return reader.decodeFromCanvas(canvas);
}

// 테스트에서 직접 부른다. 이 두 번 보는 규칙이 이 파일에서 가장 조용히 깨지는 자리라,
// 캔버스를 만드는 일까지 끌고 들어가지 않고 여기만 따로 본다.
export async function decodeBarcode(canvas) {
  let result = null;
  try {
    result = await readCanvas(canvas);
  } catch {
    try {
      result = await readCanvas(canvas, HARD_HINTS);
    } catch {
      return { code: null, codeType: null, cropBlob: null };
    }
  }

  const codeType = result.getBarcodeFormat ? BarcodeFormat[result.getBarcodeFormat()] || null : null;
  const points = result.getResultPoints?.();
  const cropBlob = await cropBarcodeRegion(canvas, points, codeType);
  return {
    code: result.getText(),
    codeType,
    cropBlob,
    // 막대가 사진 가로폭의 몇 할을 차지하는가. 훑기 쪽과 같은 값이다(gallery.js).
    // 이 값이 작다는 건 "바코드를 보여주려고 찍은 사진"이 아니라는 뜻이다 — 앱 화면이나
    // 목록을 통째로 찍은 캡처가 그렇다. 그런 그림에는 다른 기프티콘이 같이 찍혀 있어서,
    // 모델이 옆칸의 금액과 기한을 이 기프티콘 것으로 읽어온다.
    coverage: barcodeCoverage(points, canvas.width),
  };
}

function barcodeCoverage(points, width) {
  if (!points || points.length === 0 || !width) return 0;
  const xs = points.map((point) => point.getX());
  return (Math.max(...xs) - Math.min(...xs)) / width;
}

// 이보다 작게 찍혔으면 화면에서 한마디 한다. 훑기 쪽과 같은 기준이다.
export const SMALL_BARCODE_COVERAGE = 0.25;

// 매장에서 실제로 스캔할 바코드/QR만 잘라서 보여주기 위해, zxing이 알려주는
// 인식 좌표를 기준으로 원본 이미지에서 해당 영역만 잘라낸다.
// QR은 좌표 3개가 사각형 전체를 대략 감싸지만, 1D 바코드는 스캔선 좌우 두 점만
// 주어지고 막대의 실제 높이는 알려주지 않아서, 폭을 기준으로 막대 높이와
// 아래쪽에 인쇄된 숫자 영역까지 넉넉하게 추정해서 자른다.
async function cropBarcodeRegion(source, points, codeType) {
  if (!points || points.length === 0) return null;

  const xs = points.map((p) => p.getX());
  const ys = points.map((p) => p.getY());
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const width = Math.max(maxX - minX, 1);
  const isQr = codeType === 'QR_CODE';

  let cropX;
  let cropY;
  let cropW;
  let cropH;

  if (isQr) {
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const height = Math.max(maxY - minY, 1);
    const padX = width * 0.3;
    const padY = height * 0.3;
    cropX = minX - padX;
    cropY = minY - padY;
    cropW = width + padX * 2;
    cropH = height + padY * 2;
  } else {
    const scanY = (Math.min(...ys) + Math.max(...ys)) / 2;
    const barHalfHeight = width * 0.14;
    const padTop = width * 0.02;
    const padBottom = width * 0.24;
    const padX = width * 0.12;
    cropX = minX - padX;
    cropY = scanY - barHalfHeight - padTop;
    cropW = width + padX * 2;
    cropH = barHalfHeight * 2 + padTop + padBottom;
  }

  cropX = Math.max(0, cropX);
  cropY = Math.max(0, cropY);
  cropW = Math.min(source.width - cropX, cropW);
  cropH = Math.min(source.height - cropY, cropH);
  if (cropW <= 0 || cropH <= 0) return null;

  const canvas = document.createElement('canvas');
  canvas.width = cropW;
  canvas.height = cropH;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(source, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
}

// 목록에 보여줄 상품 사진만 잘라낸다. 올라오는 사진은 대개 선물함 화면을 통째로 찍은
// 캡처라, 68px로 줄이면 상품 사진·상품명·버튼이 한꺼번에 뭉개져서 뭐가 뭔지 알 수 없다.
// 서버가 짚어준 영역(백분율)을 원본 좌표로 되돌려 그 부분만 잘라 쓴다.
// 백분율로 주고받는 이유: 모델이 본 이미지는 줄여서 보낸 것이라 픽셀 좌표가 원본과 다르다.
async function cropThumbnail(file, box) {
  const canvas = await toAnalyzeCanvas(file);
  try {
    const x = Math.max(0, (box.x / 100) * canvas.width);
    const y = Math.max(0, (box.y / 100) * canvas.height);
    const width = Math.min(canvas.width - x, (box.width / 100) * canvas.width);
    const height = Math.min(canvas.height - y, (box.height / 100) * canvas.height);
    if (width < 16 || height < 16) return null;

    const scale = Math.min(1, THUMB_EDGE / Math.max(width, height));
    const out = document.createElement('canvas');
    out.width = Math.round(width * scale);
    out.height = Math.round(height * scale);
    const ctx = out.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(canvas, x, y, width, height, 0, 0, out.width, out.height);

    return await new Promise((resolve) => out.toBlob(resolve, 'image/jpeg', 0.85));
  } catch {
    // 썸네일은 없어도 원본 사진으로 대신할 수 있다. 여기서 막히면 등록 자체가 막힌다.
    return null;
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

// 기프티콘 한 건을 여러 장으로 나눠 올릴 수 있다(예: 상품명 화면 + 유효기간 화면).
// 처리는 두 단계다.
//
//   1) prepareImages — 브라우저에서 할 수 있는 일. 바코드를 읽고, 보관용 축소본을 만든다.
//   2) readGifticonInfo — 서버(모델)에게 상품명·금액·유효기간을 읽히고 썸네일을 잘라낸다.
//
// 나눠둔 이유는 2)가 실패해도 1)의 결과는 살려야 하기 때문이다. 모델 호출은 키가 없거나
// 인터넷이 끊기면 실패하는데, 그때도 사진은 올라가야 하고 이미 읽은 바코드도 남아야 한다.
//
// onProgress로 지금 어느 단계인지 알려준다. 몇 초 걸리는 동안 화면에 아무 변화가 없으면
// 멈춘 것처럼 보이기 때문에, 화면 쪽에서 진행 상황을 표시할 수 있게 한다.
export async function prepareImages(files, { onProgress } = {}) {
  const report = (step, extra) => onProgress?.({ step, total: files.length, ...extra });
  const barcode = { code: null, codeType: null, cropBlob: null, coverage: 0 };
  const storageFiles = [];
  const uploads = [];

  for (const [index, file] of files.entries()) {
    report('barcode', { current: index + 1 });
    const canvas = await toAnalyzeCanvas(file);
    try {
      if (!barcode.code) {
        const found = await decodeBarcode(canvas);
        if (found.code) Object.assign(barcode, found);
      }
      const { storage, analyze } = await toOutputBlobs(canvas);
      storageFiles.push(new File([storage], storageName(file), { type: 'image/jpeg' }));
      uploads.push(await toUploadPayload(analyze));
    } finally {
      // 다 쓴 캔버스가 메모리에 남지 않게 비워둔다.
      canvas.width = 0;
      canvas.height = 0;
    }
  }

  return {
    code: barcode.code,
    codeType: barcode.codeType,
    barcodeCropBlob: barcode.cropBlob,
    // 읽어낸 막대가 사진에서 얼마나 큰가. 화면이 "작게 찍혔어요"를 말할 때 쓴다.
    barcodeCoverage: barcode.coverage,
    // 스토리지에 올릴 파일. 사용자가 고른 원본이 아니라 줄인 것이다.
    storageFiles,
    // 모델에게 보낼 같은 그림의 base64.
    uploads,
  };
}

export async function readGifticonInfo(prepared, { onProgress, knownCode } = {}) {
  const total = prepared.uploads.length;
  const report = (step) => onProgress?.({ step, total });

  report('reading');
  // 테스트 중에는 같은 번호를 다시 읽히지 않는다. 실사용 배포에서는 늘 null이라
  // 아래 호출이 그대로 나간다 (client/src/utils/scanCache.js).
  //
  // 열쇠는 부르는 쪽이 아는 번호를 먼저 쓴다. 여기서 다시 읽은 prepared.code만 쓰면
  // 갤러리 훑기의 정밀 탐색으로 찾은 건이 통째로 빠진다 — 저쪽은 tryHarder를 켜고 읽고
  // 이쪽 decodeBarcode는 그냥 읽어서, 저쪽만 성공하는 사진이 있다. 그런 건은 열쇠가
  // 없어 저장되지 않았고, 여덟 건을 읽어도 캐시에는 한 건만 남았다.
  //
  // 번호에 사진 장수를 붙인다. 번호만으로 두면, 같은 기프티콘에 정보 화면을 한 장 더해
  // 다시 올려도 예전 답이 그대로 나온다 — 새로 넣은 사진은 모델이 보지도 못한다.
  // "금액 화면을 같이 올렸는데 금액이 안 채워진다"가 그래서 났고, 그때는 캐시를
  // 의심하기 어려웠다. 화면에는 사진이 세 장 멀쩡히 붙어 있기 때문이다.
  const known = knownCode || prepared.code;
  const cacheKey = known ? `${known}·${prepared.uploads.length}장` : null;
  const cached = readCachedInfo(cacheKey);
  const info = cached || (await analyzeGifticonImages(prepared.uploads, CATEGORY_KEYS));
  if (!cached) writeCachedInfo(cacheKey, info);

  // 이 답이 어디서 왔는지. 테스트 빌드 화면에만 찍힌다.
  //
  // "고쳤는데 왜 그대로냐"를 가리려면 이 셋이 필요하다 — 사진 몇 장을 보냈는지, 캐시에서
  // 꺼낸 답인지, 서버의 프롬프트가 몇 판인지. 화면에서는 셋 다 똑같아 보여서 그동안
  // 짐작으로 골랐고, 여러 번 틀렸다.
  const meta = { shots: prepared.uploads.length, fromCache: Boolean(cached), promptVersion: info.promptVersion };

  // 서버가 상품 사진 위치를 못 짚었으면 잘라내지 않는다. 이 경우 목록은 예전처럼
  // 첫 사진을 그대로 보여준다(잘못 자른 그림보다는 캡처 전체가 낫다).
  // 자를 대상은 축소본이다. 썸네일은 480px이라 원본을 다시 열어 읽을 이유가 없다.
  //
  // 캐시에서 꺼낸 값은 그때 보낸 사진 장수를 기준으로 매겨진 번호라, 이번에 들고 온
  // 사진이 더 적으면 가리키는 자리가 비어 있을 수 있다. 없으면 자르지 않는다.
  report('thumbnail');
  const thumbBox = info.thumbnail;
  const thumbSource = thumbBox ? prepared.storageFiles[thumbBox.image - 1] : null;
  const thumbCropBlob = thumbSource ? await cropThumbnail(thumbSource, thumbBox) : null;
  report('done');

  // 바코드 번호는 두 군데서 읽힌다 — zxing이 막대를 읽은 값과, 모델이 사진에 인쇄된
  // 숫자를 눈으로 읽은 값이다.
  //
  // 원본에는 번호가 하나뿐이다. 막대 아래 인쇄된 숫자는 그 막대를 사람이 읽을 수 있게
  // 적어둔 것이라, 둘은 같은 값이어야 한다. 다른 건 값이 아니라 읽는 방법이고, 두 방법은
  // 틀리는 방식이 다르다.
  //
  //   막대 읽기는 검산 장치가 있다. CODE_128은 검산 문자, EAN-13은 체크디지트를 달고
  //   있어서, 잘못 읽으면 검산이 안 맞아 아예 값을 안 내놓는다. 크게 실패한다.
  //
  //   숫자 읽기에는 그런 것이 없다. 6을 5로 읽으면 그냥 5가 된다. 조용히 실패한다.
  //   게다가 그 눈은 같은 사진의 상품명을 "떠먹는"에서 "더먹는"으로 읽는 눈이다.
  //
  // 그래서 막대 쪽이 기본이다. 인쇄된 숫자의 몫은 하나뿐이다 — 막대를 아예 못 읽었을 때
  // 채워주는 것.
  //
  // ── 한때 반대로 돼 있었다 ──────────────────────────────────────────────
  // 갤러리에서 찾아 등록한 스타벅스 교환권이 한 자리 틀린 번호로 저장된 일이 있었고
  // (7590922768021420 → 7590922268021420), 그때 "막대도 압축 자국에 뭉개진다"는 이유로
  // 갈리면 인쇄된 숫자를 기본값으로 삼게 바꿨다.
  //
  // 그 판단이 뒤집힌 이유가 둘이다. 하나는 위에 적은 비대칭 — 검산이 있는 쪽과 없는 쪽을
  // 같은 저울에 올린 것이 애초에 틀렸다. 다른 하나는 그 뒤에 실제로 벌어진 일이다.
  // 훑기는 막대에서 읽은 번호로 후보를 묶고 "이미 등록됐나"를 묻는데 등록은 인쇄된
  // 번호로 들어갔고, 그래서 이미 등록한 기프티콘이 다시 잡혀 또 등록됐다.
  //
  // 이제 "등록되는 번호 = 후보를 묶은 번호"가 늘 성립한다.
  //
  // ── 갈렸다고 알리지도 않는다 ─────────────────────────────────────────────
  // 한때 둘이 다르면 "사진과 맞는지 확인해주세요"를 띄웠다. 걷어냈다.
  //
  // 갈렸다는 건 둘 중 하나가 틀렸다는 뜻인데, 위에 적은 비대칭 때문에 틀린 쪽은 거의
  // 항상 인쇄된 숫자다. 즉 그 경고는 맞는 값을 놓고 사람을 세워두는 일이 대부분이다.
  // 헛경보가 반복되면 정작 진짜 경고도 안 읽힌다.
  //
  // 갤러리 훑기에서는 아예 구조적으로 헛경보다. 후보 자체가 막대에서 읽은 번호로
  // 묶여서 만들어지므로(client/src/utils/gallery.js의 seenCodes) scanned가 늘 있고,
  // 인쇄된 숫자는 어디에도 쓰이지 않는다. 거기서 갈림을 알리는 것은 "안 쓰는 값이
  // 틀렸다"고 알리는 셈이다.
  const printed = info.code || null;
  // 부르는 쪽이 이미 읽어둔 막대 값이 있으면 그것도 막대에서 읽은 값이다. 여기
  // decodeBarcode는 tryHarder 없이 읽고 갤러리 훑기는 켜고 읽어서, 훑기만 성공하는
  // 사진이 있다. 그 경우까지 인쇄된 숫자로 흘러가면 안 된다.
  const scanned = prepared.code || knownCode || null;
  const code = scanned || printed;
  // 형식은 막대에서 읽은 것이 맞다. 숫자 한 자리가 갈렸어도 어떤 규격의 바코드인지는
  // 막대 모양이 말해준다.
  const codeType = scanned ? prepared.codeType : printed ? 'CODE_128' : null;

  return {
    code,
    codeType,
    thumbCropBlob,
    category: info.category || '기타',
    brand: info.brand || null,
    amount: info.amount ?? null,
    expiresAt: info.expiresAt || null,
    name: info.name || '',
    isVoucher: Boolean(info.isVoucher),
    // 이 답이 어디서 왔는지. 테스트 빌드 화면에만 찍힌다.
    meta,
  };
}
