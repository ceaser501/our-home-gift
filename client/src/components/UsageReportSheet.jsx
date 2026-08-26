import { useEffect, useMemo, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import FamilyReport from './FamilyReport';
import { listGifticonStats, listUsageHistory } from '../api';
import { useFamily } from '../FamilyContext';
import { formatDateShortYear } from '../utils/date';
import { memberTagColorClass, nameTagColorClass, OWNER_TAG_PALETTE } from '../utils/tagColor';
import useBackClose from '../utils/useBackClose';

function formatAmount(amount) {
  return amount ? `${Number(amount).toLocaleString('ko-KR')}원` : '';
}

// 연·월·일에서 월·일만. 제목 아래에 연도가 이미 적혀 있다.
function formatMonthDay(iso) {
  const short = formatDateShortYear(iso); // 26.08.22
  return short ? short.slice(3) : '';
}

export default function UsageReportSheet({ onClose }) {
  // 뒤로가기로 이 창을 닫는다. 안 그러면 설치해서 쓸 때 앱이 통째로 꺼진다.
  useBackClose(onClose);
  const { family, members } = useFamily();
  const [rows, setRows] = useState([]);
  const [all, setAll] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    // 결산은 안 쓴 것과 지나간 것까지 봐야 해서 따로 받아온다. 결산을 못 불러와도
    // 사용 내역은 보여야 하므로 실패는 여기서 삼킨다.
    listGifticonStats(family.id)
      .then((data) => {
        if (!cancelled) setAll(data);
      })
      .catch(() => {});

    listUsageHistory(family.id)
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || '사용 내역을 불러오지 못했어요.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [family.id]);

  // 사람 이름 → 이름표 색. 가족에 있는 사람은 정해진 색을, 나간 사람은 이름에서 뽑은
  // 색을 쓴다(utils/tagColor). 목록의 점 색과 같아야 위아래가 이어진다.
  function colorOf(name) {
    const member = members.find((m) => m.display_name === name);
    return memberTagColorClass(member) ?? nameTagColorClass(name) ?? OWNER_TAG_PALETTE[0];
  }

  // 사람별로 몇 개, 얼마어치를 썼는지. 막대 길이는 가장 많이 쓴 사람을 100으로 잡는다 —
  // 전체 합으로 나누면 사람이 넷일 때 다 같이 짧아져서 서로 견주기가 어렵다.
  const summary = useMemo(() => {
    const byPerson = new Map();
    for (const row of rows) {
      const who = row.used_by_name || row.owner || '알 수 없음';
      const current = byPerson.get(who) || { count: 0, amount: 0 };
      byPerson.set(who, { count: current.count + 1, amount: current.amount + (row.amount || 0) });
    }
    const list = [...byPerson.entries()].sort((a, b) => b[1].count - a[1].count);
    const top = list[0]?.[1].count || 1;
    return list.map(([name, stat]) => ({ name, ...stat, ratio: (stat.count / top) * 100 }));
  }, [rows]);

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="max-h-[92dvh] gap-0 overflow-y-auto pb-[var(--safe-bottom)]">
        <SheetHeader className="gap-0 px-[18px] pr-14 pb-3">
          <SheetTitle className="text-[19px] font-bold tracking-[-0.026em]">사용 내역</SheetTitle>
          <p className="m-0 text-[13px] font-medium text-muted-foreground">{family.name}</p>
        </SheetHeader>

        {/* 결산이 먼저다. 목록은 "무엇을 썼나"를 하나씩 보는 자리이고, 결산은 그걸
            한눈에 요약해준다. 요약을 보고 나서 자세히 보는 순서가 자연스럽다. */}
        <div className="px-[18px] pb-3.5">
          <FamilyReport gifticons={all} />
        </div>

        <div className="flex flex-col px-[18px]">
          {loading && <p className="py-8 text-center text-sm font-medium text-muted-foreground">불러오는 중…</p>}
          {!loading && error && <p className="py-8 text-center text-sm text-destructive">{error}</p>}
          {!loading && !error && rows.length === 0 && (
            <p className="py-8 text-center text-sm font-medium text-muted-foreground">
              아직 사용 완료한 기프티콘이 없어요.
            </p>
          )}

          {!loading && !error && rows.length > 0 && (
            <>
              {/* 칩이 모두 같은 보라이던 자리다. 그러면 누가 많이 썼는지를 색으로 알 수
                  없고 숫자를 하나씩 읽어야 한다. 이름표 색으로 막대를 그리면 길이로
                  한눈에 보이고, 아래 목록의 점 색과도 이어진다. */}
              <p className="m-0 pb-2 text-[14.5px] font-bold tracking-[-0.015em]">누가 썼나요</p>
              <div className="flex flex-col gap-2 pb-4">
                {summary.map((person) => (
                  <div key={person.name} className="flex items-center gap-2.5">
                    <span
                      className={`flex size-[34px] shrink-0 items-center justify-center rounded-full text-[11.5px] font-bold text-white ${colorOf(person.name)}`}
                    >
                      {person.name.slice(0, 3)}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex items-baseline justify-between gap-2.5">
                        <span className="truncate text-[14.5px] font-semibold text-foreground">{person.name}</span>
                        <span className="shrink-0 text-[13.5px] tabular-nums text-foreground/80">
                          <b className="font-bold">{person.count}개</b>
                          {person.amount > 0 && ` · ${formatAmount(person.amount)}`}
                        </span>
                      </div>
                      <div className="h-[7px] overflow-hidden rounded-[4px] bg-secondary">
                        <div className={`h-full ${colorOf(person.name)}`} style={{ width: `${person.ratio}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-baseline gap-[7px] pt-1">
                <p className="m-0 text-[14.5px] font-bold tracking-[-0.015em]">사용한 기프티콘</p>
                <p className="m-0 text-[13px] font-semibold tabular-nums text-muted-foreground">{rows.length}개</p>
              </div>

              {/* 목록에는 회색 배경을 깔지 않는다. 위 결산 카드가 이미 회색 면이라,
                  여기도 회색이면 회색 두 종류가 겹쳐 어느 쪽이 묶음인지 흐려진다.
                  화면에서 회색 면은 결산 하나로 두고 목록은 구분선으로 나눈다. */}
              <ul className="m-0 flex list-none flex-col p-0 pt-1.5">
                {rows.map((row) => {
                  const who = row.used_by_name || row.owner || '알 수 없음';
                  return (
                    <li
                      key={row.id}
                      className="flex items-center gap-[11px] border-b border-border/40 px-0.5 py-[11px] last:border-b-0"
                    >
                      <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-accent">
                        {row.thumb_url && <img src={row.thumb_url} alt="" className="size-full object-cover" />}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-[15px] font-semibold tracking-[-0.015em] text-foreground">
                          {row.name}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${colorOf(who)}`} />
                          <span className="truncate text-[13px] font-medium tabular-nums text-muted-foreground">
                            {who} · {formatMonthDay(row.used_at || row.updated_at)}
                          </span>
                        </span>
                      </span>
                      {row.amount > 0 && (
                        <span className="shrink-0 text-[15px] font-bold tabular-nums text-foreground/80">
                          {formatAmount(row.amount)}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
