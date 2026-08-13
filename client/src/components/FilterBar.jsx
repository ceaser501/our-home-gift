import { useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { CATEGORIES, STATUS_TABS } from '../constants';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import useBackClose from '../utils/useBackClose';

// 분류 칩에 붙는 개수. 고른 칩은 배경이 진해서 같은 회색 뱃지를 얹으면 묻히므로,
// 그 위에서는 글자색을 따라가는 반투명 배경을 쓴다.
function CountBadge({ count, selected }) {
  // 0개인 분류에까지 '0'을 달면 눈에 걸리는 숫자만 늘어난다. 비어 있다는 건 칩을 눌러
  // 빈 목록을 보면 알 수 있고, 대개는 누르지도 않는다.
  if (!count) return null;

  return (
    <span
      className={cn(
        'ml-1 rounded-full px-1.5 text-[11px] font-semibold tabular-nums',
        selected ? 'bg-primary-foreground/25 text-primary-foreground' : 'bg-secondary text-foreground/60'
      )}
    >
      {count}
    </span>
  );
}

export default function FilterBar({
  search,
  onSearchChange,
  category,
  onCategoryChange,
  categoryCounts = {},
  totalCount = 0,
  statusTab,
  onStatusTabChange,
}) {
  const [statusOpen, setStatusOpen] = useState(false);
  // 뒤로가기로 이 시트를 닫는다. 훅은 조건부로 부를 수 없어서, 닫혀 있는 동안에는
  // null을 넘겨 아무것도 하지 않게 한다.
  useBackClose(statusOpen ? () => setStatusOpen(false) : null);
  // 사용여부는 한 번 정해두면 잘 안 바꾸는 값이라 한 줄을 통째로 내주지 않고 접어둔다.
  // 대신 지금 무엇으로 보고 있는지가 버튼에 그대로 적혀 있어야, 걸어둔 걸 잊지 않는다.
  const currentStatus = STATUS_TABS.find((tab) => tab.key === statusTab) ?? STATUS_TABS[0];
  const statusIsDefault = statusTab === STATUS_TABS[0].key;

  // 목록과 맞닿는 경계에 가는 선을 둔다. 선이 없으면 필터와 첫 카드가 한 덩어리처럼 붙어 보이고,
  // 화면을 올릴 때 카드가 필터 밑으로 지나가는 것도 눈에 잘 안 띈다.
  return (
    <div className="sticky top-0 z-10 flex flex-col gap-2.5 border-b border-border bg-background px-5 pt-2 pb-3">
      <div className="flex gap-2">
        {/* 검색 앞에 두어 "무엇 안에서 찾을지"를 먼저 정하는 순서로 읽히게 한다. */}
        <button
          type="button"
          onClick={() => setStatusOpen(true)}
          className={cn(
            'flex h-10 shrink-0 items-center gap-1 rounded-full border px-3.5 text-[13px] font-semibold shadow-xs transition-colors',
            statusIsDefault ? 'border-border bg-card text-muted-foreground' : 'border-primary bg-primary text-primary-foreground'
          )}
        >
          {currentStatus.label}
          <ChevronDown className="size-3.5" />
        </button>

        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="이름, 브랜드로 검색"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="rounded-full pr-9 pl-9 [&::-webkit-search-cancel-button]:hidden"
          />
          {search && (
            <button
              type="button"
              className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground"
              onClick={() => onSearchChange('')}
              aria-label="검색어 지우기"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>

      <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => onCategoryChange('')}
          className={cn(
            'flex h-10 shrink-0 items-center rounded-full border px-3.5 text-[13px] whitespace-nowrap shadow-xs transition-colors',
            category === '' ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground'
          )}
        >
          전체
          <CountBadge count={totalCount} selected={category === ''} />
        </button>
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            type="button"
            onClick={() => onCategoryChange(cat.key)}
            className={cn(
              'flex h-10 shrink-0 items-center rounded-full border px-3.5 text-[13px] whitespace-nowrap shadow-xs transition-colors',
              category === cat.key
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card text-muted-foreground'
            )}
          >
            {cat.label}
            <CountBadge count={categoryCounts[cat.key]} selected={category === cat.key} />
          </button>
        ))}
      </div>

      {statusOpen && (
        <Sheet open onOpenChange={(open) => !open && setStatusOpen(false)}>
          <SheetContent className="gap-0 pb-[var(--safe-bottom)]">
            <SheetHeader className="pr-14 pb-1">
              <SheetTitle>어떤 기프티콘을 볼까요?</SheetTitle>
            </SheetHeader>
            <div className="flex flex-col px-5 pt-2">
              {STATUS_TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => {
                    onStatusTabChange(tab.key);
                    setStatusOpen(false);
                  }}
                  className="flex w-full items-center gap-3 px-1 py-3 text-left text-sm"
                >
                  <span className={cn('flex-1', statusTab === tab.key ? 'font-semibold text-primary' : 'text-foreground')}>
                    {tab.label}
                  </span>
                  {statusTab === tab.key && <Check className="size-4.5 text-primary" />}
                </button>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
