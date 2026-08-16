import { createHash, timingSafeEqual } from "node:crypto";
import { requireEnv } from "@/lib/env";
import { SESSION_COOKIE, createSessionToken } from "@/lib/session";

/**
 * Parolaları sabit uzunluklu özetleri üzerinden sabit zamanlı karşılaştırır.
 * Ham baytları karşılaştırmak, uzunluk eşitsizliğinde erken dönerek
 * parolanın uzunluğunu sızdırırdı; SHA-256 özeti her zaman 32 bayttır.
 */
function passwordMatches(given: string, expected: string): boolean {
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function POST(request: Request): Promise<Response> {
  const expected = requireEnv("TOFI_PASSWORD");
  const secret = requireEnv("TOFI_SECRET");

  let password: unknown;
  try {
    ({ password } = await request.json());
  } catch {
    return new Response("Geçersiz istek gövdesi", { status: 400 });
  }

  if (typeof password !== "string" || !passwordMatches(password, expected)) {
    return new Response("Parola hatalı", { status: 401 });
  }

  const headers = new Headers();
  headers.append(
    "set-cookie",
    [
      `${SESSION_COOKIE}=${createSessionToken(secret)}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      `Max-Age=${60 * 60 * 24 * 30}`,
      process.env.NODE_ENV === "production" ? "Secure" : "",
    ]
      .filter(Boolean)
      .join("; "),
  );

  return new Response(null, { status: 204, headers });
}
