import { useMemo } from 'react';
import { todayStr } from '../utils/date';

// 사용 내역 위에 얹는 결산. 핵심은 마지막 줄 하나다 — "못 쓰고 지나간 것이 얼마어치".
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
    const missedAmount = missed.reduce((sum, g) => sum + (g.amount || 0), 0);

    return {
      scope,
      received: pool.length,
      used: used.length,
      missed: missed.length,
      missedAmount,
      // 아직 쓸 수 있는 것. 띠에서 나머지 자리를 채운다.
      left: Math.max(0, pool.length - used.length - missed.length),
    };
  }, [gifticons]);

  if (stat.received === 0) return null;

  const pct = (n) => (n / stat.received) * 100;

  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3.5">
      <p className="m-0 text-xs font-semibold text-muted-foreground">{stat.scope} 우리 가족</p>

      {/* 셋을 폭에 고르게 나눠 놓는다. 왼쪽에 몰아두면 숫자가 한 자리일 때 오른쪽이
          휑하게 비어서 덩그러니 놓인 것처럼 보인다. 가운데 선으로 칸을 나눠 세 값이
          한 묶음이라는 것도 같이 말해준다. */}
      <div className="mt-2.5 flex">
        <span className="flex flex-1 flex-col items-center">
          <span className="text-xl font-bold text-foreground">{stat.received}</span>
          <span className="text-[11px] text-muted-foreground">받은 것</span>
        </span>
        <span className="flex flex-1 flex-col items-center border-l border-border">
          <span className="text-xl font-bold text-success">{stat.used}</span>
          <span className="text-[11px] text-muted-foreground">쓴 것</span>
        </span>
        <span className="flex flex-1 flex-col items-center border-l border-border">
          <span className={stat.missed > 0 ? 'text-xl font-bold text-destructive' : 'text-xl font-bold text-muted-foreground'}>
            {stat.missed}
          </span>
          <span className="text-[11px] text-muted-foreground">놓친 것</span>
        </span>
      </div>

      {/* 비율 띠. 쓴 것(초록) · 아직 쓸 수 있는 것(회색) · 놓친 것(빨강) 순으로 잇는다. */}
      <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-secondary" aria-hidden="true">
        <span className="bg-success" style={{ width: `${pct(stat.used)}%` }} />
        <span className="bg-border" style={{ width: `${pct(stat.left)}%` }} />
        <span className="bg-destructive" style={{ width: `${pct(stat.missed)}%` }} />
      </div>

      {/* 금액은 숫자 칸에 끼워 넣지 않고 이 문장 안에서 말한다. 건수 셋과 나란히 두면
          어느 게 개수고 어느 게 돈인지 헷갈리고, 칸도 좁아 자리가 안 난다.
          손실을 보여주면서 동시에 고칠 길을 연다 — 쓰고 표시만 안 한 것이 여기 섞이는데,
          그 사실을 감추면 사용자는 숫자를 믿지 않게 된다. */}
      {stat.missed > 0 ? (
        <p className="m-0 mt-2.5 text-[11px] leading-relaxed break-keep text-muted-foreground">
          {stat.missedAmount > 0 && (
            <>
              놓친 기프티콘이 <b className="font-semibold text-destructive">{formatWon(stat.missedAmount)}</b>어치예요.{' '}
            </>
          )}
          기한이 지났는데 사용완료로 표시되지 않은 것들이에요. 이미 쓰셨다면 목록에서 사용완료로 바꿔주세요.
        </p>
      ) : (
        <p className="m-0 mt-2.5 text-[11px] text-muted-foreground">기한을 넘긴 기프티콘이 없어요.</p>
      )}
    </div>
  );
}
