import { requireEnv } from "@/lib/env";
import { verify } from "@/lib/sign";

/** Upstream'e iletilecek istek başlıkları. Range, VOD'da ileri sarma için şart. */
const FORWARD_REQUEST_HEADERS = ["range", "user-agent"];

/** İstemciye geçirilecek yanıt başlıkları. */
const FORWARD_RESPONSE_HEADERS = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
];

export async function GET(request: Request): Promise<Response> {
  const secret = requireEnv("TOFI_SECRET");
  const { searchParams } = new URL(request.url);
  const target = searchParams.get("u");
  const sig = searchParams.get("sig");

  if (!target || !sig) {
    return new Response("u ve sig parametreleri zorunlu", { status: 400 });
  }
  if (!verify(target, sig, secret)) {
    return new Response("Geçersiz imza", { status: 403 });
  }

  const headers = new Headers();
  for (const name of FORWARD_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      headers,
      signal: request.signal,
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
      // Malformed target URL; use default host.
    }
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`Upstream'e bağlanılamadı (${host}):`, errorMsg);
    return new Response("Yayın kaynağına ulaşılamadı", { status: 502 });
  }

  if (!upstream.ok) {
    // Cancel the response body to release the connection back to the pool.
    // Without this, unconsumed bodies in error responses cause socket leaks.
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

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}
