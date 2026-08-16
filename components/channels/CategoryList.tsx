"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { deriveCategories } from "@/lib/category-groups";
import type { Channel } from "@/lib/types";

const ROW_HEIGHT = 44; // estimateSize; dokunma hedefi ≥44px
const DEBOUNCE_MS = 200;

interface Props {
  channels: Channel[];
  /** Seçili grup; boş string = "Tümü". */
  selectedGroup: string;
  onSelectGroup: (group: string) => void;
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

export function CategoryList({ channels, selectedGroup, onSelectGroup }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const searchId = useId();

  const [searchRaw, setSearchRaw] = useState("");
  const search = useDebounce(searchRaw, DEBOUNCE_MS);

  // Roving focus
  const [focusedIdx, setFocusedIdx] = useState(0);
  const rowRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

  // Kategori listesi — aktif kanallar değiştiğinde bir kez türetilir.
  const categories = useMemo(() => deriveCategories(channels), [channels]);

  // Arama filtresi — yalnızca kategori adlarını filtreler; "Tümü" her zaman görünür.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter(
      (entry) => entry.group === "" || entry.group.toLowerCase().includes(q),
    );
  }, [categories, search]);

  // Arama değişince listeyi başa kaydır, odağı sıfırla.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
    setFocusedIdx(0);
  }, [search]);

  function moveFocus(nextIdx: number) {
    const clamped = Math.max(0, Math.min(nextIdx, filtered.length - 1));
    setFocusedIdx(clamped);
    virtualizer.scrollToIndex(clamped, { align: "auto" });
    requestAnimationFrame(() => {
      rowRefs.current.get(clamped)?.focus();
    });
  }

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual bilinen uyumsuzluk; kaçınılmaz
  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
    getItemKey: (index) => filtered[index]!.group || "__tumu__",
  });

  const items = virtualizer.getVirtualItems();

  return (
    <div className="flex h-full flex-col overflow-hidden border-r border-border bg-surface">
      {/* Başlık + arama */}
      <div className="flex flex-col gap-2 border-b border-border px-3 py-3 shrink-0">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Kategori
        </span>
        <label htmlFor={searchId} className="sr-only">
          Kategori ara
        </label>
        <input
          id={searchId}
          type="search"
          value={searchRaw}
          onChange={(e) => setSearchRaw(e.target.value)}
          placeholder="Kategori ara…"
          className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent-text focus:outline-2 focus:outline-accent-text"
        />
      </div>

      {/* Sanallaştırılmış kategori listesi */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto"
        onKeyDown={(e) => {
          if (filtered.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            moveFocus(focusedIdx + 1);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            moveFocus(focusedIdx - 1);
          } else if (e.key === "Home") {
            e.preventDefault();
            moveFocus(0);
          } else if (e.key === "End") {
            e.preventDefault();
            moveFocus(filtered.length - 1);
          } else if (e.key === "Enter") {
            e.preventDefault();
            const entry = filtered[focusedIdx];
            if (entry) onSelectGroup(entry.group);
          }
        }}
      >
        {filtered.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">
            Eşleşen kategori yok
          </p>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {items.map((vRow) => {
              const entry = filtered[vRow.index]!;
              const isSelected = entry.group === selectedGroup;
              const isFocused = vRow.index === focusedIdx;
              const label = entry.group === "" ? "Tümü" : entry.group;

              return (
                <div
                  key={vRow.key}
                  data-index={vRow.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    transform: `translateY(${vRow.start}px)`,
                  }}
                >
                  <button
                    type="button"
                    ref={(el) => {
                      if (el) rowRefs.current.set(vRow.index, el);
                      else rowRefs.current.delete(vRow.index);
                    }}
                    onClick={() => onSelectGroup(entry.group)}
                    onFocus={() => setFocusedIdx(vRow.index)}
                    aria-current={isSelected ? "true" : undefined}
                    tabIndex={isFocused ? 0 : -1}
                    title={label}
                    className={[
                      // Sol kenar çubuğu seçim göstergesi — yalnızca renkle değil
                      "flex w-full items-center justify-between border-l-[3px] pl-[9px] pr-3 py-2 text-left transition-colors duration-150",
                      "min-h-[44px]",
                      isSelected
                        ? "border-accent bg-surface-raised text-foreground"
                        : "border-transparent text-muted-foreground hover:bg-surface-raised hover:text-foreground",
                      "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring",
                    ].join(" ")}
                  >
                    <span className="truncate text-sm font-medium">{label}</span>
                    <span className="ml-2 shrink-0 text-xs tabular text-muted-foreground">
                      {entry.count.toLocaleString("tr-TR")}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
