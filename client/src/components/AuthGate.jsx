import { useEffect, useState } from 'react';
import { getSession, onAuthStateChange, signOut } from '../auth';
import { getMyFamily } from '../family';
import { FamilyContext } from '../FamilyContext';
import LoginScreen from './LoginScreen';
import FamilyOnboarding from './FamilyOnboarding';

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
