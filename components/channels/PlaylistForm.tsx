"use client";

import { Loader2, AlertCircle } from "lucide-react";
import { useId, useRef, useState } from "react";
import { saveChannels } from "@/lib/db";
import type { Channel } from "@/lib/types";

type Phase =
  | { kind: "idle" }
  | { kind: "downloading" }
  | { kind: "writing"; written: number; total: number }
  | { kind: "done" };

interface Props {
  onLoaded: (channels: Channel[]) => void;
}

export function PlaylistForm({ onLoaded }: Props) {
  const inputId = useId();
  const errorId = useId();
  const statusId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<number | null>(null);

  const isLoading = phase.kind === "downloading" || phase.kind === "writing";

  function statusText(): string {
    if (phase.kind === "downloading") return "Playlist indiriliyor…";
    if (phase.kind === "writing")
      return `${phase.written.toLocaleString("tr-TR")} / ${phase.total.toLocaleString("tr-TR")} kayıt yazılıyor…`;
    return "";
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const url = inputRef.current?.value.trim() ?? "";
    if (!url) return;

    setError(null);
    setSkipped(null);
    setPhase({ kind: "downloading" });

    let channels: Channel[];
    let skippedCount = 0;

    try {
      const res = await fetch("/api/playlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg =
          typeof body.error === "string"
            ? body.error
            : "Playlist yüklenemedi.";
        setError(msg);
        setPhase({ kind: "idle" });
        return;
      }

      const data = await res.json();
      channels = data.channels as Channel[];
      skippedCount = typeof data.skipped === "number" ? data.skipped : 0;
    } catch {
      setError("Sunucuya ulaşılamadı. Bağlantınızı kontrol edin.");
      setPhase({ kind: "idle" });
      return;
    }

    const total = channels.length;
    setPhase({ kind: "writing", written: 0, total });

    await saveChannels(channels, (written) => {
      setPhase({ kind: "writing", written, total });
    });

    if (skippedCount > 0) setSkipped(skippedCount);
    setPhase({ kind: "done" });
    onLoaded(channels);
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
        <div className="flex flex-col gap-2">
          <label htmlFor={inputId} className="text-sm font-medium text-foreground">
            Playlist adresi
          </label>
          <input
            ref={inputRef}
            id={inputId}
            type="url"
            required
            disabled={isLoading}
            placeholder="http://sunucu/playlist.m3u"
            aria-describedby={
              [error ? errorId : null, statusId].filter(Boolean).join(" ") || undefined
            }
            className="h-11 rounded-lg border border-border bg-surface px-3 text-base text-foreground placeholder:text-muted-foreground focus:border-accent-text focus:outline-2 focus:outline-accent-text disabled:opacity-50"
          />
          {error && (
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

        {skipped !== null && skipped > 0 && (
          <p className="text-sm text-muted-foreground">
            {skipped.toLocaleString("tr-TR")} kayıt atlandı.
          </p>
        )}

        <button
          type="submit"
          disabled={isLoading}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-accent px-5 font-semibold text-white transition-colors duration-150 hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading && <Loader2 aria-hidden className="size-4 animate-spin" />}
          {isLoading ? "Yükleniyor…" : "Kanalları yükle"}
        </button>
      </form>

      {/* Güvenlik uyarısı */}
      <p className="text-xs text-muted-foreground">
        Playlist adresi kullanıcı adı ve şifre içerir. Bu adres yalnızca bu
        tarayıcıda saklanır; hiçbir sunucuya veya üçüncü tarafa iletilmez.
      </p>
    </div>
  );
}
