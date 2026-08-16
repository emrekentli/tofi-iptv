import { describe, expect, it } from "vitest";
import { encryptToken, decryptToken, proxyUrl } from "./sign";

const SECRET = "test-secret-long-enough";
const URL_A = "http://provider.example/live/1.ts";
const URL_B = "http://provider.example/live/2.ts";

describe("encryptToken / decryptToken", () => {
  it("şifrelenmiş token'ı geri çözer", () => {
    const token = encryptToken(URL_A, SECRET);
    expect(decryptToken(token, SECRET)).toBe(URL_A);
  });

  it("farklı URL'ler için farklı token üretir (rastgele IV)", () => {
    const t1 = encryptToken(URL_A, SECRET);
    const t2 = encryptToken(URL_A, SECRET);
    // Rastgele IV sayesinde aynı girdi farklı token üretir
    expect(t1).not.toBe(t2);
    // Ama her ikisi de doğru çözülür
    expect(decryptToken(t1, SECRET)).toBe(URL_A);
    expect(decryptToken(t2, SECRET)).toBe(URL_A);
  });

  it("farklı gizli anahtarla çözmeye çalışınca null döner", () => {
    const token = encryptToken(URL_A, SECRET);
    expect(decryptToken(token, "yanlis-anahtar-abc12")).toBeNull();
  });

  it("değiştirilmiş token null döner", () => {
    const token = encryptToken(URL_A, SECRET);
    // Ortadaki bir karakteri değiştir — SON karakter değil!
    // base64url'de son karakter, bayt sayısına göre kullanılmayan bitler
    // taşıyabilir; onu değiştirmek çözülen baytları hiç değiştirmeyebilir ve
    // test rastgele IV'ye bağlı olarak yaklaşık %50 oranında yanlış geçerdi.
    // Ortadaki karakter her zaman tam bir bayta katkı verir.
    const mid = Math.floor(token.length / 2);
    const swapped = token[mid] === "A" ? "B" : "A";
    const tampered = token.slice(0, mid) + swapped + token.slice(mid + 1);
    expect(tampered).not.toBe(token);
    expect(decryptToken(tampered, SECRET)).toBeNull();
  });

  it("kısa/bozuk token null döner", () => {
    expect(decryptToken("kisa", SECRET)).toBeNull();
    expect(decryptToken("", SECRET)).toBeNull();
  });

  it("token URL güvenli karakterler içerir (base64url)", () => {
    const token = encryptToken(URL_A, SECRET);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("farklı URL'ler doğru çözülür", () => {
    expect(decryptToken(encryptToken(URL_A, SECRET), SECRET)).toBe(URL_A);
    expect(decryptToken(encryptToken(URL_B, SECRET), SECRET)).toBe(URL_B);
  });

  it("sorgu parametresi içeren URL'leri bozulmadan şifreler", () => {
    const target = "http://provider.example/x?a=1&b=2";
    expect(decryptToken(encryptToken(target, SECRET), SECRET)).toBe(target);
  });
});

describe("proxyUrl", () => {
  it("t parametreli /api/stream yolu üretir", () => {
    const result = proxyUrl(URL_A, SECRET);
    const parsed = new URL(result, "http://localhost");
    expect(parsed.pathname).toBe("/api/stream");
    expect(parsed.searchParams.has("t")).toBe(true);
    expect(parsed.searchParams.has("u")).toBe(false);
    expect(parsed.searchParams.has("sig")).toBe(false);
  });

  it("token'dan orijinal URL geri çözülür", () => {
    const result = proxyUrl(URL_A, SECRET);
    const parsed = new URL(result, "http://localhost");
    const token = parsed.searchParams.get("t")!;
    expect(decryptToken(token, SECRET)).toBe(URL_A);
  });

  it("sorgu içeren hedefleri bozulmadan şifreler", () => {
    const target = "http://provider.example/x?a=1&b=2";
    const parsed = new URL(proxyUrl(target, SECRET), "http://localhost");
    const token = parsed.searchParams.get("t")!;
    expect(decryptToken(token, SECRET)).toBe(target);
  });
});
