import { useEffect, useRef, useState } from 'react';
import { Plus, RotateCcw, Search, X } from 'lucide-react';
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
import ImageSourcePicker from './ImageSourcePicker';

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

  const [analyzing, setAnalyzing] = useState(false);
  const [autoFilled, setAutoFilled] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [searchingPrice, setSearchingPrice] = useState(false);
  const [priceSearchNote, setPriceSearchNote] = useState('');
  const [amountMissing, setAmountMissing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const photoInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    return () => {
      newPreviews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [newPreviews]);

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handlePick(source) {
    setPickerOpen(false);
    const ref = source === 'camera' ? cameraInputRef : source === 'file' ? fileInputRef : photoInputRef;
    ref.current?.click();
  }

  async function handleFileChange(e) {
    const picked = Array.from(e.target.files || []);
    e.target.value = '';
    if (picked.length === 0) return;

    // "파일"로 고르면 이미지가 아닌 것도 집을 수 있어서 여기서 걸러낸다.
    const selected = picked.filter((f) => f.type.startsWith('image/'));
    if (selected.length === 0) {
      setError('이미지 파일만 올릴 수 있어요.');
      return;
    }

    const hadCode = Boolean(form.code);

    setNewFiles((prev) => [...prev, ...selected]);
    setNewPreviews((prev) => [...prev, ...selected.map((f) => URL.createObjectURL(f))]);
    setError('');
    setAnalyzing(true);
    setAutoFilled(false);

    try {
      const result = await analyzeImages(selected);
      setForm((prev) => ({
        ...prev,
        name: prev.name || result.name || '',
        category: prev.category === '기타' ? result.category || '기타' : prev.category,
        brand: prev.brand || result.brand || '',
        amount: prev.amount === '' ? result.amount ?? '' : prev.amount,
        code: prev.code || result.code || '',
        code_type: prev.code_type || result.codeType || '',
        expires_at: prev.expires_at || result.expiresAt || '',
      }));
      if (!hadCode && result.code && result.barcodeCropBlob) {
        setBarcodeCropFile(new File([result.barcodeCropBlob], 'barcode.png', { type: 'image/png' }));
      }
      setAutoFilled(true);
      setAmountMissing(form.amount === '' && !result.amount);
    } catch {
      setError('이미지 자동 인식에 실패했어요. 직접 입력해주세요.');
    } finally {
      setAnalyzing(false);
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
    setError('');
    setAutoFilled(false);
    setPriceSearchNote('');
    setAmountMissing(false);
    setPickerOpen(false);
    [photoInputRef, cameraInputRef, fileInputRef].forEach((ref) => {
      if (ref.current) ref.current.value = '';
    });
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
          alert('이미 등록된 기프티콘이에요.');
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
        const created = await createGifticon(family.id, fields, newFiles, barcodeCropFile);
        onSaved(created);
      } else {
        const updated = await updateGifticon(family.id, initial.id, fields, {
          addFiles: newFiles,
          removePaths: removedPaths,
          barcodeCropFile,
        });
        onSaved(updated);
      }
    } catch (err) {
      setError(err.message || '저장에 실패했어요.');
    } finally {
      setSubmitting(false);
    }
  }

  const thumbs = [
    ...existingImages.map((img) => ({ kind: 'existing', path: img.path, url: img.url })),
    ...newPreviews.map((url, i) => ({ kind: 'new', index: i, url })),
  ];

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        className="max-h-[92dvh] gap-0 overflow-y-auto pb-[max(20px,env(safe-area-inset-bottom))]"
        // 이미지 추가 시트는 이 시트 밖(body)에 그려지므로, 그걸 누른 걸
        // "바깥 클릭"으로 보고 입력하던 내용까지 닫아버리지 않게 막는다.
        onInteractOutside={(e) => {
          if (pickerOpen) e.preventDefault();
        }}
      >
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
              onClick={() => setPickerOpen(true)}
              className="flex aspect-square flex-col items-center justify-center gap-0.5 rounded-xl border border-dashed border-border bg-background text-xs text-muted-foreground"
            >
              <Plus className="size-5" />
              <span>이미지 추가</span>
            </button>
          </div>
          {analyzing && <p className="text-xs text-muted-foreground">이미지 분석 중…</p>}

          {/*
            "사진"은 이미지만 여러 장 요청해서 갤러리(사진 선택 도구)가 열리게 하고,
            "파일"은 종류를 제한하지 않아 파일 관리자가 열리게 한다. 둘을 나눠두면
            작업 선택 창에 파일 앱이 두 개씩 겹쳐 나오는 상황을 피할 수 있다.
          */}
          <input
            id="gifticon-image"
            ref={photoInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileChange}
            hidden
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileChange}
            hidden
          />
          <input ref={fileInputRef} type="file" multiple onChange={handleFileChange} hidden />

          {pickerOpen && <ImageSourcePicker onPick={handlePick} onClose={() => setPickerOpen(false)} />}

          {autoFilled && <p className="text-xs text-success">자동으로 정보를 채웠어요. 확인 후 저장해주세요.</p>}
          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label htmlFor="f-name">상품명 *</Label>
              <Input
                id="f-name"
                value={form.name}
                onChange={(e) => updateField('name', e.target.value)}
                placeholder="예: 황올반+BBQ양념반+콜라1.25L"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="f-brand">상호</Label>
              <Input id="f-brand" value={form.brand} onChange={(e) => updateField('brand', e.target.value)} placeholder="예: BBQ" />
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
                  type="number"
                  inputMode="numeric"
                  value={form.amount}
                  onChange={(e) => {
                    updateField('amount', e.target.value);
                    setPriceSearchNote('');
                  }}
                  placeholder={amountMissing ? '이미지에 금액 정보가 없습니다' : '예: 5000'}
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
                  {members.map((m) => (
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
      </SheetContent>
    </Sheet>
  );
}
