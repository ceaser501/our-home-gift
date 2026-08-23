import { useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { CATEGORIES, STATUS_TABS } from '../constants';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import useBackClose from '../utils/useBackClose';

// 분류 칩에 붙는 개수.
//
// 알약 배경을 걷었다. 칩 자체가 알약인데 그 안에 또 알약이 들어가 있어 시끄러웠고,
// 칩이 32px로 낮아지면서 들어갈 자리도 없어졌다. 숫자만 옅게 두면 글자 뒤에 붙은
// 꼬리로 읽혀서, 세는 값이라는 게 그대로 전해진다.
function CountBadge({ count, selected }) {
  // 0개인 분류에까지 '0'을 달면 눈에 걸리는 숫자만 늘어난다. 비어 있다는 건 칩을 눌러
  // 빈 목록을 보면 알 수 있고, 대개는 누르지도 않는다.
  if (!count) return null;

  return (
    <span className={cn('tabular-nums', selected ? 'opacity-70' : 'font-semibold text-muted-foreground')}>
      {count}
    </span>
  );
}

// 분류 칩 하나. 고른 것과 아닌 것이 같은 모양을 쓰되 채움만 다르다.
const CHIP = 'flex h-8 shrink-0 items-center gap-1 rounded-full border px-2.5 text-[13px] whitespace-nowrap transition-colors';
const CHIP_ON = 'border-primary bg-primary font-semibold text-primary-foreground';
const CHIP_OFF = 'border-input bg-card font-medium text-foreground';

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
    // 위쪽 여백 11px. 안내 띠가 전체 폭 배경이고 아래 테두리도 없어서, 여백이 없으면
    // 띠와 필터가 한 덩어리로 읽힌다. 띠가 없는 날에도 같은 값이라 헤더와의 간격이
    // 들쭉날쭉해지지 않는다.
    <div className="sticky top-0 z-10 flex flex-col gap-2.5 border-b border-border bg-background pt-[11px] pb-2.5">
      <div className="flex gap-[7px] px-4">
        {/* 검색 앞에 두어 "무엇 안에서 찾을지"를 먼저 정하는 순서로 읽히게 한다.
            알약이 아니라 각진 모서리를 쓴다 — 아래 카드와 각을 맞추기 위해서다.
            알약과 카드가 섞이면 필터 줄만 붕 떠 보인다. 분류 칩만 알약으로 남겨
            성격이 다르다는 것을 모양으로 말한다.
            기본이 아닐 때 보라로 채우는 것은 그대로 둔다. 걸어둔 필터를 잊으면
            "왜 안 보이지"가 되는데, 그때 화면에서 알려주는 것이 이 색뿐이다. */}
        <button
          type="button"
          onClick={() => setStatusOpen(true)}
          className={cn(
            'flex h-10 shrink-0 items-center gap-1 rounded-[11px] border px-3.5 text-sm font-semibold transition-colors',
            statusIsDefault ? 'border-input bg-card text-foreground' : 'border-primary bg-primary text-primary-foreground'
          )}
        >
          {currentStatus.label}
          <ChevronDown className={cn('size-3.5', statusIsDefault && 'text-muted-foreground')} strokeWidth={2.5} />
        </button>

        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="이름, 브랜드로 검색"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-10 rounded-[11px] border-input pr-9 pl-9 [&::-webkit-search-cancel-button]:hidden"
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

      {/* 아이콘이 들어간 만큼 칩 여백과 사이 간격을 줄인다. 네 번째 칩까지 글자가
          다 보이는 선이다 — 예전에는 네 번째가 잘린 채로 걸쳐 있었다. */}
      <div className="no-scrollbar flex gap-[5px] overflow-x-auto px-4 pb-1">
        <button
          type="button"
          onClick={() => onCategoryChange('')}
          className={cn(CHIP, category === '' ? CHIP_ON : CHIP_OFF)}
        >
          전체
          <CountBadge count={totalCount} selected={category === ''} />
        </button>
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            type="button"
            onClick={() => onCategoryChange(cat.key)}
            className={cn(CHIP, category === cat.key ? CHIP_ON : CHIP_OFF)}
          >
            {/* 선 굵기를 글자에 맞춘다(1.9). 아이콘이 글자보다 굵으면 그것부터 읽힌다.
                고른 칩에서는 currentColor를 따라 흰색이 된다. */}
            {cat.Icon && (
              <cat.Icon
                className={cn('size-3.5 shrink-0', category !== cat.key && 'text-muted-foreground')}
                strokeWidth={1.9}
              />
            )}
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
