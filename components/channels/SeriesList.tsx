"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowLeft } from "lucide-react";
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

// Seviye 1'deki bir dizi satırını temsil eder.
type SeriesRow =
  | { type: "series"; title: string; seasonCount: number; episodeCount: number }
  | { type: "other"; count: number };

// Seviye 2'deki düzleştirilmiş satır (sezon başlığı veya bölüm).
type EpisodeRow =
  | { type: "season"; label: string; key: string }
  | { type: "episode"; channel: Channel; key: string };

export function SeriesList({ channels, selectedId, onSelect }: Props) {
  // Seviye durumu: null = seviye 1, string = açık dizi başlığı, "other" = Diğer grubu
  const [openSeries, setOpenSeries] = useState<string | "other" | null>(null);

  // Seviye 1 kaydırma konumunu korumak için
  const level1ScrollRef = useRef<HTMLDivElement>(null);
  const savedScrollTop = useRef<number>(0);

  // Gruplama — yalnızca channels değiştiğinde hesaplanır.
  const grouped = useMemo(() => {
    const map = new Map<string, Channel[]>();
    const other: Channel[] = [];
    for (const channel of channels) {
      if (channel.series) {
        const list = map.get(channel.series.title);
        if (list) list.push(channel);
        else map.set(channel.series.title, [channel]);
      } else {
        other.push(channel);
      }
    }
    const titles = [...map.keys()].sort((a, b) => a.localeCompare(b, "tr"));
    return { map, titles, other };
  }, [channels]);

  // Seviye 1 arama
  const searchId = useId();
  const [searchRaw, setSearchRaw] = useState("");
  const search = useDebounce(searchRaw, DEBOUNCE_MS);

  // Seviye 1 satırları: filtrelenmiş dizi listesi + Diğer
  const seriesRows = useMemo((): SeriesRow[] => {
    const q = search.trim().toLowerCase();
    const rows: SeriesRow[] = [];
    for (const title of grouped.titles) {
      if (q && !title.toLowerCase().includes(q)) continue;
      const episodes = grouped.map.get(title)!;
      const seasons = new Set(episodes.map((ch) => ch.series!.season));
      rows.push({
        type: "series",
        title,
        seasonCount: seasons.size,
        episodeCount: episodes.length,
      });
    }
    // Diğer: arama yapılmıyorsa göster
    if (!q && grouped.other.length > 0) {
      rows.push({ type: "other", count: grouped.other.length });
    }
    return rows;
  }, [grouped, search]);

  // Seviye 2 düzleştirilmiş satırlar (seçili dizi veya Diğer)
  const episodeRows = useMemo((): EpisodeRow[] => {
    if (openSeries === null) return [];
    const rows: EpisodeRow[] = [];
    if (openSeries === "other") {
      // Diğer: sıralı bölüm listesi (sezon başlığı yok)
      for (const ch of grouped.other) {
        rows.push({ type: "episode", channel: ch, key: ch.id });
      }
      return rows;
    }
    const episodes = grouped.map.get(openSeries);
    if (!episodes) return rows;
    // Sezona göre sırala, sonra bölüme göre
    const sorted = [...episodes].sort((a, b) => {
      const sa = a.series!.season - b.series!.season;
      if (sa !== 0) return sa;
      return a.series!.episode - b.series!.episode;
    });
    let lastSeason = -1;
    for (const ch of sorted) {
      if (ch.series!.season !== lastSeason) {
        lastSeason = ch.series!.season;
        rows.push({
          type: "season",
          label: `${lastSeason}. Sezon`,
          key: `season-${lastSeason}`,
        });
      }
      rows.push({ type: "episode", channel: ch, key: ch.id });
    }
    return rows;
  }, [openSeries, grouped]);

  // Geri butonuna tıklayınca kaydırma konumunu geri yükle
  function handleBack() {
    savedScrollTop.current = level1ScrollRef.current?.scrollTop ?? 0;
    setOpenSeries(null);
  }

  // Dizi satırına tıklayınca seviye 2'ye geç; kaydırma konumunu kaydet
  function handleOpenSeries(title: string | "other") {
    savedScrollTop.current = level1ScrollRef.current?.scrollTop ?? 0;
    setOpenSeries(title);
  }

  // Seviye 1'e geri dönünce kaydırma konumunu geri yükle
  useEffect(() => {
    if (openSeries === null && level1ScrollRef.current) {
      level1ScrollRef.current.scrollTop = savedScrollTop.current;
    }
  }, [openSeries]);

  // Escape ile seviye 2'den seviye 1'e dön
  useEffect(() => {
    if (openSeries === null) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        // Kaydırma konumunu kaydet ve seviye 1'e dön
        savedScrollTop.current = level1ScrollRef.current?.scrollTop ?? 0;
        setOpenSeries(null);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openSeries]);

  if (openSeries !== null) {
    const title = openSeries === "other" ? "Diğer" : openSeries;
    return (
      <EpisodeList
        title={title}
        rows={episodeRows}
        selectedId={selectedId}
        onSelect={onSelect}
        onBack={handleBack}
      />
    );
  }

  return (
    <Level1List
      rows={seriesRows}
      searchRaw={searchRaw}
      onSearchChange={setSearchRaw}
      searchId={searchId}
      scrollRef={level1ScrollRef}
      onOpen={handleOpenSeries}
    />
  );
}

// ---- Seviye 1: Dizi Listesi ----

interface Level1Props {
  rows: SeriesRow[];
  searchRaw: string;
  onSearchChange: (v: string) => void;
  searchId: string;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onOpen: (title: string | "other") => void;
}

function Level1List({ rows, searchRaw, onSearchChange, searchId, scrollRef, onOpen }: Level1Props) {
  const [focusedIdx, setFocusedIdx] = useState(0);
  const rowRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual bilinen uyumsuzluk; kaçınılmaz
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
    getItemKey: (index) => {
      const row = rows[index]!;
      return row.type === "other" ? "__other__" : row.title;
    },
  });

  function moveFocus(nextIdx: number) {
    const clamped = Math.max(0, Math.min(nextIdx, rows.length - 1));
    setFocusedIdx(clamped);
    virtualizer.scrollToIndex(clamped, { align: "auto" });
    requestAnimationFrame(() => {
      rowRefs.current.get(clamped)?.focus();
    });
  }

  const items = virtualizer.getVirtualItems();

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Arama */}
      <div className="flex flex-col gap-2 border-b border-border px-3 py-3">
        <label htmlFor={searchId} className="text-sm font-medium text-foreground">
          Dizi ara
        </label>
        <input
          id={searchId}
          type="search"
          value={searchRaw}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Dizi ara…"
          className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-base text-foreground placeholder:text-muted-foreground focus:border-accent-text focus:outline-2 focus:outline-accent-text"
        />
      </div>

      {/* Sanallaştırılmış dizi listesi */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto"
        onKeyDown={(e) => {
          if (rows.length === 0) return;
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
            moveFocus(rows.length - 1);
          } else if (e.key === "Enter") {
            e.preventDefault();
            const row = rows[focusedIdx];
            if (row) {
              onOpen(row.type === "other" ? "other" : row.title);
            }
          }
        }}
      >
        {rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            Eşleşen kayıt yok
          </p>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {items.map((vRow) => {
              const row = rows[vRow.index]!;
              const isFocused = vRow.index === focusedIdx;
              const key = row.type === "other" ? "__other__" : row.title;
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
                    tabIndex={isFocused ? 0 : -1}
                    onFocus={() => setFocusedIdx(vRow.index)}
                    onClick={() => onOpen(row.type === "other" ? "other" : row.title)}
                    className={[
                      "flex w-full flex-col items-start border-l-[3px] border-transparent px-3 py-2 text-left transition-colors duration-150",
                      "min-h-[44px] hover:bg-surface-raised",
                      "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring",
                    ].join(" ")}
                    aria-label={
                      row.type === "other"
                        ? `Diğer, ${row.count} kayıt`
                        : `${row.title}, ${row.seasonCount} sezon, ${row.episodeCount} bölüm`
                    }
                  >
                    <span className="truncate text-sm font-medium text-foreground" title={key}>
                      {row.type === "other" ? `Diğer (${row.count})` : row.title}
                    </span>
                    {row.type === "series" && (
                      <span className="text-xs text-muted-foreground">
                        <span className="tabular">{row.seasonCount}</span>
                        {" sezon · "}
                        <span className="tabular">{row.episodeCount}</span>
                        {" bölüm"}
                      </span>
                    )}
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

// ---- Seviye 2: Bölüm Listesi ----

interface EpisodeListProps {
  title: string;
  rows: EpisodeRow[];
  selectedId: string | null;
  onSelect: (channel: Channel) => void;
  onBack: () => void;
}

function EpisodeList({ title, rows, selectedId, onSelect, onBack }: EpisodeListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [focusedIdx, setFocusedIdx] = useState(0);
  const rowRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual bilinen uyumsuzluk; kaçınılmaz
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => {
      const row = rows[index];
      return row?.type === "season" ? 36 : ROW_HEIGHT;
    },
    overscan: 10,
    getItemKey: (index) => rows[index]!.key,
  });

  function moveFocus(nextIdx: number) {
    // Sezon başlıklarını atla
    let idx = Math.max(0, Math.min(nextIdx, rows.length - 1));
    while (idx < rows.length - 1 && rows[idx]?.type === "season") idx++;
    while (idx > 0 && rows[idx]?.type === "season") idx--;
    setFocusedIdx(idx);
    virtualizer.scrollToIndex(idx, { align: "auto" });
    requestAnimationFrame(() => {
      rowRefs.current.get(idx)?.focus();
    });
  }

  const items = virtualizer.getVirtualItems();

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Başlık: geri düğmesi + dizi adı */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Dizi listesine geri dön"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-raised text-foreground transition-colors duration-150 hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
        >
          <ArrowLeft aria-hidden className="size-4" />
        </button>
        <span
          className="truncate text-sm font-semibold text-foreground"
          title={title}
        >
          {title}
        </span>
      </div>

      {/* Sanallaştırılmış bölüm listesi */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto"
        onKeyDown={(e) => {
          if (rows.length === 0) return;
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
            moveFocus(rows.length - 1);
          }
        }}
      >
        {rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            Bölüm bulunamadı
          </p>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {items.map((vRow) => {
              const row = rows[vRow.index]!;
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
                  {row.type === "season" ? (
                    <div className="flex items-center px-3 py-2 min-h-[36px]">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {row.label}
                      </span>
                    </div>
                  ) : (
                    <EpisodeRow
                      channel={row.channel}
                      isSelected={row.channel.id === selectedId}
                      isFocused={vRow.index === focusedIdx}
                      onSelect={onSelect}
                      onFocus={() => setFocusedIdx(vRow.index)}
                      registerRef={(el) => {
                        if (el) rowRefs.current.set(vRow.index, el);
                        else rowRefs.current.delete(vRow.index);
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Bölüm satırı ----

interface EpisodeRowProps {
  channel: Channel;
  isSelected: boolean;
  isFocused: boolean;
  onSelect: (channel: Channel) => void;
  onFocus: () => void;
  registerRef: (el: HTMLButtonElement | null) => void;
}

function EpisodeRow({ channel, isSelected, isFocused, onSelect, onFocus, registerRef }: EpisodeRowProps) {
  const s = channel.series;
  // "S01E08 — Hanna" biçimi; bölüm adı yoksa kanalın adı kullanılır
  const label = s
    ? (() => {
        const code = `S${String(s.season).padStart(2, "0")}E${String(s.episode).padStart(2, "0")}`;
        // Kanal adından "Dizi S01 Dizi - S01E08 - Başlık" → bölüm başlığını çıkarmaya çalış
        const match = channel.name.match(/- S\d+E\d+ - (.+)$/);
        const episodeTitle = match?.[1]?.trim();
        return episodeTitle ? `${code} — ${episodeTitle}` : code;
      })()
    : channel.name;

  return (
    <button
      type="button"
      ref={registerRef}
      onClick={() => onSelect(channel)}
      onFocus={onFocus}
      aria-current={isSelected ? "true" : undefined}
      tabIndex={isFocused ? 0 : -1}
      title={label}
      className={[
        "flex w-full items-center border-l-[3px] pl-[9px] pr-3 py-2 text-left transition-colors duration-150",
        "min-h-[44px]",
        isSelected
          ? "border-accent bg-surface-raised"
          : "border-transparent hover:bg-surface-raised",
        "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring",
      ].join(" ")}
    >
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium text-foreground tabular">
          {label}
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
