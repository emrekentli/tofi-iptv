import { parseM3U } from "@/lib/sources/m3u";
import type { Channel } from "@/lib/types";

/** Playlist'ler büyük olabilir; makul bir tavan koyup belleği koruyoruz. */
const MAX_BYTES = 200 * 1024 * 1024;

/** Gövdeyi bayt sayarak okur; sınır aşılırsa akışı iptal edip null döner.
 *  content-length başlığına güvenilemez — chunked yanıtlarda hiç gelmez. */
async function readWithLimit(
  response: Response,
  maxBytes: number,
): Promise<string | null> {
  if (!response.body) return null;
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
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
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

  let target: URL;
  try {
    target = new URL(url.trim());
  } catch {
    return Response.json({ error: "Adres çözümlenemedi" }, { status: 400 });
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return Response.json({ error: "Yalnızca http/https desteklenir" }, { status: 400 });
  }

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

  const text = await readWithLimit(response, MAX_BYTES);
  if (text === null) {
    return Response.json({ error: "Playlist çok büyük" }, { status: 413 });
  }

  const { channels: parsed, skipped } = parseM3U(text);

  // Ham adres döndürülür; imzalama istemci isteğinde /api/sign üzerinden yapılır.
  const channels: Channel[] = parsed.map(({ rawUrl, ...rest }) => ({
    ...rest,
    url: rawUrl,
  }));

  return Response.json({ channels, skipped });
}
