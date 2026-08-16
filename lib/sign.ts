import { createHmac, timingSafeEqual } from "node:crypto";

/** Hedef URL için base64url kodlu HMAC-SHA256 imzası üretir. */
export function sign(target: string, secret: string): string {
  return createHmac("sha256", secret).update(target).digest("base64url");
}

/**
 * İmzayı sabit zamanlı karşılaştırır.
 * timingSafeEqual eşit olmayan uzunlukta hata fırlattığı için önce uzunluk kontrol edilir.
 */
export function verify(target: string, sig: string, secret: string): boolean {
  const expected = Buffer.from(sign(target, secret));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

/** Hedefi kendi stream proxy'mize yönlendiren göreli URL üretir. */
export function proxyUrl(target: string, secret: string): string {
  const params = new URLSearchParams({ u: target, sig: sign(target, secret) });
  return `/api/stream?${params.toString()}`;
}
