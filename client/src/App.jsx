import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import Header from './components/Header';
import FilterBar from './components/FilterBar';
import GifticonList from './components/GifticonList';
import UploadSheet from './components/UploadSheet';
import BarcodeModal from './components/BarcodeModal';
import ExtendSheet from './components/ExtendSheet';
import SpendSheet from './components/SpendSheet';
import ImageViewerModal from './components/ImageViewerModal';
import NearbyStoresSheet from './components/NearbyStoresSheet';
import InstallPrompt from './components/InstallPrompt';
import NoticeBanner from './components/NoticeBanner';
import NearbyBanner from './components/NearbyBanner';
import AlertDialog from './components/AlertDialog';
import PullToRefresh from './components/PullToRefresh';
import { listGifticons, updateGifticon, deleteGifticon, claimGifticon, releaseGifticon, spendVoucher } from './api';
import { subscribeToGifticons, subscribeToFamily } from './realtime';
import { ensureSampleGifticon } from './sampleData';
import { daysUntil, todayStr } from './utils/date';
import { hasNewVersion } from './utils/version';
import { hasSharedImages, takeSharedImages, discardSharedImages } from './utils/shareTarget';
import { useFamily } from './FamilyContext';

// 목록은 "지금 쓸 수 있는 것 → 기한이 지난 것 → 다 쓴 것" 세 덩어리다.
// 급한 순으로만 세우면 기한이 지난 것이 D-1보다 더 급한 값(음수)이라 맨 위를 차지한다.
// 못 쓰는 것이 제일 먼저 눈에 들어오는 목록은 계산대 앞에서 방해만 된다.
// 지난 것도 아주 내리지는 않는다 — 90% 환불이 남아 있어서 다 쓴 것보다는 할 일이 있다.
function sortGifticons(items) {
  const today = todayStr();
  const isExpired = (g) => Boolean(g.expires_at) && g.expires_at < today;

  const live = items.filter((g) => g.status !== 'used' && !isExpired(g));
  const expired = items.filter((g) => g.status !== 'used' && isExpired(g));
  const used = items.filter((g) => g.status === 'used');

  live.sort((a, b) => {
    const da = daysUntil(a.expires_at);
    const db = daysUntil(b.expires_at);
    if (da === null && db === null) return b.id - a.id;
    if (da === null) return 1;
    if (db === null) return -1;
    return da - db;
  });

  // 최근에 지난 것부터. 오래된 것일수록 손쓸 일이 적어서 아래로 내려간다.
  expired.sort((a, b) => (b.expires_at || '').localeCompare(a.expires_at || ''));

  used.sort((a, b) => {
    const ua = a.used_at || a.updated_at || '';
    const ub = b.used_at || b.updated_at || '';
    return ub.localeCompare(ua);
  });

  return [...live, ...expired, ...used];
}

export default function App() {
  const { family, members, user, dataVersion, refreshFamily } = useFamily();
  const myName = members.find((m) => m.user_id === user.id)?.display_name || null;
  const [gifticons, setGifticons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  // 중요 공지가 목록 위 띠를 쓰고 있는지. 주변 매장 안내가 이걸 보고 자리를 비켜준다.
  const [noticeShown, setNoticeShown] = useState(false);
  // 목록을 다시 읽을 때마다 오르는 수. 공지 띠가 이걸 보고 같이 다시 읽는다.
  const [refreshTick, setRefreshTick] = useState(0);
  const [category, setCategory] = useState('');
  const [statusTab, setStatusTab] = useState('all');

  const [sheetState, setSheetState] = useState(null); // { mode, initial }
  const [codeTarget, setCodeTarget] = useState(null);
  const [imageTarget, setImageTarget] = useState(null);
  const [storesTarget, setStoresTarget] = useState(null);
  const [extendTarget, setExtendTarget] = useState(null);
  const [spendTarget, setSpendTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [notice, setNotice] = useState(null);

  // silent: 당겨서 새로고침처럼 이미 다른 표시가 돌고 있을 때는 목록을 "불러오는 중…"으로
  // 갈아끼우지 않는다. 화면이 통째로 사라졌다 나타나면 오히려 새로고침이 아니라 오류처럼 보인다.
  const fetchList = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      // 분류는 서버에서 거르지 않고 다 받아온다. 분류별 개수를 뱃지로 보여주려면 어차피
      // 전체가 필요하고, 받아둔 것을 화면에서 거르면 분류를 바꿀 때 서버에 다시 묻지 않아
      // 즉시 바뀐다.
      const params = { familyId: family.id, search };
      if (statusTab !== 'all') params.status = statusTab;
      const data = await listGifticons(params);
      setGifticons(sortGifticons(data));
    } catch (err) {
      setError(err.message || '목록을 불러오지 못했어요.');
    } finally {
      setLoading(false);
    }
    // dataVersion은 이름 바꾸기처럼 목록에 적힌 이름까지 서버에서 바뀐 뒤 다시 읽어오게 하는 신호다.
    // 함수 안에서 쓰이지는 않지만, 값이 바뀌면 목록을 다시 불러와야 해서 의존성에 넣어둔다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [family.id, search, statusTab, dataVersion]);

  // 뱃지에 적을 숫자. "이걸 누르면 몇 개가 보이나"라서, 지금 걸어둔 사용여부·검색은
  // 그대로 반영되고 분류만 빼고 센다.
  const categoryCounts = useMemo(() => {
    const counts = {};
    for (const item of gifticons) counts[item.category] = (counts[item.category] ?? 0) + 1;
    return counts;
  }, [gifticons]);

  const visibleGifticons = useMemo(
    () => (category ? gifticons.filter((item) => item.category === category) : gifticons),
    [gifticons, category]
  );

  useEffect(() => {
    const timer = setTimeout(() => fetchList(), search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [fetchList, search]);

  // 검색어를 한 글자 칠 때마다 fetchList가 새로 만들어지는데, 그때마다 구독을 끊었다 다시
  // 맺으면 낭비라서 최신 함수만 여기에 담아두고 구독은 가족이 바뀔 때만 다시 맺는다.
  const refreshRef = useRef(null);
  refreshRef.current = () => {
    // 기프티콘만 다시 읽으면 공지는 옛것 그대로다. 사용자가 "최신으로 맞춰줘"라고 한
    // 순간이니 위쪽 띠도 함께 맞춘다.
    setRefreshTick((n) => n + 1);
    return Promise.all([fetchList({ silent: true }), refreshFamily()]);
  };

  // 당겨서 새로고침은 사용자에게 "최신으로 맞춰줘"라는 뜻이다. 그런데 데이터만 다시 읽으면
  // 그사이 배포된 새 화면은 옛것 그대로라, 당겼는데도 안 바뀌었다고 느끼게 된다.
  // 설치해서 쓰면 주소창이 없어 페이지를 새로 열 방법도 마땅치 않다. 그래서 당길 때
  // 새 버전이 올라와 있는지 함께 보고, 있으면 데이터 대신 페이지를 새로 연다.
  //
  // 이 확인은 당겼을 때만 한다. 실시간 반영이나 앱 복귀 때도 하면 기프티콘을 쓰는 도중에
  // 화면이 통째로 다시 열릴 수 있는데, 당기는 건 사용자가 목록에서 직접 한 동작이라 안전하다.
  async function handlePullRefresh() {
    if (await hasNewVersion()) {
      window.location.reload();
      return;
    }
    await refreshRef.current();
  }

  // 가족이 기프티콘을 올리거나 고치면 새로고침 없이 바로 목록에 나타나게 한다.
  useEffect(() => {
    let timer = null;
    // 한 번 저장할 때 이미지 여러 장과 함께 여러 신호가 잇달아 오기도 해서, 잠깐 모았다가
    // 한 번만 다시 불러온다.
    function reload() {
      clearTimeout(timer);
      timer = setTimeout(() => refreshRef.current(), 300);
    }
    const unsubscribeGifticons = subscribeToGifticons(family.id, reload);
    const unsubscribeFamily = subscribeToFamily(family.id, reload);
    return () => {
      clearTimeout(timer);
      unsubscribeGifticons();
      unsubscribeFamily();
    };
  }, [family.id]);

  // ⚠️ 테스트 빌드에서만: 이 가족에 샘플 기프티콘이 없으면 하나 넣어준다.
  // 전체 초기화를 하면 가족과 계정까지 지워져서 기프티콘이 남을 수 없기 때문에,
  // 화면을 열 때마다 확인해서 채워 넣는다. 누가 언제 들어와도 같은 샘플을 보게 된다.
  useEffect(() => {
    let cancelled = false;
    ensureSampleGifticon({ familyId: family.id, ownerName: myName, userId: user.id }).then((added) => {
      if (added && !cancelled) refreshRef.current();
    });
    return () => {
      cancelled = true;
    };
  }, [family.id, myName, user.id]);

  // 카카오톡이나 갤러리에서 "공유 → 모아콘"으로 넘어왔으면, 사용자는 이미 등록할 사진을
  // 고른 것이다. 목록을 보여주고 다시 + 를 누르게 하지 않고 등록 창을 바로 열어준다.
  useEffect(() => {
    if (!hasSharedImages()) {
      // 표시가 없는데 사진이 남아 있다면 지난번 공유가 등록까지 이어지지 않은 것이다
      // (로그인 화면을 거치면서 주소의 표시가 떨어져 나가는 경우 등). 그냥 치운다.
      discardSharedImages();
      return;
    }

    let cancelled = false;
    takeSharedImages().then((files) => {
      if (!cancelled && files.length > 0) setSheetState({ mode: 'create', initial: null, files });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // 폰이 잠들거나 다른 앱에 다녀오는 동안에는 연결이 끊겨서 그사이 바뀐 것을 놓친다.
  // 앱이 다시 화면에 나오면 한 번 맞춰본다.
  useEffect(() => {
    function onVisible() {
      if (!document.hidden) refreshRef.current();
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

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
      setNotice({ tone: 'warning', title: '상태를 바꾸지 못했어요', description: err.message });
    }
  }

  // 찜은 "이건 내가 쓸게"를 가족에게 알려두는 표시다. 한 사람만 찜할 수 있어서, 그사이
  // 다른 사람이 먼저 찜했으면 그 사실을 알려주고 목록을 새로 읽는다.
  async function handleToggleClaim(gifticon) {
    try {
      if (gifticon.claimed_by === user.id) {
        await releaseGifticon(gifticon.id);
      } else {
        const result = await claimGifticon(gifticon.id);
        if (!result?.ok) {
          // 찜은 잠금이 아니라 표시다. "못 쓴다"가 아니라 "겹칠 수 있다"로 읽히게 적는다.
          setNotice({
            tone: 'info',
            title: `${result?.claimed_by_name || '다른 구성원'}님이 찜했어요`,
            description: '겹치지 않게 한 번 물어보시는 게 좋아요.\n그래도 쓰실 수 있어요.',
          });
        }
      }
      fetchList({ silent: true });
    } catch (err) {
      setNotice({ tone: 'warning', title: '찜하지 못했어요', description: err.message });
    }
  }

  // 연장은 발행사에서만 할 수 있어서 우리가 대신 해줄 수 없다. 여기서는 사용자가
  // 연장하고 와서 알려준 날짜를 앱에 맞춰줄 뿐이다.
  async function handleExtend(gifticon, nextDate) {
    try {
      await updateGifticon(family.id, gifticon.id, {
        expires_at: nextDate,
        // 이미 "곧 만료" 알림을 보낸 기프티콘이라 표시가 켜져 있다. 되돌리지 않으면
        // 새 기한이 다가와도 알림이 다시 가지 않는다.
        expiry_notified: false,
      });
      fetchList();
    } catch (err) {
      setNotice({ tone: 'warning', title: '기한을 바꾸지 못했어요', description: err.message });
    }
  }

  // 금액권을 쓴 만큼 깎는다. 잔액이 0이 되면 서버 쪽에서 사용완료로 넘긴다.
  async function handleSpend(gifticon, spent) {
    try {
      await spendVoucher(family.id, gifticon.id, { spent, user: user.id, userName: myName });
      fetchList();
    } catch (err) {
      setNotice({ tone: 'warning', title: '사용 금액을 기록하지 못했어요', description: err.message });
    }
  }

  async function handleConfirmDelete() {
    const target = deleteTarget;
    setDeleteTarget(null);
    try {
      await deleteGifticon(target.id);
      fetchList();
    } catch (err) {
      setNotice({ tone: 'warning', title: '삭제하지 못했어요', description: err.message });
    }
  }

  function handleSaved() {
    setSheetState(null);
    fetchList();
  }

  return (
    <div className="relative mx-auto flex min-h-dvh w-full max-w-[480px] flex-col overflow-x-hidden bg-background pb-22">
      {/* 당겨서 새로고침은 기프티콘뿐 아니라 가족 구성원까지 같이 다시 읽어오고,
          새 버전이 배포됐으면 화면 자체를 새로 연다. */}
      <PullToRefresh onRefresh={handlePullRefresh} />

      <Header />

      <InstallPrompt />

      {/* 목록 위 띠는 한 자리뿐이다. 둘이 같이 뜨면 목록이 두 줄만큼 밀려서 정작 봐야 할
          기프티콘이 화면 밖으로 나간다. 그래서 서로 자리를 주고받게 했다.

          평소 그 자리는 주변 매장 안내가 쓴다 — 지금 당장 쓸 수 있는 것을 알려주는
          쪽이라 자주 쓸모가 있다. 급한 공지(중요 표시)가 게시된 동안에만 공지가 자리를
          가져가고, 공지가 끝나거나 사용자가 그 공지를 닫으면 다시 매장 안내로 돌아온다. */}
      <NoticeBanner refreshKey={refreshTick} onShownChange={setNoticeShown} />

      <NearbyBanner gifticons={gifticons} onPick={setSearch} yielded={noticeShown} />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        category={category}
        onCategoryChange={setCategory}
        categoryCounts={categoryCounts}
        totalCount={gifticons.length}
        statusTab={statusTab}
        onStatusTabChange={setStatusTab}
      />

      <main className="flex-1 px-5 pt-3 pb-5">
        {loading && <p className="py-10 text-center text-muted-foreground">불러오는 중…</p>}
        {!loading && error && <p className="py-10 text-center text-destructive">{error}</p>}
        {!loading && !error && (
          <GifticonList
            gifticons={visibleGifticons}
            onViewCode={setCodeTarget}
            onViewImage={setImageTarget}
            onToggleUsed={handleToggleUsed}
            onEdit={(g) => setSheetState({ mode: 'edit', initial: g })}
            onDelete={setDeleteTarget}
            onFindStores={setStoresTarget}
            onToggleClaim={handleToggleClaim}
            onExtend={setExtendTarget}
            onSpend={setSpendTarget}
          />
        )}
      </main>

      {/* + 는 등록 창만 연다. 한때 여기서 사진 선택창을 곧바로 열어 한 단계를 줄였는데,
          사진 없이 손으로 적어 넣고 싶은 사람에게는 길이 막힌 것처럼 보인다. */}
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
          initialFiles={sheetState.files}
          onClose={() => setSheetState(null)}
          onSaved={handleSaved}
        />
      )}

      {codeTarget && (
        <BarcodeModal
          gifticon={codeTarget}
          onClose={() => setCodeTarget(null)}
          // 사용완료를 누르면 창을 닫는다. 다 쓴 바코드를 계속 띄워둘 이유가 없고,
          // 닫히는 것 자체가 "처리됐다"는 신호가 된다.
          onUsed={() => {
            handleToggleUsed(codeTarget);
            setCodeTarget(null);
          }}
          // 금액권은 완료로 넘기지 않고 얼마 썼는지 묻는다. 바코드 창을 닫고 그 창을 여는
          // 이유는 둘 다 아래에서 올라오는 창이라, 겹쳐 띄우면 뒤엣것이 앞엣것에 가린다.
          onSpend={() => {
            setSpendTarget(codeTarget);
            setCodeTarget(null);
          }}
        />
      )}
      {imageTarget && <ImageViewerModal gifticon={imageTarget} onClose={() => setImageTarget(null)} />}
      {storesTarget && <NearbyStoresSheet gifticon={storesTarget} onClose={() => setStoresTarget(null)} />}

      {extendTarget && (
        <ExtendSheet gifticon={extendTarget} onExtend={handleExtend} onClose={() => setExtendTarget(null)} />
      )}

      {spendTarget && <SpendSheet gifticon={spendTarget} onSpend={handleSpend} onClose={() => setSpendTarget(null)} />}

      {deleteTarget && (
        <AlertDialog
          tone="danger"
          title="이 기프티콘을 삭제할까요?"
          description={`'${deleteTarget.name}'이(가) 목록에서 사라져요. 되돌릴 수 없어요.`}
          confirmLabel="삭제"
          onConfirm={handleConfirmDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}

      {notice && <AlertDialog {...notice} onClose={() => setNotice(null)} />}
    </div>
  );
}
