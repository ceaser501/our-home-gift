// 가족 온보딩의 ② 승인 기다림, ③ 만들어짐.
//
// 이 둘은 제출이 끝난 뒤에야 뜨는 화면이다(pendingFor · created 가 지역 상태다).
// 하네스로는 서버를 부르지 않고 열 수가 없어서, 마크업을 그대로 옮겨 세운다.
//
// 복제본이다. 값이 아니라 모양을 보려고 두는 것이고, 원본이 바뀌면 여기도 따라
// 바꿔야 한다. 클래스 이름은 한 글자도 안 고치고 옮겼다 — 고치면 보는 뜻이 없다.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import { Check, Clock } from 'lucide-react';
import { Button } from '../src/components/ui/button';
import CopyButton from '../src/components/CopyButton';
import { PRIMARY_BUTTON } from '../src/utils/sheetUi';

const pendingFor = "'우리집' 가족";
const created = { name: '우리집', invite_code: 'A1B2C3' };

function Pending() {
  return (
    <div className="mx-auto flex min-h-[calc(100dvh/var(--ui-scale))] w-full max-w-[480px] flex-col overflow-y-auto bg-background px-6">
      <div className="my-auto flex flex-col items-center gap-5 py-7">
        <span className="flex size-14 items-center justify-center rounded-full bg-warning/12">
          <Clock className="size-7 text-warning" />
        </span>
        <h1 className="m-0 text-heading font-bold tracking-heading text-foreground">승인을 기다리는 중</h1>
        <p className="m-0 text-center text-body break-keep text-muted-foreground">
          {pendingFor}에 참여를 신청했어요.
        </p>

        <div className="flex w-full flex-col gap-3.5 rounded-lg bg-secondary/60 p-4">
          <div className="flex items-start gap-3">
            <span className="flex size-[26px] shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
              <Check className="size-3.5" strokeWidth={3} />
            </span>
            <p className="m-0 flex-1 text-body text-foreground">신청을 보냈어요</p>
          </div>
          <div className="flex items-start gap-3">
            <span className="size-[26px] shrink-0 rounded-full border-2 border-border bg-card" />
            <div className="flex flex-1 flex-col gap-0.5">
              <p className="m-0 text-body font-semibold text-foreground">가족 구성원이 승인하면 참여돼요</p>
              <p className="m-0 text-footnote text-muted-foreground">코드를 알려준 분에게 말씀해주세요</p>
            </div>
          </div>
        </div>

        <div className="flex w-full flex-col gap-2">
          <Button size="xl" className={PRIMARY_BUTTON}>알겠어요, 나가기</Button>
          <Button variant="outline" size="lg" className="w-full rounded-lg text-muted-foreground">
            다른 코드로 신청하기
          </Button>
        </div>
      </div>
    </div>
  );
}

function Created() {
  return (
    <div className="mx-auto flex min-h-[calc(100dvh/var(--ui-scale))] w-full max-w-[480px] flex-col overflow-y-auto bg-background px-6">
      <div className="my-auto flex flex-col items-center gap-5 py-7">
        <span className="flex size-14 items-center justify-center rounded-full bg-success/12">
          <Check className="size-7 text-success" strokeWidth={2.5} />
        </span>
        <h1 className="m-0 text-center text-heading font-bold tracking-heading break-keep text-foreground">
          {created.name}을 만들었어요
        </h1>
        <div
          className="flex w-full flex-col gap-3 rounded-lg bg-accent px-5 py-5"
        >
          <p className="m-0 text-center text-caption font-semibold text-primary/70">초대 코드</p>
          <p
            className="m-0 text-center font-bold tracking-heading text-foreground"
            style={{ fontSize: CODE_SIZE }}
          >
            {created.invite_code}
          </p>
          <CopyButton
            value={created.invite_code}
            label="코드 복사"
            className="mx-auto h-11 justify-center rounded-lg bg-primary px-5 text-callout font-bold text-primary-foreground"
          />
        </div>
        <Button variant="outline" size="xl" className={PRIMARY_BUTTON}>시작하기</Button>
      </div>
    </div>
  );
}

const params = new URLSearchParams(location.search);
const which = params.get('v') || 'pending';
// 초대 코드 크기를 주소로 바꿔가며 본다. 34 는 지금 값, 28 은 display 눈금이다.
const CODE_SIZE = (params.get('code') || '28') + 'px';


createRoot(document.getElementById('root')).render(
  <StrictMode>{which === 'created' ? <Created /> : <Pending />}</StrictMode>
);
