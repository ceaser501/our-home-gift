import { useEffect, useRef, useState } from 'react';
import { Loader2, Plus, RotateCcw, Search, X } from 'lucide-react';
import { CATEGORIES } from '../constants';
import { analyzeImages } from '../utils/imageAnalyze';
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
      }
    : empty;
}

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

export default function UploadSheet({ mode, initial, onClose, onSaved }) {
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

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleFileChange(e) {
    const picked = Array.from(e.target.files || []);
    e.target.value = '';
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

    setNewFiles((prev) => [...prev, ...selected]);
    setNewPreviews((prev) => [...prev, ...selected.map((f) => URL.createObjectURL(f))]);
    setError('');
    setAnalyzing(true);
    setProgress({ step: 'barcode', current: 1, total: selected.length });
    setAutoFilled(false);

    try {
      const result = await analyzeImages(selected, { onProgress: setProgress });

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
      }));

      setBarcodeCropFile(
        result.code && result.barcodeCropBlob
          ? new File([result.barcodeCropBlob], 'barcode.png', { type: 'image/png' })
          : null
      );
      // 목록 썸네일로 쓸, 상품 사진만 잘라낸 그림. 못 잘랐으면 null로 두어 예전처럼
      // 올린 사진 그대로를 쓴다.
      setThumbCropFile(
        result.thumbCropBlob ? new File([result.thumbCropBlob], 'thumb.jpg', { type: 'image/jpeg' }) : null
      );
      setAutoFilled(true);
    } catch {
      setError('이미지 자동 인식에 실패했어요. 직접 입력해주세요.');
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
    if (!form.name.trim()) {
      setError('상품명을 입력해주세요.');
      return;
    }
    if (mode === 'create' && newFiles.length === 0) {
      setError('기프티콘 이미지를 1장 이상 업로드해주세요.');
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
      <SheetContent className="max-h-[92dvh] gap-0 overflow-y-auto pb-[max(20px,env(safe-area-inset-bottom))]">
        <SheetHeader className="flex-row items-center justify-between gap-2 pr-14 pb-3">
          <SheetTitle>{mode === 'create' ? '기프티콘 추가' : '기프티콘 수정'}</SheetTitle>
          <Button type="button" variant="ghost" size="sm" onClick={handleReset} className="text-muted-foreground">
            <RotateCcw className="size-3.5" />
            초기화
          </Button>
        </SheetHeader>

        <form className="flex flex-col gap-4 px-5" onSubmit={handleSubmit}>
          <p className="text-xs text-muted-foreground">
            기프티콘 이미지를 여러 장 올릴 수 있어요 (예: 상품명 보이는 화면 + 금액·기한 보이는 화면). 각 이미지에서
            찾은 정보를 자동으로 합쳐서 채워드려요.
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
              <Label htmlFor="f-brand">상호</Label>
              <Input id="f-brand" value={form.brand} onChange={(e) => updateField('brand', e.target.value)} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>카테고리</Label>
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
                  className="min-w-20 flex-1"
                />
                {!form.amount && form.name.trim() && (
                  <Button type="button" variant="outline" size="sm" onClick={handleSearchPrice} disabled={searchingPrice} className="shrink-0">
                    <Search className="size-3.5" />
                    {searchingPrice ? '검색 중…' : '가격 검색'}
                  </Button>
                )}
              </div>
              {priceSearchNote && <p className="text-xs text-muted-foreground">{priceSearchNote}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="f-expires">유효기한</Label>
              <Input id="f-expires" type="date" value={form.expires_at} onChange={(e) => updateField('expires_at', e.target.value)} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="f-code">바코드/QR 값</Label>
              <Input
                id="f-code"
                value={form.code}
                onChange={(e) => updateField('code', e.target.value)}
                placeholder="자동 인식 또는 직접 입력"
              />
            </div>

            <div className="col-span-2 flex flex-col gap-1.5">
              <Label>받은 사람</Label>
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
