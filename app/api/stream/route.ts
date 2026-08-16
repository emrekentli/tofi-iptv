import { isHlsResponse, rewriteHlsPlaylist } from "@/lib/hls-rewrite";
import { requireEnv } from "@/lib/env";
import { decryptToken } from "@/lib/sign";
import { checkPublicUrl } from "@/lib/safe-url";

/** Upstream'e iletilecek istek başlıkları. Range, VOD'da ileri sarma için şart. */
const FORWARD_REQUEST_HEADERS = ["range", "user-agent"];

/** İstemciye geçirilecek yanıt başlıkları. */
const FORWARD_RESPONSE_HEADERS = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
];

/**
 * Bu route yalnızca medya taşır. HTML veya script içerikli bir yanıt her zaman
 * bir yanlış yapılandırmaya ya da saldırıya işaret eder; kabul edilmez.
 *
 * Bazı panel yazılımları .m3u dosyalarını text/plain olarak sunar — bu nedenle
 * text/plain izin listesine dahildir.
 */
const ALLOWED_CONTENT_TYPE_PREFIXES = [
  "video/",
  "audio/",
  "application/octet-stream",
  "application/vnd.apple.mpegurl",
  "application/x-mpegurl",
  "application/dash+xml",
  "text/plain",
];

/** Upstream'in içerik tipinin medya olup olmadığını kontrol eder. */
function isAllowedContentType(contentType: string | null): boolean {
  if (!contentType) return true; // İçerik tipi yoksa bloke etme; HLS dalı zaten ayrı işler
  const lower = contentType.toLowerCase().split(";")[0].trim();
  return ALLOWED_CONTENT_TYPE_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

/**
 * Bağlantı aşaması için zaman aşımı — canlı akış saatlerce sürebilir,
 * bu yüzden toplam süreyi değil yalnızca ilk yanıtı sınırlandırıyoruz.
 * İstemci sinyaliyle birleştirilerek hangisi önce gelirse onu kullanırız.
 *
 * DİKKAT: Bu değeri "akış kesildi" hatasını düzeltmek amacıyla toplam
 * bağlantı süresi olarak ayarlamayın — uzun seyirciyi koparır.
 */
const STREAM_CONNECT_TIMEOUT_MS = 20_000;

export async function GET(request: Request): Promise<Response> {
  const secret = requireEnv("TOFI_SECRET");
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("t");

  if (!token) {
    return new Response("t parametresi zorunlu", { status: 400 });
  }

  // Token'ı çöz — GCM kutudan çıkar çıkmaz bütünlük doğrular; ayrı HMAC gerekmez.
  const target = decryptToken(token, secret);
  if (!target) {
    return new Response("Geçersiz token", { status: 403 });
  }

  // Gerçek chokepoint: token geçerli olsa bile URL dahili ağa işaret edemez.
  // URL hiçbir zaman loglanmaz; şifre taşıyor olabilir.
  const check = await checkPublicUrl(target);
  if (!check.ok) {
    return new Response(check.reason, { status: 400 });
  }

  const headers = new Headers();
  for (const name of FORWARD_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  // Bağlantı aşaması için zaman aşımı: ilk yanıt gelmezse 20 s sonra vazgeç.
  // İstemci önceden bağlantıyı keserse onun sinyali de ateşlenir.
  const connectSignal = AbortSignal.any([
    request.signal,
    AbortSignal.timeout(STREAM_CONNECT_TIMEOUT_MS),
  ]);

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      headers,
      signal: connectSignal,
      redirect: "follow",
      cache: "no-store",
    });
  } catch (error) {
    if (request.signal.aborted) {
      // İstemci sekmeyi kapattı veya kanal değiştirdi; hata değil.
      return new Response(null, { status: 499 });
    }
    let host = "unknown";
    try {
      host = new URL(target).host;
    } catch {
      // Hedef URL çözümlenemedi; varsayılan host ile devam edilir.
    }
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`Upstream'e bağlanılamadı (${host}):`, errorMsg);
    return new Response("Yayın kaynağına ulaşılamadı", { status: 502 });
  }

  if (!upstream.ok) {
    // Gövde iptal edilerek bağlantı havuza iade edilir. Tüketilmemiş hata
    // gövdeleri soketi havuz dışında tutar ve zamanla sızıntıya yol açar.
    upstream.body?.cancel();
    return new Response(`Yayın kaynağı ${upstream.status} döndü`, {
      status: upstream.status === 404 ? 404 : 502,
    });
  }

  const responseHeaders = new Headers();
  for (const name of FORWARD_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  responseHeaders.set("cache-control", "no-store");

  // Tüm yanıtlara nosniff eklenir — içerik tipi ne olursa olsun tarayıcı
  // içeriği farklı yorumlamaya çalışmamalıdır.
  responseHeaders.set("x-content-type-options", "nosniff");

  if (isHlsResponse(upstream.headers.get("content-type"), upstream.url)) {
    // Playlist küçük bir metin dosyasıdır; belleğe alıp yeniden yazmak güvenlidir.
    const rewritten = rewriteHlsPlaylist(await upstream.text(), upstream.url, secret);
    responseHeaders.delete("content-length"); // uzunluk değişti
    // fetch() önceden yönlendirmeleri izler; yeniden yazılmış playlist her zaman 200 döner.
    return new Response(rewritten, { status: 200, headers: responseHeaders });
  }

  // Medya olmayan içerik tipleri reddedilir — HTML, JSON veya başka her şey
  // bu proxy'den geçemez. Saldırganın imzalı URL'den HTML servis etmesini engeller.
  const upstreamContentType = upstream.headers.get("content-type");
  if (!isAllowedContentType(upstreamContentType)) {
    upstream.body?.cancel();
    return new Response(
      "Yayın kaynağı medya olmayan bir içerik tipi döndürdü; bağlantı reddedildi",
      { status: 502 },
    );
  }

  // Güvenlik kalkanı: medya öğeleri Content-Disposition'ı yok sayar, ancak
  // gezinen bir tarayıcı dosyayı indirmeye zorlanır — aynı kaynak bağlamında çalışamaz.
  responseHeaders.set("content-disposition", "attachment");

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}
