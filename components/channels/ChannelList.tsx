"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Channel } from "@/lib/types";

const ROW_HEIGHT = 56; // estimateSize; gerçek yükseklik ≥44px CSS ile garanti edilir
const DEBOUNCE_MS = 200;

interface Props {
  channels: Channel[];
  selectedId: string | null;
  onSelect: (channel: Channel) => void;
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

/** Kanaldan benzersiz grup listesi çıkarır. */
function extractGroups(channels: Channel[]): string[] {
  const seen = new Set<string>();
  for (const ch of channels) {
    if (ch.group) seen.add(ch.group);
  }
  return Array.from(seen).sort((a, b) => a.localeCompare(b, "tr"));
}

export function ChannelList({ channels, selectedId, onSelect }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const [searchRaw, setSearchRaw] = useState("");
  const [group, setGroup] = useState("");
  const search = useDebounce(searchRaw, DEBOUNCE_MS);

  // Grup listesi kanallar değiştiğinde yeniden hesaplanır.
  const groups = useMemo(() => extractGroups(channels), [channels]);

  // Filtreli kanal listesi: arama + grup filtresi.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return channels.filter((ch) => {
      if (group && ch.group !== group) return false;
      if (q && !ch.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [channels, search, group]);

  // Filtre değiştiğinde listeyi en başa kaydır.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [search, group]);

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual bilinen uyumsuzluk; kaçınılmaz
  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  const items = virtualizer.getVirtualItems();

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Arama ve grup filtresi */}
      <div className="flex flex-col gap-2 border-b border-border px-3 py-3">
        <input
          type="search"
          value={searchRaw}
          onChange={(e) => setSearchRaw(e.target.value)}
          placeholder="Kanal ara…"
          aria-label="Kanal ara"
          className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-base text-foreground placeholder:text-muted-foreground focus:border-accent-text focus:outline-2 focus:outline-accent-text"
        />
        {groups.length > 0 && (
          <select
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            aria-label="Grup filtrele"
            className="h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground focus:border-accent-text focus:outline-2 focus:outline-accent-text"
          >
            <option value="">Tüm gruplar</option>
            {groups.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Sanallaştırılmış liste */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            Eşleşen kayıt yok
          </p>
        ) : (
          <div
            style={{ height: virtualizer.getTotalSize(), position: "relative" }}
          >
            {items.map((vRow) => {
              const channel = filtered[vRow.index]!;
              const isSelected = channel.id === selectedId;
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
                  <ChannelRow
                    channel={channel}
                    isSelected={isSelected}
                    onSelect={onSelect}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Satır bileşeni ----

interface RowProps {
  channel: Channel;
  isSelected: boolean;
  onSelect: (channel: Channel) => void;
}

function ChannelRow({ channel, isSelected, onSelect }: RowProps) {
  const [logoError, setLogoError] = useState(false);
  const initial = channel.name.charAt(0).toUpperCase();

  return (
    <button
      type="button"
      onClick={() => onSelect(channel)}
      aria-pressed={isSelected}
      title={channel.name}
      className={[
        // Temel satır stili
        "flex w-full items-center gap-3 px-3 py-2 text-left transition-colors duration-150",
        "min-h-[44px]",
        // Seçim durumu: sol çubuk + arka plan (yalnızca renk değil)
        isSelected
          ? "border-l-[3px] border-accent bg-surface-raised pl-[9px]"
          : "border-l-[3px] border-transparent hover:bg-surface-raised",
      ].join(" ")}
    >
      {/* Logo — her zaman 32×32 yer kaplar; düzen kaymasını önler */}
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded bg-surface-raised text-xs font-semibold text-muted-foreground"
        aria-hidden="true"
      >
        {channel.logo && !logoError ? (
          // eslint-disable-next-line @next/next/no-img-element -- sağlayıcı logoları bilinmeyen domainlerden gelir; next/image için remotePatterns yazılamaz
          <img
            src={channel.logo}
            alt=""
            width={32}
            height={32}
            loading="lazy"
            decoding="async"
            onError={() => setLogoError(true)}
            className="h-8 w-8 object-contain"
          />
        ) : (
          <span>{initial}</span>
        )}
      </span>

      {/* Metin */}
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium text-foreground">
          {channel.name}
        </span>
        {channel.group && (
          <span className="truncate text-xs text-muted-foreground">
            {channel.group}
          </span>
        )}
      </span>
    </button>
  );
}
