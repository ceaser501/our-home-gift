import { useEffect, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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

// 목록을 처음에 몇 줄까지 펼쳐 둘까. 다섯 줄이면 결산 카드와 '누가 썼나요' 아래로
// 화면 한 장이 대충 찬다. 그 뒤는 남은 개수를 적은 버튼 하나로 넘긴다 — 스무 건이
// 그대로 이어지면 창을 닫을 자리를 찾느라 한참 내려야 한다.
const FIRST_ROWS = 5;
const ALL = 'all';

export default function UsageReportSheet({ onClose }) {
  // 뒤로가기로 이 창을 닫는다. 안 그러면 설치해서 쓸 때 앱이 통째로 꺼진다.
  useBackClose(onClose);
  const { family, members, user } = useFamily();
  const [rows, setRows] = useState([]);
  const [all, setAll] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // 누구 것만 볼까. 'all'이면 가족 전체다.
  const [who, setWho] = useState(ALL);
  // 남은 것까지 다 펼쳤나.
  const [expanded, setExpanded] = useState(false);

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

  // 내 이름. 사용 내역에는 사람 번호가 없고 이름만 적혀 있어서, 가족 명단에서 찾아 맞춘다.
  const myName = members.find((m) => m.user_id === user.id)?.display_name ?? null;

  // 필터에 올릴 사람들. 가족 명단 순서를 그대로 쓰고, 명단에 없는 이름(나간 사람)이
  // 내역에 있으면 뒤에 붙인다 — 그 사람 기록만 골라 볼 길이 없어지면 안 된다.
  const people = useMemo(() => {
    const names = members.map((m) => m.display_name).filter(Boolean);
    const seen = new Set(names);
    for (const row of rows) {
      const name = row.used_by_name || row.owner || '알 수 없음';
      if (!seen.has(name)) {
        seen.add(name);
        names.push(name);
      }
    }
    return names;
  }, [members, rows]);

  const filtered = useMemo(
    () => (who === ALL ? rows : rows.filter((row) => (row.used_by_name || row.owner || '알 수 없음') === who)),
    [rows, who]
  );
  const visible = expanded ? filtered : filtered.slice(0, FIRST_ROWS);
  const more = filtered.length - visible.length;

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
                        <span className="flex min-w-0 items-baseline gap-1.5">
                          <span className="truncate text-[14.5px] font-semibold text-foreground">{person.name}</span>
                          {/* 이름이 '아들'이면 그게 나인지 동생인지 알 수 없다. 가족 명단
                              화면과 같은 자리에 같은 딱지를 붙인다. */}
                          {person.name === myName && (
                            <span className="shrink-0 rounded-md bg-accent px-1.5 py-px text-[11.5px] font-bold text-accent-foreground">
                              나
                            </span>
                          )}
                        </span>
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

              <div className="flex items-center justify-between gap-2 pt-1">
                <div className="flex items-baseline gap-[7px]">
                  <p className="m-0 text-[14.5px] font-bold tracking-[-0.015em]">사용한 기프티콘</p>
                  <p className="m-0 text-[13px] font-semibold tabular-nums text-muted-foreground">{filtered.length}개</p>
                </div>
                {/* 사람으로 거른다. 가족이 넷이면 내가 쓴 것을 찾는 데만도 스무 줄을
                    지나야 한다. 테두리를 준 이유는 누를 수 있다는 표시가 ▾ 하나뿐이면
                    작아서다 — 이 앱에서 테두리는 조작하는 것에 붙인다. */}
                <Select
                  value={who}
                  onValueChange={(value) => {
                    setWho(value);
                    // 거르고 나면 줄 수가 확 줄어든다. 펼쳐둔 상태를 그대로 두면
                    // 세 줄짜리 목록에 '더 보기'가 남아 있게 된다.
                    setExpanded(false);
                  }}
                >
                  <SelectTrigger
                    aria-label="누가 쓴 것만 볼까요"
                    className="h-9 w-auto shrink-0 gap-1.5 rounded-full px-3.5 text-[13.5px] font-semibold text-foreground/80 shadow-none"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="min-w-36">
                    <SelectItem value={ALL} className="py-2.5 text-[15px]">
                      가족 전체
                    </SelectItem>
                    {people.map((name) => (
                      <SelectItem key={name} value={name} className="py-2.5 text-[15px]">
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {filtered.length === 0 && (
                <p className="py-7 text-center text-sm font-medium text-muted-foreground">
                  {who}님이 쓴 것은 아직 없어요.
                </p>
              )}

              {/* 목록에는 회색 배경을 깔지 않는다. 위 결산 카드가 이미 회색 면이라,
                  여기도 회색이면 회색 두 종류가 겹쳐 어느 쪽이 묶음인지 흐려진다.
                  화면에서 회색 면은 결산 하나로 두고 목록은 구분선으로 나눈다. */}
              <ul className="m-0 flex list-none flex-col p-0 pt-1.5">
                {visible.map((row) => {
                  const usedBy = row.used_by_name || row.owner || '알 수 없음';
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
                          <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${colorOf(usedBy)}`} />
                          <span className="truncate text-[13px] font-medium tabular-nums text-muted-foreground">
                            {usedBy} · {formatMonthDay(row.used_at || row.updated_at)}
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

              {/* 남은 개수를 그대로 적는다. '더 보기'만 있으면 몇 개가 더 있는지 몰라
                  누를지 말지를 못 정한다. 한 번 누르면 나머지가 다 나온다 — 두 번
                  세 번 누르게 하면 끝이 어딘지 모르는 목록이 된다. */}
              {more > 0 && (
                <button
                  type="button"
                  onClick={() => setExpanded(true)}
                  className="mt-2.5 flex h-[46px] w-full items-center justify-center gap-1 rounded-xl border border-input bg-card text-[14.5px] font-semibold text-foreground/80"
                >
                  {more}개 더 보기
                  <ChevronDown className="size-4 text-muted-foreground" />
                </button>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
