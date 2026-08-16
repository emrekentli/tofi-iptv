export type StreamEngine = "hls" | "mpegts" | "native";

const NATIVE_EXTENSIONS = [".mp4", ".mkv", ".webm", ".mov", ".m4v"];
const MPEGTS_EXTENSIONS = [".ts", ".mpegts", ".mts"];

/**
 * Proxy URL'i verildiyse içindeki gerçek hedefi çıkarır.
 * Token şifrelidir — çözümleme burada yapılmaz; yalnızca uzantı tespiti için
 * en iyi çaba gösterilir. Token geçersizse kaynak URL döndürülür.
 */
function extractTarget(src: string): string {
  try {
    const url = new URL(src, "http://localhost");
    if (url.pathname === "/api/stream") {
      // Eski "u" parametresi (geriye dönük uyumluluk): şifreli token "t" tercih edilir,
      // ancak burada şifre çözümü yapılamaz — uzantı tespiti için token içeriğine
      // erişim gerekmez, sadece uzantısız varsayılan (HLS) döndürülür.
      return src;
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
