import { useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';
import AlertDialog from './AlertDialog';
import { clearLoginError, readLoginError, watchLoginError } from '../utils/loginError';

// 로그인이 실패했을 때 뜨는 창.
//
// 앱이 만든 다른 창들과 같은 모양이다. 예전에는 window.alert이었다 — 폰이 그리는 회색
// 상자에 서버가 준 영어가 그대로 뜨고, 닫는 버튼도 'OK'였다. 60대가 보는 화면이고
// 심사자도 눌러보는 자리인데 앱 안에서 그것만 다른 물건이었다.
//
// AuthGate가 들고 있는다. 로그인 화면이든 목록이든 어느 화면으로 갈아끼워져도 이건
// 그 위에 남는다(DeleteAccountError와 같은 사정이다).
export default function LoginErrorAlert() {
  const [message, setMessage] = useState(() => readLoginError());

  useEffect(() => {
    // 그리기 전에 이미 적힌 것이 있을 수 있다. 걸어두면서 한 번 더 읽는다.
    setMessage(readLoginError());
    return watchLoginError(setMessage);
  }, []);

  if (!message) return null;

  return (
    <AlertDialog
      tone="warning"
      icon={KeyRound}
      title="로그인하지 못했어요"
      description={message}
      onClose={clearLoginError}
    />
  );
}
