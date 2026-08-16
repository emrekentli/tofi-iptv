import { Readable, type Writable } from "node:stream";
import { isHlsResponse, rewriteHlsPlaylist } from "@/lib/hls-rewrite";
import { requireEnv } from "@/lib/env";
import { decryptToken } from "@/lib/sign";
import { checkPublicUrl } from "@/lib/safe-url";
import { detectEngine } from "@/lib/stream-type";
import { probeCodecs, type TsCodecs } from "@/lib/ts-probe";
import { needsAudioTranscode, spawnAudioTranscoder } from "@/lib/transcode";

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

/**
 * Codec tespiti için tamponlanacak azami bayt.
 *
 * PAT ve PMT akışın başında ve saniyede birkaç kez tekrarlanır; bu sınıra
 * kadar görünmediyse akış çözümlenemiyor demektir ve dokunulmadan geçirilir.
 * Tampon dolmadan tablolar bulunursa okuma erken biter — canlı yayında
 * gereksiz gecikme oluşmaz.
 */
const PROBE_HEAD_BYTES = 256 * 1024;

/** Codec tespiti bir sonuç üretebildi mi? */
function isProbeConclusive(codecs: TsCodecs): boolean {
  return codecs.video !== null || codecs.audio.length > 0;
}

/** Yeni yığını tampona ekler; yer yetmezse tamponu büyütür. Bayt kaybı olmaz. */
function appendBytes(
  target: Uint8Array,
  length: number,
  chunk: Uint8Array,
): Uint8Array {
  if (length + chunk.length <= target.length) {
    target.set(chunk, length);
    return target;
  }
  const grown = new Uint8Array(
    Math.max(target.length * 2, length + chunk.length),
  );
  grown.set(target.subarray(0, length));
  grown.set(chunk, length);
  return grown;
}

interface ProbedHead {
  /** Upstream'den okunmuş ama henüz istemciye gönderilmemiş baytlar. */
  head: Uint8Array;
  /** Upstream gövdesi bu baytlarla birlikte tamamen bitti mi? */
  upstreamDone: boolean;
  codecs: TsCodecs;
}

/**
 * Gövdenin başını okuyup codec'leri çözümler.
 *
 * Okunan baytlar tamponda saklanır ve çağıran tarafa geri verilir; bu baytlar
 * hiçbir koşulda atılmamalıdır — atılırsa oynatma yarım bir pakette başlar ve
 * konteyner bozulur.
 */
async function readAndProbeHead(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<ProbedHead> {
  let buffer: Uint8Array = new Uint8Array(64 * 1024);
  let length = 0;
  let upstreamDone = false;
  let codecs: TsCodecs = { video: null, audio: [] };

  while (length < PROBE_HEAD_BYTES) {
    const { done, value } = await reader.read();
    if (done) {
      upstreamDone = true;
      break;
    }
    if (value === undefined || value.length === 0) continue;

    buffer = appendBytes(buffer, length, value);
    length += value.length;

    const probed = probeCodecs(buffer.subarray(0, length));
    if (isProbeConclusive(probed)) {
      codecs = probed;
      break;
    }
  }

  return { head: buffer.subarray(0, length), upstreamDone, codecs };
}

/**
 * Tamponlanan başı, ardından gövdenin kalanını yayan akış.
 * Baş kısım her zaman ilk sırada gönderilir; aksi hâlde akışın başı kaybolur.
 */
function headThenRest(
  head: Uint8Array,
  reader: ReadableStreamDefaultReader<Uint8Array>,
  upstreamDone: boolean,
): ReadableStream<Uint8Array> {
  let headSent = false;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (!headSent) {
        headSent = true;
        if (head.length > 0) {
          controller.enqueue(head);
          return;
        }
      }
      if (upstreamDone) {
        controller.close();
        return;
      }
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        if (value !== undefined && value.length > 0) controller.enqueue(value);
      } catch (error) {
        controller.error(error);
      }
    },
    cancel(reason) {
      // İstemci ayrıldı; upstream soketini serbest bırak.
      void reader.cancel(reason).catch(() => {});
    },
  });
}

/**
 * ffmpeg'in stdin'ine geri basınca saygı duyarak yazar.
 * Boru kapandıysa `false` döner — çağıran taraf beslemeyi durdurmalıdır.
 */
function writeChunk(stdin: Writable, chunk: Uint8Array): Promise<boolean> {
  return new Promise((resolve) => {
    if (stdin.destroyed || stdin.writableEnded) {
      resolve(false);
      return;
    }
    // EPIPE burada yakalanır: ffmpeg erken kapanırsa yazma hata verir.
    const flushed = stdin.write(chunk, (error) => {
      if (error) resolve(false);
    });
    if (flushed) {
      resolve(true);
      return;
    }
    // Tampon doldu. `drain` beklenirken ffmpeg ölürse söz asla çözülmezdi;
    // bu yüzden kapanma ve hata olayları da dinlenir.
    const settle = (value: boolean) => () => {
      stdin.off("drain", onDrain);
      stdin.off("close", onClose);
      stdin.off("error", onClose);
      resolve(value);
    };
    const onDrain = settle(true);
    const onClose = settle(false);
    stdin.once("drain", onDrain);
    stdin.once("close", onClose);
    stdin.once("error", onClose);
  });
}

/**
 * ffmpeg'i başlatıp sesi AAC'ye çeviren bir gövde döndürür.
 * ffmpeg başlatılamazsa `null` döner ve çağıran taraf akışı olduğu gibi geçirir.
 */
async function transcodedBody(
  request: Request,
  head: Uint8Array,
  reader: ReadableStreamDefaultReader<Uint8Array>,
  upstreamDone: boolean,
): Promise<ReadableStream<Uint8Array> | null> {
  const transcoder = await spawnAudioTranscoder();
  if (transcoder === null) return null;

  let stopped = false;
  /**
   * Tek kapanış yolu. Üç tetikleyicisi vardır: istemcinin bağlantıyı kesmesi,
   * upstream'in bitmesi ve ffmpeg'in stdout'unun kapanması. Hepsi buraya
   * çıkar; aksi hâlde terk edilen her kanal değişiminde bir ffmpeg sızardı.
   */
  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    request.signal.removeEventListener("abort", stop);
    void reader.cancel().catch(() => {});
    transcoder.kill();
  };

  request.signal.addEventListener("abort", stop, { once: true });
  transcoder.stdout.once("close", stop);

  // Upstream → ffmpeg beslemesi. Yanıtı bloke etmemesi için beklenmez.
  void (async () => {
    try {
      if (head.length > 0 && !(await writeChunk(transcoder.stdin, head))) {
        return;
      }
      while (!upstreamDone && !stopped) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value === undefined || value.length === 0) continue;
        if (!(await writeChunk(transcoder.stdin, value))) return;
      }
    } catch {
      // Upstream koptu; aşağıdaki end() ffmpeg'in tamponu boşaltmasını sağlar.
    } finally {
      // Girdiyi kapatmak ffmpeg'in kalanı yazıp düzgünce çıkmasını sağlar.
      if (!transcoder.stdin.destroyed) transcoder.stdin.end();
    }
  })();

  return Readable.toWeb(transcoder.stdout) as ReadableStream<Uint8Array>;
}

/**
 * Gövdenin başını inceleyip gerekiyorsa sesi transcode ederek yanıtı kurar.
 * Tespit sonuçsuz kalırsa veya ffmpeg yoksa akış olduğu gibi geçirilir.
 */
async function streamWithOptionalTranscode(
  request: Request,
  body: ReadableStream<Uint8Array>,
  status: number,
  headers: Headers,
): Promise<Response> {
  const reader = body.getReader();

  let probed: ProbedHead;
  try {
    probed = await readAndProbeHead(reader);
  } catch (error) {
    void reader.cancel().catch(() => {});
    if (request.signal.aborted) return new Response(null, { status: 499 });
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("Yayın gövdesi okunamadı:", errorMsg);
    return new Response(
      "Bu kanal şu anda yayında değil — sağlayıcı yayını yarıda kesti",
      { status: 502 },
    );
  }

  if (needsAudioTranscode(probed.codecs)) {
    const transcoded = await transcodedBody(
      request,
      probed.head,
      reader,
      probed.upstreamDone,
    );
    if (transcoded !== null) {
      // Uzunluk ve bayt aralıkları artık kaynaktakiyle örtüşmüyor.
      headers.delete("content-length");
      headers.delete("content-range");
      headers.delete("accept-ranges");
      headers.set("content-type", "video/mp2t");
      return new Response(transcoded, { status: 200, headers });
    }
    // ffmpeg yok: sessiz oynayan bir yayın, hiç oynamayandan iyidir.
  }

  return new Response(
    headThenRest(probed.head, reader, probed.upstreamDone),
    { status, headers },
  );
}

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
    // 504: sağlayıcıya hiç ulaşılamadı (bağlantı hatası veya bağlantı zaman aşımı).
    // Bu geçici bir durumdur; istemci yeniden deneyebilir.
    return new Response(
      "Yayın kaynağına ulaşılamadı — sağlayıcı sunucusu yanıt vermedi veya bağlantı zaman aşımına uğradı",
      { status: 504 },
    );
  }

  if (!upstream.ok) {
    // Gövde iptal edilerek bağlantı havuza iade edilir. Tüketilmemiş hata
    // gövdeleri soketi havuz dışında tutar ve zamanla sızıntıya yol açar.
    upstream.body?.cancel();
    // 502: sağlayıcı yanıt verdi ama aktif bir yayın döndürmedi.
    // Bu yeniden denemede düzelmez; kanal sağlayıcı tarafında kapalı.
    return new Response(
      "Bu kanal şu anda yayında değil — sağlayıcı aktif bir yayın döndürmedi",
      { status: upstream.status === 404 ? 404 : 502 },
    );
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
    // 502: sağlayıcı yanıtladı ama medya yerine başka bir içerik gönderdi.
    // HTML veya JSON tabanlı hata sayfası olma ihtimali yüksek; kanal kapalı.
    return new Response(
      "Bu kanal şu anda yayında değil — sağlayıcı medya yerine başka bir içerik döndürdü",
      { status: 502 },
    );
  }

  // Güvenlik kalkanı: medya öğeleri Content-Disposition'ı yok sayar, ancak
  // gezinen bir tarayıcı dosyayı indirmeye zorlanır — aynı kaynak bağlamında çalışamaz.
  responseHeaders.set("content-disposition", "attachment");

  // Yalnızca MPEG-TS adayları incelenir. VOD dosyaları (.mp4/.mkv) eskisi gibi
  // dokunulmadan geçer; HLS playlist'leri zaten yukarıdaki dalda işlendi.
  if (upstream.body !== null && detectEngine(upstream.url) !== "native") {
    return await streamWithOptionalTranscode(
      request,
      upstream.body,
      upstream.status,
      responseHeaders,
    );
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}
