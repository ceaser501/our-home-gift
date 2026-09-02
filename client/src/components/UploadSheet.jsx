import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Image as ImageIcon, Loader2, Plus, RotateCcw, Search, X } from 'lucide-react';
import { CATEGORIES } from '../constants';
import { prepareImages, readGifticonInfo, SMALL_BARCODE_COVERAGE } from '../utils/imageAnalyze';
import { createGifticon, updateGifticon, searchPrice, findGifticonByCode, findLookalikeGifticon } from '../api';
import { useFamily } from '../FamilyContext';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { OWNER_TAG_PALETTE, memberTagColorClass, nameTagColorClass } from '../utils/tagColor';
import AlertDialog from './AlertDialog';
import { readableCode, wrapCode } from '../utils/code';
import useBackClose from '../utils/useBackClose';
import { groupImages } from '../utils/gallery';
import { PhotoStrip } from './PhotoViewer';
import { todayStr } from '../utils/date';

// 스토리지 버킷에 걸어둔 제한과 같은 값이어야 한다(supabase/schema.sql).
// 달라지면 화면에서는 통과했는데 올릴 때 실패하는, 이유를 알 수 없는 오류가 난다.
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

// 바코드를 한 건도 못 알아봤을 때, 몇 장까지를 '한 기프티콘'으로 볼 것인가.
//
// 한 기프티콘을 여러 장 갖고 있는 경우는 대개 셋이다 — 받은 원본, 계산대에서 쓰려고
// 바코드만 크게 띄운 캡처, 금액이나 기한이 적힌 정보 캡처. 그 셋이라면 막대가 뭉개져
// 안 읽혀도 한 건으로 보고 서버에 눈으로 읽혀도 된다.
//
// 그보다 많으면 아니다. 자세한 사연은 아래 acceptFiles에 적어뒀다.
const SOLO_MAX_SHOTS = 3;

function buildEmptyForm(defaultOwner) {
  return {
    name: '',
    category: '기타',
    brand: '',
    amount: '',
    owner: defaultOwner || '',
    code: '',
    code_type: '',
    expires_at: '',
    memo: '',
    is_voucher: false,
  };
}

function buildForm(initial, defaultOwner) {
  const empty = buildEmptyForm(defaultOwner);
  return initial
    ? {
        ...empty,
        ...initial,
        amount: initial.amount ?? '',
        brand: initial.brand ?? '',
        owner: initial.owner ?? empty.owner,
        code: initial.code ?? '',
        code_type: initial.code_type ?? '',
        expires_at: initial.expires_at ?? '',
        memo: initial.memo ?? '',
        is_voucher: Boolean(initial.is_voucher),
      }
    : empty;
}

// 이 앱은 결국 계산대에서 바코드를 보여주기 위한 것이다. 사진은 거기 적힌 번호를 꺼내는
// 수단일 뿐이라 없어도 되지만, 번호가 없으면 등록해둘 이유 자체가 없다.
//
// 나머지 넷은 목록에서 이 기프티콘을 찾아내는 데 쓰인다. 상호와 분류로 걸러 보고,
// 받은 사람으로 누구 것인지 가른다. 하나라도 비면 목록이 금세 알아볼 수 없게 된다.
//
// 화면에 뜨는 순서와 같게 둔다. 빠진 것을 알려줬을 때 눈이 위에서 아래로 따라가야 한다.
// 가격 검색을 가려둔다. 지우지 않고 스위치만 내려둔 이유는 되살릴 수 있게 하기 위해서다.
//
// 이 버튼은 금액이 비었을 때만 떴는데, 정작 필요한 금액권은 카드에 액면이 크게 박혀 있어
// 이미 자동으로 채워진다. 그래서 뜰 일이 거의 없고, 뜨는 쪽(교환권)은 앱이 그 값을 쓰지
// 않는다. 게다가 검색이 찾는 건 시세인데 금액권에 필요한 건 액면이라 값의 종류부터 다르다.
//
// 그러면서 앱에서 가장 비싼 호출이다(모델 + 웹 검색, 검색은 토큰과 별도로 과금된다).
// 값어치보다 비용이 커서 내려둔다.
const SHOW_PRICE_SEARCH = false;

const REQUIRED_FIELDS = [
  { key: 'name', message: '상품명을 입력해주세요.' },
  { key: 'brand', message: '상호를 입력해주세요. (예: 스타벅스, BBQ)' },
  { key: 'category', message: '분류를 골라주세요.' },
  { key: 'code', message: '바코드 번호를 입력해주세요. 계산대에서 이 번호로 결제해요.' },
  { key: 'owner', message: '받은 사람을 골라주세요.' },
];

// 금액은 저장할 때 숫자만 쓰고, 화면에는 천 단위 쉼표를 넣어 보여준다. (5000 → 5,000)
function onlyDigits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function formatAmount(value) {
  const digits = onlyDigits(value);
  return digits ? Number(digits).toLocaleString('ko-KR') : '';
}

// 안 적어도 되는 칸에만 붙는다. 반대로 별표를 붙이면 일곱 칸 중 넷에 별이 생겨서,
// 별이 규칙이 아니라 무늬가 된다.
function Optional() {
  return <span className="font-normal text-muted-foreground">선택</span>;
}

// 받는 사람 칸에 찍는 색 점.
//
// 그 사람의 tag_color를 쓴다 — 목록 카드가 쓰는 것과 같은 색이라야 등록할 때 본 색과
// 목록에서 보는 색이 같다. 색은 가입 순서로 붙는 값이지 이름에서 나오는 값이 아니다.
//
// 가족에 없는 이름일 때는 이름에서 뽑는다. 예전에 가족을 나간 사람 것을 고쳐 쓰는
// 경우가 여기 든다.
function ownerDotClass(members, owner) {
  const found = members.find((m) => m.display_name === owner);
  if (found) return memberTagColorClass(found) ?? OWNER_TAG_PALETTE[0];
  return nameTagColorClass(owner) ?? 'bg-border';
}

// 내가 받은 기프티콘을 올리는 경우가 가장 많아서 내 이름을 맨 위에 둔다.
// 다만 가족 것을 대신 올릴 수도 있으니 나머지 구성원도 그대로 아래에 나열한다.
function membersWithMeFirst(members, myName) {
  const me = members.filter((m) => m.display_name === myName);
  const others = members.filter((m) => m.display_name !== myName);
  return [...me, ...others];
}

// 분석이 어느 단계인지 사람이 읽을 수 있는 문구로 바꾼다.
function progressLabel(progress) {
  if (!progress) return '이미지를 준비하고 있어요';
  if (progress.step === 'barcode') {
    const count = progress.total > 1 ? ` (${progress.current}/${progress.total})` : '';
    return `바코드를 읽고 있어요${count}`;
  }
  if (progress.step === 'reading') return '상품명·금액·사용기한을 읽고 있어요';
  if (progress.step === 'verifying') return '상품명을 다시 확인하고 있어요';
  if (progress.step === 'thumbnail') return '상품 사진을 잘라내고 있어요';
  return '거의 다 됐어요';
}

function buildExistingImages(initial) {
  return (initial?.image_paths || []).map((path, i) => ({ path, url: initial.image_urls[i] }));
}

export default function UploadSheet({ mode, initial, initialFiles, onClose, onSaved, onBulk, onNext }) {
  // 뒤로가기로 이 창을 닫는다. 안 그러면 설치해서 쓸 때 앱이 통째로 꺼진다.
  useBackClose(onClose);
  const { family, members, user } = useFamily();
  const myName = members.find((m) => m.user_id === user.id)?.display_name || members[0]?.display_name || '';
  const [form, setForm] = useState(() => buildForm(initial, myName));
  const [existingImages, setExistingImages] = useState(() => buildExistingImages(initial));
  const [removedPaths, setRemovedPaths] = useState([]);
  const [newFiles, setNewFiles] = useState([]);
  const [newPreviews, setNewPreviews] = useState([]);
  const [barcodeCropFile, setBarcodeCropFile] = useState(null);
  const [thumbCropFile, setThumbCropFile] = useState(null);

  const [analyzing, setAnalyzing] = useState(false);
  const [autoFilled, setAutoFilled] = useState(false);
  // 막대가 사진에서 너무 작게 찍혔는가. 앱 화면이나 목록을 통째로 찍은 캡처가 그렇다.
  const [smallBarcode, setSmallBarcode] = useState(false);
  // 모델이 금액권으로 봤는지. 켜주지는 않고 귀띔만 한다.
  const [voucherHint, setVoucherHint] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  // 사용기한이 지나 등록을 막았다는 얼럿.
  const [expiredBlock, setExpiredBlock] = useState(false);
  const [searchingPrice, setSearchingPrice] = useState(false);
  const [priceSearchNote, setPriceSearchNote] = useState('');
  const [duplicateName, setDuplicateName] = useState(null);
  // 번호는 다른데 같은 물건으로 보이는 것. 막지 않고 한 번 되묻는다.
  const [lookalike, setLookalike] = useState(null);
  // 유효기한 없이 저장하려 할 때. 막지 않고 한 번 짚는다.
  const [noExpiry, setNoExpiry] = useState(false);
  // 방금 고른 사진이 지금 편집 중인 것과 다른 기프티콘일 때, 어떻게 할지 물어보려고 들고 있는다.
  const [mismatch, setMismatch] = useState(null);
  const [progress, setProgress] = useState(null);
  // 바코드가 없어서 이번 건에서 떼어둔 사진. 저장을 마친 뒤에 "이것도 기프티콘인가요?"를
  // 한 번 여쭤보려고 들고 있는다. 안 누르면 서버에 묻지 않으므로 값이 들지 않는다.
  //
  // ref인 이유는 저장 함수 안에서 읽기 때문이다. 사진을 고른 직후에 정해지고 그 뒤로는
  // 안 바뀌는 값이라, 다시 그리게 할 이유도 없다.
  const leftoverRef = useRef([]);
  const savedRef = useRef(null);
  const [askLeftover, setAskLeftover] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    return () => {
      newPreviews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [newPreviews]);

  // 공유로 넘어온 사진은 사용자가 이미 "이걸 등록해줘"라고 고른 것이라, 창이 열리자마자
  // 직접 고른 것과 똑같이 분석을 시작한다.
  // 개발 모드(StrictMode)에서는 이 효과가 두 번 실행돼서 같은 사진이 두 장 붙는다.
  // 한 번 받아들인 뒤로는 다시 처리하지 않게 표시해둔다.
  const sharedHandledRef = useRef(false);
  useEffect(() => {
    if (sharedHandledRef.current || !initialFiles?.length) return;
    sharedHandledRef.current = true;
    acceptFiles(initialFiles);
    // acceptFiles는 매번 새로 만들어지는 함수라 의존성에 넣으면 효과가 계속 다시 돈다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFiles]);

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleFileChange(e) {
    const picked = Array.from(e.target.files || []);
    e.target.value = '';
    await acceptFiles(picked);
  }

  // 사진이 들어오는 길은 두 갈래다 — 직접 고르거나, 다른 앱에서 "공유 → 모아콘"으로
  // 보내오거나. 둘 다 같은 검사와 같은 분석을 거치도록 여기 하나로 모았다.
  async function acceptFiles(picked) {
    if (picked.length === 0) return;

    // "파일"로 고르면 이미지가 아닌 것도 집을 수 있어서 여기서 걸러낸다.
    // 서버(스토리지 버킷)에도 같은 제한이 걸려 있다. 여기 검사는 방어가 아니라,
    // 올리고 나서 알 수 없는 오류를 보는 대신 고르는 순간 알려주기 위한 것이다.
    let selected = picked.filter((f) => ALLOWED_IMAGE_TYPES.includes(f.type));
    if (selected.length === 0) {
      setError('사진 파일(JPG, PNG, WEBP, HEIC)만 올릴 수 있어요.');
      return;
    }

    const tooBig = selected.find((f) => f.size > MAX_IMAGE_BYTES);
    if (tooBig) {
      setError(`사진 한 장은 ${Math.floor(MAX_IMAGE_BYTES / 1024 / 1024)}MB까지 올릴 수 있어요.`);
      return;
    }

    setError('');
    setAnalyzing(true);
    setProgress({ step: 'barcode', current: 1, total: selected.length });
    setAutoFilled(false);
    setSmallBarcode(false);

    // 여러 장을 골랐는데 서로 다른 기프티콘이면, 한 건짜리인 이 화면으로는 담을 수 없다.
    //
    // 예전에는 두 번째 사진의 바코드가 다르면 "다른 기프티콘인데 새로 시작할까요?"라고
    // 물었다. 다섯 장을 골라 온 사람에게는 네 번을 물어보고 네 번을 버리는 셈이었다.
    // 이제는 묶어서 한꺼번에 넣는 화면으로 넘긴다.
    //
    // 여기서는 얕게만 본다(quick). 몇 건인지만 알면 되는 자리라, 사진 두 장 고른 사람을
    // 무거운 판 앞에 세워둘 이유가 없다. 제대로 읽는 것은 넘겨받은 쪽이 다시 한다.
    //
    // 사진을 더하는 중이면 넘기지 않는다. 그건 한 기프티콘을 여러 화면으로 나눠 올리는
    // 중이라는 뜻이고, 지금까지 채워둔 것을 버릴 수 없다.
    const adding = existingImages.length + newFiles.length > 0;
    if (onBulk && selected.length > 1 && !adding) {
      let grouped = null;
      try {
        grouped = await groupImages(selected, { quick: true });

        // 얕은 판이 "한 건"이라고 했는데 못 읽은 사진이 남아 있으면, 그건 한 건이라는
        // 뜻이 아니라 **아직 모른다**는 뜻이다.
        //
        // 얕은 판은 일부러 약하다(1600px, 정밀 탐색 없음). 못 읽은 사진을 버리기로 한
        // 뒤로 이 한 번이 더 중요해졌다 — 예전에는 안 읽히면 옆 건에 붙어 값이 섞였고,
        // 지금은 안 읽히면 그 기프티콘이 통째로 사라진다. 흐릿하게 찍힌 한 장이
        // 그렇게 없어지면 사용자는 올린 줄 알고 지나간다.
        //
        // 못 읽은 사진만 다시 본다. 정밀 탐색은 느려서, 이미 읽힌 것까지 다시 돌리면
        // 잘 되던 경우가 같이 느려진다.
        //
        // 후보가 둘 이상이면 여기서 안 돌린다. 그건 다건 화면으로 넘어가고, 거기서
        // 처음부터 정밀 탐색으로 다시 읽는다(GalleryScanSheet). 두 번 돌릴 이유가 없다.
        if (grouped.candidates.length <= 1 && grouped.missed.length > 0) {
          const again = await groupImages(
            grouped.missed.map((image) => image.file),
            { skipCodes: new Set(grouped.candidates.map((c) => c.code)) }
          );
          grouped = { ...grouped, candidates: [...grouped.candidates, ...again.candidates], missed: again.missed };
        }

        // 바코드가 읽힌 것이 둘 이상이면 다건으로 넘긴다.
        //
        // 한동안은 못 읽은 사진까지 서버에 한 장씩 물어보고 그 답을 셌다. 번호가 나오면
        // 딴 물건(바코드 없이 번호만 인쇄된 파인트 아이스크림 쿠폰), 안 나오면 곁가지
        // 사진이라는 판단이었는데, 그 판단이 틀리면 곁가지가 남의 건에 붙어 남의 금액과
        // 기한을 들여왔다. 그 물음 한 번에 사진 한 장을 줄여 올리고 모델을 기다리는
        // 값이 붙었고, 못 읽은 사진 두 장이면 그것만으로 몇 초였다.
        //
        // 이제 안 가르고 안 묻는다. 바코드가 읽힌 사진만 한 건으로 센다.
        if (grouped.candidates.length > 1) {
          setAnalyzing(false);
          setProgress(null);
          onBulk(selected);
          return;
        }
      } catch {
        // 묶어보지 못했다. 아래에서 장수를 보고 정한다.
      }

      // 한 건도 못 알아봤을 때.
      //
      // 여기서 그냥 아래로 내려가면 고른 사진 전부가 한 건의 사진이 된다. 그게 맞는
      // 날도 있다 — 한 기프티콘을 원본·바코드 캡처·정보 캡처로 서너 장 갖고 있는데
      // 막대가 뭉개져 안 읽히는 경우다. 그때는 서버가 사진을 눈으로 읽어 채워준다.
      //
      // 그런데 열한 장을 골라 온 사람에게는 그 짐작이 맞을 수가 없다. 실제로 스타벅스
      // 라떼의 바코드 번호에 썬키스트의 상품명이 붙어 저장 직전까지 갔다 — 서로 다른
      // 열한 건을 한꺼번에 보여주니 모델이 이 사진의 이름과 저 사진의 번호를 섞었다.
      // 화면상 멀쩡해서 아무도 안 고치는 값이라, 빈칸보다 나쁘다.
      //
      // 그래서 장수로 가른다. 서넛까지는 한 건으로 보고 아래로 내려가고, 그보다 많으면
      // 다건 화면으로 넘긴다. 거기서 정밀하게 다시 읽고, 그래도 없으면 없다고 말한다.
      // 묶다가 넘어진 경우(catch)도 같은 길이다 — 무엇이 들었는지 못 본 것이라,
      // 열한 장을 한 건으로 우길 근거가 더 없다.
      if (!grouped?.candidates.length && selected.length > SOLO_MAX_SHOTS) {
        setAnalyzing(false);
        setProgress(null);
        onBulk(selected);
        return;
      }

      if (grouped?.candidates.length === 1) {
        // 한 건이면 그 건의 사진만 데리고 간다. 못 읽은 사진은 여기서 놓는다.
        //
        // 붙일 곳이 하나뿐이라 해서 그게 그 건의 사진이라는 뜻은 아니다. 금액이 적힌
        // 정보 캡처일 수도 있고, 바코드 없이 번호만 인쇄된 딴 기프티콘일 수도 있다.
        // 둘을 그림만 보고 가를 방법이 없어서 여기서 곁가지가 남의 건으로 들어갔다.
        //
        // 이제 안 가른다. 바코드가 있어서 기프티콘으로 알아본 사진만 취급한다.
        // 뗐다고 말하지도 않는다 — 애초에 대상이 아닌 사진이라, 알려줄 것이 없다.
        //
        // 떼는 자리가 prepareImages 앞인 것이 중요하다. 버릴 사진을 줄이고 인코딩하는
        // 데만 한 장에 수백 ms가 든다.
        const drop = new Set((grouped.missed ?? []).map((image) => image.file));
        if (drop.size > 0) {
          const kept = selected.filter((file) => !drop.has(file));
          // 한 장도 안 남으면 떼지 않는다. 그건 곁가지가 아니라 고른 사진 전부다.
          // 아래 등록 폼은 서버가 사진에 인쇄된 숫자를 눈으로 읽어주는 길이라, 막대가
          // 뭉개진 기프티콘은 그 길로 들어온다. 붙을 곳이 없으니 섞일 일도 없다.
          if (kept.length > 0) {
            // 뗀 사진은 버리지 않고 들고 있는다. 저장을 마친 뒤에 한 번 여쭤본다 —
            // 막대 없이 번호만 인쇄된 기프티콘(파인트 아이스크림 쿠폰)이 여기 섞여 있을
            // 수 있는데, 그건 서버가 눈으로 읽어야 아는 것이라 지금 물으면 값이 든다.
            leftoverRef.current = selected.filter((file) => drop.has(file));
            selected = kept;
          }
        }
      }
    }

    let prepared;
    try {
      prepared = await prepareImages(selected, { onProgress: setProgress });
    } catch {
      // 여기서 실패하면 올릴 사진이 없다. 원본으로 대신하지는 않는다 — 원본은 한 장에
      // 몇 MB라, 그대로 쌓이면 저장 공간이 금세 찬다.
      setError('사진을 읽지 못했어요. 다른 사진으로 다시 시도해주세요.');
      setAnalyzing(false);
      setProgress(null);
      return;
    }

    // 이미 사진이 있는데 바코드 번호가 다르면 다른 기프티콘이다.
    //
    // 여러 장을 올리는 건 한 기프티콘을 여러 화면으로 나눠 찍은 경우를 위한 것인데,
    // 실수로 다른 상품 사진을 더하면 사진은 쌓이고 정보만 덮어써진다. 스타벅스 사진에
    // 투썸 바코드가 붙은 기프티콘이 저장되고, 서로 다른 상품을 함께 본 모델은 상품명도
    // 헷갈린다. 저장하고 나면 어디가 틀렸는지 알아보기도 어렵다.
    //
    // 그렇다고 사진을 더할 때마다 화면을 비우면, 같은 기프티콘의 두 번째 화면을 올리는
    // 정상적인 경우가 망가진다. 둘을 가르는 기준은 바코드다 — 번호가 다르면 다른 물건이다.
    const currentCode = String(form.code || '').trim();
    const hasImages = existingImages.length + newFiles.length > 0;
    if (hasImages && currentCode && prepared.code && prepared.code !== currentCode) {
      setMismatch(prepared);
      setAnalyzing(false);
      setProgress(null);
      return;
    }

    await applyPrepared(prepared, { merge: hasImages });
  }

  // 읽어둔 사진을 화면에 반영한다. 사진을 더하는 길과, 다른 기프티콘이라 새로 시작하는
  // 길이 같은 처리를 쓴다.
  async function applyPrepared(prepared, { merge = false } = {}) {
    setAnalyzing(true);
    // 막대는 읽혔는데 사진에서 차지하는 자리가 작다. 번호는 맞지만(막대에는 검산 자리가
    // 있다) 그 그림에는 다른 기프티콘이 같이 찍혀 있을 수 있고, 그러면 모델이 옆칸의
    // 금액과 기한을 이 기프티콘 것으로 읽어온다. 훑기는 그런 건을 아예 빼지만, 여기는
    // 사람이 폼을 보고 있는 자리라 막지 않고 알린다.
    if (prepared.code) {
      setSmallBarcode(prepared.barcodeCoverage > 0 && prepared.barcodeCoverage < SMALL_BARCODE_COVERAGE);
    }

    // 보관하는 건 사용자가 고른 원본이 아니라 줄인 사본이다(긴 변 1400px JPEG).
    // 미리보기도 같은 파일로 만들어서, 화면에 보이는 것과 실제로 올라가는 것이 같게 한다.
    setNewFiles((prev) => [...prev, ...prepared.storageFiles]);
    setNewPreviews((prev) => [...prev, ...prepared.storageFiles.map((f) => URL.createObjectURL(f))]);

    // 바코드는 브라우저에서 이미 읽었다. 아래 서버 인식이 실패해도 이건 남아야 한다 —
    // 기한을 못 읽으면 알림을 못 받을 뿐이지만, 바코드가 없으면 계산대에서 쓸 수가 없다.
    setBarcodeCropFile(
      prepared.code && prepared.barcodeCropBlob
        ? new File([prepared.barcodeCropBlob], 'barcode.png', { type: 'image/png' })
        : null
    );
    if (prepared.code) {
      setForm((prev) => ({ ...prev, code: prepared.code, code_type: prepared.codeType || '' }));
    }

    try {
      const result = await readGifticonInfo(prepared, { onProgress: setProgress });

      // 첫 사진을 올리는 건 "이 기프티콘으로 하겠다"는 뜻이라, 설명하는 칸들을 통째로
      // 새 결과로 바꾼다. 못 읽은 항목은 비워서 예전 기프티콘 값이 남지 않게 한다.
      //
      // 사진을 더하는 건 다르다. 여기까지 왔다는 건 바코드가 같거나 없다는 뜻이고, 곧
      // 같은 기프티콘의 다른 화면이라는 뜻이다(금액만 적힌 상세 화면 같은 것). 그때는
      // 빈칸만 채우고 이미 있는 값은 건드리지 않는다. 덮어쓰면 앞 사진에서 읽어둔
      // 유효기간이 뒷 사진에 없다는 이유로 지워진다 — 합치자고 더했는데 잃는 셈이다.
      //
      // 채우는 쪽은 이미 적힌 값이 이긴다. 처음에는 새로 읽은 값을 앞에 뒀는데, 그러면
      // 채우는 게 아니라 덮어쓰는 것이 된다. 실제로 그랬다 — 투썸 원본을 올려 상품명이
      // 제대로 들어간 상태에서 금액만 적힌 주문 정보 화면을 더했더니, 그 화면에서 읽은
      // '16,600원'이 상품명 자리에 들어가 앉았다. 빈칸이던 금액은 채워야 하고 이미 있던
      // 상품명은 그대로 둬야 하는데, 규칙 하나가 둘 다를 결정하고 있었다.
      const fill = (next, before) => (merge ? before || next || '' : next ?? '');
      setForm((prev) => ({
        ...prev,
        name: fill(result.name || null, prev.name),
        brand: fill(result.brand || null, prev.brand),
        amount: fill(result.amount ?? null, prev.amount),
        // 분류도 같다. 앞 사진으로 정해진 것이 있으면 그대로 둔다.
        category: merge ? prev.category || result.category || '기타' : result.category || '기타',
        code: fill(result.code || null, prev.code),
        code_type: fill(result.codeType || null, prev.code_type),
        expires_at: fill(result.expiresAt || null, prev.expires_at),
        // 금액권 여부는 자동으로 켜지 않는다.
        //
        // 카드에 적힌 글자로 짐작하는 것이라 확실할 수가 없다. 그런데 틀렸을 때의 결과가
        // 한쪽으로 치우친다 — 교환권을 금액권으로 켜두면 쓸 때마다 얼마를 썼는지 묻고
        // 잔액이 남아 목록에서 사라지지 않는다. 반대로 금액권을 꺼둔 채로 두면 잔액을
        // 못 따라갈 뿐 쓰는 데는 지장이 없다.
        //
        // 확실하지 않은 판단은 켜는 쪽이 아니라 끄는 쪽으로 기울여야 한다.
        // 대신 모델이 금액권으로 봤다면 아래에 한 줄로 귀띔해서, 사람이 켜게 한다.
        is_voucher: merge ? prev.is_voucher : false,
      }));

      // 목록 썸네일로 쓸, 상품 사진만 잘라낸 그림. 못 잘랐으면 null로 두어 예전처럼
      // 올린 사진 그대로를 쓴다.
      setThumbCropFile(
        result.thumbCropBlob ? new File([result.thumbCropBlob], 'thumb.jpg', { type: 'image/jpeg' }) : null
      );
      setVoucherHint(Boolean(result.isVoucher));
      setAutoFilled(true);
    } catch (err) {
      // 서버가 왜 거절했는지 그대로 보여준다. 예전에는 무슨 일이 있었든 "실패했어요"만
      // 띄웠는데, 그러면 오늘 한도를 넘긴 것인지, 로그인이 풀린 것인지, API 키가 없는
      // 것인지 알 수가 없다. 사용자도 답답하고 고칠 때도 단서가 없다.
      setError(err?.message ? `${err.message} 직접 입력해주세요.` : '이미지 자동 인식에 실패했어요. 직접 입력해주세요.');
    } finally {
      setAnalyzing(false);
      setProgress(null);
    }
  }

  // 다른 기프티콘 사진으로 새로 시작한다. 지금까지 채운 것과 붙여둔 사진을 비우고,
  // 방금 고른 사진만 남긴다.
  function startOver(prepared) {
    newPreviews.forEach((url) => URL.revokeObjectURL(url));
    setRemovedPaths((prev) => [...prev, ...existingImages.map((image) => image.path)]);
    setExistingImages([]);
    setNewFiles([]);
    setNewPreviews([]);
    setBarcodeCropFile(null);
    setThumbCropFile(null);
    setForm(buildEmptyForm(myName));
    setError('');
    applyPrepared(prepared);
  }

  async function handleSearchPrice() {
    setSearchingPrice(true);
    setPriceSearchNote('');
    try {
      const result = await searchPrice({ brand: form.brand, name: form.name });
      if (result.amount) {
        updateField('amount', result.amount);
        setPriceSearchNote(`검색으로 채웠어요 (${result.source || '검색 결과'} 기준, 실제 가격과 다를 수 있어요)`);
      } else {
        setPriceSearchNote('검색 결과에서 가격을 찾지 못했어요. 직접 입력해주세요.');
      }
    } catch (err) {
      setPriceSearchNote(err.message || '가격 검색에 실패했어요.');
    } finally {
      setSearchingPrice(false);
    }
  }

  // 마지막 사진을 뗐으면 적힌 것도 함께 지운다.
  //
  // 이 칸들은 사람이 적은 것이 아니라 그 사진에서 읽어온 값이다. 사진을 뗐는데 상품명과
  // 기한이 그대로 남아 있으면, 어느 사진에서 나온 값인지 알 수 없는 폼이 된다.
  // 새로 등록하는 중일 때만 그렇게 한다 — 고치는 중이면 사진만 빼고 나머지는 그대로
  // 두는 것이 맞다.
  function clearedByLastPhoto(remaining) {
    if (mode !== 'create' || remaining > 0) return false;
    handleReset();
    return true;
  }

  function removeExisting(path) {
    if (clearedByLastPhoto(existingImages.length - 1 + newFiles.length)) return;
    setExistingImages((prev) => prev.filter((img) => img.path !== path));
    setRemovedPaths((prev) => [...prev, path]);
  }

  function removeNewFile(index) {
    if (clearedByLastPhoto(existingImages.length + newFiles.length - 1)) return;
    URL.revokeObjectURL(newPreviews[index]);
    setNewFiles((prev) => prev.filter((_, i) => i !== index));
    setNewPreviews((prev) => prev.filter((_, i) => i !== index));
  }

  function handleReset() {
    newPreviews.forEach((url) => URL.revokeObjectURL(url));
    setForm(buildForm(initial, myName));
    setExistingImages(buildExistingImages(initial));
    setRemovedPaths([]);
    setNewFiles([]);
    setNewPreviews([]);
    setBarcodeCropFile(null);
    setThumbCropFile(null);
    setError('');
    setAutoFilled(false);
    // 되돌리기는 읽어온 것을 다 무르는 자리다. 사진에서 나온 경고도 같이 무른다 —
    // 폼은 처음 값으로 돌아갔는데 "바코드가 작아요"만 남으면 무엇을 보라는 말인지 모른다.
    setSmallBarcode(false);
    setVoucherHint(false);
    setPriceSearchNote('');
    setProgress(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  // 되묻기를 지나온 뒤 이어서 저장하기 위한 표시. 한 번 확인했으면 다시 묻지 않는다.
  const lookalikeOkRef = useRef(false);
  const expiryOkRef = useRef(false);

  // 되묻는 창의 '그래도 등록'에서도 부른다. 그때는 폼 제출이 아니라 넘어오는 것이 없다.
  async function handleSubmit(e) {
    e?.preventDefault();

    // 사진은 없어도 저장된다. 종이 쿠폰이나 문자로 번호만 받은 것도 넣을 수 있어야 하고,
    // 자동 인식이 실패한 것도 손으로 적어 남길 수 있어야 한다. 바코드 번호만 있으면
    // 계산대에서 쓰는 데 지장이 없다 — 번호로 바코드를 새로 그려서 보여주기 때문이다
    // (client/src/components/BarcodeModal.jsx). 대신 그 번호는 반드시 있어야 한다.
    const missing = REQUIRED_FIELDS.find((field) => !String(form[field.key] ?? '').trim());
    if (missing) {
      setError(missing.message);
      return;
    }

    // 이미 지난 기한은 등록하지 않는다.
    //
    // 넣어봐야 목록에서 처음부터 빨간 배지를 달고 앉아 있고, 알림은 이미 지나간 날에
    // 대해 울릴 수가 없다. 쓸 수 없는 것이 자리만 차지하는 셈이다.
    //
    // 오늘까지는 받는다. 기한이 오늘인 기프티콘은 오늘 쓰면 되고, 계산대 앞에서 급히
    // 넣는 경우가 실제로 그 자리다.
    //
    // 수정은 막지 않는다. 이미 들어와 있는 것의 다른 값을 고치려는 것뿐인데 기한 때문에
    // 저장이 안 되면 손댈 방법이 없어진다.
    if (mode !== 'edit' && form.expires_at && form.expires_at < todayStr()) {
      // 폼 밑의 빨간 줄로 적었더니 저장 버튼만 보고 있던 눈에 안 들어왔다. 얼럿으로 묻는다.
      setExpiredBlock(true);
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const excludeId = mode === 'edit' ? initial.id : undefined;
      if (form.code) {
        const existing = await findGifticonByCode(family.id, form.code, excludeId);
        if (existing) {
          setDuplicateName(existing.name);
          setSubmitting(false);
          return;
        }
      }

      // 유효기한이 비어 있으면 한 번 짚는다.
      //
      // 필수로 만들지는 않는다. 기한을 모르는 채로 일단 넣어두고 나중에 채우는 길이
      // 막히면 안 된다 — 종이 쿠폰이나 문자로 번호만 받은 것도 있다.
      //
      // 다만 비어 있으면 이 앱이 해주는 일의 절반이 없어진다. 만료 전에 알려주는 것도,
      // 목록에서 급한 것부터 보여주는 것도 기한이 있어야 한다. 저장하고 나면 그게 빠진
      // 줄 모르고 지나가므로, 넘어가기 전에 한 번만 말한다.
      if (!form.expires_at && !expiryOkRef.current) {
        setNoExpiry(true);
        setSubmitting(false);
        return;
      }

      // 번호가 같지 않아도 같은 물건일 수 있다.
      //
      // 위 검사는 번호가 똑같을 때만 걸린다. 그런데 같은 사진에서 번호가 한 자리 다르게
      // 읽히는 일이 실제로 있었고, 그래서 같은 스타벅스 교환권이 두 건으로 들어갔다.
      // 번호가 달라서 아무것도 걸리지 않았다.
      //
      // 상호·상품명·유효기한이 셋 다 같고 **번호를 믿을 수 없을 때만** 되묻는다.
      // 막대에서 읽은 번호끼리 다르면 다른 물건이므로 묻지 않는다 — 같은 상품을 두 개
      // 받는 건 흔한 일인데, 그때마다 물으면 사람은 "내가 등록했었나" 하고 취소한다.
      if (!lookalikeOkRef.current) {
        const lookalike = await findLookalikeGifticon(
          family.id,
          {
            brand: form.brand?.trim(),
            name: form.name.trim(),
            expiresAt: form.expires_at,
            codeType: form.code_type || null,
          },
          excludeId
        );
        if (lookalike) {
          setLookalike(lookalike);
          setSubmitting(false);
          return;
        }
      }

      const fields = {
        name: form.name.trim(),
        category: form.category,
        brand: form.brand || null,
        amount: form.amount,
        owner: form.owner || null,
        code: form.code || null,
        code_type: form.code_type || null,
        expires_at: form.expires_at || null,
        memo: form.memo || null,
        // 금액이 없으면 금액권일 수 없다. 깎아 나갈 값이 없으면 잔액이 성립하지 않는다.
        is_voucher: Boolean(form.is_voucher) && Boolean(onlyDigits(form.amount)),
        // 메모를 남긴 사람. 저장하는 쪽에서 메모가 실제로 바뀌었을 때만 반영한다.
        memo_by: user.id,
        memo_by_name: myName || null,
      };

      if (mode === 'create') {
        // 등록한 사람은 새로 만들 때만 적는다(남의 기프티콘을 수정해도 등록자가 안 바뀌게).
        const created = await createGifticon(family.id, { ...fields, created_by: user.id }, newFiles, {
          barcodeCropFile,
          thumbCropFile,
        });
        // 바코드가 없어 떼어둔 사진이 있으면 여기서 한 번 여쭤본다. 저장이 끝난 뒤라
        // 기다리는 사람이 없고, 누르지 않으면 서버에 묻지도 않는다.
        if (leftoverRef.current.length > 0 && onNext) {
          savedRef.current = created;
          setAskLeftover(true);
          return;
        }
        onSaved(created);
      } else {
        const updated = await updateGifticon(family.id, initial.id, fields, {
          addFiles: newFiles,
          removePaths: removedPaths,
          barcodeCropFile,
          thumbCropFile,
        });
        onSaved(updated);
      }
    } catch (err) {
      setError(err.message || '저장에 실패했어요.');
    } finally {
      setSubmitting(false);
    }
  }

  // 이미지에서 못 읽어 비어 있는 항목. 사용자가 칸에 직접 채우면 그 순간 사라진다.
  const missingCode = !form.code.trim();
  const missingExpiry = !form.expires_at;

  const thumbs = [
    ...existingImages.map((img) => ({ kind: 'existing', path: img.path, url: img.url })),
    ...newPreviews.map((url, i) => ({ kind: 'new', index: i, url })),
  ];

  // 여러 장을 나눠 담는 안내는 새로 등록할 때만 뜬다. 수정 화면에서 "기프티콘별로
  // 나눠 담아요"는 거짓말이다 — 거기서 고른 사진은 지금 보고 있는 이 한 건에 붙는다.
  // 넘겨줄 곳(onBulk)이 없을 때도 마찬가지다.
  const showBulkHint = mode === 'create' && Boolean(onBulk) && thumbs.length === 0;

  // 지울 것이 있는가. 받는 사람은 처음부터 내 이름이 들어 있어서 세지 않는다 —
  // 그것만 있는 화면은 아직 아무것도 안 적은 화면이다.
  const hasAnything =
    thumbs.length > 0 ||
    Boolean(form.name.trim() || form.brand.trim() || form.code.trim() || form.amount || form.expires_at || form.memo.trim());

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="max-h-[92dvh] gap-0 overflow-y-auto pb-[var(--safe-bottom)]">
        {/* 초기화를 뺐다. 닫기 ✕ 바로 옆이라 손이 미끄러지면 적던 것이 다 날아갔고,
            글자만 있는 버튼이기도 했다. 폼 맨 아래로 옮겼다 — 다 적은 뒤에야 필요한
            동작이라 적기 시작하는 자리에 있을 이유가 없다. */}
        <SheetHeader className="pr-14 pb-3">
          <SheetTitle className="text-[19px] font-bold tracking-[-0.026em]">
            {mode === 'create' ? '기프티콘 추가' : '기프티콘 수정'}
          </SheetTitle>
        </SheetHeader>

        <form className="flex flex-col gap-4 px-5" onSubmit={handleSubmit}>
          {/* 안내는 사진 상자 안으로 들어갔다. 상자 위에 따로 한 문단으로 두면 화면을
              여는 순간 읽어야 할 글부터 나오는데, 그 말이 가리키는 것은 바로 아래
              상자다. 상자 안에 두면 무엇에 대한 말인지 짚어줄 것이 없다. */}

          {/* 아직 아무 사진도 없을 때는 큰 + 하나만 둔다.
              한때 빈 칸 '2' '3'을 나란히 그려뒀다. 여러 장을 골라도 알아서 나눠 담는다는
              것을 모양으로 알리려던 것인데, 두 가지가 어긋났다 — 그 숫자가 무슨 뜻인지
              알 수 없었고(두 번째 사진인지, 최대 세 장인지), 한 장만 올리려는 사람에게는
              두 장을 더 올려야 하는 것처럼 보였다. 대부분은 한 장으로 끝난다.
              큰 버튼 하나로 합치니 이 상자가 화면의 1/3에서 1/6로 줄고, 폼이 그만큼
              위로 올라온다. 여러 장을 골라도 된다는 말은 아래 한 줄이 한다. */}
          {showBulkHint ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full flex-col items-center gap-[11px] rounded-[15px] border-[1.5px] border-dashed border-primary/60 bg-primary/4 px-3.5 py-4"
            >
              <span className="flex size-[52px] items-center justify-center rounded-[15px] bg-primary">
                <Plus className="size-[26px] text-primary-foreground" strokeWidth={2.1} />
              </span>
              <span className="flex flex-col items-center gap-1">
                <span className="text-base font-bold tracking-[-0.015em] text-foreground">사진 고르기</span>
                {/* 두 줄이 하는 말이 다르다. 앞은 사진을 올리면 무슨 일이 생기는지,
                    뒤는 여러 장을 골라도 된다는 것.
                    뒷줄을 고쳤다. 예전에는 '기프티콘별로 나눠 담아요'였는데, 지금은
                    정보성 화면은 버리고 기프티콘만 골라 담는다. */}
                <span className="text-center text-[13px] leading-relaxed font-medium break-keep text-muted-foreground">
                  사진을 올리면 <b className="font-bold text-foreground">정보를 자동으로 채워요</b>
                  <br />
                  여러 장을 올리면 기프티콘만 골라서 등록해요
                </span>
              </span>
            </button>
          ) : (
          <div className="grid grid-cols-3 gap-2">
            {thumbs.map((thumb) => (
              <div
                key={thumb.kind === 'existing' ? thumb.path : `new-${thumb.index}`}
                className="relative aspect-square overflow-hidden rounded-xl bg-black"
              >
                <img src={thumb.url} alt="기프티콘 이미지" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => (thumb.kind === 'existing' ? removeExisting(thumb.path) : removeNewFile(thumb.index))}
                  aria-label="이미지 삭제"
                  className="absolute top-1 right-1 flex size-5.5 items-center justify-center rounded-full bg-black/60 text-white"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex aspect-square flex-col items-center justify-center gap-0.5 rounded-xl border border-dashed border-border bg-background text-xs text-muted-foreground"
            >
              <Plus className="size-5" />
              <span>이미지 추가</span>
            </button>
          </div>
          )}
          {/* 분석은 몇 초 걸린다. 작은 글씨 한 줄만 있으면 멈춘 것처럼 보여서,
              지금 무슨 단계인지와 진행 중이라는 걸 눈에 띄게 보여준다. */}
          {analyzing && (
            <div className="flex flex-col gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3.5 py-3">
              <div className="flex items-center gap-2.5">
                <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
                <span className="flex-1 text-sm font-semibold text-foreground">{progressLabel(progress)}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-primary/15">
                <div className="animate-progress-indeterminate h-full w-2/5 rounded-full bg-primary" />
              </div>
              <p className="m-0 text-xs text-muted-foreground">잠시만 기다려주세요. 몇 초 정도 걸려요.</p>
            </div>
          )}

          <input id="gifticon-image" ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileChange} hidden />

          {/* 못 읽은 항목은 여기서 짚어준다. 목록에 나간 뒤에 알려주면 다시 찾아 들어와야
              하지만, 지금은 사용자가 이 화면에서 입력 중이라 그 자리에서 채울 수 있다.
              값을 채우면 그 줄만 사라지고, 둘 다 채워지면 평소의 "다 채웠어요"로 돌아간다. */}
          {autoFilled && (missingCode || missingExpiry) ? (
            <div className="flex flex-col gap-1.5 rounded-xl border border-warning/40 bg-warning/10 px-3.5 py-3">
              <p className="m-0 text-sm font-semibold text-foreground">못 읽은 게 있어요</p>
              {/* 바코드를 먼저 적는다. 기한이 없으면 알림을 못 받을 뿐이지만, 바코드가
                  없으면 계산대에서 이 기프티콘을 아예 쓸 수 없다. */}
              {missingCode && (
                <p className="m-0 text-xs leading-relaxed break-keep text-muted-foreground">
<b className="font-semibold text-foreground">바코드 번호</b>를 못 읽었어요. 계산대에서 쓰는 번호라 꼭 필요해요.
                </p>
              )}
              {missingExpiry && (
                <p className="m-0 text-sm leading-relaxed break-keep text-muted-foreground">
                  <b className="font-semibold text-foreground">사용기한</b>을 못 읽었어요. 넣어두시면 만료 전에 알려드려요. (안 넣어도
                  저장돼요)
                </p>
              )}
            </div>
          ) : (
            autoFilled && <p className="text-sm text-success">정보를 채웠어요. 확인하고 저장해주세요.</p>
          )}
          {smallBarcode && !analyzing && (
            <p className="text-warning m-0 text-sm leading-relaxed break-keep">
              바코드가 사진에서 작게 찍혀 있어요. 다시 한번 확인해주세요.
            </p>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}

          {/* 질문형 구역 제목 셋(무엇인가요 · 언제까지, 얼마인가요 · 누구 것인가요)을
              걷었다. 칸마다 라벨이 있어서 같은 말을 두 번 하고 있었다 — '무엇인가요'
              아래에 상호·상품명이 있고, '누구 것인가요'는 칸 하나짜리 구역이었다.
              묶음은 여백이 만든다. 칸 사이를 13 → 16px로 벌리고, 사진과 정보 사이에만
              선을 하나 둔다.

              별표(*)도 없다. 일곱 칸 중 넷에 별이 붙으면 별이 규칙이 아니라 무늬가 된다.
              안 적어도 되는 것에만 '선택'이라고 적는 편이 짧다. */}
          <div className="my-1 h-px bg-border/60" />

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="f-name" className="text-[14px] font-semibold text-foreground/80">상품명</Label>
              <Input
                id="f-name"
                value={form.name}
                onChange={(e) => updateField('name', e.target.value)}
                required
                className="h-[52px] rounded-[13px] text-[15.5px]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="f-brand" className="text-[14px] font-semibold text-foreground/80">상호</Label>
                <Input
                  id="f-brand"
                  value={form.brand}
                  onChange={(e) => updateField('brand', e.target.value)}
                  className="h-[52px] rounded-[13px] text-[15.5px]"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label className="text-[14px] font-semibold text-foreground/80">카테고리</Label>
                {/* 고르는 칸은 배경을 채운다. 적는 칸(흰 배경)과 갈라 보이게 하려는 것이다 —
                    테두리는 둘 다 갖는다. 둘 다 조작하는 자리라서.
                    아이콘은 목록에서 쓰는 것과 같다(constants의 CATEGORIES). 같은 분류가
                    화면마다 다른 그림이면 그림이 이름을 대신하지 못한다. */}
                <Select value={form.category} onValueChange={(v) => updateField('category', v)}>
                  {/* 위의 Label은 htmlFor로 묶을 수가 없다 — 이 칸은 input이 아니라 button이다.
                      그래서 이름을 따로 붙인다. 없으면 읽어주는 프로그램에는 값만 들리고
                      ("카페"), 무엇을 고르는 칸인지가 안 들린다. */}
                  {/* 이름이 길면 두 줄로 감기면서 칸 밖으로 잘렸다('생활·편의' 같은 것).
                      한 줄로 붙들고 넘치면 …으로 자른다 — 아이콘이 무엇인지 이미 말한다. */}
                  <SelectTrigger
                    size="lg"
                    aria-label="카테고리"
                    className="w-full gap-2.5 rounded-[13px] border border-input bg-secondary/50 px-[15px] text-[15.5px] [&>span]:min-w-0 [&>span]:truncate [&>span]:whitespace-nowrap"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.key} value={c.key}>
                        <span className="flex items-center gap-2">
                          {c.Icon && <c.Icon className="size-[18px] shrink-0 text-muted-foreground" strokeWidth={1.9} />}
                          {c.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* 번호도 '무엇인가요'다. 한때 기한·금액과 한 묶음에 뒀는데, 그 묶음의 이름이
                무엇이 되든 번호는 거기 속하지 않는다 — 이 번호가 이 기프티콘을 가리키는
                이름이고, 계산대에서 실제로 내미는 것도 이것이다. */}
            {/* 껍데기는 화면에서 감추되 저장값에는 남긴다.
                편의점 쿠폰의 QR에는 번호만 들어 있지 않다 — IX;1;9816401685019;; 처럼
                앞뒤가 붙는다. 저장한 값으로 QR을 다시 그리기 때문에 그 앞뒤를 잃으면
                매장 리더기가 원본과 다르게 읽는다.

                그렇다고 화면에 그대로 두면 사람은 자기 번호가 아닌 줄 알고 지운다. 그래서
                보여주는 것은 숫자뿐이고, 고쳐 적으면 기억해둔 앞뒤에 다시 끼워 넣는다.
                한때 아래에 "매장에서 부를 번호는 …" 한 줄을 달아뒀는데, 그건 화면이 왜
                이상한지를 변명하는 줄이었다. 이상하지 않게 만드는 편이 맞다. */}
            {/* 번호와 금액을 한 줄에 나눠 놓고, 사용기한에 한 줄을 통째로 준다.
                셋을 반반씩 놓았더니 기한 칸이 좁아 "2026. 11. 0"에서 잘렸다 — 날짜
                고르개는 폰이 그리는 것이라 글자를 줄여 맞춰주지 않고 그냥 자른다.
                하필 잘리는 것이 끝자리라, 11월 1일인지 10일인지 20일인지를 알 수 없다.

                기한은 이 앱이 하는 일의 거의 전부다. 반대로 번호는 열몇 자리, 금액은
                길어야 여섯 자리라 절반씩으로 충분하다. */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="f-code" className="text-[14px] font-semibold text-foreground/80">바코드 번호</Label>
                <Input
                  id="f-code"
                  value={readableCode(form.code)}
                  onChange={(e) => updateField('code', wrapCode(form.code, e.target.value))}
                  placeholder="직접 입력"
                  className="h-[52px] rounded-[13px] text-[15.5px]"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="f-amount" className="text-[14px] font-semibold text-foreground/80">
                  금액 <Optional />
                </Label>
                {/* '원'을 예시 문구로 두면 한 글자만 적어도 사라져서, 무엇을 적는 칸인지가
                    적는 순간 없어진다. 오른쪽에 붙박이로 둔다. */}
                <div className="relative">
                  <Input
                    id="f-amount"
                    type="text"
                    inputMode="numeric"
                    value={formatAmount(form.amount)}
                    onChange={(e) => {
                      updateField('amount', onlyDigits(e.target.value));
                      setPriceSearchNote('');
                    }}
                    className="h-[52px] rounded-[13px] pr-8 text-[15.5px] font-semibold tabular-nums"
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-[13px] flex items-center text-[15px] font-semibold text-muted-foreground">
                    원
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="f-expires" className="text-[14px] font-semibold text-foreground/80">
                사용기한 <Optional />
              </Label>
              {/* 폰이 들고 있는 날짜 고르개를 그대로 쓴다. 직접 만든 달력으로 바꾸면
                  폰마다 익숙한 조작을 버리게 되고, 60대에게는 그 손해가 크다.

                  다만 웹뷰가 그려주는 달력 아이콘은 우리 화살표와 굵기도 색도 달라서
                  다른 칸과 나란히 두면 깨져 보인다. 그것만 감추고 같은 화살표를
                  직접 그린다. 누르는 자리는 칸 전체라 화살표는 그림일 뿐이다. */}
              <div className="relative">
                <Input
                  id="f-expires"
                  type="date"
                  value={form.expires_at}
                  onChange={(e) => updateField('expires_at', e.target.value)}
                  className="moacon-date h-[52px] w-full rounded-[13px] bg-secondary/50 pr-9 text-[15.5px]"
                />
                <ChevronDown
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 right-[15px] size-4 -translate-y-1/2 opacity-50"
                />
              </div>
            </div>

            {SHOW_PRICE_SEARCH && !form.amount && form.name.trim() && (
              <Button type="button" variant="outline" size="sm" onClick={handleSearchPrice} disabled={searchingPrice} className="self-start">
                <Search className="size-3.5" />
                {searchingPrice ? '검색 중…' : '가격 검색'}
              </Button>
            )}
            {priceSearchNote && <p className="m-0 text-xs text-muted-foreground">{priceSearchNote}</p>}

            {/* 금액권은 한 번에 다 쓰지 않고 쓴 만큼 깎아 나간다. 켜두면 사용할 때
                "얼마 썼어요?"를 묻고 잔액을 남긴다. 금액이 없으면 깎아 나갈 값이
                없으므로 이 스위치도 보이지 않는다.
                무엇을 켜는 건지는 스위치 옆에 붙여 적는다 — 켠 뒤에 한 줄을 더
                띄우면 같은 말을 두 번 하는 셈이고, 그만큼 화면이 길어진다. */}
            {onlyDigits(form.amount) && (
              <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-input bg-card px-3.5 py-3">
                <input
                  type="checkbox"
                  checked={Boolean(form.is_voucher)}
                  onChange={(e) => updateField('is_voucher', e.target.checked)}
                  className="size-4.5 shrink-0 accent-primary"
                />
                <span className="text-[15px] font-medium break-keep text-foreground">금액권 — 쓴 만큼 깎여요</span>
              </label>
            )}

            {/* 켜주지 않고 물어만 본다. 잘못 켜두면 쓸 때마다 금액을 묻고 잔액이 남아
                목록에서 사라지지 않아서, 사람이 확인하고 켜는 쪽이 안전하다. */}
            {voucherHint && !form.is_voucher && onlyDigits(form.amount) && (
              <p className="m-0 text-sm break-keep text-muted-foreground">금액권 같아 보여요. 맞으면 체크해주세요.</p>
            )}

            {/* 다시 고르는 칸으로 돌아왔다. 단추를 늘어놓던 때는 가족이 서넛일 때를 보고
                정한 것인데, 다섯이 되면 두 줄을 먹고 화면에서 가장 큰 덩어리가 된다.
                지금 로그인한 사람이 처음부터 골라져 있어서(buildEmptyForm의 myName)
                대개 손대지 않는 칸이다. 접어두면 52px 한 줄이라 위 칸들과 높이가 같고,
                사람이 늘어도 화면이 안 변한다.

                접힌 채로도 색 점과 '나'를 남긴다. 목록에서 이름표 색으로 누구 것인지
                가리는 앱이라 등록할 때부터 그 색이 보여야 한다.
                동그란 아바타는 안 쓴다 — 옆에 이름이 그대로 있어서 '아들아들'처럼 두 번
                읽힌다. 아바타는 이름이 안 보이는 자리에서 쓰는 것이다. */}
            <div className="flex flex-col gap-1.5">
              <Label className="text-[14px] font-semibold text-foreground/80">받는 사람</Label>
              <Select value={form.owner} onValueChange={(v) => updateField('owner', v)}>
                <SelectTrigger
                  size="lg"
                  aria-label="받는 사람"
                  className="w-full gap-2.5 rounded-[13px] border border-input bg-card px-[15px] text-[15.5px]"
                >
                  {/* pointer-events를 끈다. 안 끄면 이 span이 눌림을 먼저 받아서, 열려
                      있을 때 다시 눌러도 닫히지 않는다 — 라딕스는 밖을 눌러 닫고 트리거를
                      눌러 여는데, 그 둘이 같은 한 번의 눌림에서 잇달아 일어난다.
                      기본 SelectValue가 하는 일과 같다. */}
                  <span className="pointer-events-none flex min-w-0 flex-1 items-center gap-2.5">
                    <span
                      aria-hidden="true"
                      className={cn('size-2 shrink-0 rounded-full', ownerDotClass(members, form.owner))}
                    />
                    <span className="min-w-0 flex-1 truncate text-left font-semibold text-foreground">
                      {form.owner || '골라주세요'}
                    </span>
                    {form.owner && form.owner === myName && (
                      <span className="shrink-0 rounded-[5px] bg-accent px-1.5 py-0.5 text-[12.5px] font-semibold text-primary">
                        나
                      </span>
                    )}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {membersWithMeFirst(members, myName).map((m) => (
                    <SelectItem key={m.user_id} value={m.display_name}>
                      <span className="flex items-center gap-2.5">
                        <span
                          aria-hidden="true"
                          className={cn('size-2 shrink-0 rounded-full', memberTagColorClass(m) ?? OWNER_TAG_PALETTE[0])}
                        />
                        {m.display_name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              {/* 바코드 창에서 '○○님의 메모'로 크게 보이는 값인데, 여기서는 그걸 알 수
                  없었다. 칸 안 예시 문구로는 안 된다 — 적기 시작하면 사라진다. */}
              <div className="flex items-baseline gap-1.5">
                <Label htmlFor="f-memo" className="text-[14px] font-semibold text-foreground/80">메모</Label>
                <span className="text-[12.5px] font-medium text-muted-foreground">선택 · 가족이 같이 봐요</span>
              </div>
              <Textarea
                id="f-memo"
                value={form.memo}
                onChange={(e) => updateField('memo', e.target.value)}
                className="h-[76px] rounded-[13px] text-[15.5px]"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2 pt-1">
            <Button
              type="submit"
              className="h-[52px] w-full rounded-[13px] text-[15.5px] font-bold"
              disabled={submitting || analyzing}
            >
              {submitting ? '저장 중…' : '저장하기'}
            </Button>
            {/* 헤더에서 옮겨온 자리. 다 적은 뒤에야 필요한 동작이라 여기가 맞고, 적은
                것이 하나도 없으면 지울 것도 없으니 아예 안 그린다. */}
            {hasAnything && (
              <Button
                type="button"
                variant="outline"
                onClick={handleReset}
                className="h-11 w-full rounded-[11px] text-sm font-semibold text-muted-foreground"
              >
                <RotateCcw className="size-4" />
                적은 내용 지우기
              </Button>
            )}
          </div>
        </form>

        {/* 다른 기프티콘 사진을 더했을 때. 그냥 더하면 사진과 정보가 뒤섞이고, 그냥
            막으면 "잘못 골랐으니 이걸로 새로 하겠다"는 뜻이었을 때 길이 없다. 물어본다. */}
        {mismatch && (
          <AlertDialog
            tone="warning"
            title="다른 기프티콘 같아요"
            description={'바코드 번호가 앞에 올린 것과 달라요.\n이 사진으로 새로 등록할까요?'}
            details={['새로 등록하면 앞에 올린 것은 지워져요', '취소하면 지금 올린 것은 뺄게요']}
            confirmLabel="새로 등록"
            onConfirm={() => {
              const prepared = mismatch;
              setMismatch(null);
              startOver(prepared);
            }}
            onClose={() => setMismatch(null)}
          />
        )}

        {noExpiry && (
          <AlertDialog
            tone="warning"
            title="사용기한이 비어 있어요"
            description={'기한이 없으면 만료 전에 알려드릴 수 없어요.'}
            details={['나중에 수정에서 채워도 돼요']}
            confirmLabel="이대로 저장"
            cancelLabel="채우고 올게요"
            onConfirm={() => {
              setNoExpiry(false);
              expiryOkRef.current = true;
              handleSubmit();
            }}
            onClose={() => setNoExpiry(false)}
          />
        )}

        {lookalike && (
          <AlertDialog
            tone="warning"
            // "이미 등록한 것 같아요"라고 물었더니, 사람은 자기가 등록했었나 싶어
            // 반사적으로 취소했다. 여기까지 온 사람은 손에 기프티콘을 들고 있다.
            // 되묻더라도 등록하는 쪽으로 서 있어야 한다.
            title="같은 상품이 하나 더 있어요"
            description={`'${lookalike.name}'이(가) 상호·상품명·기한까지 똑같아요.`}
            details={[
              '이 사진은 바코드를 못 읽어서 번호를 글자로 읽었어요',
              '같은 걸 두 개 받으셨다면 그대로 등록하세요',
            ]}
            confirmLabel="등록"
            onConfirm={() => {
              setLookalike(null);
              lookalikeOkRef.current = true;
              handleSubmit();
            }}
            onClose={() => setLookalike(null)}
          />
        )}

        {expiredBlock && (
          <AlertDialog
            tone="warning"
            title="사용기한이 지났어요"
            description="기한이 지난 기프티콘은 등록할 수 없어요."
            onClose={() => setExpiredBlock(false)}
          />
        )}

        {duplicateName && (
          <AlertDialog
            tone="warning"
            title="이미 등록된 기프티콘이에요"
            description={`같은 바코드로 '${duplicateName}'이(가) 이미 목록에 있어요.`}
            onClose={() => setDuplicateName(null)}
          />
        )}

        {/* 저장을 마친 뒤 한 번만 여쭤본다. 바코드가 없어 뗀 사진 중에 막대 없이 번호만
            인쇄된 기프티콘이 섞여 있을 수 있는데(파인트 아이스크림 쿠폰), 그건 서버가
            눈으로 읽어야 안다. 미리 다 물어보면 정보 캡처까지 물어보게 돼서 느려진다.
            누를 때만 읽으니 안 누르면 값이 들지 않는다. */}
        {askLeftover && (
          <AlertDialog
            tone="info"
            icon={ImageIcon}
            title="이 사진도 기프티콘인가요?"
            description="바코드가 없어서 빼두었어요. 기프티콘이면 이어서 올려드릴게요."
            preview={<PhotoStrip files={leftoverRef.current} />}
            confirmLabel="네, 올릴게요"
            cancelLabel="아니요"
            onConfirm={() => {
              setAskLeftover(false);
              onNext(leftoverRef.current, savedRef.current);
            }}
            onClose={() => {
              setAskLeftover(false);
              onSaved(savedRef.current);
            }}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
