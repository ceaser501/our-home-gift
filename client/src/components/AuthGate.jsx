import { useEffect, useState } from 'react';
import { getSession, onAuthStateChange, signOut } from '../auth';
import { getMyFamily } from '../family';
import { FamilyContext } from '../FamilyContext';
import LoginScreen from './LoginScreen';
import FamilyOnboarding from './FamilyOnboarding';
import SplashScreen from './SplashScreen';

// 스플래시가 깜빡이고 사라지면 오히려 산만해서, 한 번 뜨면 최소 이 시간만큼은 보여준다.
const MIN_SPLASH_MS = 1800;

export default function AuthGate({ children }) {
  const [session, setSession] = useState(undefined);
  const [familyState, setFamilyState] = useState(undefined);
  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSplashDone(true), MIN_SPLASH_MS);
    return () => clearTimeout(timer);
  }, []);

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

  if (!splashDone || session === undefined) return <SplashScreen />;
  if (!session) return <LoginScreen />;
  if (familyState === undefined) return <SplashScreen />;
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
