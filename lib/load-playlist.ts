/**
 * loadPlaylist — istemci tarafı playlist yükleme API'si.
 *
 * Önce worker içinde doğrudan fetch'i dener.
 * CORS reddi veya ağ hatası olursa /api/playlist sunucu yoluna düşer
 * ve bu geçişi onProgress aracılığıyla çağırana bildirir.
 *
 * Bu modül yalnızca tarayıcıda çalışır ("use client" bileşenlerinden çağrılır).
 */

import type { RawChannel } from "./db";

/** İlerleme olayları — üç aşama + sunucuya düşüş bildirimi */
export type ProgressEvent =
  | { phase: "downloading"; loaded: number }
  | { phase: "parsing" }
  | { phase: "server-fallback" }         // sunucu yoluna düşüldü
  | { phase: "writing"; written: number; total: number }
  | { phase: "done" };

export type LoadResult = {
  channels: RawChannel[];
  skipped: number;
  /** İstemci doğrudan çekebildi mi, yoksa sunucu proxy'si mi kullandı? */
  viaServer: boolean;
};

/**
 * Playlist URL'sini alıp ayrıştırır.
 * `onProgress` çağrıları bilgilendirme amaçlıdır; hata durumunda `reject` gelir.
 */
export async function loadPlaylist(
  url: string,
  onProgress: (event: ProgressEvent) => void,
): Promise<LoadResult> {
  // Worker dosyasını Turbopack/Webpack'in `new Worker(new URL(...))` kalıbıyla yükle.
  // Bu ifade statik analiz edilir — değişken kullanılamaz, sabir literal string olmalı.
  const worker = new Worker(new URL("./playlist-worker.ts", import.meta.url));

  const directResult = await new Promise<
    | { ok: true; channels: RawChannel[]; skipped: number }
    | { ok: false }
  >((resolve) => {
    worker.onmessage = (event) => {
      const msg = event.data as import("./playlist-worker").WorkerOutMessage;
      if (msg.phase === "downloading") {
        onProgress({ phase: "downloading", loaded: msg.loaded });
      } else if (msg.phase === "parsing") {
        onProgress({ phase: "parsing" });
      } else if (msg.phase === "done") {
        resolve({ ok: true, channels: msg.channels as RawChannel[], skipped: msg.skipped });
      } else if (msg.phase === "error") {
        // CORS reddi veya ağ hatası — sunucu yoluna düş
        resolve({ ok: false });
      }
    };
    worker.onerror = () => {
      resolve({ ok: false });
    };

    worker.postMessage({ url });
  });

  worker.terminate();

  if (directResult.ok) {
    return { channels: directResult.channels, skipped: directResult.skipped, viaServer: false };
  }

  // --- Sunucu yedek yolu ---
  // CORS veya ağ hatası — /api/playlist üzerinden dene.
  // Sunucu kendi SSRF koruması, boyut sınırı ve eşzamanlılık sınırıyla birlikte gelir.
  onProgress({ phase: "server-fallback" });

  const res = await fetch("/api/playlist", {
    method: "POST",
    headers: { "content-type": "application/json" },
    // URL kimlik bilgisi taşır; yalnızca bu uygulamanın kendi sunucusuna gönderilir.
    body: JSON.stringify({ url }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg =
      typeof body.error === "string" ? body.error : "Playlist yüklenemedi.";
    throw new Error(msg);
  }

  const data = await res.json();
  const channels = data.channels as RawChannel[];
  const skipped = typeof data.skipped === "number" ? data.skipped : 0;

  return { channels, skipped, viaServer: true };
}
