import { BrowserMultiFormatReader } from '@zxing/browser';
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
    return {
      code: result.getText(),
      codeType: result.getBarcodeFormat ? String(result.getBarcodeFormat()) : null,
    };
  } catch {
    return { code: null, codeType: null };
  }
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

function guessName(text, brand) {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length >= 2 && l.length <= 20 && !/^[0-9.\-/\s]+$/.test(l));
  const nameLine = lines.find((l) => (brand ? l.includes(brand) : true)) || lines[0];
  return nameLine || brand || '';
}

export async function analyzeImage(file) {
  const imageUrl = URL.createObjectURL(file);
  try {
    const [barcodeResult, text] = await Promise.all([decodeBarcode(imageUrl), runOcr(imageUrl)]);
    const { category, brand } = extractCategoryAndBrand(text);
    const amount = extractAmount(text);
    const expiresAt = extractExpiry(text);
    const name = guessName(text, brand);

    return {
      code: barcodeResult.code,
      codeType: barcodeResult.codeType,
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
    category: '기타',
    brand: null,
    amount: null,
    expiresAt: null,
    name: '',
  };

  for (const result of results) {
    if (!merged.code && result.code) merged.code = result.code;
    if (!merged.codeType && result.codeType) merged.codeType = result.codeType;
    if (merged.category === '기타' && result.category && result.category !== '기타') merged.category = result.category;
    if (!merged.brand && result.brand) merged.brand = result.brand;
    if (merged.amount === null && result.amount !== null) merged.amount = result.amount;
    if (!merged.expiresAt && result.expiresAt) merged.expiresAt = result.expiresAt;
    if (!merged.name && result.name) merged.name = result.name;
  }

  return merged;
}
