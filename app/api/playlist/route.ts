import { parseM3U } from "@/lib/sources/m3u";
import { checkPublicUrl } from "@/lib/safe-url";
import type { RawChannel } from "@/lib/db";

/** Playlist'ler büyük olabilir; makul bir tavan koyup belleği koruyoruz.
 *  Gerçek playlist ~40 MB; 80 MB tavan iki katlık bir güvenlik payı sağlar. */
const MAX_BYTES = 80 * 1024 * 1024;

/** readWithLimit dönüş değeri — null ile "yok" ve "aşıldı" ayrımını sağlar. */
type ReadResult =
  | { kind: "ok"; text: string }
  | { kind: "missing" }
  | { kind: "too_large" };

/** Gövdeyi bayt sayarak okur; sınır aşılırsa akışı iptal edip too_large döner.
 *  content-length başlığına güvenilemez — chunked yanıtlarda hiç gelmez. */
async function readWithLimit(
  response: Response,
  maxBytes: number,
): Promise<ReadResult> {
  if (!response.body) return { kind: "missing" };
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return { kind: "too_large" };
    }
    text += decoder.decode(value, { stream: true });
  }
  return { kind: "ok", text: text + decoder.decode() };
}

export async function POST(request: Request): Promise<Response> {
  let url: unknown;
  try {
    ({ url } = await request.json());
  } catch {
    return Response.json({ error: "Geçersiz istek gövdesi" }, { status: 400 });
  }

  if (typeof url !== "string" || !url.trim()) {
    return Response.json({ error: "Playlist adresi gerekli" }, { status: 400 });
  }

  const trimmed = url.trim();

  // Adresi doğrula: protokol, dahili ağ ve DNS kontrolü
  const check = await checkPublicUrl(trimmed);
  if (!check.ok) {
    // URL hiçbir zaman loglanmaz; kullanıcı adı ve şifre taşıyor olabilir.
    return Response.json({ error: check.reason }, { status: 400 });
  }

  const target = check.url;

  let response: Response;
  try {
    response = await fetch(target, { signal: request.signal, cache: "no-store" });
  } catch (error) {
    // Playlist adresi kullanıcı adı ve şifre taşır; yalnızca host loglanır.
    const detail = error instanceof Error ? error.message : String(error);
    console.error(
      `Playlist indirilemedi (${target.host}):`,
      detail.split(target.href).join("[adres]"),
    );
    return Response.json({ error: "Playlist sunucusuna ulaşılamadı" }, { status: 502 });
  }

  if (!response.ok) {
    response.body?.cancel();
    return Response.json(
      {
        error:
          response.status === 401 || response.status === 403
            ? "Kullanıcı adı veya şifre hatalı"
            : `Playlist sunucusu ${response.status} döndü`,
      },
      { status: response.status === 404 ? 404 : 502 },
    );
  }

  const result = await readWithLimit(response, MAX_BYTES);
  if (result.kind === "missing") {
    return Response.json({ error: "Playlist yanıtında gövde yok" }, { status: 502 });
  }
  if (result.kind === "too_large") {
    return Response.json({ error: "Playlist çok büyük" }, { status: 413 });
  }

  const { channels: parsed, skipped } = parseM3U(result.text);

  // Ham adres döndürülür; imzalama istemci isteğinde /api/sign üzerinden yapılır.
  // playlistId istemci tarafında addPlaylist() çağrılırken eklenir.
  const channels: RawChannel[] = parsed.map(({ rawUrl, ...rest }) => ({
    ...rest,
    url: rawUrl,
  }));

  return Response.json({ channels, skipped });
}
