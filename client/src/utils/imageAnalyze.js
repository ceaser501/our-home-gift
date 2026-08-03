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
// 서버로 보낼 이미지 크기. 글자를 읽기에 충분하면서 전송량과 비용이 과하지 않은 선.
const UPLOAD_EDGE = 1400;

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

async function toUploadImage(canvas) {
  const scale = Math.min(1, UPLOAD_EDGE / Math.max(canvas.width, canvas.height));
  const scaled = scale < 1 ? drawScaled(canvas, canvas.width, canvas.height, scale) : canvas;
  const blob = await new Promise((resolve) => scaled.toBlob(resolve, 'image/jpeg', 0.82));
  const bytes = new Uint8Array(await blob.arrayBuffer());

  // btoa는 문자열만 받는데 한 번에 다 넘기면 인자 수 제한에 걸려서 나눠서 이어 붙인다.
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }

  if (scaled !== canvas) {
    scaled.width = 0;
    scaled.height = 0;
  }

  return { mediaType: 'image/jpeg', data: btoa(binary) };
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

// 기프티콘 한 건을 여러 장으로 나눠 올릴 수 있다(예: 상품명 화면 + 유효기간 화면).
// 바코드는 장마다 따로 읽고, 글자 정보는 여러 장을 한 번에 서버로 보내 합쳐서 받는다.
// onProgress로 지금 어느 단계인지 알려준다. 분석이 몇 초 걸리는데 화면에 아무 변화가
// 없으면 멈춘 것처럼 보이기 때문에, 화면 쪽에서 진행 상황을 표시할 수 있게 한다.
export async function analyzeImages(files, { onProgress } = {}) {
  const report = (step, extra) => onProgress?.({ step, total: files.length, ...extra });
  const barcode = { code: null, codeType: null, cropBlob: null };
  const uploads = [];

  for (const [index, file] of files.entries()) {
    report('barcode', { current: index + 1 });
    const canvas = await toAnalyzeCanvas(file);
    try {
      if (!barcode.code) {
        const found = await decodeBarcode(canvas);
        if (found.code) Object.assign(barcode, found);
      }
      uploads.push(await toUploadImage(canvas));
    } finally {
      // 다 쓴 캔버스가 메모리에 남지 않게 비워둔다.
      canvas.width = 0;
      canvas.height = 0;
    }
  }

  report('reading');
  const info = await analyzeGifticonImages(uploads, CATEGORY_KEYS);
  report('done');

  // 바코드 막대를 못 읽었을 때는 이미지에 인쇄된 번호를 대신 쓴다.
  // 이 경우 잘라낸 이미지가 없으니 화면에서 바코드를 새로 그려 보여준다.
  const code = barcode.code || info.code || null;
  const codeType = barcode.code ? barcode.codeType : info.code ? 'CODE_128' : null;

  return {
    code,
    codeType,
    barcodeCropBlob: barcode.cropBlob,
    category: info.category || '기타',
    brand: info.brand || null,
    amount: info.amount ?? null,
    expiresAt: info.expiresAt || null,
    name: info.name || '',
  };
}
