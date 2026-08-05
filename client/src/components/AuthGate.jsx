import { useCallback, useEffect, useRef, useState } from 'react';
import { getSession, onAuthStateChange, signOut } from '../auth';
import { getFamilyMembers, getMyFamilies, listPendingJoinRequests } from '../family';
import { hasAgreedToCurrent } from '../consent';
import { FamilyContext } from '../FamilyContext';
import LoginScreen from './LoginScreen';
import FamilyOnboarding from './FamilyOnboarding';
import ConsentScreen from './ConsentScreen';
import LoadingScreen from './LoadingScreen';

// 예전에는 여기서 로고와 한 줄 소개를 보여주는 인트로 화면을 최소 1.8초 띄웠다.
// 그런데 설치형 PWA는 앱을 켤 때 브라우저가 먼저 제 스플래시(아이콘 + 앱 이름)를
// 띄우기 때문에, 우리 인트로가 그 뒤에 또 나와 같은 인사를 두 번 하는 꼴이었다.
// 브라우저 것은 우리가 끌 수 없으므로 우리 것을 뺐다. 준비되는 동안에는 조용한
// 로딩 화면만 쓴다.

// 여러 가족에 속해 있을 수 있어서, 마지막으로 보던 가족을 기억해뒀다가 다음에도 그대로 연다.
const LAST_FAMILY_KEY = 'moacon:family-id';

function readLastFamilyId() {
  try {
    return localStorage.getItem(LAST_FAMILY_KEY);
  } catch {
    return null;
  }
}

function rememberFamilyId(id) {
  try {
    localStorage.setItem(LAST_FAMILY_KEY, id);
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
  const loadFamilies = useCallback(
    async (wantedId) => {
      const families = await getMyFamilies(userId);
      if (families.length === 0) return null;

      const wanted = wantedId ?? readLastFamilyId();
      const family = families.find((f) => f.id === wanted) ?? families[0];
      rememberFamilyId(family.id);

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

  useEffect(() => {
    if (userId === undefined) return;
    if (userId === null) {
      setFamilyState(null);
      return;
    }
    let cancelled = false;
    setFamilyState(undefined);
    loadFamilies()
      .then((next) => {
        if (!cancelled) setFamilyState(next);
      })
      .catch(() => {
        if (!cancelled) setFamilyState(null);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, loadFamilies]);

  function refetchFamily() {
    setFamilyState(undefined);
    loadFamilies()
      .then(setFamilyState)
      .catch(() => setFamilyState(null));
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
    const next = await loadFamilies(familyId);
    if (next) setFamilyState(next);
  }

  const waitingScreen = <LoadingScreen />;

  if (session === undefined) return waitingScreen;
  if (!session) return <LoginScreen />;
  if (agreed === undefined) return waitingScreen;
  if (!agreed) return <ConsentScreen userId={session.user.id} onDone={() => setAgreed(true)} />;
  if (familyState === undefined) return waitingScreen;
  if (!familyState) return <FamilyOnboarding userEmail={session.user.email} onDone={refetchFamily} />;

  return (
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
