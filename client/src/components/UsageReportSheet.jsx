import { useEffect, useMemo, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { listUsageHistory } from '../api';
import { useFamily } from '../FamilyContext';
import { formatDate } from '../utils/date';

function formatAmount(amount) {
  return amount ? `${Number(amount).toLocaleString('ko-KR')}원` : '';
}

export default function UsageReportSheet({ onClose }) {
  const { family } = useFamily();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
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

  // 사람별로 몇 건, 얼마어치를 썼는지 위에 요약해서 보여준다.
  const summary = useMemo(() => {
    const byPerson = new Map();
    for (const row of rows) {
      const who = row.used_by_name || row.owner || '알 수 없음';
      const current = byPerson.get(who) || { count: 0, amount: 0 };
      byPerson.set(who, { count: current.count + 1, amount: current.amount + (row.amount || 0) });
    }
    return [...byPerson.entries()].sort((a, b) => b[1].count - a[1].count);
  }, [rows]);

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="max-h-[92dvh] gap-0 overflow-y-auto pb-[max(24px,env(safe-area-inset-bottom))]">
        <SheetHeader className="pr-14 pb-1">
          <SheetTitle>사용 내역</SheetTitle>
        </SheetHeader>
        <p className="m-0 px-5 pb-1 text-xs text-muted-foreground">
          {family.name} 구성원이 사용 완료로 표시한 기프티콘이 모두 보여요.
        </p>

        <div className="flex flex-col gap-3 px-5 pt-2">
          {loading && <p className="py-8 text-center text-sm text-muted-foreground">불러오는 중…</p>}
          {!loading && error && <p className="py-8 text-center text-sm text-destructive">{error}</p>}
          {!loading && !error && rows.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">아직 사용 완료한 기프티콘이 없어요.</p>
          )}

          {!loading && !error && rows.length > 0 && (
            <>
              <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
                {summary.map(([who, stat]) => (
                  <li key={who} className="rounded-full bg-accent px-3 py-1.5 text-xs text-accent-foreground">
                    <span className="font-semibold">{who}</span> {stat.count}건
                    {stat.amount > 0 && ` · ${formatAmount(stat.amount)}`}
                  </li>
                ))}
              </ul>

              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {rows.map((row) => (
                  <li key={row.id} className="flex items-center gap-3 border-b border-border py-2.5 last:border-b-0">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-semibold text-foreground">{row.name}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {[row.brand, formatAmount(row.amount)].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end">
                      <span className="text-xs font-semibold text-foreground">
                        {row.used_by_name || row.owner || '알 수 없음'}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {row.used_at ? formatDate(row.used_at) : formatDate(row.updated_at)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
