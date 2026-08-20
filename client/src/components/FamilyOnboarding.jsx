import { useState } from 'react';
import { Clock, Users } from 'lucide-react';
import { createFamily, requestJoinFamily } from '../family';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import CopyButton from './CopyButton';
import { signOut } from '../auth';

export default function FamilyOnboarding({ userEmail, onDone }) {
  const [mode, setMode] = useState('create');
  const [familyName, setFamilyName] = useState('우리집');
  const [memberName, setMemberName] = useState('');
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null);
  const [pendingFor, setPendingFor] = useState(null);

  async function handleCreate(e) {
    e.preventDefault();
    if (!familyName.trim() || !memberName.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const family = await createFamily(familyName.trim(), memberName.trim());
      setCreated(family);
    } catch (err) {
      setError(err.message || '만들지 못했어요.');
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
      // 코드가 맞아도 바로 들어가지지 않는다. 기존 구성원이 승인해야 한다.
      const result = await requestJoinFamily(code.trim(), memberName.trim());
      if (result.status === 'joined') {
        onDone();
        return;
      }
      setPendingFor(result.family_name);
    } catch (err) {
      setError(err.message || '참여 신청을 하지 못했어요.');
    } finally {
      setSubmitting(false);
    }
  }

  if (pendingFor) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col items-center justify-center gap-5 bg-background px-6">
        <Clock className="size-10 text-primary" />
        <h1 className="m-0 text-xl font-bold text-foreground">승인을 기다리는 중이에요</h1>
        <p className="m-0 text-center text-base leading-relaxed break-keep text-muted-foreground">
          '{pendingFor}'에 참여를 신청했어요.
          <br />
          가족의 구성원이 승인하면, 참여할 수 있어요.
          <br />
          초대 코드를 알려준 분에게 말씀해 주세요.
        </p>
        <div className="flex w-full flex-col gap-2">
          {/* 승인은 상대가 눌러줘야 나는 일이라 여기서 기다릴 것이 없다. 로그인
              화면으로 돌아간다 — onDone으로 두면 참여 신청 화면이 또 떠서, 승인을
              기다리라는 건지 다시 신청하라는 건지 알 수 없었다. */}
          <Button size="lg" className="w-full rounded-xl" onClick={() => signOut()}>
            확인했어요
          </Button>
          {/* 밑줄 글자였는데 버튼으로 바꿨다. 보라 버튼 밑에 놓이는 두 번째 길은 어디서든
              같은 모양(테두리만 있는 버튼)이어야 한다 — ExtendSheet·SpendSheet와 같다. */}
          <Button
            variant="outline"
            size="lg"
            className="w-full rounded-xl text-muted-foreground"
            onClick={() => setPendingFor(null)}
          >
            다른 코드로 신청하기
          </Button>
        </div>
      </div>
    );
  }

  if (created) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col items-center justify-center gap-5 bg-background px-6">
        <Users className="size-10 text-primary" />
        <h1 className="m-0 text-lg font-bold text-foreground">만들었어요</h1>
        <p className="m-0 text-center text-sm text-muted-foreground">
          가족과 함께 보고 싶으면 이 코드를 알려주세요.
          혼자 쓰실 거면 그냥 시작하셔도 돼요.
        </p>
        {/* 가족을 막 만든 이 순간이 코드를 실제로 보내는 순간이다. 여기서 복사가 안 되면
            사람은 여섯 자를 눈으로 외워 옮겨 적는다. */}
        <div className="flex flex-col items-center gap-1 rounded-2xl border border-border bg-card px-8 py-4">
          <p className="m-0 text-3xl font-bold tracking-[0.2em] text-primary">{created.invite_code}</p>
          <CopyButton value={created.invite_code} label="코드 복사" />
        </div>
        <Button size="lg" className="w-full rounded-xl" onClick={onDone}>
          시작하기
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col justify-center gap-5 bg-background px-6">
      {/* 이 화면이 "이 앱이 내 앱인가"를 정한다. 예전 문구("가족 그룹이 필요해요")는 혼자
          쓰려는 사람에게 자격 조건처럼 읽혔다. 혼자도 괜찮다는 것을 먼저 말해준다. */}
      <div className="flex flex-col items-center gap-1.5">
        <Users className="size-9 text-primary" />
        <h1 className="m-0 text-xl font-bold text-foreground">기프티콘을 모아둘 곳을 만들어요</h1>
        <p className="m-0 text-center text-base break-keep text-muted-foreground">
          혼자 써도 좋아요.
          <br />
          나중에 가족을 초대할 수 있어요.
        </p>
        <p className="m-0 text-center text-sm text-muted-foreground">{userEmail}로 로그인했어요.</p>
      </div>

      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => setMode('create')}
          className={cn(
            'flex-1 rounded-[10px] border py-2.5 text-sm font-semibold transition-colors',
            mode === 'create' ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground'
          )}
        >
          새로 만들기
        </button>
        <button
          type="button"
          onClick={() => setMode('join')}
          className={cn(
            'flex-1 rounded-[10px] border py-2.5 text-sm font-semibold transition-colors',
            mode === 'join' ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground'
          )}
        >
          초대 코드로 참여
        </button>
      </div>

      {mode === 'create' ? (
        <form onSubmit={handleCreate} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fam-name">이름</Label>
            {/* autoComplete="off": 예전에 적었던 값이 아래로 뜨지 않게 한다. */}
            <Input
              id="fam-name"
              value={familyName}
              onChange={(e) => setFamilyName(e.target.value)}
              placeholder="예: 우리집"
              autoComplete="off"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fam-my-name">내 이름</Label>
            <Input
              id="fam-my-name"
              value={memberName}
              onChange={(e) => setMemberName(e.target.value)}
              placeholder="예: 태수"
              autoComplete="off"
              required
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" size="lg" className="w-full rounded-xl" disabled={submitting}>
            {submitting ? '만드는 중…' : '만들기'}
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
              autoComplete="off"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fam-join-name">내 이름</Label>
            <Input
              id="fam-join-name"
              value={memberName}
              onChange={(e) => setMemberName(e.target.value)}
              placeholder="예: 보연"
              autoComplete="off"
              required
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" size="lg" className="w-full rounded-xl" disabled={submitting}>
            {submitting ? '참여하는 중…' : '참여하기'}
          </Button>
        </form>
      )}

      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-full rounded-xl text-muted-foreground"
        onClick={() => signOut()}
      >
        다른 계정으로 로그인
      </Button>
    </div>
  );
}
