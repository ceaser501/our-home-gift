import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, ScanSearch, Trash2 } from 'lucide-react';
import Header from './components/Header';
import FilterBar from './components/FilterBar';
import GifticonList from './components/GifticonList';
import UploadSheet from './components/UploadSheet';
import { openAfterClose } from './utils/sheetSwap';
import BarcodeModal from './components/BarcodeModal';
import ExtendSheet from './components/ExtendSheet';
import SpendSheet from './components/SpendSheet';
import ImageViewerModal from './components/ImageViewerModal';
import NearbyStoresSheet from './components/NearbyStoresSheet';
import InstallPrompt from './components/InstallPrompt';
import GalleryScanSheet from './components/GalleryScanSheet';
import WelcomeBanner from './components/WelcomeBanner';
import FirstRunScreen from './components/FirstRunScreen';
import NoticesSheet from './components/NoticesSheet';
import NearbyBanner from './components/NearbyBanner';
import AlertDialog from './components/AlertDialog';
import PullToRefresh from './components/PullToRefresh';
import { listGifticons, updateGifticon, deleteGifticon, claimGifticon, releaseGifticon, spendVoucher, listNotices } from './api';
import { blockingNotice, importantNotices, remainingLabel } from './utils/notices';
import { subscribeToGifticons, subscribeToFamily, subscribeToNotices } from './realtime';
import { ensureSampleGifticon } from './sampleData';
import { daysUntil, todayStr } from './utils/date';
import { hasNewVersion } from './utils/version';
import { hasSharedImages, takeSharedImages, discardSharedImages } from './utils/shareTarget';
import { isGalleryScanSupported, autoScanDue, markAutoScanRan } from './utils/gallery';
import { useFamily } from './FamilyContext';
import { cn } from '@/lib/utils';

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
  // 환영 인사가 목록 위 띠를 쓰고 있는지. 주변 매장 안내가 이걸 보고 자리를 비켜준다.
  const [welcomeShown, setWelcomeShown] = useState(false);
  // 목록을 다시 읽을 때마다 오르는 수.
  const [refreshTick, setRefreshTick] = useState(0);
  // 점검 공지. 게시된 동안에는 등록을 막고, 등록을 누르면 이걸 그 자리에서 보여준다.
  const [noticeRows, setNoticeRows] = useState([]);
  const [blockedBy, setBlockedBy] = useState(null);
  const [category, setCategory] = useState('');
  const [statusTab, setStatusTab] = useState('all');

  const [sheetState, setSheetState] = useState(null); // { mode, initial }
  // 등록 창에서 넘어온, 여러 건으로 묶일 사진들.
  const [bulkFiles, setBulkFiles] = useState(null);
  // 갤러리 훑기는 앱으로 설치했을 때만 있다. 브라우저에는 폴더를 볼 방법이 없다.
  const [scanSupported] = useState(() => isGalleryScanSupported());
  // 켜뒀으면 앱을 열 때 바로 훑는다. 받아둔 기프티콘을 넣는 게 이 앱에 들어오는 이유라,
  // 매번 버튼을 찾아 누르게 할 이유가 없다. 끄면 버튼으로만 연다.
  //
  // '앱을 열 때'는 한 번뿐이다(autoScanDue). 약관을 보고 뒤로가기로 돌아오면 이 화면이
  // 처음부터 다시 열리는데, 그때마다 훑기 창이 다시 떠서 사진 수백 장을 또 읽었다.
  // 그래도 훑고 싶으면 메인의 훑기 버튼이 있다.
  const [scanOpen, setScanOpen] = useState(() => autoScanDue());
  // 방금 저장한 바코드. 훑기 창이 이걸 보고 그 후보를 목록에서 뺀다. 안 그러면 등록을
  // 마치고 돌아왔을 때 방금 넣은 것이 그대로 남아 있어서 또 넣게 된다.
  const [codeTarget, setCodeTarget] = useState(null);
  const [imageTarget, setImageTarget] = useState(null);
  const [storesTarget, setStoresTarget] = useState(null);
  const [extendTarget, setExtendTarget] = useState(null);
  const [spendTarget, setSpendTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [notice, setNotice] = useState(null);
  // 처음 온 사람에게 보여주는 공지 한 줄이 이 창을 연다. 평소에는 종 안에만 있는데,
  // 빈 화면에는 종을 눌러볼 이유가 아직 없다.
  const [noticesOpen, setNoticesOpen] = useState(false);

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

  // 아직 한 장도 없는 사람인가. 검색어나 필터가 걸려 있으면 "거른 결과가 비었다"는
  // 다른 이야기라, 그때는 평소 화면 그대로 둔다.
  //
  // 이 값이 켜지면 화면에서 셋이 사라진다 — 필터 줄(거를 것이 없다), 환영 띠(빈 화면
  // 본문이 그 말을 대신한다), 오른쪽 아래 버튼 둘(가운데 버튼과 같은 일을 한다).
  const isFirstRun = !loading && !error && gifticons.length === 0 && !search && !category && statusTab === 'all';
  // 처음 온 사람에게 한 줄로 남길 공지.
  const firstNotice = importantNotices(noticeRows)[0] || null;

  useEffect(() => {
    const timer = setTimeout(() => fetchList(), search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [fetchList, search]);

  // 자동 훑기는 이번 실행에서 한 번 물어봤다고 적어둔다. 훑기 창을 열었든 안 열었든
  // 적는다 — 물어본 것 자체가 한 번이고, 껐던 사람이 다시 켜면 그건 버튼으로 연다.
  useEffect(() => {
    markAutoScanRan();
  }, []);

  // 점검 공지를 읽어둔다. 등록을 누르는 순간에 서버에 물으면 그만큼 기다려야 하는데,
  // 그 자리는 사진을 올리려고 누른 자리라 한 박자도 늦으면 안 눌린 것처럼 느껴진다.
  //
  // refreshTick은 목록을 다시 읽는 순간(당겨서 새로고침, 다른 앱 다녀오기)마다 바뀐다.
  // 점검이 시작되거나 끝난 것을 그때 따라잡는다.
  // 언제 읽은 값인지. guardUpload가 이걸 보고 다시 물을지 정한다.
  const noticesAtRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    listNotices().then((rows) => {
      if (cancelled) return;
      setNoticeRows(rows);
      noticesAtRef.current = Date.now();
    });
    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  // 공지가 올라오거나 내려가면 곧바로 받아온다.
  //
  // 이게 없으면 앱을 켜둔 사람은 점검이 시작된 줄 모르고 계속 등록한다. 실제로 그랬다 —
  // 공지를 띄운 뒤에도 등록이 됐고, 목록을 당겨 새로고침해야 그제서야 막혔다. 작업이
  // 갑자기 잡힐 때 그 틈으로 자료가 들어온다.
  useEffect(() => {
    return subscribeToNotices(() => setRefreshTick((n) => n + 1));
  }, []);

  // 점검 중이면 등록 창을 열지 않고 그 공지를 그 자리에서 보여준다.
  //
  // "점검 중"이라고 해놓고 누를 수 있으면 눌러보고 실패한다. 두 번 실망시키는 셈이다.
  // 반대로 앱을 열자마자 알리지는 않는다 — 바코드를 띄우러 온 사람은 공지가 있는 줄도
  // 모르고 잘 쓰고 나가는데, 그게 가장 좋은 결과다. 바코드는 저장된 것이라 점검 중에도
  // 그대로 된다.
  //
  // 손에 든 답을 못 믿을 때는 다시 물어본다. 두 경우다.
  //
  //   막힌다고 알고 있을 때 — 점검이 그새 끝났을 수 있다. 옛 답으로 막으면 사용자는 앱을
  //   껐다 켜거나 목록을 당겨야 올릴 수 있게 되고, 왜 막히는지 알 방법도 없다.
  //
  //   읽은 지 오래됐을 때 — 이쪽이 더 위험하다. 반대 방향으로 틀리는 것이라, 점검이 막
  //   시작됐는데 열어주게 된다. 위 실시간 구독이 이걸 막아주지만 웹소켓은 조용히 끊길 수
  //   있어서, 그때를 위한 두 번째 자물쇠를 둔다.
  //
  // 평소에는 실시간 구독이 값을 계속 새것으로 유지하므로 여기서 기다릴 일이 없다.
  const NOTICE_STALE_MS = 60 * 1000;

  async function guardUpload(open) {
    const stale = Date.now() - noticesAtRef.current > NOTICE_STALE_MS;

    if (!stale && !blockingNotice(noticeRows)) {
      open();
      return;
    }

    const fresh = await listNotices().catch(() => noticeRows);
    setNoticeRows(fresh);
    noticesAtRef.current = Date.now();

    const blocked = blockingNotice(fresh);
    if (blocked) {
      setBlockedBy(blocked);
      return;
    }
    open();
  }

  // 검색어를 한 글자 칠 때마다 fetchList가 새로 만들어지는데, 그때마다 구독을 끊었다 다시
  // 맺으면 낭비라서 최신 함수만 여기에 담아두고 구독은 가족이 바뀔 때만 다시 맺는다.
  const refreshRef = useRef(null);
  refreshRef.current = () => {
    // 기프티콘만 다시 읽으면 공지는 옛것 그대로다. 사용자가 "최신으로 맞춰줘"라고 한
    // 순간이니 공지도 함께 맞춘다 — 점검이 끝났는데 등록이 계속 막혀 있으면 안 된다.
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

  // 방금 등록을 마치고, 빼뒀던 사진으로 한 건 더 올리러 간다.
  //
  // 창을 닫자마자 열면 새 창이 스스로 닫힌다 — 닫는 쪽이 히스토리 표시를 걷어내느라
  // 부른 뒤로가기가 뒤늦게 돌아와서 새 창이 그걸 자기 것으로 받는다(openAfterClose).
  function openNext(files) {
    setSheetState(null);
    setBulkFiles(null);
    fetchList();
    openAfterClose(() => setSheetState({ mode: 'create', initial: null, files }));
  }

  return (
    <div className="relative mx-auto flex min-h-dvh w-full max-w-[480px] flex-col overflow-x-hidden bg-background pb-22">
      {/* 당겨서 새로고침은 기프티콘뿐 아니라 가족 구성원까지 같이 다시 읽어오고,
          새 버전이 배포됐으면 화면 자체를 새로 연다. */}
      <PullToRefresh onRefresh={handlePullRefresh} />

      <Header />

      <InstallPrompt />

      {/* 목록 위 띠는 한 자리뿐이다. 둘이 같이 뜨면 목록이 두 줄만큼 밀려서 정작 봐야 할
          기프티콘이 화면 밖으로 나간다.

          그 자리는 주변 매장 안내가 갖는다. 기프티콘을 못 쓰고 버리는 진짜 이유는 기한을
          몰라서가 아니라 매장 앞을 지나가면서도 가진 걸 떠올리지 못해서라, 이 앱에서 가장
          힘이 센 자리다. 공지는 여기서 뺐다 — 종 안으로 들어갔고, 등록을 막는 점검 공지는
          등록을 누르는 그 자리에서 뜬다.

          환영 인사만 예외로 이 자리를 쓴다. 가입하고 처음 들어온 날 한 번뿐이고, 그날은
          기프티콘이 없어서 매장 안내가 어차피 띄울 것이 없다. */}
      {!isFirstRun && <WelcomeBanner onShownChange={setWelcomeShown} />}

      <NearbyBanner gifticons={gifticons} onPick={setSearch} yielded={welcomeShown} />

      {!isFirstRun && (
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
      )}

      <main className={cn('flex flex-1 flex-col px-4 pb-5', isFirstRun ? 'pt-2' : 'pt-3')}>
        {loading && <p className="py-10 text-center text-muted-foreground">불러오는 중…</p>}
        {!loading && error && <p className="py-10 text-center text-destructive">{error}</p>}
        {isFirstRun && (
          <FirstRunScreen
            notice={firstNotice}
            onOpenNotices={() => setNoticesOpen(true)}
            onUpload={() => guardUpload(() => setSheetState({ mode: 'create', initial: null }))}
            onScan={() => guardUpload(() => setScanOpen(true))}
            scanSupported={scanSupported}
          />
        )}
        {!loading && !error && !isFirstRun && (
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

      {/* 갤러리 훑기는 + 위에 한 단 작게 놓는다. 거들기 위한 기능이라 등록 버튼과
          같은 크기로 나란히 두면 어느 쪽이 본길인지 헷갈린다. 앱으로 설치했을 때만
          보이고, 없어도 아래 + 로 하던 대로 등록할 수 있다. */}
      {scanSupported && !isFirstRun && (
        <button
          type="button"
          onClick={() => guardUpload(() => setScanOpen(true))}
          aria-label="갤러리에서 기프티콘 찾기"
          style={{ right: 'max(24px, calc((100vw - 480px) / 2 + 24px))' }}
          className="fixed bottom-[calc(var(--safe-bottom)+64px)] z-20 flex size-11 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-md"
        >
          <ScanSearch className="size-5" />
        </button>
      )}

      {/* + 는 등록 창만 연다. 한때 여기서 사진 선택창을 곧바로 열어 한 단계를 줄였는데,
          사진 없이 손으로 적어 넣고 싶은 사람에게는 길이 막힌 것처럼 보인다. */}
      {!isFirstRun && (
      <button
        type="button"
        onClick={() => guardUpload(() => setSheetState({ mode: 'create', initial: null }))}
        aria-label="기프티콘 추가"
        style={{ right: 'max(20px, calc((100vw - 480px) / 2 + 20px))' }}
        className="fixed bottom-[var(--safe-bottom)] z-20 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/40"
      >
        <Plus className="size-7" />
      </button>
      )}

      {/* 훑기 창은 등록 창 아래에 그대로 열려 있는다. 여러 장을 찾았을 때 한 장 등록하고
          돌아오면 나머지가 남아 있어야, 매번 처음부터 다시 훑지 않는다. */}
      {/* 자동 훑기는 버튼을 거치지 않고 앱을 열자마자 뜬다. 점검 중에는 그 길도 막는다 —
          버튼만 막아두면 자동으로 켠 사람은 점검 중에도 훑기 창을 보게 된다. */}
      {scanOpen && !blockingNotice(noticeRows) && (
        <GalleryScanSheet onRegistered={fetchList} onClose={() => setScanOpen(false)} />
      )}

      {/* 등록 창에서 여러 건이 나왔을 때 넘어오는 자리. 사진첩 훑기와 같은 화면을 쓴다 —
          찾아온 길만 다르고 그 뒤로 하는 일이 같다. 아이폰에서는 훑기를 쓸 수 없어서
          여기가 여러 장을 한 번에 넣는 유일한 길이 된다. */}
      {bulkFiles && (
        <GalleryScanSheet
          files={bulkFiles}
          onRegistered={fetchList}
          onClose={() => setBulkFiles(null)}
          onNext={openNext}
        />
      )}

      {sheetState && (
        <UploadSheet
          mode={sheetState.mode}
          initial={sheetState.initial}
          initialFiles={sheetState.files}
          onClose={() => setSheetState(null)}
          onSaved={handleSaved}
          // 고른 사진이 여러 건이면 한 건짜리 이 창으로는 담을 수 없다. 묶어서 넣는
          // 화면으로 넘기고 이 창은 닫는다.
          onBulk={(files) => {
            setSheetState(null);
            // 곧바로 열면 새 창이 스스로 닫힌다. 닫는 쪽이 히스토리 표시를 걷어내느라
            // 부른 뒤로가기가 뒤늦게 돌아오는데, 새 창이 그걸 자기 것으로 받는다.
            openAfterClose(() => setBulkFiles(files));
          }}
          // 바코드가 없어 뺐던 사진을 "이것도 기프티콘인가요?"에 네라고 답했을 때.
          // 등록 창을 한 번 더 연다 — 그쪽은 서버가 사진에 인쇄된 숫자를 눈으로 읽어주는
          // 길이라, 막대 없이 번호만 찍힌 기프티콘이 이 길로 들어온다.
          onNext={openNext}
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
          //
          // 닫는 것과 여는 것을 같은 순간에 하면 안 된다. 새 창이 먼저 뜨고 바코드 창이
          // 나중에 정리되면서, 정리하는 쪽이 화면 전체의 클릭을 막아둔 상태를 남긴다.
          // 카드의 수정·삭제와 테스트 도구에서 같은 일이 있었다.
          onSpend={() => {
            const target = codeTarget;
            setCodeTarget(null);
            setTimeout(() => setSpendTarget(target), 0);
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
          icon={Trash2}
          title="이 기프티콘을 삭제할까요?"
          // 이름을 따옴표 문장에서 빼내 한 줄로 세운다. 이름이 길면 "'…'이(가) 목록에서
          // 사라져요"가 세 줄로 접혀서, 정작 무엇을 지우는지가 문장에 묻혔다.
          // "목록에서 사라져요"는 '삭제'라는 말이 이미 하고 있어서 뺐다.
          subject={deleteTarget.name}
          warning="되돌릴 수 없어요"
          confirmLabel="삭제"
          onConfirm={handleConfirmDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}

      {noticesOpen && <NoticesSheet onClose={() => setNoticesOpen(false)} />}

      {notice && <AlertDialog {...notice} onClose={() => setNotice(null)} />}

      {/* 점검 중에 등록을 눌렀을 때. 어느 기능이 막히는지는 따로 적지 않는다 —
          공지 본문에 쓴다. 지금 막힐 만한 것이 등록 하나뿐이라(모델을 부르는 자리가
          거기뿐이다) 굳이 나눌 이유가 없고, 바코드·목록·매장 찾기는 그대로 된다. */}
      {blockedBy && (
        <AlertDialog
          tone="warning"
          title={blockedBy.title}
          description={blockedBy.body || '지금은 기프티콘을 등록할 수 없어요.'}
          details={[
            ...(remainingLabel(blockedBy) ? [`${remainingLabel(blockedBy)} 이어져요`] : []),
            '바코드 보기와 목록·매장 찾기는 그대로 돼요',
          ]}
          onClose={() => setBlockedBy(null)}
        />
      )}
    </div>
  );
}
