import { createHash, randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

/**
 * TOFI_SECRET'ten AES-256-GCM anahtarı türetir.
 * SHA-256 kullanılarak sabit 32 baytlık anahtar elde edilir.
 */
function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

/**
 * Hedef URL'i AES-256-GCM ile şifreleyip opak bir token üretir.
 * Token formatı: base64url(iv[12] || ciphertext || authTag[16])
 *
 * Avantajı: URL asla query string'e düşmez → proxy logları ve tarayıcı
 * geçmişi şifre içermez. GCM kutudan çıkar çıkmaz bütünlük sağlar;
 * ayrı HMAC gereksizdir.
 */
export function encryptToken(target: string, secret: string): string {
  const key = deriveKey(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(target, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, ciphertext, authTag]).toString("base64url");
}

/**
 * encryptToken ile üretilmiş token'ı çözüp orijinal URL'i döndürür.
 * Herhangi bir hata (bozuk token, yanlış anahtar, değiştirilmiş veri) → null.
 */
export function decryptToken(token: string, secret: string): string | null {
  try {
    const key = deriveKey(secret);
    const buf = Buffer.from(token, "base64url");
    // iv: 12 bayt, authTag: 16 bayt — en az 28 bayt gerekli
    if (buf.byteLength < 28) return null;
    const iv = buf.subarray(0, 12);
    const authTag = buf.subarray(buf.byteLength - 16);
    const ciphertext = buf.subarray(12, buf.byteLength - 16);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    return decipher.update(ciphertext) + decipher.final("utf8");
  } catch {
    return null;
  }
}

/** Hedefi kendi stream proxy'mize yönlendiren göreli URL üretir. */
export function proxyUrl(target: string, secret: string): string {
  const token = encryptToken(target, secret);
  return `/api/stream?t=${token}`;
}
