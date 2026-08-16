import { proxyUrl } from "./sign";

// /g flag güvenli: String.prototype.replace her çağrı öncesi lastIndex'i sıfırlar.
const URI_ATTRIBUTE = /URI="([^"]+)"/g;

/** Yanıtın bir HLS playlist'i olup olmadığını içerik tipinden, yoksa uzantıdan anlar. */
export function isHlsResponse(contentType: string | null, url: string): boolean {
  if (contentType?.toLowerCase().includes("mpegurl")) return true;
  if (contentType) return false;
  return new URL(url).pathname.toLowerCase().endsWith(".m3u8");
}

/** Göreli veya mutlak bir adresi imzalı proxy URL'ine çevirir. Çözümlenemezse null. */
function toProxy(uri: string, baseUrl: string, secret: string): string | null {
  try {
    // RFC 3986 §4.2: göreli yolun ilk segmenti ':' ile başlayamaz (belirsiz sözdizim).
    // URL() yapıcısı bunu hataya dönüştürmez; bu guard gereklidir.
    if (uri.startsWith(":")) return null;
    return proxyUrl(new URL(uri, baseUrl).toString(), secret);
  } catch {
    return null;
  }
}

/**
 * Playlist içindeki segment, alt playlist ve anahtar adreslerini proxy'ye yönlendirir.
 * Yeniden yazılmazsa tarayıcı bu adresleri doğrudan sağlayıcıdan ister ve CORS'a takılır.
 */
export function rewriteHlsPlaylist(
  text: string,
  baseUrl: string,
  secret: string,
): string {
  return text
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;

      if (trimmed.startsWith("#")) {
        // EXT-X-KEY, EXT-X-MAP, EXT-X-MEDIA gibi etiketler URI="..." taşır.
        return line.replace(URI_ATTRIBUTE, (match, uri: string) => {
          const proxied = toProxy(uri, baseUrl, secret);
          return proxied ? `URI="${proxied}"` : match;
        });
      }

      return toProxy(trimmed, baseUrl, secret) ?? line;
    })
    .join("\n");
}
