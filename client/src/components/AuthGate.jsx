import { useCallback, useEffect, useRef, useState } from 'react';
import { getSession, onAuthStateChange, signOut } from '../auth';
import { getFamilyMembers, getMyFamilies, listPendingJoinRequests, touchFamily } from '../family';
import { hasAgreedToCurrent } from '../consent';
import { FamilyContext } from '../FamilyContext';
import LoginScreen from './LoginScreen';
import FamilyOnboarding from './FamilyOnboarding';
import FamilyLoadError from './FamilyLoadError';
import ConsentScreen from './ConsentScreen';
import WelcomeSetupScreen from './WelcomeSetupScreen';
import { needsWelcomeSetup, markWelcomeSetupDone } from '../utils/welcomeSetup';
import LoadingScreen from './LoadingScreen';
import DeleteAccountError from './DeleteAccountError';
import LoginErrorAlert from './LoginErrorAlert';

// 예전에는 여기서 로고와 한 줄 소개를 보여주는 인트로 화면을 최소 1.8초 띄웠다.
// 그런데 설치형 PWA는 앱을 켤 때 브라우저가 먼저 제 스플래시(아이콘 + 앱 이름)를
// 띄우기 때문에, 우리 인트로가 그 뒤에 또 나와 같은 인사를 두 번 하는 꼴이었다.
// 브라우저 것은 우리가 끌 수 없으므로 우리 것을 뺐다. 준비되는 동안에는 조용한
// 로딩 화면만 쓴다.

// 여러 가족에 속해 있을 수 있어서, 마지막으로 보던 가족을 기억해뒀다가 다음에도 그대로 연다.
//
// 계정마다 따로 적는다. 예전에는 한 칸을 같이 썼는데, 한 폰에서 계정을 갈아타면 뒤에
// 들어온 계정이 앞 계정의 기억을 덮어썼다. 그러고 다시 앞 계정으로 돌아오면 적혀 있는
// 가족이 자기 가족이 아니라서 못 찾고, 목록의 첫 번째로 열렸다. 실제로 그렇게 겪었다 —
// 새로 만든 가족을 두고 늘 처음 만든 가족이 열렸다.
function familyKey(userId) {
  return `moacon:family-id:${userId}`;
}

function readLastFamilyId(userId) {
  try {
    return localStorage.getItem(familyKey(userId));
  } catch {
    return null;
  }
}

function rememberFamilyId(userId, id) {
  try {
    localStorage.setItem(familyKey(userId), id);
  } catch {
    // 저장 못 해도 이번 실행 동안은 그대로 쓴다.
  }
}

// 가족 이름·구성원이 실제로 달라졌는지 비교하기 위한 요약 문자열.
function familySignature(state) {
  if (!state) return '';
  return [
    state.family.name,
    ...state.families.map((f) => `${f.id}:${f.name}`),
    ...state.members.map((m) => `${m.user_id}:${m.display_name}`),
    ...state.joinRequests.map((r) => r.id),
  ].join('|');
}

export default function AuthGate({ children }) {
  const [session, setSession] = useState(undefined);
  // undefined = 아직 확인 중, true/false = 지금 판 약관에 동의했는지
  const [agreed, setAgreed] = useState(undefined);
  const [familyState, setFamilyState] = useState(undefined);
  // 가족을 못 읽었을 때. 없는 것과 다르다 — 아래 loadWithRetry 주석 참고.
  const [familyError, setFamilyError] = useState(null);
  const [dataVersion, setDataVersion] = useState(0);
  // 다시 읽어온 가족 정보와 견주어 볼 "지금 값". 비교만 하는 용도라 화면을 다시 그리지 않는다.
  const familyRef = useRef(familyState);
  familyRef.current = familyState;
  useEffect(() => {
    getSession().then(setSession);
    return onAuthStateChange(setSession);
  }, []);

  // 카메라·갤러리·파일 앱을 다녀오면 화면이 다시 보이는 순간 supabase가 세션을 점검하고,
  // 내용은 같지만 "새로운 세션 객체"로 알려준다. 그 객체가 바뀔 때마다 가족 정보를 다시
  // 불러오면 그동안 화면 전체가 로딩 화면으로 바뀌면서 App이 통째로 새로 마운트되고,
  // 사진을 골라둔 기프티콘 입력창까지 사라진다(앱이 튕긴 것처럼 보인다).
  // 그래서 실제로 사람이 바뀌었을 때(로그인/로그아웃)만 다시 불러온다.
  const userId = session === undefined ? undefined : (session?.user?.id ?? null);

  // 내가 속한 가족을 모두 읽고, 그중 하나를 골라 그 구성원까지 함께 가져온다.
  // wantedId를 주면 그 가족을, 없으면 마지막으로 보던 가족을, 그것도 없으면 첫 번째를 연다.
  //
  // touch는 '이 가족을 지금 열었다'를 서버에 적을지다. 여는 순간에만 참이고, 뒤에서
  // 조용히 다시 읽는 때(refreshFamily)는 거짓이다. 아래 touchFamily 주석 참고.
  const loadFamilies = useCallback(
    async (wantedId, { touch = false } = {}) => {
      const families = await getMyFamilies(userId);
      if (families.length === 0) return null;

      // 폰 안에 적어둔 것이 먼저다. 앱을 다시 깔아 그게 없으면 families[0]인데, 그 차례는
      // 이제 서버가 '마지막으로 연 순서'로 세워 준다(family.js의 getMyFamilies).
      const wanted = wantedId ?? readLastFamilyId(userId);
      const family = families.find((f) => f.id === wanted) ?? families[0];
      rememberFamilyId(userId, family.id);
      // 서버에도 적어둔다. 기다리지 않는다 — 이게 늦어도 화면이 늦을 이유가 없다.
      //
      // ⚠ 여기가 무한 반복의 자리였다. 다시 읽을 때마다 적으면 이렇게 돈다:
      //
      //   적기(family_members UPDATE)
      //     → 실시간 신호(realtime.js의 subscribeToFamily가 그 표를 듣는다)
      //     → 목록 다시 읽기(App.jsx의 reload)
      //     → refreshFamily → 여기로 다시 → 적기 → …
      //
      // 0.3초마다 스스로를 부르며 끝없이 돈다. 아무도 아무것도 안 했는데 목록이
      // 계속 깜빡이고, 그동안 데이터베이스에는 쉼 없이 쓰기가 나갔다. 당겨서
      // 새로고침하면 그 고리에 불이 붙는다.
      //
      // 여는 순간에만 적는다. 이 값이 뜻하는 것도 원래 그것이다 — 마지막으로 연
      // 때이지, 마지막으로 목록을 읽은 때가 아니다.
      if (touch) touchFamily(family.id);

      const [members, joinRequests] = await Promise.all([
        getFamilyMembers(family.id),
        listPendingJoinRequests(family.id).catch(() => []),
      ]);
      return { families, family, members, joinRequests };
    },
    [userId]
  );

  // 약관 동의는 가족을 만들기 전에 받는다. 가족을 만드는 것도 개인정보를 남기는 일이라
  // 그 전에 물어야 순서가 맞다.
  useEffect(() => {
    if (userId === undefined) return;
    if (userId === null) {
      setAgreed(undefined);
      return;
    }
    let cancelled = false;
    setAgreed(undefined);
    hasAgreedToCurrent(userId)
      .then((ok) => !cancelled && setAgreed(ok))
      .catch(() => !cancelled && setAgreed(true));
    return () => {
      cancelled = true;
    };
  }, [userId]);

  /**
   * 가족을 읽는다. 실패하면 잠깐 쉬었다 두 번까지 다시 해본다.
   *
   * 이 자리에서 실패를 '가족 없음'으로 치면, 쓰고 있던 사람에게 가족 만들기 창이 뜬다.
   * 그러면 이미 가족이 있는 사람이 가족을 하나 더 만들어버릴 수 있다 — 되돌리기 어려운
   * 일이라 실패는 실패로 두어야 한다.
   *
   * 실제로 그렇게 나갔다. "가끔 앱을 열면 참여코드 넣는 창이 뜬다"가 이것이었다.
   * 앱을 켠 직후는 네트워크가 아직 안 붙어 있는 순간이라 여기가 제일 잘 실패한다.
   *
   * 다시 해보는 이유는 그 순간이 대개 짧아서다. 두 번이면 대개 붙고, 그래도 안 되면
   * 화면에 물어보게 둔다.
   */
  const loadWithRetry = useCallback(
    async (wantedId) => {
      let lastError;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        if (attempt > 0) await new Promise((done) => setTimeout(done, attempt * 700));
        try {
          return await loadFamilies(wantedId, { touch: true });
        } catch (err) {
          lastError = err;
        }
      }
      throw lastError;
    },
    [loadFamilies]
  );

  useEffect(() => {
    if (userId === undefined) return;
    if (userId === null) {
      setFamilyState(null);
      setFamilyError(null);
      return;
    }
    let cancelled = false;
    setFamilyState(undefined);
    setFamilyError(null);
    loadWithRetry()
      .then((next) => {
        if (!cancelled) setFamilyState(next);
      })
      .catch((err) => {
        // null(가족 없음)로 두지 않는다. 못 읽은 것뿐이다.
        if (!cancelled) setFamilyError(err);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, loadWithRetry]);

  function refetchFamily() {
    setFamilyState(undefined);
    setFamilyError(null);
    loadWithRetry()
      .then(setFamilyState)
      .catch(setFamilyError);
  }

  // 이름을 바꾼 뒤나 새 구성원이 들어온 뒤처럼, 화면은 그대로 두고 가족 정보만 다시 읽어온다.
  // refetchFamily와 달리 로딩 화면으로 갈아끼우지 않아서 열어둔 창이 닫히지 않는다.
  async function refreshFamily() {
    const next = await loadFamilies(familyRef.current?.family?.id);
    if (!next) return;

    const changed = familySignature(familyRef.current) !== familySignature(next);
    setFamilyState(next);
    // 이름이 달라졌으면 기프티콘에 적힌 받은 사람·사용한 사람 이름도 서버에서 함께 바뀌었을
    // 테니 목록도 다시 불러오게 한다. 달라진 게 없으면 괜히 두 번 부르지 않는다.
    if (changed) setDataVersion((v) => v + 1);
  }

  // 보는 가족을 바꾼다. 새로 만들거나 초대 코드로 들어온 직후에도 이걸로 그 가족을 연다.
  // 화면을 로딩으로 갈아끼우지 않아서, 가족을 고른 창이 그대로 있는 채로 내용만 바뀐다.
  async function switchFamily(familyId) {
    const next = await loadFamilies(familyId, { touch: true });
    if (next) setFamilyState(next);
  }

  // 첫 설정 화면을 띄울지.
  //
  // useState의 초기값으로 정할 수가 없다 — 처음 그릴 때는 로그인 정보를 아직 못 읽어서
  // 누구인지 모르고, 그때 정해버리면 영영 거짓으로 남는다. 그래서 그릴 때마다 본다.
  // '시작하기'를 누르면 아래 값이 참이 되어 다시 세우지 않는다.
  const [welcomeDone, setWelcomeDone] = useState(false);
  const welcomeSetup = !welcomeDone && needsWelcomeSetup(session?.user?.id);

  const waitingScreen = <LoadingScreen />;

  // 탈퇴가 막힌 이유는 여기서 들고 있는다. 탈퇴는 데이터부터 지우기 때문에 도중에 실패하면
  // 아래 화면이 목록에서 가족 만들기로 통째로 갈아끼워지는데, 그때 문구를 그 화면 안에서
  // 띄우면 세워지자마자 같이 사라진다. 이 자리는 어느 화면으로 바뀌어도 안 사라진다.
  const withNotice = (screen) => (
    <>
      {screen}
      <DeleteAccountError />
      <LoginErrorAlert />
    </>
  );

  if (session === undefined) return withNotice(waitingScreen);
  if (!session) return withNotice(<LoginScreen />);
  if (agreed === undefined) return withNotice(waitingScreen);
  if (!agreed)
    return withNotice(<ConsentScreen userId={session.user.id} onDone={() => setAgreed(true)} />);
  // 못 읽었으면 다시 해보게 한다. 여기서 가족 만들기로 넘기면, 쓰던 사람이 가족을
  // 하나 더 만들어버릴 수 있다.
  if (familyError) return withNotice(<FamilyLoadError onRetry={refetchFamily} />);
  if (familyState === undefined) return withNotice(waitingScreen);
  if (!familyState)
    return withNotice(<FamilyOnboarding userEmail={session.user.email} onDone={refetchFamily} />);

  // 가족까지 정한 사람에게 딱 한 번. 사진첩 찾기와 알림을 켜고 시작할지 묻는다.
  //
  // 여기가 자리인 이유는 둘 다 가족이 있어야 뜻이 서기 때문이다 — 알림 토큰은 가족에
  // 매여 있고, 찾아낸 기프티콘도 가족 서랍으로 들어간다.
  if (welcomeSetup)
    return withNotice(
      <WelcomeSetupScreen
        familyId={familyState.family.id}
        userId={session.user.id}
        onDone={() => {
          markWelcomeSetupDone(session.user.id);
          setWelcomeDone(true);
        }}
      />
    );

  return withNotice(
    <FamilyContext.Provider
      value={{
        user: session.user,
        family: familyState.family,
        families: familyState.families,
        members: familyState.members,
        joinRequests: familyState.joinRequests,
        dataVersion,
        switchFamily,
        refetchFamily,
        refreshFamily,
        signOut,
      }}
    >
      {children}
    </FamilyContext.Provider>
  );
}
