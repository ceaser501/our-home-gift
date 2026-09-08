import { useState } from "react";
import { Check, Clock, Plus } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ACTION_ROW, ACTION_PRIMARY, ACTION_CANCEL } from "../utils/sheetUi";
import { useFamily } from "../FamilyContext";
import { createFamily, requestJoinFamily } from "../family";
import { forgetInviteCode } from "../utils/inviteLink";
import { cn } from "@/lib/utils";
import useBackClose from "../utils/useBackClose";

// 보는 가족을 바꾸는 창. 한 사람이 여러 가족에 속할 수 있어서(연인끼리 하나, 부모님과 하나)
// 여기서 오가며 본다.
//
// 새 가족을 만들거나 초대 코드로 들어가는 것도 이 창 안에서 화면만 바꿔 처리한다.
// 창을 하나 더 띄우면 목록 위에 창이 두 겹 쌓여서, 어디까지 닫아야 하는지 헷갈린다.
export default function FamilySwitcherSheet({ onClose, initialCode = "" }) {
  // 뒤로가기로 이 창을 닫는다. 안 그러면 설치해서 쓸 때 앱이 통째로 꺼진다.
  useBackClose(onClose);
  const { families, family, members, user, switchFamily } = useFamily();
  const myName = members.find((m) => m.user_id === user.id)?.display_name || "";

  // 초대 링크를 눌러 온 사람에게는 참여 칸을 이미 열어 코드까지 채워서 보여준다.
  // 그러라고 링크를 만든 것이다 — 목록을 보여주고 '가족 추가하기'를 찾게 하면 걸음이
  // 도로 늘어난다.
  const [mode, setMode] = useState(initialCode ? "join" : "list"); // list | create | join
  // 빈 칸으로 시작한다.
  //
  // 예전에는 가족 이름에 '우리집', 내 이름에 지금 쓰는 이름을 미리 넣어뒀다. 새 가족을
  // 만드는 화면인데 이미 쓰고 있는 가족의 값이 적혀 있으면, 그대로 눌러 똑같은 이름의
  // 가족이 하나 더 생긴다. 무엇을 적어야 하는지는 아래 예시(placeholder)가 말한다.
  const [familyName, setFamilyName] = useState("");
  const [memberName, setMemberName] = useState("");
  const [code, setCode] = useState(initialCode);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [pendingFor, setPendingFor] = useState(null);

  async function pick(id) {
    if (id === family.id) {
      onClose();
      return;
    }
    await switchFamily(id);
    onClose();
  }

  async function submit(e) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      if (mode === "create") {
        const created = await createFamily(
          familyName.trim(),
          memberName.trim(),
        );
        await switchFamily(created.id);
        onClose();
        return;
      }

      // 초대 코드가 맞아도 바로 들어가지지 않는다. 기존 구성원이 승인해야 한다.
      const result = await requestJoinFamily(code.trim(), memberName.trim());
      // 링크로 들고 온 코드는 다 썼다. 남겨두면 다음에 앱을 열 때 또 이 창이 열린다.
      forgetInviteCode();
      if (result.status === "joined") {
        await switchFamily(result.family_id);
        onClose();
        return;
      }
      setPendingFor(result.family_name);
      setSubmitting(false);
    } catch (err) {
      setError(
        err.message ||
          (mode === "create"
            ? "가족을 만들지 못했어요."
            : "초대 코드로 참여하지 못했어요."),
      );
      setSubmitting(false);
    }
  }

  const title = pendingFor
    ? "승인을 기다리는 중"
    : mode === "create"
      ? "새 가족 만들기"
      : mode === "join"
        ? "초대 코드로 참여"
        : "어떤 가족을 볼까요?";

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="max-h-[calc(92dvh/var(--ui-scale))] gap-0 overflow-y-auto pb-[var(--safe-bottom)]">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {/* 제목을 보태는 설명이라 부제 자리다. 본문 <p> 로 놓여 있었는데, 그러면
              제목과 헤더 여백(20)만큼 벌어져 딴 이야기처럼 읽힌다.
              「보고 싶은 가족을 고르세요」는 걷었다 — 제목이 이미 묻고 있다.
              고르는 화면에서만 쓴다. 만들기·참여·승인 대기 화면은 제 할 말이 따로 있다. */}
          {!pendingFor && mode === "list" && (
            <SheetDescription className="break-keep">
              기프티콘은 가족마다 따로 모여요.
            </SheetDescription>
          )}
        </SheetHeader>

        {pendingFor ? (
          <div className="flex flex-col items-center gap-3 px-8 py-8 text-center">
            <Clock className="size-7 text-primary" />
            <p className="m-0 text-callout font-semibold text-foreground">
              '{pendingFor}'에 참여를 신청했어요
            </p>
            <p className="m-0 text-body leading-relaxed break-keep text-muted-foreground">
              그 가족의 구성원이 승인하면 목록에 나타나요. 초대 코드를 알려준
              분에게 확인해달라고 말씀해주세요.
            </p>
            <Button className="mt-1 w-full rounded-xl" onClick={onClose}>
              알겠어요
            </Button>
          </div>
        ) : mode === "list" ? (
          <>
            {/* 가족마다 눌리는 면을 준다. 예전에는 글자 색만 다른 두 줄이라 목록으로 안
                보였다 — 이 창의 목적이 고르는 것인데, 무엇을 누르는지가 안 보였다.

                줄이 담던 것을 셋으로 줄였다. 걷어낸 것과 까닭은 이렇다.
                — 집 아이콘: 셋이 다 같아서 구별에 도움이 안 되고 이름을 밀어냈다.
                — '눌러서 바꾸기': 이 창은 고르는 창이라 모든 줄이 눌린다.
                — '지금 보는 중': 보라 테두리와 ✓ 가 이미 말한다.
                — › : 기호는 ✓ 하나로 모은다. 고른 것과 안 고른 것에 다른 기호를 쓰면
                  둘이 다른 종류로 보인다. 필터바도 ✓ 만 쓴다. */}
            <ul className="m-0 flex list-none flex-col gap-2 p-0 px-5">
              {families.map((item) => {
                const isCurrent = item.id === family.id;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => pick(item.id)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-2xl p-3.5 text-left transition-colors",
                        isCurrent
                          ? "border-[1.5px] border-primary bg-primary/4"
                          : "border border-border bg-card",
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate text-callout font-semibold text-foreground">
                        {item.name}
                      </span>
                      {isCurrent && (
                        <Check
                          className="size-5 shrink-0 text-primary"
                          strokeWidth={2.6}
                        />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>

            {/* 위 목록은 고르는 자리이고 여기는 만드는 자리다. 「가족 추가하기」라는
                제목을 두었었는데 걷었다 — 버튼 둘이 「새로 만들기」·「초대 코드로 참여」라
                무엇을 하는지 스스로 말한다.

                가른 것은 여백이다. 가족끼리는 8, 추가하기 앞은 16. 선도 점선도 안 들인다.
                가로로 놓는 것도 가르는 일을 한다 — 세로로 쌓으면 「가족 다섯 중 하나」처럼
                읽히는데, 나란히 두면 「가족 셋」과 「추가하는 두 길」로 갈린다.

                둘을 하나로 묶을까 보았는데 두었다. 만들기는 바로 들어가고 참여는 승인을
                기다린다 — 결과가 다르다. 첫 칸도 다르다(내가 짓는 이름 / 남이 준 코드).
                게다가 초대 링크를 타고 오면 목록을 건너뛰고 곧장 참여 화면이 열리는데,
                묶으면 그 지름길이 한 걸음 는다.

                가족과 같은 카드 꼴이되 + 를 달고 글자를 회색으로 낮춰 「가족이 아니라
                만드는 것」이라고 말한다. */}
            <div className="mt-4 flex gap-2 px-5">
              {[
                {
                  label: "새로 만들기",
                  to: "create",
                },
                {
                  label: "초대 코드로 참여",
                  to: "join",
                },
              ].map((it) => (
                <button
                  key={it.to}
                  type="button"
                  onClick={() => {
                    setError("");
                    // 반대쪽에서 적다 만 값이 남아 있지 않게 한다.
                    setFamilyName("");
                    setCode("");
                    setMemberName("");
                    setMode(it.to);
                  }}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl border border-border bg-card p-3.5 text-callout font-semibold text-muted-foreground transition-colors"
                >
                  {/* 아이콘까지 한 덩어리로 가운데를 맞추면 눈이 내용으로 읽는 글자가
                      가운데선 오른쪽에 놓여 버튼이 쏠려 보인다. 아이콘을 5 당겨 글자를
                      가운데 쪽으로 돌려준다 — 절반쯤은 justify-center 가 도로 밀어내므로
                      11.5 를 당겨도 5.8 밖에 안 준다. 눈으로 견줘 고른 값이다. */}
                  <Plus
                    className="-ml-[5px] size-4.5 shrink-0"
                    strokeWidth={2.2}
                  />
                  {it.label}
                </button>
              ))}
            </div>
          </>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3 px-5 pt-2">
            {mode === "create" ? (
              <div className="flex flex-col gap-2.5">
                <Label htmlFor="switch-fam-name">가족 이름</Label>
                {/* autoComplete="off": 예전에 적었던 값이 아래로 뜨지 않게 한다. */}
                <Input
                  id="switch-fam-name"
                  className="h-13 rounded-lg px-4 text-callout"
                  value={familyName}
                  onChange={(e) => setFamilyName(e.target.value)}
                  placeholder="우리집"
                  maxLength={20}
                  autoComplete="off"
                  autoFocus
                  required
                />
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                <Label htmlFor="switch-fam-code">초대 코드</Label>
                <Input
                  id="switch-fam-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="6자리 코드"
                  /* 고정폭 글꼴과 넓은 자간은 값이 들어온 뒤에만 쓴다. 빈 칸에 미리 걸면
                     예시 문구가 이미 적힌 코드처럼 보인다. */
                  className={cn(
                    "h-13 rounded-lg px-4 text-callout",
                    "uppercase",
                    code && "font-mono tracking-code",
                  )}
                  maxLength={6}
                  autoComplete="off"
                  autoFocus
                  required
                />
              </div>
            )}

            <div className="flex flex-col gap-2.5">
              <Label htmlFor="switch-my-name">이 가족에서 쓸 내 이름</Label>
              <Input
                id="switch-my-name"
                className="h-13 rounded-lg px-4 text-callout"
                value={memberName}
                onChange={(e) => setMemberName(e.target.value)}
                placeholder=""
                maxLength={20}
                autoComplete="off"
                required
              />
            </div>

            {error && <p className="m-0 text-body text-destructive">{error}</p>}

            {/* 이 화면만 기본값(40)을 쓰고 있었다 — 칸도 버튼도. 다른 시트는 52 다.
                취소·확정 짝은 ACTION_ROW 가 맡는다. 주 버튼이 오른쪽에 오도록
                row-reverse 를 쓰므로 DOM 에서는 확정이 먼저다. */}
            <div className={cn(ACTION_ROW, "pt-1")}>
              <Button
                type="submit"
                size="xl"
                className={ACTION_PRIMARY}
                disabled={submitting}
              >
                {submitting
                  ? "잠시만요…"
                  : mode === "create"
                    ? "만들기"
                    : "참여하기"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="xl"
                className={ACTION_CANCEL}
                onClick={() => setMode("list")}
              >
                뒤로
              </Button>
            </div>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}
