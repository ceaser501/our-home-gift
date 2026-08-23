import { useState } from 'react';
import { Check, ChevronRight, Clock, Mail, Users } from 'lucide-react';
import { createFamily, requestJoinFamily } from '../family';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import CopyButton from './CopyButton';
import { signOut } from '../auth';

export default function FamilyOnboarding({ userEmail, onDone }) {
  const [mode, setMode] = useState('create');
  // 빈칸으로 시작한다. '우리집'을 미리 적어두면 그대로 두고 넘어가는 사람이 많은데,
  // 이 이름은 가족 모두가 매일 보는 이름이라 자기 말로 짓게 하는 편이 낫다.
  const [familyName, setFamilyName] = useState('');
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
      <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col overflow-y-auto bg-background px-6">
        <div className="my-auto flex flex-col items-center gap-5 py-7">
        <span className="flex size-14 items-center justify-center rounded-full bg-warning/12">
          <Clock className="size-7 text-warning" />
        </span>
        <h1 className="m-0 text-[21px] font-bold tracking-[-0.028em] text-foreground">승인을 기다리는 중</h1>
        <p className="m-0 text-center text-[15px] break-keep text-muted-foreground">
          {pendingFor}에 참여를 신청했어요.
        </p>

        {/* 세 줄 문단을 두 걸음으로 나눈다. 어디까지 왔고 무엇이 남았는지가 보인다 —
            줄글로 두면 셋 다 앞으로 할 일처럼 읽혔다. */}
        <div className="flex w-full flex-col gap-3.5 rounded-[18px] bg-secondary/60 p-4">
          <div className="flex items-start gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
              <Check className="size-3.5" strokeWidth={3} />
            </span>
            <p className="m-0 flex-1 text-[15px] text-foreground">신청을 보냈어요</p>
          </div>
          <div className="flex items-start gap-3">
            <span className="size-6 shrink-0 rounded-full border-2 border-border bg-card" />
            <div className="flex flex-1 flex-col gap-0.5">
              <p className="m-0 text-[15px] font-semibold text-foreground">가족 구성원이 승인하면 참여돼요</p>
              <p className="m-0 text-[13.5px] text-muted-foreground">코드를 알려준 분에게 말씀해주세요</p>
            </div>
          </div>
        </div>

        <div className="flex w-full flex-col gap-2">
          {/* 승인은 상대가 눌러줘야 나는 일이라 여기서 기다릴 것이 없다. 로그인
              화면으로 돌아간다 — onDone으로 두면 참여 신청 화면이 또 떠서, 승인을
              기다리라는 건지 다시 신청하라는 건지 알 수 없었다.
              '확인했어요'는 실제로 로그아웃인데 그렇게 읽히지 않아서 이름을 고쳤다. */}
          <Button
            size="lg"
            className="h-[52px] w-full rounded-[13px] text-[15.5px] font-bold"
            onClick={() => signOut()}
          >
            알겠어요, 나가기
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
      </div>
    );
  }

  if (created) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col overflow-y-auto bg-background px-6">
        <div className="my-auto flex flex-col items-center gap-5 py-7">
        <span className="flex size-14 items-center justify-center rounded-full bg-success/12">
          <Check className="size-7 text-success" strokeWidth={2.5} />
        </span>
        <h1 className="m-0 text-center text-[21px] font-bold tracking-[-0.028em] break-keep text-foreground">
          {created.name}을 만들었어요
        </h1>
        <p className="m-0 text-center text-[15px] leading-relaxed break-keep text-muted-foreground">
          혼자 쓰셔도 되고,
          <br />
          가족에게 코드를 알려줘도 돼요.
        </p>
        {/* 가족을 막 만든 이 순간이 코드를 실제로 보내는 순간이다. 여기서 복사가 안 되면
            사람은 여섯 자를 눈으로 외워 옮겨 적는다.
            그래서 주 버튼 자리를 복사에 내준다. 예전에는 보라 '시작하기'가 제일 세서,
            코드를 안 보내고 그냥 넘어가게 됐다 — 이 화면이 있는 이유가 그 코드다. */}
        <div className="flex w-full flex-col gap-3 rounded-[18px] bg-accent px-5 py-5">
          <p className="m-0 text-center text-[13.5px] font-semibold text-primary/70">초대 코드</p>
          <p className="m-0 text-center text-[34px] font-bold tracking-[0.16em] text-foreground">
            {created.invite_code}
          </p>
          <CopyButton
            value={created.invite_code}
            label="코드 복사"
            className="h-[52px] w-full justify-center rounded-[13px] bg-primary text-[15.5px] font-bold text-primary-foreground"
          />
        </div>
        <Button
          variant="outline"
          size="lg"
          className="h-[52px] w-full rounded-[13px] text-[15.5px] font-bold"
          onClick={onDone}
        >
          시작하기
        </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col overflow-y-auto bg-background px-6">
      {/* 한 칸(16px)으로 통일한다. 예전에는 바깥이 20px인데 폼 위에 4px이 더 붙고 버튼
          위에는 12+4px이 붙어서, 같은 화면 안에 24px과 16px 두 간격이 섞여 있었다.
          '가족 이름' 위와 마지막 칸 아래가 서로 달라 보이던 것이 이것이다. */}
      <div className="my-auto flex flex-col gap-4 py-7">
      {/* 이 화면이 "이 앱이 내 앱인가"를 정한다. 예전 문구("가족 그룹이 필요해요")는 혼자
          쓰려는 사람에게 자격 조건처럼 읽혔다. 혼자도 괜찮다는 것을 먼저 말해준다. */}
      <div className="flex flex-col items-center gap-1.5">
        <span className="flex size-11 items-center justify-center rounded-full bg-accent">
          <Users className="size-[22px] text-primary" />
        </span>
        <h1 className="m-0 text-center text-[20px] font-bold tracking-[-0.028em] text-foreground">
          기프티콘을 모아둘
          <br />
          곳을 만들어요
        </h1>
        <p className="m-0 text-center text-[14.5px] leading-relaxed font-medium break-keep text-muted-foreground">
          혼자 써도 좋아요.
          <br />
          나중에 가족을 초대할 수 있어요.
        </p>
      </div>

      {/* 어느 계정으로 만드는지와 계정을 바꾸는 길을 한 자리에 둔다. 예전에는 이메일이
          화면 위, 버튼이 화면 맨 아래에 떨어져 있어 같은 이야기를 두 곳에서 했다. */}
      <div className="flex h-12 items-center gap-3 rounded-[13px] border border-border bg-card pr-2.5 pl-3.5">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Mail className="size-[17px] shrink-0 text-muted-foreground" />
          <p className="m-0 truncate text-[14.5px] font-medium text-foreground">{userEmail}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 shrink-0 rounded-[10px] text-[13.5px] font-semibold text-foreground/70"
          onClick={() => signOut()}
        >
          계정 바꾸기
          <ChevronRight className="size-3.5" />
        </Button>
      </div>

      {/* 보라로 채운 탭은 '눌러야 할 주 버튼'처럼 보였다. 실제로는 지금 어느 쪽인지
          알려주는 표시다. 흰 배경이 선택된 쪽을 가리키고 둘은 같은 무게로 남는다. */}
      <div className="flex gap-0 rounded-[13px] bg-secondary p-1">
        {[
          ['create', '새로 만들기'],
          ['join', '초대 코드로 참여'],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setMode(value)}
            className={cn(
              'flex-1 rounded-[10px] py-2 text-[15px] font-semibold tracking-[-0.015em] transition-colors',
              mode === value ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'create' ? (
        // 폼 안 간격도 바깥과 같은 16px. 그래야 '가족 이름' 위와 마지막 칸 아래가 같다.
        <form onSubmit={handleCreate} className="flex flex-col gap-4">
          {/* 적는 칸을 테두리 카드로 또 감싸지 않는다. 칸마다 테두리가 있으므로 두 겹이
              된다 — 이 앱에서 테두리는 '누르거나 적는 것' 하나만 가리켜야 한다.
              칸끼리는 한 단 좁게(12px) 붙여서 둘이 한 묶음으로 읽히게 한다. */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              {/* '이름'만 적으면 무엇의 이름인지 묻게 된다. 바로 아래가 '내 이름'이라 더 그렇다. */}
              <Label htmlFor="fam-name" className="text-[14px] font-semibold">가족 이름</Label>
              {/* autoComplete="off": 예전에 적었던 값이 아래로 뜨지 않게 한다. */}
              <Input
                id="fam-name"
                value={familyName}
                onChange={(e) => setFamilyName(e.target.value)}
                placeholder="우리집"
                className="h-12 rounded-[13px] text-[15.5px]"
                autoComplete="off"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              {/* 왜 묻는지가 없으면 본명을 적는다. 그 힌트를 플레이스홀더가 혼자 지고
                  있었는데, 한 글자만 적어도 사라지는 자리다. */}
              <div className="flex items-baseline gap-1.5">
                <Label htmlFor="fam-my-name" className="text-[14px] font-semibold">내 이름</Label>
                <span className="text-[12.5px] font-medium text-muted-foreground">가족에게 이렇게 보여요</span>
              </div>
              <Input
                id="fam-my-name"
                value={memberName}
                onChange={(e) => setMemberName(e.target.value)}
                placeholder="아빠, 엄마, 아들, 딸"
                className="h-12 rounded-[13px] text-[15.5px]"
                autoComplete="off"
                required
              />
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button
            type="submit"
            size="lg"
            className="h-[52px] w-full rounded-[13px] text-[15.5px] font-bold"
            disabled={submitting}
          >
            {submitting ? '만드는 중…' : '만들기'}
          </Button>
        </form>
      ) : (
        <form onSubmit={handleJoin} className="flex flex-col gap-4">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fam-code" className="text-[14px] font-semibold">초대 코드</Label>
              <Input
                id="fam-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="6자리 코드"
                className="h-12 rounded-[13px] text-[15.5px] tracking-[0.2em] uppercase"
                maxLength={6}
                autoComplete="off"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-baseline gap-1.5">
                <Label htmlFor="fam-join-name" className="text-[14px] font-semibold">내 이름</Label>
                <span className="text-[12.5px] font-medium text-muted-foreground">가족에게 이렇게 보여요</span>
              </div>
              <Input
                id="fam-join-name"
                value={memberName}
                onChange={(e) => setMemberName(e.target.value)}
                placeholder="아빠, 엄마, 아들, 딸"
                className="h-12 rounded-[13px] text-[15.5px]"
                autoComplete="off"
                required
              />
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button
            type="submit"
            size="lg"
            className="h-[52px] w-full rounded-[13px] text-[15.5px] font-bold"
            disabled={submitting}
          >
            {submitting ? '참여하는 중…' : '참여하기'}
          </Button>
        </form>
      )}
      </div>
    </div>
  );
}
