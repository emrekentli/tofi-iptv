import { requireEnv } from "@/lib/env";
import { proxyUrl } from "@/lib/sign";
import { checkPublicUrl } from "@/lib/safe-url";

export async function POST(request: Request): Promise<Response> {
  const secret = requireEnv("TOFI_SECRET");

  let url: unknown;
  try {
    ({ url } = await request.json());
  } catch {
    return Response.json({ error: "Geçersiz istek gövdesi" }, { status: 400 });
  }

  if (typeof url !== "string" || !url.trim()) {
    return Response.json({ error: "Adres gerekli" }, { status: 400 });
  }

  const trimmed = url.trim();

  // Adresi doğrula: protokol, dahili ağ ve DNS kontrolü
  const check = await checkPublicUrl(trimmed);
  if (!check.ok) {
    // URL hiçbir zaman loglanmaz; kullanıcı adı ve şifre taşıyor olabilir.
    return Response.json({ error: check.reason }, { status: 400 });
  }

  return Response.json({ src: proxyUrl(trimmed, secret) });
}
