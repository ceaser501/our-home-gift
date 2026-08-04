import { useState } from 'react';
import { Users } from 'lucide-react';
import { createFamily, joinFamily } from '../family';
import { seedSampleGifticon } from '../sampleData';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { signOut } from '../auth';

export default function FamilyOnboarding({ userEmail, userId, onDone }) {
  const [mode, setMode] = useState('create');
  const [familyName, setFamilyName] = useState('우리 가족');
  const [memberName, setMemberName] = useState('');
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null);

  async function handleCreate(e) {
    e.preventDefault();
    if (!familyName.trim() || !memberName.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const family = await createFamily(familyName.trim(), memberName.trim());
      // 테스트 빌드에서만 샘플 기프티콘을 하나 넣어준다. 초기화할 때마다 SQL을 다시
      // 실행하지 않아도 되도록.
      await seedSampleGifticon({ familyId: family.id, ownerName: memberName.trim(), userId });
      setCreated(family);
    } catch (err) {
      setError(err.message || '가족 그룹 생성에 실패했어요.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleJoin(e) {
    e.preventDefault();
    if (!code.trim() || !memberName.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      await joinFamily(code.trim(), memberName.trim());
      onDone();
    } catch (err) {
      setError(err.message || '초대 코드로 참여하지 못했어요.');
    } finally {
      setSubmitting(false);
    }
  }

  if (created) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col items-center justify-center gap-5 bg-background px-6">
        <Users className="size-10 text-primary" />
        <h1 className="m-0 text-lg font-bold text-foreground">가족 그룹을 만들었어요</h1>
        <p className="m-0 text-center text-sm text-muted-foreground">
          아래 초대 코드를 가족에게 알려주면, 같은 코드로 참여해서 기프티콘을 함께 볼 수 있어요.
        </p>
        <div className="rounded-2xl border border-border bg-card px-8 py-4 text-center">
          <p className="m-0 text-3xl font-bold tracking-[0.2em] text-primary">{created.invite_code}</p>
        </div>
        <Button size="lg" className="w-full rounded-xl" onClick={onDone}>
          시작하기
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col justify-center gap-5 bg-background px-6">
      <div className="flex flex-col items-center gap-1.5">
        <Users className="size-9 text-primary" />
        <h1 className="m-0 text-lg font-bold text-foreground">가족 그룹이 필요해요</h1>
        <p className="m-0 text-center text-sm text-muted-foreground">{userEmail}로 로그인했어요.</p>
      </div>

      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => setMode('create')}
          className={cn(
            'flex-1 rounded-[10px] border py-2 text-[13px] font-semibold transition-colors',
            mode === 'create' ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground'
          )}
        >
          가족 만들기
        </button>
        <button
          type="button"
          onClick={() => setMode('join')}
          className={cn(
            'flex-1 rounded-[10px] border py-2 text-[13px] font-semibold transition-colors',
            mode === 'join' ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground'
          )}
        >
          초대 코드로 참여
        </button>
      </div>

      {mode === 'create' ? (
        <form onSubmit={handleCreate} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fam-name">가족 이름</Label>
            <Input id="fam-name" value={familyName} onChange={(e) => setFamilyName(e.target.value)} placeholder="예: 우리 가족" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fam-my-name">내 이름</Label>
            <Input id="fam-my-name" value={memberName} onChange={(e) => setMemberName(e.target.value)} placeholder="예: 태수" required />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" size="lg" className="w-full rounded-xl" disabled={submitting}>
            {submitting ? '만드는 중…' : '가족 만들기'}
          </Button>
        </form>
      ) : (
        <form onSubmit={handleJoin} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fam-code">초대 코드</Label>
            <Input
              id="fam-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="6자리 코드"
              className="tracking-[0.2em] uppercase"
              maxLength={6}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fam-join-name">내 이름</Label>
            <Input id="fam-join-name" value={memberName} onChange={(e) => setMemberName(e.target.value)} placeholder="예: 보연" required />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" size="lg" className="w-full rounded-xl" disabled={submitting}>
            {submitting ? '참여하는 중…' : '참여하기'}
          </Button>
        </form>
      )}

      <button type="button" onClick={() => signOut()} className="text-center text-xs text-muted-foreground underline">
        다른 계정으로 로그인
      </button>
    </div>
  );
}
