import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { requireEnv } from "./env";

describe("requireEnv", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear relevant env vars before each test
    delete process.env.TEST_VAR;
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
