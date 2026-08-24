// 바코드 번호를 사람에게 보여주고 되돌려 받는 규칙.
//
// 화면과 저장값이 다르다는 것이 이 파일의 전부다. 저장값은 리더기가 읽을 값이고, 화면은
// 사람이 부르고 고칠 값이다. 둘을 같은 것으로 두면 한쪽이 반드시 망가진다.

// 사람에게 불러줄 번호.
//
// QR에는 값만 들어 있지 않다. 편의점 쿠폰은 이런 모양이다 — IX;1;9816401685019;;
// 그림을 다시 그릴 때는 이 껍데기까지 그대로여야 리더기가 원본과 같게 읽는다. 그런데
// 점원이 "번호 불러주세요" 할 때 읽어야 하는 것은 그 안의 9816401685019다.
//
// 숫자 덩어리가 하나일 때만 벗긴다. 둘 이상이면 어느 쪽이 번호인지 알 수 없어서
// 원래 값을 그대로 보여준다 — 잘못된 번호를 자신 있게 보여주는 것이 제일 나쁘다.
export function readableCode(code) {
  const value = String(code || '');
  if (!value || /^[0-9]+$/.test(value)) return value;
  const runs = value.match(/[0-9]{6,}/g);
  return runs && runs.length === 1 ? runs[0] : value;
}

// 네 자리씩 띄운다. 열세 자리를 한 덩어리로 보면 불러주다가 자리를 잃는다.
// 숫자만 있을 때만 끊는다 — 글자가 섞인 값은 어디가 자리인지 알 수 없다.
//
// 마지막 한 자리가 홀로 남으면 앞 묶음에 붙인다. 열세 자리를 4씩 끊으면 '9816 4016 8501 9'가
// 되는데, 끝에 뜬 '9'는 불러줄 때 앞자리를 빼먹은 것처럼 들린다. '9816 4016 85019'로 둔다.
export function groupDigits(code) {
  const value = String(code || '');
  if (!/^[0-9]+$/.test(value)) return value;
  const groups = value.match(/\d{1,4}/g) || [];
  if (groups.length > 1 && groups.at(-1).length === 1) {
    groups[groups.length - 2] += groups.pop();
  }
  return groups.join(' ');
}

// 사람이 고친 번호를 원래 껍데기에 도로 끼워 넣는다.
//
// 등록 창에는 숫자만 보여준다(readableCode). 그런데 저장은 원래 값 그대로여야 한다 —
// QR을 그 값으로 다시 그리기 때문에, IX;1;9816401685019;; 에서 앞뒤를 잃으면 매장
// 리더기가 원본과 다르게 읽는다. 그래서 앞뒤를 기억해뒀다가 새 숫자를 그 사이에 넣는다.
//
// 다 지우면 껍데기도 같이 지운다. 빈 번호에 껍데기만 남으면 그건 번호가 아니다.
export function wrapCode(previous, typed) {
  if (!typed) return '';
  const raw = String(previous || '');
  const inner = readableCode(raw);
  if (!inner || inner === raw) return typed;

  const at = raw.indexOf(inner);
  if (at < 0) return typed;
  return raw.slice(0, at) + typed + raw.slice(at + inner.length);
}
