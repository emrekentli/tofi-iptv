import { describe, expect, it } from "vitest";
import { checkPublicUrl } from "./safe-url";

// ─── Sahte çözümleyici yardımcısı ─────────────────────────────────────────────

/** Verilen adresi döndüren sahte DNS çözümleyici üretir. */
function fakeResolver(addresses: { address: string; family: number }[]) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return (host: string, opts: { all: true }) => Promise.resolve(addresses);
}

/** DNS çözümlemesinin başarısız olmasını simüle eden çözümleyici. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function failingResolver(host: string, opts: { all: true }): never {
  throw new Error("ENOTFOUND hostname.invalid");
}

/** Genel (herkese açık) bir IP simüle eden çözümleyici. */
const publicResolver = fakeResolver([{ address: "93.184.216.34", family: 4 }]);

// ─── Protokol kontrolleri ──────────────────────────────────────────────────────

describe("protokol kontrolleri", () => {
  it("file: protokolünü reddeder", async () => {
    const result = await checkPublicUrl("file:///etc/passwd", publicResolver);
    expect(result.ok).toBe(false);
    expect((result as { ok: false; reason: string }).reason).toContain("protokol");
  });

  it("data: protokolünü reddeder", async () => {
    const result = await checkPublicUrl("data:text/plain,merhaba", publicResolver);
    expect(result.ok).toBe(false);
  });

  it("ftp: protokolünü reddeder", async () => {
    const result = await checkPublicUrl("ftp://example.com/file.txt", publicResolver);
    expect(result.ok).toBe(false);
  });

  it("gopher: protokolünü reddeder", async () => {
    const result = await checkPublicUrl("gopher://example.com/", publicResolver);
    expect(result.ok).toBe(false);
  });

  it("http: protokolüne izin verir", async () => {
    const result = await checkPublicUrl("http://example.com/video.m3u8", publicResolver);
    expect(result.ok).toBe(true);
  });

  it("https: protokolüne izin verir", async () => {
    const result = await checkPublicUrl("https://example.com/video.m3u8", publicResolver);
    expect(result.ok).toBe(true);
  });
});

// ─── Geçersiz URL ─────────────────────────────────────────────────────────────

describe("geçersiz URL", () => {
  it("tamamen bozuk bir URL'yi reddeder", async () => {
    const result = await checkPublicUrl("bu-bir-url-degil", publicResolver);
    expect(result.ok).toBe(false);
  });

  it("boş dizeyi reddeder", async () => {
    const result = await checkPublicUrl("", publicResolver);
    expect(result.ok).toBe(false);
  });
});

// ─── localhost ve yerel alan adları ──────────────────────────────────────────

describe("localhost ve .local alan adları", () => {
  it("'localhost' adresini reddeder", async () => {
    const result = await checkPublicUrl("http://localhost:3000/", publicResolver);
    expect(result.ok).toBe(false);
    expect((result as { ok: false; reason: string }).reason).toMatch(/yerel/i);
  });

  it("'foo.localhost' adresini reddeder", async () => {
    const result = await checkPublicUrl("http://foo.localhost/", publicResolver);
    expect(result.ok).toBe(false);
  });

  it("'.local' son ekli alan adını reddeder", async () => {
    const result = await checkPublicUrl("http://printer.local/", publicResolver);
    expect(result.ok).toBe(false);
  });
});

// ─── Kısıtlı IPv4 aralıkları ─────────────────────────────────────────────────

describe("literal kısıtlı IPv4 adresleri", () => {
  it("0.0.0.0/8 — belirsiz adresi reddeder", async () => {
    const result = await checkPublicUrl("http://0.0.0.1/", publicResolver);
    expect(result.ok).toBe(false);
  });

  it("10.0.0.1 — RFC-1918 özel adresini reddeder", async () => {
    const result = await checkPublicUrl("http://10.0.0.1/", publicResolver);
    expect(result.ok).toBe(false);
  });

  it("10.255.255.255 — RFC-1918 aralığı sonunu reddeder", async () => {
    const result = await checkPublicUrl("http://10.255.255.255/", publicResolver);
    expect(result.ok).toBe(false);
  });

  it("127.0.0.1 — loopback'i reddeder", async () => {
    const result = await checkPublicUrl("http://127.0.0.1/", publicResolver);
    expect(result.ok).toBe(false);
  });

  it("127.255.255.255 — loopback aralığı sonunu reddeder", async () => {
    const result = await checkPublicUrl("http://127.255.255.255/", publicResolver);
    expect(result.ok).toBe(false);
  });

  it("169.254.169.254 — bulut meta-veri adresini reddeder", async () => {
    const result = await checkPublicUrl("http://169.254.169.254/latest/meta-data/", publicResolver);
    expect(result.ok).toBe(false);
  });

  it("169.254.0.1 — link-local adresini reddeder", async () => {
    const result = await checkPublicUrl("http://169.254.0.1/", publicResolver);
    expect(result.ok).toBe(false);
  });

  it("172.16.0.1 — RFC-1918 172.16/12 başlangıcını reddeder", async () => {
    const result = await checkPublicUrl("http://172.16.0.1/", publicResolver);
    expect(result.ok).toBe(false);
  });

  it("172.31.255.255 — RFC-1918 172.16/12 sonunu reddeder", async () => {
    const result = await checkPublicUrl("http://172.31.255.255/", publicResolver);
    expect(result.ok).toBe(false);
  });

  it("172.15.0.1 — 172.15 aralığı dışında olduğu için geçer", async () => {
    const result = await checkPublicUrl("http://172.15.0.1/", publicResolver);
    // Literal IP kontrolünü geçer; DNS resolver herkese açık sonuç döner
    expect(result.ok).toBe(true);
  });

  it("192.168.1.1 — RFC-1918 özel adresini reddeder", async () => {
    const result = await checkPublicUrl("http://192.168.1.1/", publicResolver);
    expect(result.ok).toBe(false);
  });

  it("100.64.0.1 — CGNAT adresini reddeder", async () => {
    const result = await checkPublicUrl("http://100.64.0.1/", publicResolver);
    expect(result.ok).toBe(false);
  });

  it("100.127.255.255 — CGNAT aralığı sonunu reddeder", async () => {
    const result = await checkPublicUrl("http://100.127.255.255/", publicResolver);
    expect(result.ok).toBe(false);
  });
});

// ─── Kısıtlı IPv6 adresleri ──────────────────────────────────────────────────

describe("literal kısıtlı IPv6 adresleri", () => {
  it("::1 — IPv6 loopback'i reddeder", async () => {
    const result = await checkPublicUrl("http://[::1]/", publicResolver);
    expect(result.ok).toBe(false);
  });

  it(":: — belirsiz IPv6 adresini reddeder", async () => {
    const result = await checkPublicUrl("http://[::]/", publicResolver);
    expect(result.ok).toBe(false);
  });

  it("fc00::/7 — benzersiz yerel IPv6 adresini reddeder (fc)", async () => {
    const result = await checkPublicUrl("http://[fc00::1]/", publicResolver);
    expect(result.ok).toBe(false);
  });

  it("fd00::/7 — benzersiz yerel IPv6 adresini reddeder (fd)", async () => {
    const result = await checkPublicUrl("http://[fd00::1]/", publicResolver);
    expect(result.ok).toBe(false);
  });

  it("fe80::/10 — link-local IPv6 adresini reddeder", async () => {
    const result = await checkPublicUrl("http://[fe80::1]/", publicResolver);
    expect(result.ok).toBe(false);
  });

  it("::ffff:127.0.0.1 — IPv4-eşlemli loopback'i reddeder", async () => {
    const result = await checkPublicUrl("http://[::ffff:127.0.0.1]/", publicResolver);
    expect(result.ok).toBe(false);
  });

  it("::ffff:192.168.1.1 — IPv4-eşlemli özel adresi reddeder", async () => {
    const result = await checkPublicUrl("http://[::ffff:192.168.1.1]/", publicResolver);
    expect(result.ok).toBe(false);
  });

  it("::ffff:169.254.169.254 — IPv4-eşlemli bulut meta-verisini reddeder", async () => {
    const result = await checkPublicUrl("http://[::ffff:169.254.169.254]/", publicResolver);
    expect(result.ok).toBe(false);
  });
});

// ─── DNS çözümlemesi yoluyla özel adres tespiti ───────────────────────────────

describe("DNS çözümlemesi ile kısıtlı adres tespiti", () => {
  it("özel adrese çözümlenen alan adını reddeder", async () => {
    const resolver = fakeResolver([{ address: "10.0.0.1", family: 4 }]);
    const result = await checkPublicUrl("http://internal.example.com/", resolver);
    expect(result.ok).toBe(false);
    expect((result as { ok: false; reason: string }).reason).toContain("özel");
  });

  it("169.254.169.254'e çözümlenen alan adını reddeder", async () => {
    const resolver = fakeResolver([{ address: "169.254.169.254", family: 4 }]);
    const result = await checkPublicUrl("http://metadata.aws.example.com/", resolver);
    expect(result.ok).toBe(false);
  });

  it("çözümlenemeyen alan adını reddeder", async () => {
    const result = await checkPublicUrl(
      "http://hostname.invalid/",
      failingResolver as unknown as (
        host: string,
        opts: { all: true },
      ) => Promise<{ address: string; family: number }[]>,
    );
    expect(result.ok).toBe(false);
    expect((result as { ok: false; reason: string }).reason).toContain("çözümlenemedi");
  });

  it("herkese açık adrese çözümlenen alan adına izin verir", async () => {
    // Ağa bağlantı gerektirmez; sahte çözümleyici kullanır
    const result = await checkPublicUrl("http://example.com/video.m3u8", publicResolver);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.url.hostname).toBe("example.com");
    }
  });
});

// ─── URL nesnesinin doğru döndürüldüğünü doğrular ───────────────────────────

describe("dönen URL nesnesi", () => {
  it("başarı durumunda URL nesnesini döndürür", async () => {
    const result = await checkPublicUrl("https://cdn.example.com/stream.m3u8", publicResolver);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.url).toBeInstanceOf(URL);
      expect(result.url.hostname).toBe("cdn.example.com");
    }
  });
});
