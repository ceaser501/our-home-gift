import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat } from '@zxing/library';
import { createWorker } from 'tesseract.js';
import { BRAND_DISPLAY, CATEGORIES, GENERIC_KEYWORDS } from '../constants';

let ocrWorkerPromise = null;
function getOcrWorker() {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = createWorker('kor+eng', 1, {
      workerPath: `${import.meta.env.BASE_URL}tesseract/worker.min.js`,
    }).then(async (worker) => {
      // 기프티콘 화면은 상호·상품명·안내문이 한 칸에 위아래로 쌓인 형태라, 글자 크기가
      // 제각각인 한 단(段)으로 보고 읽으면(PSM 4) 자동 판단보다 줄이 덜 깨진다.
      // DPI를 알려주면 화면 캡처처럼 메타 정보가 없는 이미지에서 글자 크기 추정이 안정된다.
      await worker.setParameters({
        tessedit_pageseg_mode: '4',
        preserve_interword_spaces: '1',
        user_defined_dpi: '300',
      });
      return worker;
    });
  }
  return ocrWorkerPromise;
}

// 요즘 폰 사진은 1200만 화소가 넘어서, 원본 그대로 디코딩+OCR을 돌리면 메모리를
// 크게 잡아먹는다. 여러 장을 한 번에 올리면 브라우저가 페이지를 통째로 종료해버려서
// (설치한 앱에서는 앱이 튕긴 것처럼 보인다) 분석용으로는 이 크기까지 줄여서 쓴다.
// 기프티콘 바코드/글자는 이 해상도면 충분히 읽힌다.
const MAX_ANALYZE_EDGE = 2000;
// 반대로 너무 작은 이미지(작게 저장된 캡처 등)는 글자가 뭉개져서 인식률이 떨어진다.
// 이 정도까지는 키워서 읽는다(원본보다 2배까지만).
const MIN_ANALYZE_EDGE = 1600;

function analyzeScale(longEdge) {
  if (longEdge > MAX_ANALYZE_EDGE) return MAX_ANALYZE_EDGE / longEdge;
  if (longEdge < MIN_ANALYZE_EDGE) return Math.min(2, MIN_ANALYZE_EDGE / longEdge);
  return 1;
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

  const scale = analyzeScale(Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  source.close?.();

  return canvas;
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

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// 글자 인식 신뢰도가 이 값에 못 미치는 줄은 버린다. 기프티콘 이미지에는 배경 무늬나
// 로고 위의 장식 글자가 섞여 있어서, 그대로 두면 "MESH?" 같은 엉뚱한 값이 상품명으로 들어간다.
const MIN_LINE_CONFIDENCE = 45;
const NAME_MIN_CONFIDENCE = 62;

function median(numbers) {
  if (numbers.length === 0) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

// 줄 단위 인식 결과(글자 크기·신뢰도 포함)를 뽑아둔다. 상품명은 "가장 큰 글씨"라는
// 단서가 가장 정확해서, 글자 높이를 알아야 제대로 고를 수 있다.
function collectLines(page) {
  const lines = [];
  for (const block of page?.blocks || []) {
    for (const paragraph of block.paragraphs || []) {
      for (const line of paragraph.lines || []) {
        const text = (line.text || '').replace(/\s+/g, ' ').trim();
        if (!text) continue;
        const heights = (line.words || []).map((w) => w.bbox.y1 - w.bbox.y0).filter((h) => h > 0);
        lines.push({
          text,
          confidence: line.confidence ?? 0,
          height: median(heights),
          top: line.bbox?.y0 ?? 0,
        });
      }
    }
  }
  return lines;
}

async function runOcr(canvas) {
  try {
    const worker = await getOcrWorker();
    const { data } = await worker.recognize(canvas, {}, { text: true, blocks: true });
    const lines = collectLines(data);
    if (lines.length === 0) return { text: data.text || '', lines: [] };
    const text = lines
      .filter((l) => l.confidence >= MIN_LINE_CONFIDENCE)
      .map((l) => l.text)
      .join('\n');
    return { text: text || data.text || '', lines };
  } catch {
    return { text: '', lines: [] };
  }
}

// 기프티콘은 상품명을 가장 크게 인쇄한다. 그래서 안내문·라벨·상호줄을 걷어낸 뒤
// 남은 줄 중에서 글자가 가장 큰 줄을 상품명으로 본다. 두 줄로 접힌 상품명은
// 바로 아래에 비슷한 크기로 이어지므로 함께 붙인다.
function pickNameByFontSize(lines, brandNorm) {
  const candidates = lines
    .filter((l) => {
      const t = l.text;
      if (t.length < 2 || t.length > 40) return false;
      if (l.confidence < NAME_MIN_CONFIDENCE) return false;
      if (!/[가-힣a-zA-Z]{2,}/.test(t)) return false;
      if (/^[0-9.\-/\s]+$/.test(t)) return false;
      return !isNoiseLine(t) && !isStopLine(t) && !isBrandOnlyLine(t, brandNorm);
    })
    .sort((a, b) => a.top - b.top);

  if (candidates.length === 0) return null;

  const maxHeight = Math.max(...candidates.map((l) => l.height));
  if (maxHeight <= 0) return null;

  const firstIndex = candidates.findIndex((l) => l.height >= maxHeight * 0.9);
  const first = candidates[firstIndex];
  const next = candidates[firstIndex + 1];
  const wrapped =
    next && next.height >= first.height * 0.8 && next.top - first.top < first.height * 2.6 ? `${first.text} ${next.text}` : first.text;

  return wrapped.trim();
}

// OCR 워커는 한글 학습 데이터까지 올려두느라 메모리를 꽤 차지한다. 분석이 끝나면
// 정리해서, 다음에 파일 선택 화면을 오갈 때 브라우저가 페이지를 종료하지 않게 한다.
async function releaseOcrWorker() {
  if (!ocrWorkerPromise) return;
  const pending = ocrWorkerPromise;
  ocrWorkerPromise = null;
  try {
    const worker = await pending;
    await worker.terminate();
  } catch {
    // 이미 정리됐거나 만들다 실패한 경우라 무시해도 된다.
  }
}

// 카카오톡 선물하기의 "저장" 이미지처럼 zxing이 바코드 막대를 못 읽는 경우를 대비한
// 보조 수단. 바코드 밑에 인쇄된 숫자는 보통 4자리씩 띄어서 찍혀 있어서
// (예: "9350 6503 1487 8741"), 그 특징적인 모양만 매칭해 오탐(주문번호, 전화번호 등)을 피한다.
const BARCODE_NUMBER_RE = /(\d{3,4}[\s-]\d{3,4}[\s-]\d{3,4}[\s-]\d{2,4})(?!\d)/;

function extractBarcodeNumber(text) {
  const match = text.match(BARCODE_NUMBER_RE);
  if (!match) return null;
  const digits = match[1].replace(/[\s-]/g, '');
  return digits.length >= 10 ? digits : null;
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

// 키워드가 여러 개 걸리면 가장 긴 것을 택한다. "메가커피"가 걸렸는데 '커피'로 잡히거나,
// 상호가 아닌 일반 단어('치킨', '커피')가 상호 자리에 들어가는 걸 막기 위해서다.
function extractCategoryAndBrand(text) {
  const lower = text.toLowerCase().replace(/\s+/g, '');
  let best = null;

  for (const cat of CATEGORIES) {
    for (const kw of cat.keywords) {
      const norm = kw.replace(/\s+/g, '').toLowerCase();
      if (!lower.includes(norm)) continue;
      if (!best || norm.length > best.norm.length) best = { category: cat.key, keyword: kw, norm };
    }
  }

  if (!best) return { category: '기타', brand: null };
  const brand = GENERIC_KEYWORDS.has(best.keyword) ? null : BRAND_DISPLAY[best.norm] || best.keyword;
  return { category: best.category, brand };
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
  '카카오톡',
  '선물하기',
];

function isNoiseLine(line) {
  const norm = line.toLowerCase().replace(/\s+/g, '');
  return NAME_NOISE_KEYWORDS.some((kw) => norm.includes(kw.replace(/\s+/g, '').toLowerCase()));
}

// 상품명 후보를 훑다가 이 라벨들이 나오면 거기서부터는 더 이상 상품명이 아니라
// "교환처: OO", "유효기간: OO" 같은 안내 항목이 시작된 것으로 보고 멈춘다.
const NAME_STOP_WORDS = [...ALL_LABELS, '주문번호', '결제', '구매처', '사용방법'].map((w) => w.toLowerCase().replace(/\s+/g, ''));

function isStopLine(line) {
  const norm = line.toLowerCase().replace(/\s+/g, '');
  return NAME_STOP_WORDS.some((w) => norm.includes(w));
}

// 상호 이름 자체(또는 "투썸플레이스"처럼 상호+가맹점 접미어 정도)만 있는 줄인지 확인한다.
// 이런 줄은 상품명이 아니라 "브랜드를 표시하는 줄"이므로 상품명 후보에서 건너뛴다.
function isBrandOnlyLine(line, brandNorm) {
  if (!brandNorm) return false;
  const norm = line.toLowerCase().replace(/\s+/g, '');
  if (!norm.includes(brandNorm)) return false;
  return norm.replace(brandNorm, '').length <= 6;
}

// 기프티콘 화면은 보통 상호(브랜드)를 작게, 상품명을 그 아래 크게 표시한다(카카오톡
// 선물하기 저장 이미지는 상품명이 두 줄로 줄바꿈되기도 한다). 상호만 있는 줄은
// 건너뛰고, 그다음에 이어지는 실제 상품명 줄(들)을 상품명으로 합쳐서 쓴다.
function guessName(text, brand) {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length >= 2 && l.length <= 40 && !/^[0-9.\-/\s]+$/.test(l) && !isNoiseLine(l));

  if (lines.length === 0) return brand || '';
  if (!brand) return lines.find((l) => !isStopLine(l)) || lines[0];

  const brandNorm = brand.toLowerCase().replace(/\s+/g, '');

  const brandLineIndex = lines.findIndex((l) => isBrandOnlyLine(l, brandNorm));
  if (brandLineIndex !== -1) {
    const nameParts = [];
    for (let i = brandLineIndex + 1; i < lines.length; i++) {
      const line = lines[i];
      if (isStopLine(line) || (isBrandOnlyLine(line, brandNorm) && nameParts.length > 0)) break;
      nameParts.push(line);
      if (nameParts.length >= 2) break;
    }
    if (nameParts.length > 0) return nameParts.join(' ');
  }

  // 상호만 있는 별도 줄을 못 찾았다면, 상품명 자체에 브랜드가 포함된 경우다
  // (예: "황올반+BBQ양념반+콜라1.25L").
  const withBrand = lines.find((l) => !isStopLine(l) && l.toLowerCase().replace(/\s+/g, '') !== brandNorm && l.toLowerCase().replace(/\s+/g, '').includes(brandNorm));
  if (withBrand) return withBrand;

  return lines.find((l) => !isStopLine(l) && l.toLowerCase().replace(/\s+/g, '') !== brandNorm) || brand;
}

export async function analyzeImage(file) {
  const canvas = await toAnalyzeCanvas(file);
  try {
    // 바코드 인식과 OCR을 동시에 돌리면 순간 메모리 사용량이 두 배가 되므로 차례로 돌린다.
    const barcodeResult = await decodeBarcode(canvas);
    const { text, lines } = await runOcr(canvas);
    const { category, brand: keywordBrand } = extractCategoryAndBrand(text);
    // 알려진 브랜드(카테고리 키워드에 등록된 상호)는 항상 깨끗한 키워드 매칭값을
    // 우선한다. "교환처/상호" 라벨 값은 OCR이 라벨 글자를 살짝 잘못 읽어도
    // (예: "상호" → "상포도") 콜론 뒤 전체를 그대로 값으로 잡아버릴 수 있어서,
    // 목록에 없는 상호일 때 보조로만 사용한다.
    const brand = keywordBrand || extractLabeledField(text, ['교환처', '상호']);
    const labeledAmountText = extractLabeledField(text, ['금액', '권종', '가격']);
    const amount = (labeledAmountText && extractAmount(labeledAmountText)) ?? extractAmount(text);
    const expiresAt = extractExpiry(text);
    const brandNorm = brand ? brand.toLowerCase().replace(/\s+/g, '') : null;
    const name = extractLabeledField(text, ['상품명']) || pickNameByFontSize(lines, brandNorm) || guessName(text, brand);

    // zxing이 바코드 막대 자체를 못 읽었을 때(카카오톡 선물하기 저장 이미지 등에서
    // 종종 발생), 바코드 아래 인쇄된 숫자를 OCR 텍스트에서 대신 뽑아 쓴다.
    // 이 경우 원본에서 잘라낸 크롭 이미지는 없으니 바코드/QR을 새로 그려서 보여줘야 하고,
    // 국내 기프티콘은 이 형식 번호가 거의 CODE_128이라 그걸 기본값으로 둔다.
    let code = barcodeResult.code;
    let codeType = barcodeResult.codeType;
    if (!code) {
      const ocrCode = extractBarcodeNumber(text);
      if (ocrCode) {
        code = ocrCode;
        codeType = 'CODE_128';
      }
    }

    return {
      code,
      codeType,
      barcodeCropBlob: barcodeResult.cropBlob,
      category,
      brand,
      amount,
      expiresAt,
      name,
      rawText: text,
    };
  } finally {
    // 분석이 끝난 캔버스가 메모리에 남지 않게 크기를 0으로 줄여 비워둔다.
    canvas.width = 0;
    canvas.height = 0;
  }
}

// 기프티콘은 업체마다 디자인이 달라서 상품명은 첫 장, 금액·기한은 다음 장에 있는 등
// 정보가 여러 이미지에 나뉘어 있을 수 있다. 각 이미지를 따로 분석한 뒤, 필드별로
// 값을 찾은 첫 번째 이미지의 결과를 채택해서 합친다.
export async function analyzeImages(files) {
  // 여러 장을 동시에 분석하면 사진 수만큼 메모리를 한꺼번에 쓰게 되어 위험하다.
  // 한 장씩 끝내고 다음 장으로 넘어간다.
  const results = [];
  try {
    for (const file of files) {
      results.push(await analyzeImage(file));
    }
  } finally {
    await releaseOcrWorker();
  }

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
