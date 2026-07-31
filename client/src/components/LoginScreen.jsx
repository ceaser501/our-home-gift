import { useState } from 'react';
import { sendMagicLink } from '../auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Logo from './Logo';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

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

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col items-center justify-center gap-6 bg-background px-6">
      <div className="flex flex-col items-center gap-3">
        <Logo className="size-12" />
        <h1 className="m-0 text-xl font-bold text-foreground">아워홈 기프티콘</h1>
        <p className="m-0 text-center text-sm text-muted-foreground">가족과 기프티콘을 함께 관리해보세요.</p>
      </div>

      {sent ? (
        <div className="w-full rounded-2xl border border-border bg-card p-5 text-center">
          <p className="m-0 text-sm text-foreground">{email}로 로그인 링크를 보냈어요.</p>
          <p className="mt-1.5 mb-0 text-xs text-muted-foreground">메일함에서 링크를 눌러 로그인을 완료해주세요.</p>
        </div>
      ) : (
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
          <Button type="submit" size="lg" className="w-full rounded-xl" disabled={sending}>
            {sending ? '전송 중…' : '로그인 링크 받기'}
          </Button>
        </form>
      )}
    </div>
  );
}
