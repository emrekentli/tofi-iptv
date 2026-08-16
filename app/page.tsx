"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Tv, Film, Clapperboard, X } from "lucide-react";
import {
  listPlaylists,
  removePlaylist,
  loadChannelsByKind,
  countByKind,
} from "@/lib/db";
import { PlaylistForm } from "@/components/channels/PlaylistForm";
import { PlaylistBar } from "@/components/channels/PlaylistBar";
import { ChannelList } from "@/components/channels/ChannelList";
import { VideoPlayer } from "@/components/player/VideoPlayer";
import type { Channel, ChannelKind, Playlist } from "@/lib/types";

type TabKind = ChannelKind;

const TABS: { kind: TabKind; label: string; icon: React.ElementType }[] = [
  { kind: "live", label: "Canlı", icon: Tv },
  { kind: "movie", label: "Film", icon: Film },
  { kind: "series", label: "Dizi", icon: Clapperboard },
];

const ACTIVE_PLAYLIST_KEY = "tofi-active-playlist";

/** Sayfa HTTPS iken HTTP yayın karışık içerik sayılıp engellenir; o durumda
 *  proxy zorunludur. Diğer hallerde tarayıcı doğrudan çekebilir —
 *  sunucudan video trafiği geçmez ve gecikme düşer. */
function proxyGerekli(streamUrl: string): boolean {
  if (process.env.NEXT_PUBLIC_FORCE_PROXY === "1") return true;
  if (typeof window === "undefined") return true;
  return window.location.protocol === "https:" && streamUrl.startsWith("http:");
}

export default function HomePage() {
  // Playlist listesi — null: henüz yüklenmedi.
  const [playlists, setPlaylists] = useState<Playlist[] | null>(null);
  // Aktif playlist id'si.
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null);
  // Sekme başına kanal sayıları.
  const [kindCounts, setKindCounts] = useState<Record<ChannelKind, number>>({ live: 0, movie: 0, series: 0 });
  // Önbellek: `${playlistId}:${kind}` → Channel[]. Referans kararlılığı için Map.
  const channelCache = useRef<Map<string, Channel[]>>(new Map());
  // Aktif sekme için gösterilen kanallar.
  const [activeChannels, setActiveChannels] = useState<Channel[] | null>(null);

  const [dbError, setDbError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKind>("live");
  const [selected, setSelected] = useState<Channel | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [signError, setSignError] = useState<string | null>(null);
  const [skippedNotice, setSkippedNotice] = useState<number | null>(null);
  // Yükleme durumu: sekme veya playlist değişince gösterilir.
  const [loadingChannels, setLoadingChannels] = useState(false);
  // Playlist formu görünür mü?
  const [showForm, setShowForm] = useState(false);

  // Sekme düğmelerine DOM odağı taşımak için ref dizisi
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Seçilen kanalın id'sini ref'e yansıt; stale closure olmadan race condition
  // kontrolü için. id'yi ilk await'ten ÖNCE synchronous olarak yaz.
  const selectedIdRef = useRef<string | null>(null);
  useEffect(() => {
    selectedIdRef.current = selected?.id ?? null;
  }, [selected]);

  // Belirtilen playlist ve sekme için kanalları yükler; önbellekten varsa alır.
  const loadTab = useCallback(async (playlistId: string, kind: ChannelKind) => {
    const cacheKey = `${playlistId}:${kind}`;
    const cached = channelCache.current.get(cacheKey);
    if (cached) {
      setActiveChannels(cached);
      setLoadingChannels(false);
      return;
    }
    setLoadingChannels(true);
    try {
      const channels = await loadChannelsByKind(playlistId, kind);
      // Önbelleğe al — aynı referans her renderda kullanılır.
      channelCache.current.set(cacheKey, channels);
      setActiveChannels(channels);
    } catch {
      setDbError("Kanallar yüklenemedi. Tarayıcı depolamasına erişilemedi.");
    } finally {
      setLoadingChannels(false);
    }
  }, []);

  // Açılışta playlist listesini yükle.
  useEffect(() => {
    listPlaylists()
      .then((list) => {
        setPlaylists(list);
        if (list.length === 0) return;

        // Son kullanılan playlist'i ya da ilkini seç.
        const savedId = (() => {
          try { return localStorage.getItem(ACTIVE_PLAYLIST_KEY); } catch { return null; }
        })();
        const initial = list.find((p) => p.id === savedId) ?? list[0]!;
        setActivePlaylistId(initial.id);

        // Sekme sayılarını yükle (kayıt belleğe alınmaz).
        countByKind(initial.id)
          .then(setKindCounts)
          .catch(() => { /* sayı yüklenemezse sıfır kalır */ });

        // İlk sekmeyi yükle.
        loadTab(initial.id, "live").catch(() => { /* hata loadTab içinde yönetilir */ });
      })
      .catch(() => {
        setDbError(
          "Tarayıcı depolamasına erişilemedi. Gizli mod veya engellenen depolama alanı olabilir.",
        );
      });
  }, [loadTab]);

  // Playlist veya sekme değişince kanalları yükle.
  async function switchPlaylist(id: string) {
    if (id === activePlaylistId) return;

    // Önbellek ve seçim sıfırla (seçim başka playlist'e ait).
    setSelected(null);
    setSrc(null);
    setSignError(null);
    selectedIdRef.current = null;
    setActiveChannels(null);
    setActiveTab("live");

    setActivePlaylistId(id);

    try {
      localStorage.setItem(ACTIVE_PLAYLIST_KEY, id);
    } catch { /* localStorage yoksa devam et */ }

    const counts = await countByKind(id).catch(() => ({ live: 0, movie: 0, series: 0 }));
    setKindCounts(counts);

    await loadTab(id, "live");
  }

  function activateTab(kind: TabKind) {
    const idx = TABS.findIndex((t) => t.kind === kind);
    setActiveTab(kind);
    tabRefs.current[idx]?.focus();

    if (activePlaylistId) {
      setActiveChannels(null);
      loadTab(activePlaylistId, kind).catch(() => { /* hata loadTab içinde yönetilir */ });
    }
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

    if (!proxyGerekli(channel.url)) {
      // Sağlayıcı CORS başlığı gönderiyor; tarayıcı doğrudan çekebilir.
      if (selectedIdRef.current !== channel.id) return;
      setSrc(channel.url);
      return;
    }

    try {
      const response = await fetch("/api/sign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: channel.url }),
      });
      if (!response.ok) {
        if (selectedIdRef.current === channel.id) {
          setSignError(
            "Yayın adresi hazırlanamadı. Tekrar denemek için kanalı seçin.",
          );
        }
        return;
      }
      const { src: signedSrc } = await response.json() as { src: string };
      if (selectedIdRef.current !== channel.id) return;
      setSrc(signedSrc);
    } catch {
      if (selectedIdRef.current === channel.id) {
        setSignError(
          "Sunucuya ulaşılamadı. Bağlantınızı kontrol edip kanalı tekrar seçin.",
        );
      }
    }
  }, []);

  // Playlist başarıyla yüklenince listeye ekle ve aktif hale getir.
  async function handleLoaded(playlist: Playlist, skipped?: number) {
    // Playlist listesini yenile.
    const updated = await listPlaylists().catch(() => playlists ?? []);
    setPlaylists(updated);
    setShowForm(false);

    // Önbelleği temizle — yeni playlist veya yenileme.
    for (const key of Array.from(channelCache.current.keys())) {
      if (key.startsWith(`${playlist.id}:`)) {
        channelCache.current.delete(key);
      }
    }

    setSelected(null);
    setSrc(null);
    setSignError(null);
    selectedIdRef.current = null;
    setActiveTab("live");
    setActivePlaylistId(playlist.id);

    try {
      localStorage.setItem(ACTIVE_PLAYLIST_KEY, playlist.id);
    } catch { /* localStorage yoksa devam et */ }

    const counts = await countByKind(playlist.id).catch(() => ({ live: 0, movie: 0, series: 0 }));
    setKindCounts(counts);
    await loadTab(playlist.id, "live");

    if (skipped && skipped > 0) {
      setSkippedNotice(skipped);
    }
  }

  async function handleRemovePlaylist(id: string) {
    await removePlaylist(id).catch(() => { /* silme başarısız olursa devam et */ });

    // Önbelleği temizle.
    for (const key of Array.from(channelCache.current.keys())) {
      if (key.startsWith(`${id}:`)) {
        channelCache.current.delete(key);
      }
    }

    const updated = await listPlaylists().catch(() => [] as Playlist[]);
    setPlaylists(updated);

    if (updated.length === 0) {
      // Hiç playlist kalmadı — formu göster.
      setActivePlaylistId(null);
      setActiveChannels(null);
      setSelected(null);
      setSrc(null);
      setSignError(null);
      selectedIdRef.current = null;
      setKindCounts({ live: 0, movie: 0, series: 0 });
      setShowForm(true);
      return;
    }

    // Silinen aktifse ilk kalana geç.
    if (id === activePlaylistId) {
      const next = updated[0]!;
      setSelected(null);
      setSrc(null);
      setSignError(null);
      selectedIdRef.current = null;
      setActiveTab("live");
      setActivePlaylistId(next.id);

      try {
        localStorage.setItem(ACTIVE_PLAYLIST_KEY, next.id);
      } catch { /* localStorage yoksa devam et */ }

      const counts = await countByKind(next.id).catch(() => ({ live: 0, movie: 0, series: 0 }));
      setKindCounts(counts);
      await loadTab(next.id, "live");
    }
  }

  // ---- Render durumları ----

  // Yükleniyor
  if (playlists === null && dbError === null) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          Yükleniyor…
        </p>
      </div>
    );
  }

  // IndexedDB hatası
  if (dbError !== null) {
    return (
      <div className="flex h-dvh items-center justify-center px-4">
        <p role="alert" className="text-sm text-destructive text-center max-w-sm">
          {dbError}
        </p>
      </div>
    );
  }

  // Hiç playlist yok veya form açık — playlist formu göster
  if ((playlists ?? []).length === 0 || showForm) {
    return (
      <div className="flex h-dvh items-center justify-center px-4">
        <PlaylistForm onLoaded={handleLoaded} />
      </div>
    );
  }

  // Ana ekran: çoklu playlist + sekmeli düzen
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      {/* Playlist çubuğu */}
      <PlaylistBar
        playlists={playlists ?? []}
        activeId={activePlaylistId ?? ""}
        onSelect={(id) => { switchPlaylist(id).catch(() => { /* hata switchPlaylist içinde yönetilir */ }); }}
        onAdd={() => setShowForm(true)}
        onRemove={(id) => { handleRemovePlaylist(id).catch(() => { /* hata handleRemovePlaylist içinde yönetilir */ }); }}
      />

      {/* Üst çubuk: sekme listesi */}
      <header className="flex shrink-0 items-center justify-between border-b border-border bg-surface px-3">
        <nav
          role="tablist"
          aria-label="İçerik türü"
          className="flex"
          onKeyDown={(e) => {
            const idx = TABS.findIndex((t) => t.kind === activeTab);
            if (e.key === "ArrowRight") {
              e.preventDefault();
              activateTab(TABS[(idx + 1) % TABS.length]!.kind);
            } else if (e.key === "ArrowLeft") {
              e.preventDefault();
              activateTab(TABS[(idx + TABS.length - 1) % TABS.length]!.kind);
            } else if (e.key === "Home") {
              e.preventDefault();
              activateTab(TABS[0]!.kind);
            } else if (e.key === "End") {
              e.preventDefault();
              activateTab(TABS[TABS.length - 1]!.kind);
            }
          }}
        >
          {TABS.map(({ kind, label, icon: Icon }, i) => {
            const isActive = activeTab === kind;
            const count = kindCounts[kind];
            return (
              <button
                key={kind}
                ref={(el) => { tabRefs.current[i] = el; }}
                role="tab"
                aria-selected={isActive}
                aria-controls={`tabpanel-${kind}`}
                tabIndex={isActive ? 0 : -1}
                onClick={() => activateTab(kind)}
                className={[
                  "relative flex min-h-[44px] items-center gap-1.5 px-4 text-sm font-medium transition-colors duration-150",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring rounded-sm",
                  isActive
                    ? "text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-accent"
                    : "text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                <Icon aria-hidden className="size-4" />
                <span>
                  {label}
                  <span className="ml-1 text-xs text-muted-foreground">
                    ({count.toLocaleString("tr-TR")})
                  </span>
                </span>
              </button>
            );
          })}
        </nav>
      </header>

      {/* Atlanmış kayıt bildirimi */}
      {skippedNotice !== null && skippedNotice > 0 && (
        <div
          role="status"
          className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-surface px-4 py-2 text-sm text-muted-foreground"
        >
          <span>
            {skippedNotice.toLocaleString("tr-TR")} kayıt atlandı (geçersiz biçim).
          </span>
          <button
            type="button"
            aria-label="Bildirimi kapat"
            onClick={() => setSkippedNotice(null)}
            className="shrink-0 rounded p-0.5 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>
      )}

      {/* Ana içerik */}
      <div className="flex flex-1 overflow-hidden lg:flex-row flex-col-reverse">
        {/* Sol: kanal listesi */}
        <aside
          id={`tabpanel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={activeTab}
          className="flex flex-col border-r border-border bg-surface lg:w-80 lg:shrink-0 overflow-hidden flex-1 lg:flex-none"
        >
          {loadingChannels || activeChannels === null ? (
            <p
              className="px-4 py-8 text-center text-sm text-muted-foreground"
              aria-live="polite"
            >
              Kanallar yükleniyor…
            </p>
          ) : (
            // key={activeTab} her sekme için bağımsız ChannelList örneği sağlar (arama/grup/kaydırma sıfırlanır)
            <ChannelList
              key={activeTab}
              channels={activeChannels}
              selectedId={selected?.id ?? null}
              onSelect={handleSelect}
            />
          )}
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
