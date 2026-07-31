import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat } from '@zxing/library';
import { createWorker } from 'tesseract.js';
import { CATEGORIES } from '../constants';

let ocrWorkerPromise = null;
function getOcrWorker() {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = createWorker('kor+eng', 1, { workerPath: `${import.meta.env.BASE_URL}tesseract/worker.min.js` });
  }
  return ocrWorkerPromise;
}

async function decodeBarcode(imageUrl) {
  try {
    const reader = new BrowserMultiFormatReader();
    const img = await loadImage(imageUrl);
    const result = await reader.decodeFromImageElement(img);
    const codeType = result.getBarcodeFormat ? BarcodeFormat[result.getBarcodeFormat()] || null : null;
    const cropBlob = await cropBarcodeRegion(img, result.getResultPoints?.(), codeType);
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
async function cropBarcodeRegion(img, points, codeType) {
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
  cropW = Math.min(img.naturalWidth - cropX, cropW);
  cropH = Math.min(img.naturalHeight - cropY, cropH);
  if (cropW <= 0 || cropH <= 0) return null;

  const canvas = document.createElement('canvas');
  canvas.width = cropW;
  canvas.height = cropH;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function runOcr(imageUrl) {
  try {
    const worker = await getOcrWorker();
    const { data } = await worker.recognize(imageUrl);
    return data.text || '';
  } catch {
    return '';
  }
}

const AMOUNT_WON_RE = /([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{4,7})\s*원/;
const AMOUNT_MAN_RE = /([0-9]{1,3})\s*만\s*원/;

const DATE_DOT_RE = /(20[0-9]{2})[.\-/](0?[1-9]|1[0-2])[.\-/](0?[1-9]|[12][0-9]|3[01])(?!\d)/g;
const DATE_KOREAN_RE = /(20[0-9]{2})년\s*(0?[1-9]|1[0-2])월\s*(0?[1-9]|[12][0-9]|3[01])일/g;
const DATE_SHORT_RE = /(?<!\d)([0-9]{2})[.\-/](0?[1-9]|1[0-2])[.\-/](0?[1-9]|[12][0-9]|3[01])(?!\d)/g;

const EXPIRY_KEYWORDS = ['유효기간', '유효기한', '사용기한', '만료일', '까지', '기한'];

function pad2(n) {
  return String(n).padStart(2, '0');
}

function findAllDates(text) {
  const dates = [];
  for (const m of text.matchAll(DATE_DOT_RE)) {
    dates.push({ index: m.index, value: `${m[1]}-${pad2(m[2])}-${pad2(m[3])}` });
  }
  for (const m of text.matchAll(DATE_KOREAN_RE)) {
    dates.push({ index: m.index, value: `${m[1]}-${pad2(m[2])}-${pad2(m[3])}` });
  }
  for (const m of text.matchAll(DATE_SHORT_RE)) {
    dates.push({ index: m.index, value: `20${m[1]}-${pad2(m[2])}-${pad2(m[3])}` });
  }
  return dates;
}

function extractAmount(text) {
  const manMatch = text.match(AMOUNT_MAN_RE);
  if (manMatch) return Number(manMatch[1]) * 10000;
  const wonMatch = text.match(AMOUNT_WON_RE);
  if (wonMatch) return Number(wonMatch[1].replace(/,/g, ''));
  return null;
}

// 기프티콘 한 장에 발행일/유효기간처럼 날짜가 여러 개 찍혀 있는 경우가 많다.
// "유효기간", "까지" 같은 단어 바로 옆에 있는 날짜를 우선하고, 그런 단서가
// 없으면 가장 나중 날짜(발행일보다는 유효기간이 미래일 가능성이 높음)를 쓴다.
function extractExpiry(text) {
  const dates = findAllDates(text);
  if (dates.length === 0) return null;

  for (const date of dates) {
    const before = text.slice(Math.max(0, date.index - 12), date.index);
    if (EXPIRY_KEYWORDS.some((kw) => before.includes(kw))) return date.value;
  }

  return dates.reduce((latest, date) => (date.value > latest.value ? date : latest)).value;
}

const ALL_LABELS = ['상품명', '교환처', '상호', '유효기간', '유효기한', '사용기한', '금액', '권종', '가격'];

// 기프티쇼처럼 "상품명 : 아이스 시그니처 초콜릿T" / "교환처 : 스타벅스"처럼
// 라벨이 명확히 붙어 있는 형식이면, 그 라벨 뒤의 값을 최우선으로 신뢰한다.
function extractLabeledField(text, labels) {
  const pattern = new RegExp(`(?:${labels.join('|')})\\s*[:：]\\s*(.+)`);
  const match = text.match(pattern);
  if (!match) return null;

  let value = match[1].trim();

  // 줄바꿈이 사라져서 다음 라벨까지 한 줄로 붙어버린 경우(예: "아이스 시그니처
  // 초콜릿T 교환처 : 스타벅스"), 다음 라벨이 시작되는 지점 앞까지만 값으로 쓴다.
  for (const label of ALL_LABELS) {
    const idx = value.indexOf(label);
    if (idx > 0) value = value.slice(0, idx).trim();
  }

  // 그래도 라벨 글자 일부가 값 앞에 남아있는 경우(예: "상호도 : 스타벅스")를
  // 대비해, 콜론이 남아있으면 마지막 콜론 뒤쪽만 값으로 쓴다.
  if (value.includes(':') || value.includes('：')) {
    value = value.split(/[:：]/).pop().trim();
  }

  return value.length > 0 ? value : null;
}

function extractCategoryAndBrand(text) {
  const lower = text.toLowerCase().replace(/\s+/g, '');
  for (const cat of CATEGORIES) {
    for (const kw of cat.keywords) {
      if (lower.includes(kw.replace(/\s+/g, '').toLowerCase())) {
        return { category: cat.key, brand: kw };
      }
    }
  }
  return { category: '기타', brand: null };
}

const NAME_NOISE_KEYWORDS = [
  '공유',
  '지갑',
  'wallet',
  '선물정보',
  '상세정보',
  '주문하기',
  '환불',
  '취소',
  '문의하기',
  '상담하기',
  '같이쓰기',
  '고객센터',
  '사용정보',
];

function isNoiseLine(line) {
  const norm = line.toLowerCase().replace(/\s+/g, '');
  return NAME_NOISE_KEYWORDS.some((kw) => norm.includes(kw.replace(/\s+/g, '').toLowerCase()));
}

// 기프티콘 화면은 보통 상호(브랜드)를 작게, 상품명을 그 아래 크게 표시한다.
// brand와 완전히 같은 줄(상호 라벨 자체)은 상품명 후보에서 제외하고, brand를
// 포함하면서 더 긴 줄(예: "황올반+BBQ양념반")을 상품명으로 우선 채택한다.
function guessName(text, brand) {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length >= 2 && l.length <= 30 && !/^[0-9.\-/\s]+$/.test(l) && !isNoiseLine(l));

  if (lines.length === 0) return brand || '';
  if (!brand) return lines[0];

  const brandNorm = brand.toLowerCase().replace(/\s+/g, '');
  const candidates = lines.filter((l) => l.toLowerCase().replace(/\s+/g, '') !== brandNorm);

  const withBrand = candidates.find((l) => l.toLowerCase().replace(/\s+/g, '').includes(brandNorm));
  if (withBrand) return withBrand;

  const brandLineIndex = lines.findIndex((l) => l.toLowerCase().replace(/\s+/g, '') === brandNorm);
  if (brandLineIndex !== -1 && lines[brandLineIndex + 1]) return lines[brandLineIndex + 1];

  return candidates[0] || brand;
}

export async function analyzeImage(file) {
  const imageUrl = URL.createObjectURL(file);
  try {
    const [barcodeResult, text] = await Promise.all([decodeBarcode(imageUrl), runOcr(imageUrl)]);
    const { category, brand: keywordBrand } = extractCategoryAndBrand(text);
    // 알려진 브랜드(카테고리 키워드에 등록된 상호)는 항상 깨끗한 키워드 매칭값을
    // 우선한다. "교환처/상호" 라벨 값은 OCR이 라벨 글자를 살짝 잘못 읽어도
    // (예: "상호" → "상포도") 콜론 뒤 전체를 그대로 값으로 잡아버릴 수 있어서,
    // 목록에 없는 상호일 때 보조로만 사용한다.
    const brand = keywordBrand || extractLabeledField(text, ['교환처', '상호']);
    const labeledAmountText = extractLabeledField(text, ['금액', '권종', '가격']);
    const amount = (labeledAmountText && extractAmount(labeledAmountText)) ?? extractAmount(text);
    const expiresAt = extractExpiry(text);
    const name = extractLabeledField(text, ['상품명']) || guessName(text, brand);

    return {
      code: barcodeResult.code,
      codeType: barcodeResult.codeType,
      barcodeCropBlob: barcodeResult.cropBlob,
      category,
      brand,
      amount,
      expiresAt,
      name,
      rawText: text,
    };
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

// 기프티콘은 업체마다 디자인이 달라서 상품명은 첫 장, 금액·기한은 다음 장에 있는 등
// 정보가 여러 이미지에 나뉘어 있을 수 있다. 각 이미지를 따로 분석한 뒤, 필드별로
// 값을 찾은 첫 번째 이미지의 결과를 채택해서 합친다.
export async function analyzeImages(files) {
  const results = await Promise.all(files.map((file) => analyzeImage(file)));

  const merged = {
    code: null,
    codeType: null,
    barcodeCropBlob: null,
    category: '기타',
    brand: null,
    amount: null,
    expiresAt: null,
    name: '',
  };

  for (const result of results) {
    if (!merged.code && result.code) {
      merged.code = result.code;
      merged.codeType = result.codeType;
      merged.barcodeCropBlob = result.barcodeCropBlob;
    }
    if (merged.category === '기타' && result.category && result.category !== '기타') merged.category = result.category;
    if (!merged.brand && result.brand) merged.brand = result.brand;
    if (merged.amount === null && result.amount !== null) merged.amount = result.amount;
    if (!merged.expiresAt && result.expiresAt) merged.expiresAt = result.expiresAt;
    if (!merged.name && result.name) merged.name = result.name;
  }

  return merged;
}
