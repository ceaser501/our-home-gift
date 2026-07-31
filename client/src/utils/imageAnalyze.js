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
const DATE_RE = /(20[0-9]{2})[.\-/](0?[1-9]|1[0-2])[.\-/](0?[1-9]|[12][0-9]|3[01])/;
const DATE_SHORT_RE = /(?<!\d)([0-9]{2})[.\-/](0?[1-9]|1[0-2])[.\-/](0?[1-9]|[12][0-9]|3[01])(?!\d)/;

function extractAmount(text) {
  const manMatch = text.match(AMOUNT_MAN_RE);
  if (manMatch) return Number(manMatch[1]) * 10000;
  const wonMatch = text.match(AMOUNT_WON_RE);
  if (wonMatch) return Number(wonMatch[1].replace(/,/g, ''));
  return null;
}

function extractExpiry(text) {
  const full = text.match(DATE_RE);
  if (full) {
    const [, y, m, d] = full;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  const short = text.match(DATE_SHORT_RE);
  if (short) {
    const [, y, m, d] = short;
    return `20${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return null;
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
