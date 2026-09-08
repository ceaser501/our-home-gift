import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import ExtendSheet from "../components/ExtendSheet";
import { addDays, formatDate, todayStr } from "../utils/date";

// 기한 늘리기 창. 두 화면으로 갈라져 있다.
//
// 갈라둔 이유가 이 파일이 지키는 것이다. 안내와 날짜 바꾸기가 한 화면에 있으면,
// 발행처에 다녀오기도 전에 날짜부터 눌러서 실제로는 안 늘어난 기한이 앱에만 늘어난다.
// '연장했어요'를 눌러야 두 번째로 넘어가고, 거기서만 날짜가 바뀐다.

function gifticonDue(days) {
  return {
    id: "g1",
    name: "썬키스트)애사비제로스파클링500",
    expires_at: addDays(todayStr(), days),
    thumb_image_url: null,
    image_url: null,
  };
}

let onExtend;
let onClose;

beforeEach(() => {
  onExtend = vi.fn(async () => {});
  onClose = vi.fn();
});

describe("기한 늘리기 — 두 화면", () => {
  it("1단계에는 날짜를 바꾸는 것이 아무것도 없다", () => {
    render(
      <ExtendSheet
        gifticon={gifticonDue(1)}
        onExtend={onExtend}
        onClose={onClose}
      />,
    );

    expect(screen.getByText("1 / 2")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /까지로 바꾸기/ })).toBeNull();
    // 날짜 칸 자체가 없어야 한다. 있으면 다녀오기 전에 고칠 수 있다.
    expect(document.querySelector('input[type="date"]')).toBeNull();
  });

  it("'연장했어요'를 눌러야 날짜를 고를 수 있고, 기본은 90일이다", () => {
    const gifticon = gifticonDue(1);
    render(
      <ExtendSheet gifticon={gifticon} onExtend={onExtend} onClose={onClose} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "연장했어요" }));

    expect(screen.getByText("2 / 2")).toBeTruthy();
    const expected = formatDate(addDays(gifticon.expires_at, 90));
    fireEvent.click(
      screen.getByRole("button", { name: `${expected}까지로 바꾸기` }),
    );

    expect(onExtend).toHaveBeenCalledWith(
      gifticon,
      addDays(gifticon.expires_at, 90),
    );
  });

  // 90일이 아닌 날짜를 받아 온 경우. 적은 날짜가 그대로 나가야 한다.
  //
  // 한때 '직접 날짜 선택' 버튼을 눌러야 칸이 생겼다. 이제는 2단계에 들어서면 칸이
  // 이미 있고 90일이 채워져 있다 — 누른 데와 바뀌는 데가 같아야 한다.
  it("날짜를 고쳐 적으면 그대로 저장된다", () => {
    const gifticon = gifticonDue(1);
    render(
      <ExtendSheet gifticon={gifticon} onExtend={onExtend} onClose={onClose} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "연장했어요" }));

    const picked = addDays(gifticon.expires_at, 45);
    fireEvent.change(screen.getByLabelText("새 기한"), {
      target: { value: picked },
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: `${formatDate(picked)}까지로 바꾸기`,
      }),
    );

    expect(onExtend).toHaveBeenCalledWith(gifticon, picked);
  });

  // 만료된 것에 연장을 권하면 헛걸음이다. 대신 환불받는 길을 알려준다.
  it("기한이 지난 것은 단계 없이 환불 안내만 보여준다", () => {
    render(
      <ExtendSheet
        gifticon={gifticonDue(-3)}
        onExtend={onExtend}
        onClose={onClose}
      />,
    );

    expect(screen.getByText(/90% 환불/)).toBeTruthy();
    expect(screen.queryByText("1 / 2")).toBeNull();
    expect(screen.queryByRole("button", { name: "연장했어요" })).toBeNull();
  });

  // 저장을 누르기 직전인데 어느 기프티콘인지가 화면에 없었다. 목록에 카드가 많으면
  // 무엇을 바꾸는지 확인할 데가 없다.
  //
  // 1단계에는 두지 않는다. 그 화면은 아무 것도 바꾸지 않으므로 확인할 것이 없고,
  // 뒤에는 방금 누른 카드가 있다.
  it("상품명은 2단계에만 있다", () => {
    const gifticon = gifticonDue(1);
    render(
      <ExtendSheet gifticon={gifticon} onExtend={onExtend} onClose={onClose} />,
    );

    expect(screen.queryByText(gifticon.name)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "연장했어요" }));
    expect(screen.getByText(gifticon.name)).toBeTruthy();
  });

  // 지나갈 날짜와 새 날짜를 같은 꼴로 적어야 얼마나 늘어나는지 눈으로 견줘진다.
  // 옛 날짜에는 취소선을 긋는다 — 라벨 없이 그것 하나로 '지나간 값'이 말이 된다.
  it("2단계에는 지금 기한이 취소선으로 함께 있다", () => {
    const gifticon = gifticonDue(1);
    render(
      <ExtendSheet gifticon={gifticon} onExtend={onExtend} onClose={onClose} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "연장했어요" }));

    const old = screen.getByText(`${formatDate(gifticon.expires_at)} 까지`);
    expect(old.className).toContain("line-through");
  });
});
