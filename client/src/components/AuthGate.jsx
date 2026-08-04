import { useEffect, useRef, useState } from 'react';
import { getSession, onAuthStateChange, signOut } from '../auth';
import { getMyFamily } from '../family';
import { FamilyContext } from '../FamilyContext';
import LoginScreen from './LoginScreen';
import FamilyOnboarding from './FamilyOnboarding';
import SplashScreen from './SplashScreen';
import LoadingScreen from './LoadingScreen';

// 스플래시가 깜빡이고 사라지면 오히려 산만해서, 한 번 뜨면 최소 이 시간만큼은 보여준다.
const MIN_SPLASH_MS = 1800;

// 인트로 스플래시는 "앱을 켰을 때 한 번"만 보여준다.
// 구글/네이버 로그인은 외부 페이지로 나갔다 돌아오는 리다이렉트 방식이라 앱이 통째로 새로
// 로드되는데, 그때마다 인트로가 다시 뜨면 성가시다. sessionStorage는 같은 탭(설치형 PWA라면
// 같은 앱 실행) 안에서는 리다이렉트를 건너뛰어도 유지되므로, 이걸로 "이미 봤음"을 기억한다.
const SPLASH_SHOWN_KEY = 'moacon:splash-shown';

function readSplashShown() {
  try {
    return sessionStorage.getItem(SPLASH_SHOWN_KEY) === '1';
  } catch {
    // 사파리 프라이빗 모드 등에서 접근이 막히면 그냥 매번 보여준다.
    return false;
  }
}

function markSplashShown() {
  try {
    sessionStorage.setItem(SPLASH_SHOWN_KEY, '1');
  } catch {
    // 저장 못 해도 동작에는 지장 없다.
  }
}

// 가족 이름·구성원이 실제로 달라졌는지 비교하기 위한 요약 문자열.
function familySignature(state) {
  if (!state) return '';
  return [state.family.name, ...state.members.map((m) => `${m.user_id}:${m.display_name}`)].join('|');
}

export default function AuthGate({ children }) {
  const [session, setSession] = useState(undefined);
  const [familyState, setFamilyState] = useState(undefined);
  const [dataVersion, setDataVersion] = useState(0);
  // 다시 읽어온 가족 정보와 견주어 볼 "지금 값". 비교만 하는 용도라 화면을 다시 그리지 않는다.
  const familyRef = useRef(familyState);
  familyRef.current = familyState;
  // 이번 화면 로드 이전에 이미 인트로를 봤는지(= 로그인 리다이렉트 등으로 돌아온 상황인지).
  const [introShownBefore] = useState(readSplashShown);
  const [splashDone, setSplashDone] = useState(introShownBefore);

  useEffect(() => {
    if (splashDone) return;
    markSplashShown();
    const timer = setTimeout(() => setSplashDone(true), MIN_SPLASH_MS);
    return () => clearTimeout(timer);
    // 최초 마운트에서만 판단하면 되는 값이라 의존성은 비워둔다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  useEffect(() => {
    if (userId === undefined) return;
    if (userId === null) {
      setFamilyState(null);
      return;
    }
    let cancelled = false;
    setFamilyState(undefined);
    getMyFamily()
      .then((f) => {
        if (!cancelled) setFamilyState(f);
      })
      .catch(() => {
        if (!cancelled) setFamilyState(null);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  function refetchFamily() {
    setFamilyState(undefined);
    getMyFamily()
      .then(setFamilyState)
      .catch(() => setFamilyState(null));
  }

  // 이름을 바꾼 뒤나 새 구성원이 들어온 뒤처럼, 화면은 그대로 두고 가족 정보만 다시 읽어온다.
  // refetchFamily와 달리 로딩 화면으로 갈아끼우지 않아서 열어둔 창이 닫히지 않는다.
  async function refreshFamily() {
    const next = await getMyFamily();
    if (!next) return;

    const changed = familySignature(familyRef.current) !== familySignature(next);
    setFamilyState(next);
    // 이름이 달라졌으면 기프티콘에 적힌 받은 사람·사용한 사람 이름도 서버에서 함께 바뀌었을
    // 테니 목록도 다시 불러오게 한다. 달라진 게 없으면 괜히 두 번 부르지 않는다.
    if (changed) setDataVersion((v) => v + 1);
  }

  // 앱을 처음 켠 순간에는 준비가 끝날 때까지 인트로를 계속 보여주고(화면이 갈아끼워지지 않게),
  // 그 뒤의 대기 상황에서는 조용한 로딩 화면만 쓴다.
  const waitingScreen = introShownBefore ? <LoadingScreen /> : <SplashScreen />;

  if (!splashDone) return <SplashScreen />;
  if (session === undefined) return waitingScreen;
  if (!session) return <LoginScreen />;
  if (familyState === undefined) return waitingScreen;
  if (!familyState) return <FamilyOnboarding userEmail={session.user.email} userId={session.user.id} onDone={refetchFamily} />;

  return (
    <FamilyContext.Provider
      value={{
        user: session.user,
        family: familyState.family,
        members: familyState.members,
        dataVersion,
        refetchFamily,
        refreshFamily,
        signOut,
      }}
    >
      {children}
    </FamilyContext.Provider>
  );
}
