"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
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
  const searchId = useId();
  const groupId = useId();

  const [searchRaw, setSearchRaw] = useState("");
  const [group, setGroup] = useState("");
  const search = useDebounce(searchRaw, DEBOUNCE_MS);

  // Gezinme odak indeksi (roving focus için)
  const [focusedIdx, setFocusedIdx] = useState(0);
  // Satır düğmelerine ref erişimi için (odak taşımak amacıyla)
  const rowRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

  // Grup listesi kanallar değiştiğinde yeniden hesaplanır.
  const groups = useMemo(() => extractGroups(channels), [channels]);

  // Filtreli ve sıralı kanal listesi: arama + grup filtresi + Türkçe ada göre sıralama.
  // Sıralama bu useMemo içinde yapılır — arama veya grup değişiminde ekstra bir
  // sort çalışmasını önler; 17 k kanal için bu fark ölçülebilir.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const result = channels.filter((ch) => {
      if (group && ch.group !== group) return false;
      if (q && !ch.name.toLowerCase().includes(q)) return false;
      return true;
    });
    result.sort((a, b) => a.name.localeCompare(b.name, "tr"));
    return result;
  }, [channels, search, group]);

  // Filtre değiştiğinde listeyi en başa kaydır ve odağı sıfırla.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
    setFocusedIdx(0);
  }, [search, group]);

  // Odaklanan satırı görünüme çek ve DOM odağını taşı.
  function moveFocus(nextIdx: number) {
    const clamped = Math.max(0, Math.min(nextIdx, filtered.length - 1));
    setFocusedIdx(clamped);
    virtualizer.scrollToIndex(clamped, { align: "auto" });
    // scrollToIndex hemen DOM güncellemesi sağlamayabilir; bir tick sonra odakla.
    requestAnimationFrame(() => {
      rowRefs.current.get(clamped)?.focus();
    });
  }

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual bilinen uyumsuzluk; kaçınılmaz
  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
    getItemKey: (index) => filtered[index]!.id,
  });

  const items = virtualizer.getVirtualItems();

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Arama ve grup filtresi */}
      <div className="flex flex-col gap-2 border-b border-border px-3 py-3">
        <label htmlFor={searchId} className="text-sm font-medium text-foreground">
          Kanal ara
        </label>
        <input
          id={searchId}
          type="search"
          value={searchRaw}
          onChange={(e) => setSearchRaw(e.target.value)}
          placeholder="Kanal ara…"
          className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-base text-foreground placeholder:text-muted-foreground focus:border-accent-text focus:outline-2 focus:outline-accent-text"
        />
        {groups.length > 0 && (
          <>
            <label htmlFor={groupId} className="text-sm font-medium text-foreground">
              Grup filtrele
            </label>
            <select
              id={groupId}
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-base text-foreground focus:border-accent-text focus:outline-2 focus:outline-accent-text"
            >
              <option value="">Tüm gruplar</option>
              {groups.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </>
        )}
      </div>

      {/* Sanallaştırılmış liste */}
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
          }
        }}
      >
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
              const isFocused = vRow.index === focusedIdx;
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
                    isFocused={isFocused}
                    onSelect={onSelect}
                    onFocus={() => setFocusedIdx(vRow.index)}
                    registerRef={(el) => {
                      if (el) {
                        rowRefs.current.set(vRow.index, el);
                      } else {
                        rowRefs.current.delete(vRow.index);
                      }
                    }}
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
  isFocused: boolean;
  onSelect: (channel: Channel) => void;
  onFocus: () => void;
  registerRef: (el: HTMLButtonElement | null) => void;
}

function ChannelRow({ channel, isSelected, isFocused, onSelect, onFocus, registerRef }: RowProps) {
  const [logoError, setLogoError] = useState(false);
  const initial = channel.name.charAt(0).toUpperCase();

  return (
    <button
      type="button"
      ref={registerRef}
      onClick={() => onSelect(channel)}
      onFocus={onFocus}
      aria-current={isSelected ? "true" : undefined}
      tabIndex={isFocused ? 0 : -1}
      title={channel.name}
      className={[
        // Temel satır stili — pr-3 sabit, pl-[9px] seçili/seçilmez eşit tutulur
        // (border-l-[3px] her iki durumda da var; sol kenar boşluğu kaymaması için pl-[9px])
        "flex w-full items-center gap-3 border-l-[3px] pl-[9px] pr-3 py-2 text-left transition-colors duration-150",
        "min-h-[44px]",
        // Seçim durumu: sol çubuk rengi + arka plan (yalnızca renkle değil)
        isSelected
          ? "border-accent bg-surface-raised"
          : "border-transparent hover:bg-surface-raised",
        "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring",
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
