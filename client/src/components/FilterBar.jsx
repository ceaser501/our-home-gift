import { Search, X } from 'lucide-react';
import { CATEGORIES, STATUS_TABS } from '../constants';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export default function FilterBar({ search, onSearchChange, category, onCategoryChange, statusTab, onStatusTabChange }) {
  return (
    <div className="sticky top-0 z-10 flex flex-col gap-2.5 bg-background px-5 pt-2 pb-3">
      <div className="relative">
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

      <div className="flex gap-1.5">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => onStatusTabChange(tab.key)}
            className={cn(
              'flex-1 rounded-[10px] border py-2 text-[13px] font-semibold transition-colors',
              statusTab === tab.key
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card text-muted-foreground'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => onCategoryChange('')}
          className={cn(
            'shrink-0 rounded-full border px-3 py-1.5 text-[13px] whitespace-nowrap transition-colors',
            category === '' ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground'
          )}
        >
          전체
        </button>
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            type="button"
            onClick={() => onCategoryChange(cat.key)}
            className={cn(
              'shrink-0 rounded-full border px-3 py-1.5 text-[13px] whitespace-nowrap transition-colors',
              category === cat.key
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card text-muted-foreground'
            )}
          >
            {cat.label}
          </button>
        ))}
      </div>
    </div>
  );
}
