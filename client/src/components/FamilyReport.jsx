import { useMemo } from 'react';
import { todayStr } from '../utils/date';

// 사용 내역 위에 얹는 결산. 핵심은 오른쪽 위 하나다 — "못 쓰고 지나간 것이 얼마어치".
// 건수만 세면 남의 일처럼 보이는데, 금액으로 적으면 다음부터 챙기게 된다.
//
// 그래프는 막대 하나로 끝낸다. 월별 추이 같은 것을 넣으면 정확해지기는 해도 이 화면이
// 통계 화면이 되어버린다. 여기서 알고 싶은 건 "우리가 받은 것 중 얼마나 놓쳤나"라는
// 비율 하나라, 한 줄짜리 띠가 그걸 가장 빨리 말해준다.

function formatWon(amount) {
  return `${Number(amount).toLocaleString('ko-KR')}원`;
}

export default function FamilyReport({ gifticons }) {
  const stat = useMemo(() => {
    const year = new Date().getFullYear();
    const inThisYear = (row) => row.created_at && new Date(row.created_at).getFullYear() === year;

    // 기본은 올해. 다만 해가 막 바뀌었을 때는 올해 것이 거의 없어서 결산이 텅 비어 보인다.
    // 그럴 때는 전체 기간으로 바꿔 보여주고, 무엇을 세고 있는지 이름표로 밝힌다.
    const thisYear = gifticons.filter(inThisYear);
    const pool = thisYear.length > 0 ? thisYear : gifticons;
    const scope = thisYear.length > 0 ? `${year}년` : '전체 기간';

    const today = todayStr();
    const used = pool.filter((g) => g.status === 'used');
    // 안 쓴 채로 기한이 지난 것. 쓰고도 표시를 안 한 것이 여기 섞이는데, 그건 아래
    // 안내에서 밝히고 목록에서 고칠 수 있게 한다.
    const missed = pool.filter((g) => g.status !== 'used' && g.expires_at && g.expires_at < today);
    // 금액권은 이미 쓴 만큼을 뺀 잔액만 손실이다. 3만원권으로 2만원을 쓰고 남은 1만원을
    // 못 썼다면 잃은 건 1만원이지 3만원이 아니다.
    const missedAmount = missed.reduce((sum, g) => {
      const face = Number(g.amount || 0);
      return sum + (g.is_voucher ? Math.max(0, face - Number(g.spent_amount || 0)) : face);
    }, 0);

    return {
      scope,
      received: pool.length,
      used: used.length,
      missed: missed.length,
      // 아직 쓸 수 있는 것. 띠의 회색 자리이자 범례의 마지막 값이다.
      left: pool.length - used.length - missed.length,
      missedAmount,
    };
  }, [gifticons]);

  if (stat.received === 0) return null;

  const pct = (n) => (n / stat.received) * 100;

  return (
    <div className="flex flex-col gap-3 rounded-[14px] bg-secondary p-[15px]">
      {/* 왼쪽은 "몇 개 중 몇 개를 썼나", 오른쪽은 "얼마를 놓쳤나".
          숫자 셋을 나란히 세던 자리인데, 셋 다 같은 크기면 무엇을 봐야 하는지가 없다.
          쓴 개수 하나를 크게 두고 놓친 금액을 맞은편에 붙이면 둘만 읽어도 끝난다. */}
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-[3px]">
          <p className="m-0 text-[13px] font-semibold tracking-[-0.01em] text-muted-foreground">
            {stat.scope} 받은 기프티콘 {stat.received}개 중
          </p>
          <p className="m-0 flex items-baseline gap-[5px]">
            <span className="text-[27px] leading-none font-bold tracking-[-0.025em] tabular-nums text-foreground">
              {stat.used}개
            </span>
            <span className="text-[15px] font-semibold text-foreground/80">썼어요</span>
          </p>
        </div>

        {stat.missedAmount > 0 && (
          <div className="flex shrink-0 flex-col items-end gap-0.5">
            <p className="m-0 text-xs font-semibold text-muted-foreground">놓친 금액</p>
            <p className="m-0 text-[16.5px] font-bold tracking-[-0.01em] tabular-nums text-destructive">
              {formatWon(stat.missedAmount)}
            </p>
          </div>
        )}
      </div>

      {/* 띠 전체가 "받은 것"이고, 그 위에 끝난 것부터 왼쪽으로 채운다 —
          쓴 것(초록) · 놓친 것(빨강). 남은 회색 자리가 "아직 쓸 수 있는 것"이다.
          결판난 둘을 붙여놓아야 초록이 어디서 끝나고 빨강이 어디서 시작하는지 한눈에
          보인다. 사이에 회색을 끼우면 초록과 빨강이 떨어져서 비교가 안 된다. */}
      <div className="flex h-[9px] w-full overflow-hidden rounded-[5px] bg-border" aria-hidden="true">
        <span className="bg-success" style={{ width: `${pct(stat.used)}%` }} />
        <span className="bg-destructive" style={{ width: `${pct(stat.missed)}%` }} />
      </div>

      {/* 범례 순서를 막대에 맞춘다. 막대는 쓴 것 → 놓친 것 → 남은 것 순으로 그려지는데
          범례가 다른 순서면 눈이 색을 두 번 찾는다. 막대 쪽을 바꾸면 초록과 빨강이 떨어져
          "이미 끝난 것"이라는 덩어리가 깨지므로, 범례를 막대에 맞추는 쪽이 맞다. */}
      <div className="flex items-center justify-between gap-2">
        {[
          { key: 'used', dot: 'bg-success', label: '쓴 것', value: stat.used },
          { key: 'missed', dot: 'bg-destructive', label: '놓친 것', value: stat.missed },
          { key: 'left', dot: 'bg-border', label: '남은 것', value: stat.left },
        ].map(({ key, dot, label, value }) => (
          <span key={key} className="flex items-center gap-[5px]">
            <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${dot}`} />
            <span className="text-[12.5px] font-medium text-foreground/80">
              {label} {value}
            </span>
          </span>
        ))}
      </div>

      {/* 손실을 보여주면서 동시에 고칠 길을 연다 — 쓰고 표시만 안 한 것이 여기 섞이는데,
          그 사실을 감추면 사용자는 숫자를 믿지 않게 된다. */}
      {stat.missed > 0 && (
        <p className="m-0 text-[12.5px] leading-relaxed font-medium break-keep text-muted-foreground">
          기한이 지났는데 사용완료로 표시되지 않은 것들이에요. 이미 쓰셨다면 목록에서 사용완료로 바꿔주세요.
        </p>
      )}
    </div>
  );
}
