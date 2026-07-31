import { useCallback, useEffect, useState } from 'react';
import Header from './components/Header';
import FilterBar from './components/FilterBar';
import GifticonList from './components/GifticonList';
import UploadSheet from './components/UploadSheet';
import BarcodeModal from './components/BarcodeModal';
import { listGifticons, updateGifticon, deleteGifticon } from './api';
import { daysUntil, todayStr } from './utils/date';

function sortGifticons(items) {
  const unused = items.filter((g) => g.status !== 'used');
  const used = items.filter((g) => g.status === 'used');

  unused.sort((a, b) => {
    const da = daysUntil(a.expires_at);
    const db = daysUntil(b.expires_at);
    if (da === null && db === null) return b.id - a.id;
    if (da === null) return 1;
    if (db === null) return -1;
    return da - db;
  });

  used.sort((a, b) => {
    const ua = a.used_at || a.updated_at || '';
    const ub = b.used_at || b.updated_at || '';
    return ub.localeCompare(ua);
  });

  return [...unused, ...used];
}

export default function App() {
  const [gifticons, setGifticons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [statusTab, setStatusTab] = useState('all');

  const [sheetState, setSheetState] = useState(null); // { mode, initial }
  const [codeTarget, setCodeTarget] = useState(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { search, category };
      if (statusTab !== 'all') params.status = statusTab;
      const data = await listGifticons(params);
      setGifticons(sortGifticons(data));
    } catch (err) {
      setError(err.message || '목록을 불러오지 못했어요.');
    } finally {
      setLoading(false);
    }
  }, [search, category, statusTab]);

  useEffect(() => {
    const timer = setTimeout(fetchList, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [fetchList, search]);

  async function handleToggleUsed(gifticon) {
    const nextStatus = gifticon.status === 'used' ? 'unused' : 'used';
    try {
      await updateGifticon(gifticon.id, { status: nextStatus, used_at: nextStatus === 'used' ? todayStr() : null });
      fetchList();
    } catch (err) {
      alert(err.message || '상태 변경에 실패했어요.');
    }
  }

  async function handleDelete(gifticon) {
    if (!confirm(`'${gifticon.name}' 기프티콘을 삭제할까요?`)) return;
    try {
      await deleteGifticon(gifticon.id);
      fetchList();
    } catch (err) {
      alert(err.message || '삭제에 실패했어요.');
    }
  }

  function handleSaved() {
    setSheetState(null);
    fetchList();
  }

  return (
    <div className="app-shell">
      <Header />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        category={category}
        onCategoryChange={setCategory}
        statusTab={statusTab}
        onStatusTabChange={setStatusTab}
      />

      <main className="app-main">
        {loading && <p className="status-text">불러오는 중…</p>}
        {!loading && error && <p className="status-text status-text--error">{error}</p>}
        {!loading && !error && (
          <GifticonList
            gifticons={gifticons}
            onViewCode={setCodeTarget}
            onToggleUsed={handleToggleUsed}
            onEdit={(g) => setSheetState({ mode: 'edit', initial: g })}
            onDelete={handleDelete}
          />
        )}
      </main>

      <button
        type="button"
        className="fab"
        onClick={() => setSheetState({ mode: 'create', initial: null })}
        aria-label="기프티콘 추가"
      >
        +
      </button>

      {sheetState && (
        <UploadSheet
          mode={sheetState.mode}
          initial={sheetState.initial}
          onClose={() => setSheetState(null)}
          onSaved={handleSaved}
        />
      )}

      {codeTarget && <BarcodeModal gifticon={codeTarget} onClose={() => setCodeTarget(null)} />}
    </div>
  );
}
