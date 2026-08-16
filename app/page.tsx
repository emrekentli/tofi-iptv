"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Tv, Film, Clapperboard, RefreshCw } from "lucide-react";
import { loadChannels, clearChannels } from "@/lib/db";
import { PlaylistForm } from "@/components/channels/PlaylistForm";
import { ChannelList } from "@/components/channels/ChannelList";
import { VideoPlayer } from "@/components/player/VideoPlayer";
import type { Channel } from "@/lib/types";

type TabKind = "live" | "movie" | "series";

const TABS: { kind: TabKind; label: string; icon: React.ElementType }[] = [
  { kind: "live", label: "Canlı", icon: Tv },
  { kind: "movie", label: "Film", icon: Film },
  { kind: "series", label: "Dizi", icon: Clapperboard },
];

export default function HomePage() {
  const [allChannels, setAllChannels] = useState<Channel[] | null>(null);
  const [activeTab, setActiveTab] = useState<TabKind>("live");
  const [selected, setSelected] = useState<Channel | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [signError, setSignError] = useState<string | null>(null);

  // Seçilen kanalın id'sini ref'e yansıt; stale closure olmadan race condition
  // kontrolü için. useEffect ile senkronize edilir; render sırasında okunmaz.
  const selectedIdRef = useRef<string | null>(null);
  useEffect(() => {
    selectedIdRef.current = selected?.id ?? null;
  }, [selected]);

  // IndexedDB'yi açılışta yükle.
  useEffect(() => {
    loadChannels().then((channels) => {
      setAllChannels(channels.length > 0 ? channels : []);
    });
  }, []);

  // Kanalları kind'a göre üçe böl — her renderda değil, bir kez.
  const liveChannels = useMemo(
    () => (allChannels ?? []).filter((c) => c.kind === "live"),
    [allChannels],
  );
  const movieChannels = useMemo(
    () => (allChannels ?? []).filter((c) => c.kind === "movie"),
    [allChannels],
  );
  const seriesChannels = useMemo(
    () => (allChannels ?? []).filter((c) => c.kind === "series"),
    [allChannels],
  );

  function activeChannels(): Channel[] {
    if (activeTab === "live") return liveChannels;
    if (activeTab === "movie") return movieChannels;
    return seriesChannels;
  }

  function tabCount(kind: TabKind): number {
    if (kind === "live") return liveChannels.length;
    if (kind === "movie") return movieChannels.length;
    return seriesChannels.length;
  }

  // Hızlı kanal değişiminde eski isteğin geç dönüp yeni kanalı ezmemesi için,
  // dönen yanıtı uygulamadan önce seçimin hâlâ aynı kanal olduğunu doğrula.
  const handleSelect = useCallback(async (channel: Channel) => {
    // id'yi anında ref'e yaz; useEffect bir sonraki tick'te çalışır ama
    // async isteğin geri dönüşü her zaman ondan sonradır.
    selectedIdRef.current = channel.id;
    setSelected(channel);
    setSrc(null);
    setSignError(null);
    const response = await fetch("/api/sign", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: channel.url }),
    });
    if (!response.ok) {
      // Seçim değiştiyse bu hatayı gösterme.
      if (selectedIdRef.current === channel.id) {
        setSignError("Yayın adresi hazırlanamadı.");
      }
      return;
    }
    const { src: signedSrc } = await response.json();
    // Yanıt gecikmeli geldiyse ve kullanıcı başka kanala geçtiyse uygulama.
    if (selectedIdRef.current !== channel.id) return;
    setSrc(signedSrc as string);
  }, []);

  async function handleReset() {
    await clearChannels();
    setAllChannels([]);
    setSelected(null);
    setSrc(null);
    setSignError(null);
  }

  function handleLoaded(channels: Channel[]) {
    setAllChannels(channels);
    setSelected(null);
    setSrc(null);
    setSignError(null);
  }

  // Yükleniyor durumu
  if (allChannels === null) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          Yükleniyor…
        </p>
      </div>
    );
  }

  // IndexedDB boşsa playlist formunu göster
  if (allChannels.length === 0) {
    return (
      <div className="flex h-dvh items-center justify-center px-4">
        <PlaylistForm onLoaded={handleLoaded} />
      </div>
    );
  }

  // Ana ekran: sekmeli düzen
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      {/* Üst çubuk: sekme listesi + playlist değiştir düğmesi */}
      <header className="flex shrink-0 items-center justify-between border-b border-border bg-surface px-3">
        {/* Sekme listesi */}
        <nav
          role="tablist"
          aria-label="İçerik türü"
          className="flex"
          onKeyDown={(e) => {
            const idx = TABS.findIndex((t) => t.kind === activeTab);
            if (e.key === "ArrowRight") {
              e.preventDefault();
              setActiveTab(TABS[(idx + 1) % TABS.length]!.kind);
            } else if (e.key === "ArrowLeft") {
              e.preventDefault();
              setActiveTab(TABS[(idx + TABS.length - 1) % TABS.length]!.kind);
            }
          }}
        >
          {TABS.map(({ kind, label, icon: Icon }) => {
            const isActive = activeTab === kind;
            const count = tabCount(kind);
            return (
              <button
                key={kind}
                role="tab"
                aria-selected={isActive}
                tabIndex={isActive ? 0 : -1}
                onClick={() => setActiveTab(kind)}
                className={[
                  "relative flex min-h-[44px] items-center gap-1.5 px-4 text-sm font-medium transition-colors duration-150",
                  isActive
                    ? // Aktif sekme: alt çizgi + foreground rengi (yalnızca renkle değil)
                      "text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-accent"
                    : "text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                <Icon aria-hidden className="size-4" />
                <span>
                  {label}
                  {count > 0 && (
                    <span className="ml-1 text-xs text-muted-foreground">
                      ({count.toLocaleString("tr-TR")})
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </nav>

        {/* Playlist değiştir */}
        <button
          type="button"
          onClick={handleReset}
          aria-label="Playlist'i değiştir"
          className="flex min-h-[44px] items-center gap-1.5 rounded-lg px-3 text-sm text-muted-foreground transition-colors duration-150 hover:bg-surface-raised hover:text-foreground"
        >
          <RefreshCw aria-hidden className="size-4" />
          <span className="hidden sm:inline">Playlist değiştir</span>
        </button>
      </header>

      {/* Ana içerik: ≥1024px solda liste + sağda oynatıcı; <1024px oynatıcı üstte */}
      <div className="flex flex-1 overflow-hidden lg:flex-row flex-col-reverse">
        {/* Sol: kanal listesi (lg'de 320px sabit, küçükte yarım ekran) */}
        <aside className="flex flex-col border-r border-border bg-surface lg:w-80 lg:shrink-0 overflow-hidden flex-1 lg:flex-none">
          <ChannelList
            channels={activeChannels()}
            selectedId={selected?.id ?? null}
            onSelect={handleSelect}
          />
        </aside>

        {/* Sağ: oynatıcı */}
        <main className="flex flex-col flex-1 overflow-hidden bg-background p-0 lg:p-0">
          {src ? (
            <div className="flex h-full items-center justify-center">
              <div className="w-full max-w-5xl px-4 py-4 lg:px-6 lg:py-6">
                <VideoPlayer src={src} title={selected?.name} />
              </div>
            </div>
          ) : selected ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
              {signError ? (
                <p role="alert" className="text-sm text-destructive">
                  {signError}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground" aria-live="polite">
                  Yayın adresi hazırlanıyor…
                </p>
              )}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center">
              <p className="text-sm text-muted-foreground">
                Bir kanal seçin.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
