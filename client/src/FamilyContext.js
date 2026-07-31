import { createContext, useContext } from 'react';

export const FamilyContext = createContext(null);

export function useFamily() {
  const ctx = useContext(FamilyContext);
  if (!ctx) throw new Error('useFamily는 FamilyContext.Provider 안에서만 쓸 수 있어요.');
  return ctx;
}
