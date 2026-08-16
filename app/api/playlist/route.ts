import { requireEnv } from "@/lib/env";
import { proxyUrl } from "@/lib/sign";
import { parseM3U } from "@/lib/sources/m3u";
import type { Channel } from "@/lib/types";

/** Playlist'ler büyük olabilir; makul bir tavan koyup belleği koruyoruz. */
const MAX_BYTES = 200 * 1024 * 1024;

export async function POST(request: Request): Promise<Response> {
  const secret = requireEnv("TOFI_SECRET");

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
    console.error(
      `Playlist indirilemedi (${target.host}):`,
      error instanceof Error ? error.message : String(error),
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

  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) {
    response.body?.cancel();
    return Response.json({ error: "Playlist çok büyük" }, { status: 413 });
  }

  const { channels: parsed, skipped } = parseM3U(await response.text());

  // İmzalama sunucuda yapılır; gizli anahtar istemciye asla gitmez.
  const channels: Channel[] = parsed.map(({ rawUrl, ...rest }) => ({
    ...rest,
    url: proxyUrl(rawUrl, secret),
  }));

  return Response.json({ channels, skipped });
}
