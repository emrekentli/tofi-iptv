export type StreamEngine = "hls" | "mpegts" | "native";

const NATIVE_EXTENSIONS = [".mp4", ".mkv", ".webm", ".mov", ".m4v"];
const MPEGTS_EXTENSIONS = [".ts", ".mpegts", ".mts"];

/** Proxy URL'i verildiyse içindeki gerçek hedefi çıkarır. */
function extractTarget(src: string): string {
  try {
    const url = new URL(src, "http://localhost");
    if (url.pathname === "/api/stream") {
      return url.searchParams.get("u") ?? src;
    }
    return src;
  } catch {
    return src;
  }
}

/** Sorgu ve fragment'ı atarak yol kısmını küçük harfe çevirir. */
function pathOf(target: string): string {
  try {
    return new URL(target, "http://localhost").pathname.toLowerCase();
  } catch {
    return target.split(/[?#]/)[0].toLowerCase();
  }
}

/**
 * Yayın adresine göre hangi oynatma motorunun kullanılacağını belirler.
 * Uzantı yoksa HLS varsayılır: sağlayıcıların çoğu HLS sunar ve
 * Xtream canlı adresleri uzantısız olabilir.
 */
export function detectEngine(src: string): StreamEngine {
  const path = pathOf(extractTarget(src));
  if (path.endsWith(".m3u8")) return "hls";
  if (MPEGTS_EXTENSIONS.some((ext) => path.endsWith(ext))) return "mpegts";
  if (NATIVE_EXTENSIONS.some((ext) => path.endsWith(ext))) return "native";
  return "hls";
}
