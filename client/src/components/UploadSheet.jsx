import { useEffect, useRef, useState } from 'react';
import { CATEGORIES, OWNERS } from '../constants';
import { analyzeImages } from '../utils/imageAnalyze';
import { createGifticon, updateGifticon } from '../api';

const emptyForm = {
  name: '',
  category: '기타',
  brand: '',
  amount: '',
  owner: OWNERS[0],
  code: '',
  code_type: '',
  expires_at: '',
  memo: '',
};

export default function UploadSheet({ mode, initial, onClose, onSaved }) {
  const [form, setForm] = useState(() =>
    initial
      ? {
          ...emptyForm,
          ...initial,
          amount: initial.amount ?? '',
          brand: initial.brand ?? '',
          owner: initial.owner ?? emptyForm.owner,
          code: initial.code ?? '',
          code_type: initial.code_type ?? '',
          expires_at: initial.expires_at ?? '',
          memo: initial.memo ?? '',
        }
      : emptyForm
  );

  const [existingImages, setExistingImages] = useState(
    () => (initial?.image_paths || []).map((path, i) => ({ path, url: initial.image_urls[i] }))
  );
  const [removedPaths, setRemovedPaths] = useState([]);
  const [newFiles, setNewFiles] = useState([]);
  const [newPreviews, setNewPreviews] = useState([]);

  const [analyzing, setAnalyzing] = useState(false);
  const [autoFilled, setAutoFilled] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
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
    const selected = Array.from(e.target.files || []);
    e.target.value = '';
    if (selected.length === 0) return;

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
      setAutoFilled(true);
    } catch {
      setError('이미지 자동 인식에 실패했어요. 직접 입력해주세요.');
    } finally {
      setAnalyzing(false);
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

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('이름을 입력해주세요.');
      return;
    }
    if (mode === 'create' && newFiles.length === 0) {
      setError('기프티콘 이미지를 1장 이상 업로드해주세요.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
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
        const created = await createGifticon(fields, newFiles);
        onSaved(created);
      } else {
        const updated = await updateGifticon(initial.id, fields, { addFiles: newFiles, removePaths: removedPaths });
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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-sheet__header">
          <h2>{mode === 'create' ? '기프티콘 추가' : '기프티콘 수정'}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>

        <form className="upload-form" onSubmit={handleSubmit}>
          <p className="hint">
            기프티콘 이미지를 여러 장 올릴 수 있어요 (예: 상품명 보이는 화면 + 금액·기한 보이는 화면). 각 이미지에서
            찾은 정보를 자동으로 합쳐서 채워드려요.
          </p>

          <div className="image-grid">
            {thumbs.map((thumb) => (
              <div className="image-grid__item" key={thumb.kind === 'existing' ? thumb.path : `new-${thumb.index}`}>
                <img src={thumb.url} alt="기프티콘 이미지" />
                <button
                  type="button"
                  className="image-grid__remove"
                  onClick={() => (thumb.kind === 'existing' ? removeExisting(thumb.path) : removeNewFile(thumb.index))}
                  aria-label="이미지 삭제"
                >
                  ✕
                </button>
              </div>
            ))}
            <button type="button" className="image-grid__add" onClick={() => fileInputRef.current?.click()}>
              <span>＋</span>
              <span>이미지 추가</span>
            </button>
          </div>
          {analyzing && <p className="hint">이미지 분석 중…</p>}

          <input
            id="gifticon-image"
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileChange}
            hidden
          />

          {autoFilled && <p className="hint hint--success">자동으로 정보를 채웠어요. 확인 후 저장해주세요.</p>}
          {error && <p className="hint hint--error">{error}</p>}

          <div className="form-grid">
            <label className="field">
              <span>이름 *</span>
              <input value={form.name} onChange={(e) => updateField('name', e.target.value)} placeholder="예: 스타벅스 아메리카노" required />
            </label>

            <label className="field">
              <span>카테고리</span>
              <select value={form.category} onChange={(e) => updateField('category', e.target.value)}>
                {CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>받은 사람</span>
              <select value={form.owner} onChange={(e) => updateField('owner', e.target.value)}>
                {OWNERS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>금액(원)</span>
              <input
                type="number"
                inputMode="numeric"
                value={form.amount}
                onChange={(e) => updateField('amount', e.target.value)}
                placeholder="예: 5000"
              />
            </label>

            <label className="field">
              <span>유효기한</span>
              <input type="date" value={form.expires_at} onChange={(e) => updateField('expires_at', e.target.value)} />
            </label>

            <label className="field">
              <span>바코드/QR 값</span>
              <input value={form.code} onChange={(e) => updateField('code', e.target.value)} placeholder="자동 인식 또는 직접 입력" />
            </label>

            <label className="field field--full">
              <span>메모</span>
              <textarea value={form.memo} onChange={(e) => updateField('memo', e.target.value)} rows={2} />
            </label>
          </div>

          <button type="submit" className="btn btn--primary btn--block" disabled={submitting || analyzing}>
            {submitting ? '저장 중…' : '저장하기'}
          </button>
        </form>
      </div>
    </div>
  );
}
