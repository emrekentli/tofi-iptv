import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { requireEnv } from "./env";

describe("requireEnv", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear relevant env vars before each test
    delete process.env.TEST_VAR;
    delete process.env.TOFI_SECRET;
  });

  afterEach(() => {
    // Restore original env after each test
    process.env = { ...originalEnv };
  });

  it("değişken ayarlanmışsa değeri döner", () => {
    process.env.TEST_VAR = "test-value";
    expect(requireEnv("TEST_VAR")).toBe("test-value");
  });

  it("değişken eksikse hata fırlatır", () => {
    expect(() => requireEnv("TEST_VAR")).toThrow(
      /Ortam değişkeni eksik: TEST_VAR/
    );
  });

  it("değişken boş dizeyse hata fırlatır", () => {
    process.env.TEST_VAR = "";
    expect(() => requireEnv("TEST_VAR")).toThrow(
      /Ortam değişkeni eksik: TEST_VAR/
    );
  });

  it('değişken "0" olarak ayarlanmışsa "0" döner', () => {
    process.env.TEST_VAR = "0";
    expect(requireEnv("TEST_VAR")).toBe("0");
  });
});

describe("requireEnv — TOFI_SECRET güvenlik kontrolleri", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('bilinen yer tutucu "degistir-beni" değerini reddeder', () => {
    process.env.TOFI_SECRET = "degistir-beni";
    expect(() => requireEnv("TOFI_SECRET")).toThrow(/yer tutucu/);
  });

  it("16 karakterden kısa değeri reddeder", () => {
    process.env.TOFI_SECRET = "kisa-anahtar";
    expect(() => requireEnv("TOFI_SECRET")).toThrow(/kısa/);
  });

  it("tam 16 karakter uzunluğundaki değeri kabul eder", () => {
    process.env.TOFI_SECRET = "a".repeat(16);
    expect(requireEnv("TOFI_SECRET")).toBe("a".repeat(16));
  });

  it("16 karakterden uzun değeri kabul eder", () => {
    process.env.TOFI_SECRET = "guclu-gizli-anahtar-uzun";
    expect(requireEnv("TOFI_SECRET")).toBe("guclu-gizli-anahtar-uzun");
  });

  it("eksik TOFI_SECRET hata fırlatır", () => {
    delete process.env.TOFI_SECRET;
    expect(() => requireEnv("TOFI_SECRET")).toThrow(/Ortam değişkeni eksik/);
  });
});
