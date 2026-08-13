import { useEffect, useRef, useState } from 'react';
import { Loader2, Plus, RotateCcw, Search, X } from 'lucide-react';
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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [searchingPrice, setSearchingPrice] = useState(false);
  const [priceSearchNote, setPriceSearchNote] = useState('');
  const [duplicateName, setDuplicateName] = useState(null);
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

      // 이미지를 새로 올리는 건 "이 기프티콘으로 바꾸겠다"는 뜻이라, 기프티콘을 설명하는
      // 칸들은 직접 고쳐둔 값까지 포함해서 새 이미지 결과로 통째로 바꾼다.
      // 못 읽은 항목은 비워서 예전 기프티콘 값이 남지 않게 한다.
      // 받은 사람과 메모는 이미지에서 읽는 값이 아니라 사람이 정하는 값이라 그대로 둔다.
      setForm((prev) => ({
        ...prev,
        name: result.name || '',
        brand: result.brand || '',
        amount: result.amount ?? '',
        category: result.category || '기타',
        code: result.code || '',
        code_type: result.codeType || '',
        expires_at: result.expiresAt || '',
        is_voucher: result.isVoucher,
      }));

      // 목록 썸네일로 쓸, 상품 사진만 잘라낸 그림. 못 잘랐으면 null로 두어 예전처럼
      // 올린 사진 그대로를 쓴다.
      setThumbCropFile(
        result.thumbCropBlob ? new File([result.thumbCropBlob], 'thumb.jpg', { type: 'image/jpeg' }) : null
      );
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
          <p className="text-xs text-muted-foreground">
            사진을 올리면 상품명·금액·기한을 자동으로 채워드려요. 여러 장 올려도 되고요
            (예: 상품명 보이는 화면 + 금액·기한 보이는 화면), 각 이미지에서 찾은 정보를 합쳐서 채웁니다.
            <br />
            사진 없이 손으로 적어 넣어도 괜찮아요.
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
          {autoFilled && (missingCode || missingExpiry) ? (
            <div className="flex flex-col gap-1.5 rounded-xl border border-warning/40 bg-warning/10 px-3.5 py-3">
              <p className="m-0 text-xs font-semibold text-foreground">채웠지만, 못 읽은 게 있어요</p>
              {/* 바코드를 먼저 적는다. 기한이 없으면 알림을 못 받을 뿐이지만, 바코드가
                  없으면 계산대에서 이 기프티콘을 아예 쓸 수 없다. */}
              {missingCode && (
                <p className="m-0 text-xs leading-relaxed break-keep text-muted-foreground">
                  <b className="font-semibold text-foreground">바코드/QR 값</b>을 못 읽었어요. 계산대에서 이 번호로 결제하니, 사진에
                  인쇄된 번호를 직접 입력해주세요.
                </p>
              )}
              {missingExpiry && (
                <p className="m-0 text-xs leading-relaxed break-keep text-muted-foreground">
                  <b className="font-semibold text-foreground">유효기한</b>을 못 읽었어요. 넣어두시면 만료 전에 알려드려요. (안 넣어도
                  저장돼요)
                </p>
              )}
            </div>
          ) : (
            autoFilled && <p className="text-xs text-success">자동으로 정보를 채웠어요. 확인 후 저장해주세요.</p>
          )}
          {error && <p className="text-xs text-destructive">{error}</p>}

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

                {!form.amount && form.name.trim() && (
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
                <p className="m-0 text-xs break-keep text-muted-foreground">쓴 만큼 깎이고 남은 금액이 표시돼요.</p>
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
