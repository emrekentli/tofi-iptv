import { describe, expect, it } from "vitest";
import { proxyUrl, sign, verify } from "./sign";

const SECRET = "test-secret";
const URL_A = "http://provider.example/live/1.ts";
const URL_B = "http://provider.example/live/2.ts";

describe("sign", () => {
  it("aynı girdi için aynı imzayı üretir", () => {
    expect(sign(URL_A, SECRET)).toBe(sign(URL_A, SECRET));
  });

  it("farklı URL için farklı imza üretir", () => {
    expect(sign(URL_A, SECRET)).not.toBe(sign(URL_B, SECRET));
  });

  it("farklı gizli anahtar için farklı imza üretir", () => {
    expect(sign(URL_A, SECRET)).not.toBe(sign(URL_A, "other-secret"));
  });

  it("URL güvenli karakterler üretir", () => {
    expect(sign(URL_A, SECRET)).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("verify", () => {
  it("geçerli imzayı kabul eder", () => {
    expect(verify(URL_A, sign(URL_A, SECRET), SECRET)).toBe(true);
  });

  it("başka URL'in imzasını reddeder", () => {
    expect(verify(URL_A, sign(URL_B, SECRET), SECRET)).toBe(false);
  });

  it("yanlış gizli anahtarla üretilmiş imzayı reddeder", () => {
    expect(verify(URL_A, sign(URL_A, "other-secret"), SECRET)).toBe(false);
  });

  it("farklı uzunluktaki imzada çökmeden false döner", () => {
    expect(verify(URL_A, "kisa", SECRET)).toBe(false);
  });

  it("boş imzayı reddeder", () => {
    expect(verify(URL_A, "", SECRET)).toBe(false);
  });
});

describe("proxyUrl", () => {
  it("hedefi ve imzayı sorgu parametresi olarak kodlar", () => {
    const result = proxyUrl(URL_A, SECRET);
    const parsed = new URL(result, "http://localhost");
    expect(parsed.pathname).toBe("/api/stream");
    expect(parsed.searchParams.get("u")).toBe(URL_A);
    expect(parsed.searchParams.get("sig")).toBe(sign(URL_A, SECRET));
  });

  it("sorgu içeren hedefleri bozmadan kodlar", () => {
    const target = "http://provider.example/x?a=1&b=2";
    const parsed = new URL(proxyUrl(target, SECRET), "http://localhost");
    expect(parsed.searchParams.get("u")).toBe(target);
  });
});
