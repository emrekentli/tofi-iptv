/**
 * Playlist Web Worker — tarayıcıda çalışır, Node.js modülü içe aktarmaz.
 *
 * Ana iş parçacığından { url: string } mesajı alır;
 * üç aşamada ilerleme bildirir:
 *   1. indirme: { phase: "downloading", loaded: number }
 *   2. ayrıştırma: { phase: "parsing", parsed: number }
 *   3. tamamlandı: { phase: "done", channels: RawChannel[] }
 *   hata: { phase: "error", message: string }
 *
 * Not: IndexedDB yazımı worker'da değil, ana iş parçacığında yapılır.
 * Worker yalnızca m3u metnini çeker ve ayrıştırır; kanal dizisini geri postlar.
 */

import { parseM3U } from "./sources/m3u";
import type { ParsedChannel } from "./sources/m3u";

/** Ana iş parçacığına gönderilen ilerleme mesajları. */
export type WorkerInMessage = { url: string };

export type WorkerOutMessage =
  | { phase: "downloading"; loaded: number }
  | { phase: "parsing" }
  | { phase: "done"; channels: Omit<ParsedChannel, "rawUrl">[]; skipped: number }
  | { phase: "error"; message: string };

// Worker bağlamında self'e tip ekle; tsconfig lib'de DedicatedWorkerGlobalScope yoksa
// kendi arayüzümüzü tanımlarız — yalnızca kullandığımız kısımlar yeterli.
interface WorkerScope {
  onmessage: ((event: MessageEvent<WorkerInMessage>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(data: WorkerOutMessage): void;
}
declare const self: WorkerScope;

self.onmessage = async (event: MessageEvent<WorkerInMessage>) => {
  const { url } = event.data;

  // --- Aşama 1: İndirme ---
  let text: string;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      self.postMessage({
        phase: "error",
        message:
          res.status === 401 || res.status === 403
            ? "Kullanıcı adı veya şifre hatalı"
            : `Playlist sunucusu ${res.status} döndü`,
      } satisfies WorkerOutMessage);
      return;
    }

    if (!res.body) {
      self.postMessage({
        phase: "error",
        message: "Playlist yanıtında gövde yok",
      } satisfies WorkerOutMessage);
      return;
    }

    // Akışı okurken indirilen bayt sayısını raporla
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    const chunks: string[] = [];
    let loaded = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      loaded += value.byteLength;
      chunks.push(decoder.decode(value, { stream: true }));
      self.postMessage({ phase: "downloading", loaded } satisfies WorkerOutMessage);
    }
    // Kalan baytları temizle
    chunks.push(decoder.decode());
    text = chunks.join("");
  } catch (err) {
    // CORS reddi veya ağ hatası — ana iş parçacığına hata bildir
    const detail = err instanceof Error ? err.message : String(err);
    self.postMessage({ phase: "error", message: detail } satisfies WorkerOutMessage);
    return;
  }

  // --- Aşama 2: Ayrıştırma ---
  self.postMessage({ phase: "parsing" } satisfies WorkerOutMessage);
  const { channels: parsed, skipped } = parseM3U(text);

  // rawUrl'yi url olarak yeniden adlandır; PlaylistForm'da addPlaylist bunu bekler
  const channels = parsed.map(({ rawUrl, ...rest }) => ({ ...rest, url: rawUrl }));

  // --- Aşama 3: Tamamlandı ---
  self.postMessage({ phase: "done", channels, skipped } satisfies WorkerOutMessage);
};
