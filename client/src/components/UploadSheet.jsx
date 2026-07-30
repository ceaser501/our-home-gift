import { useEffect, useRef, useState } from 'react';
import { CATEGORIES, OWNERS } from '../constants';
import { analyzeImage } from '../utils/imageAnalyze';
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
  const [form, setForm] = useState(() => (initial ? { ...emptyForm, ...initial, amount: initial.amount ?? '' } : emptyForm));
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(initial?.image_url || null);
  const [analyzing, setAnalyzing] = useState(false);
  const [autoFilled, setAutoFilled] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleFileChange(e) {
    const selected = e.target.files?.[0];
    if (!selected) return;

    setFile(selected);
    const url = URL.createObjectURL(selected);
    setPreviewUrl(url);
    setError('');
    setAnalyzing(true);
    setAutoFilled(false);

    try {
      const result = await analyzeImage(selected);
      setForm((prev) => ({
        ...prev,
        name: result.name || prev.name,
        category: result.category || prev.category,
        brand: result.brand || prev.brand,
        amount: result.amount ?? prev.amount,
        code: result.code || prev.code,
        code_type: result.codeType || prev.code_type,
        expires_at: result.expiresAt || prev.expires_at,
      }));
      setAutoFilled(true);
    } catch {
      setError('이미지 자동 인식에 실패했어요. 직접 입력해주세요.');
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('이름을 입력해주세요.');
      return;
    }
    if (mode === 'create' && !file) {
      setError('기프티콘 이미지를 업로드해주세요.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const fields = {
        name: form.name.trim(),
        category: form.category,
        brand: form.brand || '',
        amount: form.amount === '' ? '' : String(form.amount),
        owner: form.owner || '',
        code: form.code || '',
        code_type: form.code_type || '',
        expires_at: form.expires_at || '',
        memo: form.memo || '',
      };

      if (mode === 'create') {
        const formData = new FormData();
        Object.entries(fields).forEach(([key, value]) => formData.append(key, value));
        if (file) formData.append('image', file);
        const created = await createGifticon(formData);
        onSaved(created);
      } else {
        if (file) fields.image = file;
        const updated = await updateGifticon(initial.id, fields);
        onSaved(updated);
      }
    } catch (err) {
      setError(err.message || '저장에 실패했어요.');
    } finally {
      setSubmitting(false);
    }
  }

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
          <label className="image-picker" htmlFor="gifticon-image">
            {previewUrl ? (
              <img src={previewUrl} alt="미리보기" />
            ) : (
              <div className="image-picker__placeholder">
                <span>📷</span>
                <span>이미지 업로드</span>
              </div>
            )}
            {analyzing && <div className="image-picker__overlay">이미지 분석 중…</div>}
          </label>
          <input
            id="gifticon-image"
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            hidden
          />
          <button type="button" className="btn btn--block" onClick={() => fileInputRef.current?.click()}>
            {previewUrl ? '이미지 다시 선택' : '갤러리에서 이미지 선택'}
          </button>

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
