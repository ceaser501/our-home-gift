import { useEffect, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { sendMagicLink, signInWithGoogle, signInWithNaver } from '../auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Logo from './Logo';
import InstallPrompt from './InstallPrompt';
import ResetAllDataButton from './ResetAllDataButton';

function GoogleIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47c-.28 1.5-1.13 2.77-2.4 3.63v3h3.88c2.27-2.09 3.57-5.17 3.57-8.82z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.88-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.95H1.26v3.1C3.24 21.3 7.29 24 12 24z"
      />
      <path fill="#FBBC05" d="M5.27 14.29a7.2 7.2 0 0 1 0-4.58v-3.1H1.26a12 12 0 0 0 0 10.78z" />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.6 4.59 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0 7.29 0 3.24 2.7 1.26 6.61l4.01 3.1C6.22 6.88 8.87 4.77 12 4.77z"
      />
    </svg>
  );
}

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [googleLoading, setGoogleLoading] = useState(false);
  const [naverLoading, setNaverLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const loginError = params.get('login_error');
    if (loginError) {
      setError(loginError);
      params.delete('login_error');
      const query = params.toString();
      window.history.replaceState(null, '', window.location.pathname + (query ? `?${query}` : ''));
    }
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email.trim()) return;
    setSending(true);
    setError('');
    try {
      await sendMagicLink(email.trim());
      setSent(true);
    } catch (err) {
      setError(err.message || '로그인 링크 전송에 실패했어요.');
    } finally {
      setSending(false);
    }
  }

  async function handleGoogleLogin() {
    setGoogleLoading(true);
    setError('');
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(err.message || '구글 로그인에 실패했어요.');
      setGoogleLoading(false);
    }
  }

  function handleNaverLogin() {
    setNaverLoading(true);
    setError('');
    try {
      signInWithNaver();
    } catch (err) {
      setError(err.message || '네이버 로그인에 실패했어요.');
      setNaverLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col bg-background">
      <div className="pt-[env(safe-area-inset-top)]">
        <InstallPrompt />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-8">
      <div className="flex flex-col items-center gap-3">
        <Logo className="size-12" />
        <h1 className="m-0 text-xl font-bold text-foreground">모아콘</h1>
        {/* 이 앱의 중심은 가족과 함께 보는 것이다. 개인용으로 방향을 틀면 카카오톡 선물함과
            겨루는 싸움이 되고, 유일한 차별점을 잃는다. 그래서 문구에서 가족을 빼지 않는다.
            다만 그것이 "가족이 있어야 쓸 수 있다"는 조건처럼 읽히면 혼자 쓰려던 사람이
            첫 화면에서 나가버리므로, 조건이 아니라 할 수 있는 일로 적는다.
            ("볼 수도 있어요"처럼 흐리지 않는다. 곁다리로 들려서 오히려 중심이 약해진다.) */}
        <p className="m-0 text-center text-sm break-keep text-muted-foreground">
          기프티콘을 모아두고, 가족과 함께 볼 수 있어요.
        </p>
      </div>

      {sent ? (
        <div className="w-full rounded-2xl border border-border bg-card p-5 text-center">
          <p className="m-0 text-sm text-foreground">{email}로 로그인 링크를 보냈어요.</p>
          <p className="mt-1.5 mb-0 text-xs text-muted-foreground">메일함에서 링크를 눌러 로그인을 완료해주세요.</p>
        </div>
      ) : (
        <div className="flex w-full flex-col gap-3">
          <Button
            type="button"
            size="lg"
            onClick={handleGoogleLogin}
            disabled={googleLoading}
            variant="outline"
            className="w-full rounded-xl"
          >
            <GoogleIcon className="size-4" />
            {googleLoading ? '연결 중…' : '구글로 로그인'}
          </Button>

          <Button
            type="button"
            size="lg"
            onClick={handleNaverLogin}
            disabled={naverLoading}
            className="w-full rounded-xl bg-[#03C75A] text-white hover:bg-[#03C75A]/90"
          >
            <span className="flex size-4 items-center justify-center text-[13px] leading-none font-bold">N</span>
            {naverLoading ? '연결 중…' : '네이버로 로그인'}
          </Button>

          <Button
            type="button"
            size="lg"
            disabled
            className="w-full rounded-xl bg-[#FEE500] text-[#191919] opacity-60 hover:bg-[#FEE500] disabled:opacity-60"
          >
            <MessageCircle className="size-4 fill-[#191919]" />
            카카오로 로그인 (서비스 예정)
          </Button>

          <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            또는
            <span className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={handleSubmit} className="flex w-full flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="login-email">이메일</Label>
              <Input
                id="login-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" size="lg" variant="outline" className="w-full rounded-xl" disabled={sending}>
              {sending ? '전송 중…' : '이메일로 로그인 링크 받기'}
            </Button>
          </form>
        </div>
      )}

        <ResetAllDataButton />
      </div>
    </div>
  );
}
