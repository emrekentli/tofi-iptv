import { describe, expect, it } from "vitest";
import { createSessionToken, isValidSessionToken } from "./session";

const SECRET = "test-secret";

describe("session token", () => {
  it("üretilen token kendi gizli anahtarıyla doğrulanır", () => {
    expect(isValidSessionToken(createSessionToken(SECRET), SECRET)).toBe(true);
  });

  it("başka gizli anahtarla üretilmiş token reddedilir", () => {
    expect(isValidSessionToken(createSessionToken("other"), SECRET)).toBe(false);
  });

  it("tanımsız token reddedilir", () => {
    expect(isValidSessionToken(undefined, SECRET)).toBe(false);
  });

  it("boş token reddedilir", () => {
    expect(isValidSessionToken("", SECRET)).toBe(false);
  });

  it("rastgele token reddedilir", () => {
    expect(isValidSessionToken("rastgele-deger", SECRET)).toBe(false);
  });
});
