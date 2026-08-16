import { lookup } from "node:dns/promises";

export type UrlCheck = { ok: true; url: URL } | { ok: false; reason: string };

// ─── Yardımcı aralık kontrolleri ──────────────────────────────────────────────

/** IPv4 adresini dört sekizliye böler. */
function parseIPv4(host: string): number[] | null {
  const parts = host.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map(Number);
  if (octets.some((o) => !Number.isInteger(o) || o < 0 || o > 255)) return null;
  return octets;
}

/** RFC-1918 ve diğer kısıtlı IPv4 aralıklarını denetler. */
function isPrivateIPv4(host: string): boolean {
  const o = parseIPv4(host);
  if (!o) return false;
  const [a, b, c] = o;

  return (
    a === 0 || // 0.0.0.0/8 — "bu ağ"
    a === 10 || // 10.0.0.0/8 — özel
    a === 127 || // 127.0.0.0/8 — loopback
    (a === 169 && b === 254) || // 169.254.0.0/16 — link-local / bulut meta-verisi
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12 — özel
    (a === 192 && b === 168) || // 192.168.0.0/16 — özel
    (a === 100 && b >= 64 && b <= 127) || // 100.64.0.0/10 — CGNAT
    (a === 192 && b === 0 && c === 2) || // TEST-NET-1
    (a === 198 && b === 51 && c === 100) || // TEST-NET-2
    (a === 203 && b === 0 && c === 113) // TEST-NET-3
  );
}

/** Kısıtlı IPv6 adreslerini denetler. */
function isPrivateIPv6(host: string): boolean {
  // Köşeli parantezleri temizle (URL içinden gelirse)
  const addr = host.replace(/^\[|\]$/g, "").toLowerCase();

  // Loopback
  if (addr === "::1") return true;
  // Belirsiz adres
  if (addr === "::" || addr === "0:0:0:0:0:0:0:0") return true;

  // IPv4-eşlemli adresler: ::ffff:a.b.c.d veya ::ffff:0xAABBCCDD
  const mappedDotted = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mappedDotted) return isPrivateIPv4(mappedDotted[1]);

  const mappedHex = addr.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (mappedHex) {
    const hi = parseInt(mappedHex[1], 16);
    const lo = parseInt(mappedHex[2], 16);
    const dotted = [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff].join(".");
    return isPrivateIPv4(dotted);
  }

  // fc00::/7 — benzersiz yerel
  // İlk sekizliyi ayrıştır: fc veya fd ile başlar
  const firstGroup = addr.split(":")[0];
  const first = parseInt(firstGroup, 16);
  if (!isNaN(first) && (first & 0xfe00) === 0xfc00) return true;

  // fe80::/10 — link-local
  if (!isNaN(first) && (first & 0xffc0) === 0xfe80) return true;

  return false;
}

/**
 * Verilen IP adresi veya hostname'in kısıtlı/özel bir konuma işaret edip
 * etmediğini söyler. Hem IPv4 hem IPv6 desteklenir.
 */
function isPrivateAddress(addr: string): boolean {
  return isPrivateIPv4(addr) || isPrivateIPv6(addr);
}

// ─── Ana doğrulama fonksiyonu ──────────────────────────────────────────────────

/**
 * Adresi çözümler ve iç ağa / loopback'e gitmediğini doğrular.
 *
 * SINIR — DNS yeniden bağlama (rebinding) saldırısına karşı tam koruma
 * sağlamaz: burada adres çözümlendikten sonra `fetch` tarafından tekrar
 * çözümlenir ve düşman bir DNS sunucusu iki sorguya farklı yanıt verebilir.
 * Tam kapatma, çözümlenen adresi sabitleyen özel bir HTTP aracısı gerektirir;
 * bu kapsam dışındadır. Bu fonksiyon saldırı penceresini önemli ölçüde daraltır
 * ancak tamamen kapamaz.
 *
 * @param raw Doğrulanacak ham URL dizesi
 * @param resolver Test için enjekte edilebilir; varsayılan olarak gerçek DNS kullanılır
 */
export async function checkPublicUrl(
  raw: string,
  resolver: (
    host: string,
    opts: { all: true },
  ) => Promise<{ address: string; family: number }[]> = (host, opts) =>
    lookup(host, opts),
): Promise<UrlCheck> {
  // 1. Geçerli bir URL mi?
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "Geçersiz URL biçimi" };
  }

  // 2. Yalnızca http/https izinlidir
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return {
      ok: false,
      reason: `İzin verilmeyen protokol: ${url.protocol} — yalnızca http/https desteklenir`,
    };
  }

  const hostname = url.hostname;

  // 3. localhost ve .local / .localhost alan adları
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local")
  ) {
    return { ok: false, reason: "Yerel ağ adresi reddedildi" };
  }

  // 4. Literal IP adresi kontrolü (DNS çözümlemesi olmadan)
  if (isPrivateAddress(hostname)) {
    return { ok: false, reason: "Özel/dahili IP adresi reddedildi" };
  }

  // 5. DNS çözümlemesi: tüm A/AAAA kayıtlarını al
  let records: { address: string; family: number }[];
  try {
    records = await resolver(hostname, { all: true });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      reason: `Alan adı çözümlenemedi: ${detail}`,
    };
  }

  if (records.length === 0) {
    return { ok: false, reason: "Alan adı için kayıt bulunamadı" };
  }

  // 6. Çözümlenen her adres kısıtlı mı?
  for (const { address } of records) {
    if (isPrivateAddress(address)) {
      return { ok: false, reason: "Alan adı özel/dahili bir adrese çözümlendi" };
    }
  }

  return { ok: true, url };
}
