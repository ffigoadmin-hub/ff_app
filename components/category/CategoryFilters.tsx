'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CategoryFiltersProps {
  categoryId: string;
  currentSort?: string;
  currentBrand?: string;
  currentTags?: string;
  mobile?: boolean;
}

// Values must match products API sort strings exactly
const SORT_OPTIONS = [
  { value: 'relevance',   label: 'Relevance' },
  { value: 'price-asc',  label: 'Price: Low to High' },
  { value: 'price-desc', label: 'Price: High to Low' },
  { value: 'discount',   label: 'Best Discount' },
  { value: 'newest',     label: 'Newest First' },
];

const TAG_FILTERS = [
  { value: 'organic',    label: '🌱 Organic' },
  { value: 'fresh',      label: '✨ Fresh' },
  { value: 'seasonal',   label: '🍂 Seasonal' },
];

export function CategoryFilters({ currentSort = 'relevance', currentTags, mobile }: CategoryFiltersProps) {
  const router       = useRouter();
  const pathname     = usePathname();
  const searchParams = useSearchParams();

  const updateParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.replace(`${pathname}?${params.toString()}`);
  };

  const activeSort = currentSort;
  const activeTags = currentTags ? currentTags.split(',') : [];

  const toggleTag = (tag: string) => {
    const next = activeTags.includes(tag)
      ? activeTags.filter((t) => t !== tag)
      : [...activeTags, tag];
    updateParam('tags', next.join(','));
  };

  // Mobile: horizontal chip strip
  if (mobile) {
    return (
      <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-100">
          <SlidersHorizontal className="h-4 w-4 text-neutral-600" aria-hidden="true" />
        </div>
        {SORT_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => updateParam('sort', opt.value)}
            aria-pressed={activeSort === opt.value}
            className={cn(
              'shrink-0 rounded-full border px-4 py-1.5 text-xs font-bold transition-all',
              activeSort === opt.value
                ? 'border-primary-600 bg-primary-600 text-white shadow-sm'
                : 'border-neutral-200 bg-white text-neutral-600 hover:border-primary-300 active:scale-95',
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    );
  }

  // Desktop: sidebar
  return (
    <div className="space-y-8" role="search" aria-label="Product filters">
      {/* Sort */}
      <section>
        <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-neutral-900">Sort By</h3>
        <div className="space-y-2.5">
          {SORT_OPTIONS.map((opt) => (
            <label key={opt.value} className="group flex cursor-pointer items-center gap-3">
              <div className="relative flex items-center justify-center">
                <input
                  type="radio"
                  name="sort"
                  value={opt.value}
                  checked={activeSort === opt.value}
                  onChange={() => updateParam('sort', opt.value)}
                  className="peer h-4 w-4 appearance-none rounded-full border border-neutral-300 transition-all checked:border-primary-600 checked:bg-primary-600"
                />
                <div className="pointer-events-none absolute h-1.5 w-1.5 rounded-full bg-white opacity-0 transition-opacity peer-checked:opacity-100" />
              </div>
              <span className={cn(
                'text-sm font-medium transition-colors',
                activeSort === opt.value ? 'text-primary-700 font-bold' : 'text-neutral-600 group-hover:text-neutral-900'
              )}>
                {opt.label}
              </span>
            </label>
          ))}
        </div>
      </section>

      {/* Tags */}
      <section>
        <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-neutral-900">Filter</h3>
        <div className="space-y-2.5">
          {TAG_FILTERS.map((tag) => (
            <label key={tag.value} className="group flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={activeTags.includes(tag.value)}
                onChange={() => toggleTag(tag.value)}
                className="h-4 w-4 rounded border-neutral-300 accent-primary-600 transition-all"
              />
              <span className={cn(
                'text-sm font-medium transition-colors',
                activeTags.includes(tag.value) ? 'text-primary-700 font-bold' : 'text-neutral-600 group-hover:text-neutral-900'
              )}>
                {tag.label}
              </span>
            </label>
          ))}
        </div>
      </section>
    </div>
  );
}
