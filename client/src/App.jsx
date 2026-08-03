import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import Header from './components/Header';
import FilterBar from './components/FilterBar';
import GifticonList from './components/GifticonList';
import UploadSheet from './components/UploadSheet';
import BarcodeModal from './components/BarcodeModal';
import ImageViewerModal from './components/ImageViewerModal';
import InstallPrompt from './components/InstallPrompt';
import { listGifticons, updateGifticon, deleteGifticon } from './api';
import { daysUntil, todayStr } from './utils/date';
import { useFamily } from './FamilyContext';

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
  const { family, members, user } = useFamily();
  const myName = members.find((m) => m.user_id === user.id)?.display_name || null;
  const [gifticons, setGifticons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [statusTab, setStatusTab] = useState('all');

  const [sheetState, setSheetState] = useState(null); // { mode, initial }
  const [codeTarget, setCodeTarget] = useState(null);
  const [imageTarget, setImageTarget] = useState(null);

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
    const used = nextStatus === 'used';
    try {
      // 누가 썼는지 남긴다. 이름은 나중에 그 사람이 가족에서 나가도 사용 내역에 보여야 해서
      // 아이디와 별개로 그때의 이름을 그대로 적어둔다.
      await updateGifticon(family.id, gifticon.id, {
        status: nextStatus,
        used_at: used ? todayStr() : null,
        used_by: used ? user.id : null,
        used_by_name: used ? myName : null,
      });
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
    <div className="relative mx-auto flex min-h-dvh w-full max-w-[480px] flex-col overflow-x-hidden bg-background pb-22">
      <Header />

      <InstallPrompt />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        category={category}
        onCategoryChange={setCategory}
        statusTab={statusTab}
        onStatusTabChange={setStatusTab}
      />

      <main className="flex-1 px-5 pb-5">
        {loading && <p className="py-10 text-center text-muted-foreground">불러오는 중…</p>}
        {!loading && error && <p className="py-10 text-center text-destructive">{error}</p>}
        {!loading && !error && (
          <GifticonList
            gifticons={gifticons}
            onViewCode={setCodeTarget}
            onViewImage={setImageTarget}
            onToggleUsed={handleToggleUsed}
            onEdit={(g) => setSheetState({ mode: 'edit', initial: g })}
            onDelete={handleDelete}
          />
        )}
      </main>

      <button
        type="button"
        onClick={() => setSheetState({ mode: 'create', initial: null })}
        aria-label="기프티콘 추가"
        style={{ right: 'max(20px, calc((100vw - 480px) / 2 + 20px))' }}
        className="fixed bottom-[max(24px,env(safe-area-inset-bottom))] z-20 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/40"
      >
        <Plus className="size-7" />
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
      {imageTarget && <ImageViewerModal gifticon={imageTarget} onClose={() => setImageTarget(null)} />}
    </div>
  );
}
