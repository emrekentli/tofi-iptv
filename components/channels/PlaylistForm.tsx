"use client";

import { Loader2, AlertCircle } from "lucide-react";
import { useId, useRef, useState } from "react";
import { addPlaylist, playlistIdFromUrl } from "@/lib/db";
import { loadPlaylist } from "@/lib/load-playlist";
import type { Playlist } from "@/lib/types";

type Phase =
  | { kind: "idle" }
  | { kind: "downloading"; loaded: number }
  | { kind: "parsing" }
  | { kind: "server-fallback" }
  | { kind: "writing"; written: number; total: number }
  | { kind: "done" };

interface Props {
  onLoaded: (playlist: Playlist, skipped?: number) => void;
  /**
   * Vazgeçme yolu. Yalnızca en az bir playlist zaten yüklüyse verilir —
   * hiç playlist yokken geri dönülecek bir ekran olmadığı için gizlenir.
   * Verilmezse "Vazgeç" düğmesi çizilmez.
   */
  onCancel?: () => void;
}

export function PlaylistForm({ onLoaded, onCancel }: Props) {
  const urlInputId = useId();
  const nameInputId = useId();
  const errorId = useId();
  const statusId = useId();
  const urlRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [urlEmpty, setUrlEmpty] = useState(false);

  const isLoading =
    phase.kind === "downloading" ||
    phase.kind === "parsing" ||
    phase.kind === "server-fallback" ||
    phase.kind === "writing";

  function statusText(): string {
    if (phase.kind === "downloading") {
      const kb = Math.round(phase.loaded / 1024);
      return `İndiriliyor… ${kb.toLocaleString("tr-TR")} KB`;
    }
    if (phase.kind === "parsing") return "Kanallar ayrıştırılıyor…";
    if (phase.kind === "server-fallback") return "Sunucu üzerinden deneniyor…";
    if (phase.kind === "writing")
      return `${phase.written.toLocaleString("tr-TR")} / ${phase.total.toLocaleString("tr-TR")} kayıt yazılıyor…`;
    return "";
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const url = urlRef.current?.value.trim() ?? "";
    if (!url) {
      setUrlEmpty(true);
      urlRef.current?.focus();
      return;
    }
    setUrlEmpty(false);

    setError(null);
    setPhase({ kind: "downloading", loaded: 0 });

    let channels: Parameters<typeof addPlaylist>[1];
    let skippedCount = 0;

    try {
      const result = await loadPlaylist(url, (event) => {
        if (event.phase === "downloading") {
          setPhase({ kind: "downloading", loaded: event.loaded });
        } else if (event.phase === "parsing") {
          setPhase({ kind: "parsing" });
        } else if (event.phase === "server-fallback") {
          setPhase({ kind: "server-fallback" });
        }
        // "writing" ve "done" aşamaları addPlaylist sırasında aşağıda güncellenir
      });
      channels = result.channels;
      skippedCount = result.skipped;
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Playlist yüklenemedi.";
      setError(msg);
      setPhase({ kind: "idle" });
      return;
    }

    const total = channels.length;
    setPhase({ kind: "writing", written: 0, total });

    // Ad alanı: girilmişse kullan, boşsa adresin host kısmından türet.
    const nameInput = nameRef.current?.value.trim() ?? "";
    let playlistName: string;
    try {
      playlistName = nameInput || new URL(url).host || "Playlist";
    } catch {
      playlistName = nameInput || "Playlist";
    }

    // Playlist kimliği: URL'den kararlı hash — aynı adres iki kez eklenince çoğalmaz.
    const playlistId = await playlistIdFromUrl(url);

    const playlist: Playlist = {
      id: playlistId,
      name: playlistName,
      url,
      addedAt: Date.now(),
      channelCount: total,
    };

    try {
      await addPlaylist(playlist, channels, (written) => {
        setPhase({ kind: "writing", written, total });
      });
    } catch {
      // addPlaylist önce varsa kanalları temizler; hata oluşursa kısmen temizlenmiş
      // olabilir. Kullanıcı yeniden deneyebilir.
      setError(
        "Kanallar kaydedilemedi. Tarayıcı depolama alanı dolu olabilir. Sayfayı yenileyip tekrar deneyin.",
      );
      setPhase({ kind: "idle" });
      return;
    }

    setPhase({ kind: "done" });
    onLoaded(playlist, skippedCount);
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-foreground">Tofi IPTV</h1>
        <p className="text-sm text-muted-foreground">
          Playlist adresinizi girin ve kanalları yükleyin.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        {/* Playlist adı — isteğe bağlı */}
        <div className="flex flex-col gap-2">
          <label htmlFor={nameInputId} className="text-sm font-medium text-foreground">
            Playlist adı <span className="font-normal text-muted-foreground">(isteğe bağlı)</span>
          </label>
          <input
            ref={nameRef}
            id={nameInputId}
            type="text"
            disabled={isLoading}
            autoComplete="off"
            placeholder="Örn. Ev Planı"
            className="h-11 rounded-lg border border-border bg-surface px-3 text-base text-foreground placeholder:text-muted-foreground focus:border-accent-text focus:outline-2 focus:outline-accent-text disabled:opacity-50"
          />
        </div>

        {/* Playlist adresi — zorunlu, kontrolsüz (kimlik bilgisi taşır; React state'e girmez) */}
        <div className="flex flex-col gap-2">
          <label htmlFor={urlInputId} className="text-sm font-medium text-foreground">
            Playlist adresi
          </label>
          <input
            ref={urlRef}
            id={urlInputId}
            type="url"
            required
            disabled={isLoading}
            autoComplete="off"
            placeholder="http://sunucu/playlist.m3u"
            aria-describedby={
              [error || urlEmpty ? errorId : null, statusId].filter(Boolean).join(" ") || undefined
            }
            aria-invalid={error !== null || urlEmpty ? true : undefined}
            onChange={() => { if (urlEmpty) setUrlEmpty(false); }}
            className="h-11 rounded-lg border border-border bg-surface px-3 text-base text-foreground placeholder:text-muted-foreground focus:border-accent-text focus:outline-2 focus:outline-accent-text disabled:opacity-50"
          />
          {urlEmpty && (
            <p
              id={errorId}
              role="alert"
              className="flex items-center gap-1.5 text-sm text-destructive"
            >
              <AlertCircle aria-hidden className="size-4 shrink-0" />
              Lütfen bir playlist adresi girin.
            </p>
          )}
          {error && !urlEmpty && (
            <p
              id={errorId}
              role="alert"
              className="flex items-center gap-1.5 text-sm text-destructive"
            >
              <AlertCircle aria-hidden className="size-4 shrink-0" />
              {error}
            </p>
          )}
        </div>

        {/* Durum metni — ekran okuyucuya kibar bildirim */}
        <p
          id={statusId}
          aria-live="polite"
          className="min-h-[1.25rem] text-sm text-muted-foreground"
        >
          {statusText()}
        </p>

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={isLoading}
            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-accent px-5 font-semibold text-white transition-colors duration-150 hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {isLoading && <Loader2 aria-hidden className="size-4 animate-spin" />}
            {isLoading ? "Yükleniyor…" : "Kanalları yükle"}
          </button>

          {/* Vazgeç: yalnızca geri dönülecek bir playlist varsa gösterilir.
              Yanlışlıkla "+" düğmesine basan kullanıcı formda mahsur kalmasın. */}
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={isLoading}
              className="inline-flex h-11 items-center justify-center rounded-lg border border-border bg-surface px-5 font-medium text-foreground transition-colors duration-150 hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Vazgeç
            </button>
          )}
        </div>
      </form>

      {/* Güvenlik notu: playlist doğrudan tarayıcıdan çekilir; adres bu tarayıcıda kalır */}
      <p className="text-xs text-muted-foreground">
        Playlist adresi bu tarayıcıdan doğrudan çekilir ve yalnızca bu tarayıcıda tutulur.
        CORS hatası olursa bu uygulamanın sunucusu yedek olarak devreye girer.
      </p>
    </div>
  );
}
