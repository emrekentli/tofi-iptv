export type StreamEngine = "hls" | "mpegts" | "native";

const NATIVE_EXTENSIONS = [".mp4", ".mkv", ".webm", ".mov", ".m4v"];
const MPEGTS_EXTENSIONS = [".ts", ".mpegts", ".mts"];

/** Sorgu ve fragment'ı atarak yol kısmını küçük harfe çevirir. */
function pathOf(target: string): string {
  try {
    return new URL(target, "http://localhost").pathname.toLowerCase();
  } catch {
    return target.split(/[?#]/)[0]!.toLowerCase();
  }
}

/**
 * Uzantısız Xtream canlı adresi mi?
 *
 * Xtream canlı bağlantıları `/KULLANICI/SIFRE/AKIS_ID` (ya da açıkça
 * `/live/KULLANICI/SIFRE/AKIS_ID`) biçimindedir ve uzantı taşımaz.
 * Sahibin sağlayıcısında ölçüldü: bu adres `video/mp2t`, yani ham MPEG-TS
 * döndürüyor — HLS değil. Eskiden uzantısız her adres için HLS varsayılıyordu;
 * bu, canlı yayınların hiç açılmamasına yol açıyordu.
 */
function isXtreamLivePath(path: string): boolean {
  const segments = path.split("/").filter(Boolean);
  if (segments.length === 3) return /^\d+$/.test(segments[2]!);
  if (segments.length === 4) {
    return segments[0] === "live" && /^\d+$/.test(segments[3]!);
  }
  return false;
}

/**
 * Yayın adresine göre hangi oynatma motorunun kullanılacağını belirler.
 *
 * ÖNEMLİ: Buraya proxy adresi (`/api/stream?t=…`) değil, HAM sağlayıcı adresi
 * verilmelidir. Token AES-GCM ile şifreli olduğundan içindeki gerçek hedef
 * istemcide çözülemez; proxy adresi verilirse uzantı görünmez ve tespit
 * varsayılana düşer. `VideoPlayer` bu yüzden ayrı bir `sourceUrl` prop'u alır.
 *
 * Uzantı yoksa ve adres Xtream canlı biçiminde değilse HLS varsayılır.
 * Tahmin yanlış olabilir; `VideoPlayer` çalışma anında bir kez diğer motora düşer.
 */
export function detectEngine(src: string): StreamEngine {
  const path = pathOf(src);
  if (path.endsWith(".m3u8")) return "hls";
  if (MPEGTS_EXTENSIONS.some((ext) => path.endsWith(ext))) return "mpegts";
  if (NATIVE_EXTENSIONS.some((ext) => path.endsWith(ext))) return "native";
  if (isXtreamLivePath(path)) return "mpegts";
  return "hls";
}

/**
 * Konteyner yanlış tanındıysa denenecek alternatif motor.
 * `native` için takas yok: tarayıcının kendi çözücüsü başarısızsa
 * hls.js veya mpegts.js de aynı dosyayı açamaz.
 */
export function fallbackEngine(engine: StreamEngine): StreamEngine | null {
  if (engine === "hls") return "mpegts";
  if (engine === "mpegts") return "hls";
  return null;
}

/**
 * hls.js `ErrorDetails` değerleri — konteynerin yanlış tanındığına işaret eder.
 * Kaynak ham MPEG-TS iken hls.js'e verilirse manifest ayrıştırılamaz.
 */
const HLS_CONTAINER_MISMATCH = new Set([
  "manifestParsingError", // Hls.ErrorDetails.MANIFEST_PARSING_ERROR
  "manifestLoadError", // Hls.ErrorDetails.MANIFEST_LOAD_ERROR
  "fragParsingError", // Hls.ErrorDetails.FRAG_PARSING_ERROR
]);

/**
 * hls.js `ErrorDetails` değerleri — codec desteklenmiyor (H.265/AC3).
 * Motor takası bunu çözmez; kullanıcıya codec mesajı gösterilmelidir.
 */
const HLS_CODEC_ERRORS = new Set([
  "manifestIncompatibleCodecsError", // MANIFEST_INCOMPATIBLE_CODECS_ERROR
  "bufferAddCodecError", // BUFFER_ADD_CODEC_ERROR
  "bufferIncompatibleCodecsError", // BUFFER_INCOMPATIBLE_CODECS_ERROR
]);

/**
 * mpegts.js `ErrorDetails` değerleri — veri MPEG-TS/FLV olarak ayrıştırılamadı.
 * Kaynak aslında HLS manifesti ise bu görülür.
 */
const MPEGTS_CONTAINER_MISMATCH = new Set([
  "FormatError", // mpegts.ErrorDetails.MEDIA_FORMAT_ERROR
  "FormatUnsupported", // mpegts.ErrorDetails.MEDIA_FORMAT_UNSUPPORTED
]);

/**
 * mpegts.js `ErrorDetails` değerleri — konteyner doğru, codec desteklenmiyor.
 */
const MPEGTS_CODEC_ERRORS = new Set([
  "CodecUnsupported", // mpegts.ErrorDetails.MEDIA_CODEC_UNSUPPORTED
  "MediaMSEError", // mpegts.ErrorDetails.MEDIA_MSE_ERROR
]);

/** Hata, konteynerin yanlış tanındığını gösteriyor mu? (motor takası yapılır) */
export function isContainerMismatch(
  engine: StreamEngine,
  details: string,
): boolean {
  if (engine === "hls") return HLS_CONTAINER_MISMATCH.has(details);
  if (engine === "mpegts") return MPEGTS_CONTAINER_MISMATCH.has(details);
  return false;
}

/** Hata codec kaynaklı mı? (motor takası YAPILMAZ; codec mesajı gösterilir) */
export function isCodecError(engine: StreamEngine, details: string): boolean {
  if (engine === "hls") return HLS_CODEC_ERRORS.has(details);
  if (engine === "mpegts") return MPEGTS_CODEC_ERRORS.has(details);
  return false;
}

/**
 * HTTP durum kodu, kanalın kullanılamaz olduğunu mu gösteriyor?
 *
 * 502 = proxy'nin kendi "kanal yayında değil" kodu.
 * Sağlayıcı yanıt verdi ama aktif bir yayın döndürmedi (hata sayfası, 503 vb.).
 * Bu durumda otomatik yeniden deneme ve motor takası anlamsızdır.
 *
 * 504 = sağlayıcıya hiç ulaşılamadı (bağlantı hatası / zaman aşımı).
 * Bu geçici bir durumdur; yeniden deneme anlamlıdır.
 */
export function isUnavailableStatus(code: number): boolean {
  return code === 502;
}
