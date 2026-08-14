import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Plus, RotateCcw, Search, X } from 'lucide-react';
import { CATEGORIES } from '../constants';
import { prepareImages, readGifticonInfo } from '../utils/imageAnalyze';
import { createGifticon, updateGifticon, searchPrice, findGifticonByCode } from '../api';
import { useFamily } from '../FamilyContext';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import AlertDialog from './AlertDialog';
import useBackClose from '../utils/useBackClose';

// 스토리지 버킷에 걸어둔 제한과 같은 값이어야 한다(supabase/schema.sql).
// 달라지면 화면에서는 통과했는데 올릴 때 실패하는, 이유를 알 수 없는 오류가 난다.
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

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
  if (progress.step === 'reading') return '상품명·금액·유효기한을 읽고 있어요';
  if (progress.step === 'thumbnail') return '상품 사진을 잘라내고 있어요';
  return '거의 다 됐어요';
}

// 두 번호는 대개 한 자리만 다르다. 열여섯 자리를 두 줄로 나란히 놓고 "다른 데를
// 찾아서 고르세요"라고 하면 사람은 못 찾는다. 다른 자리를 짚어준다.
function markDiff(value, other) {
  return [...String(value)].map((letter, index) =>
    letter === String(other)[index] ? (
      letter
    ) : (
      <b key={index} className="rounded-sm bg-primary/15 px-0.5 font-bold text-primary">
        {letter}
      </b>
    )
  );
}

function buildExistingImages(initial) {
  return (initial?.image_paths || []).map((path, i) => ({ path, url: initial.image_urls[i] }));
}

export default function UploadSheet({ mode, initial, initialFiles, onClose, onSaved }) {
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
  // 모델이 금액권으로 봤는지. 켜주지는 않고 귀띔만 한다.
  const [voucherHint, setVoucherHint] = useState(false);
  // 막대에서 읽은 번호와 사진에 인쇄된 번호가 다를 때, 그 둘.
  const [codeConflict, setCodeConflict] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [searchingPrice, setSearchingPrice] = useState(false);
  const [priceSearchNote, setPriceSearchNote] = useState('');
  const [duplicateName, setDuplicateName] = useState(null);
  // 방금 고른 사진이 지금 편집 중인 것과 다른 기프티콘일 때, 어떻게 할지 물어보려고 들고 있는다.
  const [mismatch, setMismatch] = useState(null);
  const [progress, setProgress] = useState(null);
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
    const selected = picked.filter((f) => ALLOWED_IMAGE_TYPES.includes(f.type));
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
    setCodeConflict(null);

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
      const fill = (next, before) => (merge ? next ?? before ?? '' : next ?? '');
      setForm((prev) => ({
        ...prev,
        name: fill(result.name || null, prev.name),
        brand: fill(result.brand || null, prev.brand),
        amount: fill(result.amount ?? null, prev.amount),
        category: result.category || (merge ? prev.category : '기타'),
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
      setCodeConflict(result.codeConflict || null);
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

  function removeExisting(path) {
    setExistingImages((prev) => prev.filter((img) => img.path !== path));
    setRemovedPaths((prev) => [...prev, path]);
  }

  function removeNewFile(index) {
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
    setVoucherHint(false);
    setCodeConflict(null);
    setPriceSearchNote('');
    setProgress(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleSubmit(e) {
    e.preventDefault();

    // 사진은 없어도 저장된다. 종이 쿠폰이나 문자로 번호만 받은 것도 넣을 수 있어야 하고,
    // 자동 인식이 실패한 것도 손으로 적어 남길 수 있어야 한다. 바코드 번호만 있으면
    // 계산대에서 쓰는 데 지장이 없다 — 번호로 바코드를 새로 그려서 보여주기 때문이다
    // (client/src/components/BarcodeModal.jsx). 대신 그 번호는 반드시 있어야 한다.
    const missing = REQUIRED_FIELDS.find((field) => !String(form[field.key] ?? '').trim());
    if (missing) {
      setError(missing.message);
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      if (form.code) {
        const existing = await findGifticonByCode(family.id, form.code, mode === 'edit' ? initial.id : undefined);
        if (existing) {
          setDuplicateName(existing.name);
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

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="max-h-[92dvh] gap-0 overflow-y-auto pb-[var(--safe-bottom)]">
        <SheetHeader className="flex-row items-center justify-between gap-2 pr-14 pb-3">
          <SheetTitle>{mode === 'create' ? '기프티콘 추가' : '기프티콘 수정'}</SheetTitle>
          <Button type="button" variant="ghost" size="sm" onClick={handleReset} className="text-muted-foreground">
            <RotateCcw className="size-3.5" />
            초기화
          </Button>
        </SheetHeader>

        <form className="flex flex-col gap-4 px-5" onSubmit={handleSubmit}>
          {/* 가족이 함께 쓰는 앱이라 나이 드신 분도 읽을 수 있어야 한다. 길게 설명하는
              것보다 짧고 큰 글씨가 낫다 — 자세한 규칙은 실제로 해보면 알게 된다. */}
          <p className="m-0 text-sm leading-relaxed break-keep text-muted-foreground">
사진을 올리면 정보를 자동으로 채워드려요.
            <br />
            사진 없이 직접 적어도 돼요.
          </p>

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
          {/* 막대에서 읽은 번호와 사진에 인쇄된 번호가 갈렸다.
              어느 쪽이 맞는지는 사람만 안다 — 사진을 보고 있으니까.
              한 자리가 틀린 채로 저장되면 계산대에서 못 쓰고, 같은 기프티콘이
              두 건으로 들어온다. 실제로 그런 일이 있었다. */}
          {codeConflict && (
            <div className="flex flex-col gap-2 rounded-xl border border-warning/40 bg-warning/10 px-3.5 py-3">
              <p className="m-0 text-base font-semibold text-foreground">번호가 두 가지로 읽혔어요</p>
              <p className="m-0 text-sm break-keep text-muted-foreground">위 사진과 같은 것을 골라주세요.</p>
              {[codeConflict.printed, codeConflict.scanned].map((value, index) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    updateField('code', value);
                    setCodeConflict(null);
                  }}
                  className={cn(
                    'flex items-center gap-2 rounded-lg border-2 bg-card px-3 py-2.5 text-left',
                    form.code === value ? 'border-primary' : 'border-transparent'
                  )}
                >
                  <Check className={cn('size-4 shrink-0', form.code === value ? 'text-primary' : 'opacity-0')} />
                  <span className="font-mono text-base break-all text-foreground">
                    {markDiff(value, [codeConflict.printed, codeConflict.scanned][1 - index])}
                  </span>
                </button>
              ))}
            </div>
          )}

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
                  <b className="font-semibold text-foreground">유효기한</b>을 못 읽었어요. 넣어두시면 만료 전에 알려드려요. (안 넣어도
                  저장돼요)
                </p>
              )}
            </div>
          ) : (
            autoFilled && <p className="text-sm text-success">정보를 채웠어요. 확인하고 저장해주세요.</p>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label htmlFor="f-name">상품명 *</Label>
              <Input id="f-name" value={form.name} onChange={(e) => updateField('name', e.target.value)} required />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="f-brand">상호 *</Label>
              <Input id="f-brand" value={form.brand} onChange={(e) => updateField('brand', e.target.value)} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>카테고리 *</Label>
              <Select value={form.category} onValueChange={(v) => updateField('category', v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.key} value={c.key}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 금액은 길어야 여섯 자리라 한 줄을 통째로 쓸 이유가 없다. 위 상호 칸만큼만
                쓰고, 남은 오른쪽은 그때그때 필요한 것에 내준다 — 금액이 없으면 가격 검색,
                있으면 금액권 여부. 둘은 동시에 필요한 적이 없어서 한 자리를 나눠 쓸 수 있다. */}
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label htmlFor="f-amount">금액(원)</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="f-amount"
                  type="text"
                  inputMode="numeric"
                  value={formatAmount(form.amount)}
                  onChange={(e) => {
                    updateField('amount', onlyDigits(e.target.value));
                    setPriceSearchNote('');
                  }}
                  className="w-1/2 min-w-20 shrink-0"
                />

                {SHOW_PRICE_SEARCH && !form.amount && form.name.trim() && (
                  <Button type="button" variant="outline" size="sm" onClick={handleSearchPrice} disabled={searchingPrice} className="shrink-0">
                    <Search className="size-3.5" />
                    {searchingPrice ? '검색 중…' : '가격 검색'}
                  </Button>
                )}

                {/* 금액권은 한 번에 다 쓰지 않고 쓴 만큼 깎아 나간다. 켜두면 사용할 때
                    "얼마 썼어요?"를 묻고 잔액을 남긴다. 금액이 없으면 깎아 나갈 값이
                    없으므로 이 스위치도 보이지 않는다. */}
                {onlyDigits(form.amount) && (
                  <label className="flex min-w-0 cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={Boolean(form.is_voucher)}
                      onChange={(e) => updateField('is_voucher', e.target.checked)}
                      className="size-4.5 shrink-0 accent-primary"
                    />
                    <span className="truncate text-sm font-semibold text-foreground">금액권이에요</span>
                  </label>
                )}
              </div>

              {priceSearchNote && <p className="text-xs text-muted-foreground">{priceSearchNote}</p>}

              {/* 무엇을 켠 건지는 켠 다음에 알려준다. 늘 띄워두면 안 쓸 사람에게도 한 줄을
                  차지하는데, 금액권은 열 건 중 한둘이다. */}
              {Boolean(form.is_voucher) && onlyDigits(form.amount) && (
                <p className="m-0 text-sm break-keep text-muted-foreground">쓴 만큼 깎여요.</p>
              )}

              {/* 켜주지 않고 물어만 본다. 잘못 켜두면 쓸 때마다 금액을 묻고 잔액이 남아
                  목록에서 사라지지 않아서, 사람이 확인하고 켜는 쪽이 안전하다. */}
              {voucherHint && !form.is_voucher && onlyDigits(form.amount) && (
                <p className="m-0 text-sm break-keep text-muted-foreground">
금액권 같아 보여요. 맞으면 켜주세요.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="f-expires">유효기한</Label>
              <Input id="f-expires" type="date" value={form.expires_at} onChange={(e) => updateField('expires_at', e.target.value)} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="f-code">바코드/QR 값 *</Label>
              <Input
                id="f-code"
                value={form.code}
                onChange={(e) => updateField('code', e.target.value)}
                placeholder="자동 인식 또는 직접 입력"
              />
            </div>

            <div className="col-span-2 flex flex-col gap-1.5">
              <Label>받은 사람 *</Label>
              <Select value={form.owner} onValueChange={(v) => updateField('owner', v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {membersWithMeFirst(members, myName).map((m) => (
                    <SelectItem key={m.user_id} value={m.display_name}>
                      {m.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-2 flex flex-col gap-1.5">
              <Label htmlFor="f-memo">메모</Label>
              <Textarea id="f-memo" value={form.memo} onChange={(e) => updateField('memo', e.target.value)} rows={2} />
            </div>
          </div>

          <Button type="submit" size="lg" className={cn('w-full rounded-xl')} disabled={submitting || analyzing}>
            {submitting ? '저장 중…' : '저장하기'}
          </Button>
        </form>

        {/* 다른 기프티콘 사진을 더했을 때. 그냥 더하면 사진과 정보가 뒤섞이고, 그냥
            막으면 "잘못 골랐으니 이걸로 새로 하겠다"는 뜻이었을 때 길이 없다. 물어본다. */}
        {mismatch && (
          <AlertDialog
            tone="warning"
            title="다른 기프티콘 같아요"
            description={'바코드 번호가 지금 것과 달라요.\n이 사진으로 새로 등록할까요?'}
            details={['새로 등록하면 지금 내용이 지워져요', '취소하면 이 사진만 빼요']}
            confirmLabel="새로 등록"
            onConfirm={() => {
              const prepared = mismatch;
              setMismatch(null);
              startOver(prepared);
            }}
            onClose={() => setMismatch(null)}
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
      </SheetContent>
    </Sheet>
  );
}
