import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat } from '@zxing/library';
import { CATEGORY_KEYS } from '../constants';
import { analyzeGifticonImages } from '../api';

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

function analyzeScale(longEdge) {
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

// 서버로 보낼 것과 보관할 것이 같은 그림이라 한 번만 만든다.
async function toStorageBlob(canvas) {
  const scale = Math.min(1, UPLOAD_EDGE / Math.max(canvas.width, canvas.height));
  const scaled = scale < 1 ? drawScaled(canvas, canvas.width, canvas.height, scale) : canvas;
  const blob = await new Promise((resolve) => scaled.toBlob(resolve, 'image/jpeg', 0.82));

  if (scaled !== canvas) {
    scaled.width = 0;
    scaled.height = 0;
  }

  return blob;
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

async function decodeBarcode(canvas) {
  try {
    const reader = new BrowserMultiFormatReader();
    const result = await reader.decodeFromCanvas(canvas);
    const codeType = result.getBarcodeFormat ? BarcodeFormat[result.getBarcodeFormat()] || null : null;
    const cropBlob = await cropBarcodeRegion(canvas, result.getResultPoints?.(), codeType);
    return {
      code: result.getText(),
      codeType,
      cropBlob,
    };
  } catch {
    return { code: null, codeType: null, cropBlob: null };
  }
}

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
  const barcode = { code: null, codeType: null, cropBlob: null };
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
      const blob = await toStorageBlob(canvas);
      storageFiles.push(new File([blob], storageName(file), { type: 'image/jpeg' }));
      uploads.push(await toUploadPayload(blob));
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
    // 스토리지에 올릴 파일. 사용자가 고른 원본이 아니라 줄인 것이다.
    storageFiles,
    // 모델에게 보낼 같은 그림의 base64.
    uploads,
  };
}

export async function readGifticonInfo(prepared, { onProgress } = {}) {
  const total = prepared.uploads.length;
  const report = (step) => onProgress?.({ step, total });

  report('reading');
  const info = await analyzeGifticonImages(prepared.uploads, CATEGORY_KEYS);

  // 서버가 상품 사진 위치를 못 짚었으면 잘라내지 않는다. 이 경우 목록은 예전처럼
  // 첫 사진을 그대로 보여준다(잘못 자른 그림보다는 캡처 전체가 낫다).
  // 자를 대상은 축소본이다. 썸네일은 480px이라 원본을 다시 열어 읽을 이유가 없다.
  report('thumbnail');
  const thumbBox = info.thumbnail;
  const thumbCropBlob = thumbBox ? await cropThumbnail(prepared.storageFiles[thumbBox.image - 1], thumbBox) : null;
  report('done');

  // 바코드 막대를 못 읽었을 때는 이미지에 인쇄된 번호를 대신 쓴다.
  // 이 경우 잘라낸 이미지가 없으니 화면에서 바코드를 새로 그려 보여준다.
  const code = prepared.code || info.code || null;
  const codeType = prepared.code ? prepared.codeType : info.code ? 'CODE_128' : null;

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
  };
}
