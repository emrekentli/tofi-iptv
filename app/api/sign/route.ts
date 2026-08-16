import { requireEnv } from "@/lib/env";
import { proxyUrl } from "@/lib/sign";

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

  try {
    const target = new URL(url.trim());
    if (target.protocol !== "http:" && target.protocol !== "https:") {
      return Response.json({ error: "Yalnızca http/https" }, { status: 400 });
    }
  } catch {
    return Response.json({ error: "Adres çözümlenemedi" }, { status: 400 });
  }

  return Response.json({ src: proxyUrl(url.trim(), secret) });
}
