import { describe, expect, it, beforeEach } from 'vitest';

// 초대 링크. 여기서 붙들어두는 코드 하나에 흐름 전체가 걸려 있다.
//
// 링크를 눌러 온 사람은 대개 로그인 전이고, 로그인은 카카오·구글 화면을 다녀오는
// 길이라 그 사이에 주소가 통째로 갈린다. 주소에서 꺼내 적어두지 않으면, 돌아왔을 때
// 무엇 때문에 왔는지가 사라진다.

const { catchInviteFromUrl, forgetInviteCode, inviteUrl, pendingInviteCode } = await import(
  '../utils/inviteLink'
);

function goTo(href) {
  window.history.replaceState({}, '', href);
}

beforeEach(() => {
  sessionStorage.clear();
  goTo('/');
});

describe('초대 링크', () => {
  it('주소에 실려 온 코드를 붙들어둔다', () => {
    goTo('/?join=ABC123');

    expect(catchInviteFromUrl()).toBe('ABC123');
    expect(pendingInviteCode()).toBe('ABC123');
  });

  // 남겨두면 새로고침할 때마다 참여 화면이 다시 뜨고, 이미 들어간 가족에 또 신청하려 든다.
  it('꺼낸 뒤에는 주소에서 지운다', () => {
    goTo('/?join=ABC123&other=1');
    catchInviteFromUrl();

    expect(window.location.search).not.toContain('join');
    // 남의 값은 건드리지 않는다.
    expect(window.location.search).toContain('other=1');
  });

  it('초대 코드가 없는 주소에서는 아무것도 안 한다', () => {
    goTo('/?other=1');

    expect(catchInviteFromUrl()).toBeNull();
    expect(pendingInviteCode()).toBe('');
  });

  // 코드는 대문자다. 손으로 적은 링크나 자동 소문자 변환을 거친 링크가 있어서,
  // 받는 쪽에서 한 번 맞춰둔다.
  it('소문자로 와도 대문자로 붙든다', () => {
    goTo('/?join=abc123');
    catchInviteFromUrl();

    expect(pendingInviteCode()).toBe('ABC123');
  });

  it('다 쓰면 놓는다', () => {
    goTo('/?join=ABC123');
    catchInviteFromUrl();
    forgetInviteCode();

    expect(pendingInviteCode()).toBe('');
  });

  // 앱은 화면을 안에 담아 https://localhost/ 로 연다. 그 주소로 링크를 만들면 받는
  // 사람 폰에서는 아무 데도 닿지 않는다.
  it('링크는 늘 웹 주소로 만든다', () => {
    // 지금 있는 주소와 무관하게 같은 값이 나와야 한다.
    expect(inviteUrl('ABC123')).toBe('https://ceaser501.github.io/our-home-gift/?join=ABC123');
    expect(inviteUrl(' abc ')).toContain('abc');
  });
});
