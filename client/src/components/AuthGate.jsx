import { useEffect, useState } from 'react';
import { getSession, onAuthStateChange, signOut } from '../auth';
import { getMyFamily } from '../family';
import { FamilyContext } from '../FamilyContext';
import LoginScreen from './LoginScreen';
import FamilyOnboarding from './FamilyOnboarding';
import InAppBrowserNotice from './InAppBrowserNotice';
import { detectInAppBrowser } from '../utils/browser';

function CenteredMessage({ text }) {
  return (
    <div className="flex min-h-dvh w-full items-center justify-center bg-background">
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

export default function AuthGate({ children }) {
  const [session, setSession] = useState(undefined);
  const [familyState, setFamilyState] = useState(undefined);
  const [inApp] = useState(() => detectInAppBrowser());
  const [skippedInAppNotice, setSkippedInAppNotice] = useState(false);

  useEffect(() => {
    getSession().then(setSession);
    return onAuthStateChange(setSession);
  }, []);

  useEffect(() => {
    if (session === undefined) return;
    if (!session) {
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
  }, [session]);

  function refetchFamily() {
    setFamilyState(undefined);
    getMyFamily()
      .then(setFamilyState)
      .catch(() => setFamilyState(null));
  }

  // 카카오톡 등 인앱 브라우저는 로그인부터 막히는 경우가 많아서, 로그인 화면보다 먼저
  // 크롬/사파리로 옮겨가도록 안내한다.
  if (inApp && !skippedInAppNotice) {
    return <InAppBrowserNotice inApp={inApp} onSkip={() => setSkippedInAppNotice(true)} />;
  }

  if (session === undefined) return <CenteredMessage text="불러오는 중…" />;
  if (!session) return <LoginScreen />;
  if (familyState === undefined) return <CenteredMessage text="불러오는 중…" />;
  if (!familyState) return <FamilyOnboarding userEmail={session.user.email} onDone={refetchFamily} />;

  return (
    <FamilyContext.Provider
      value={{
        user: session.user,
        family: familyState.family,
        members: familyState.members,
        signOut,
      }}
    >
      {children}
    </FamilyContext.Provider>
  );
}
