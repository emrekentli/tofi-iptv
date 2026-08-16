/**
 * FNV-1a hash testleri — m3u.ts'de channelId için kullanılan hash işlevi.
 *
 * Doğrulama hedefleri:
 * 1. Kararlılık: aynı giriş için aynı çıktı
 * 2. Dağılım: farklı girişler farklı çıktı üretir
 * 3. URL-güvenli çıktı (A-Z a-z 0-9 - _)
 * 4. Node.js özgün modül içermez (Web Worker uyumluluğu için kritik)
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseM3U } from "./m3u";

const HEADER = "#EXTM3U\n";

// channelId işlevine dolaylı erişim: aynı URL için parseM3U sonucundan al.
function getChannelId(url: string): string {
  const result = parseM3U(HEADER + "#EXTINF:-1,Test\n" + url + "\n");
  return result.channels[0]!.id;
}

describe("channelId (FNV-1a)", () => {
  it("aynı adres için aynı kimliği üretir", () => {
    const url = "http://sunucu:8080/get.php?username=u&password=p&type=m3u";
    expect(getChannelId(url)).toBe(getChannelId(url));
  });

  it("farklı adresler için farklı kimlik üretir", () => {
    const a = getChannelId("http://sunucu/live/u/p/1.ts");
    const b = getChannelId("http://sunucu/live/u/p/2.ts");
    expect(a).not.toBe(b);
  });

  it("yalnızca URL-güvenli karakterler içerir", () => {
    const urls = [
      "http://sunucu:8080/playlist.m3u",
      "http://user:pass@host/stream/1",
      "http://example.com/series/u/p/12345.mkv",
    ];
    for (const url of urls) {
      const id = getChannelId(url);
      // Base64url + tire ve alt çizgi: A-Z a-z 0-9 - _
      expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it("12 karakter uzunluğunda kimlik üretir (64 bit → 12x6-bit)", () => {
    const id = getChannelId("http://sunucu/test.m3u");
    expect(id).toHaveLength(12);
  });

  it("boş adres için bile kimlik üretir", () => {
    const id = getChannelId("http://s/");
    expect(id).toHaveLength(12);
  });

  /**
   * Gerileme testi. Kimlik `id` alanı Dexie'de birincil anahtardır; çakışan
   * iki kanaldan biri diğerini sessizce ezer ve listeden kaybolur.
   *
   * Tek şeritli 32-bit sürüm, sahibin gerçek 132.486 kanallık playlist'inde
   * 2 çakışma üretmişti. Bu test aynı ölçeği sentetik adreslerle taklit eder,
   * böylece ağa çıkmadan aynı gerilemeyi yakalar.
   */
  it("132 bin çeşitli adreste çakışma üretmez", () => {
    // Adresler HOST, PORT, TÜR, KULLANICI, KİMLİK ve UZANTI eksenlerinde
    // birlikte değişmelidir. Yalnızca sondaki sayıyı artıran bir üretici
    // (ilk yazdığımız hâli) bu gerilemeyi YAKALAMAZ: ölçüldüğünde sıralı
    // adresler 32 bitte bile 0 çakışma verir, çeşitli adresler ise 2.
    // Yani o test, düzelttiği hatanın varlığında da geçerdi.
    const kinds = ["live", "movie", "series"];
    const extensions = ["", ".ts", ".mkv", ".mp4", ".m3u8"];
    const seen = new Set<string>();
    const total = 132_486;
    for (let i = 0; i < total; i++) {
      const url =
        `http://s${i % 7}.ornek:${8080 + (i % 3)}/${kinds[i % 3]}` +
        `/K${i % 5}/S${i % 11}/${(i * 7919) % 9_999_999}${extensions[i % 5]}`;
      seen.add(getChannelId(url));
    }
    expect(seen.size).toBe(total);
  });
});

describe("Worker import grafiği — node: modül yokluğu", () => {
  it("m3u.ts node: içe aktarması içermiyor", () => {
    // playlist-worker.ts m3u.ts'yi içe aktarır; m3u.ts node:crypto içermemeli.
    const m3uSource = readFileSync(
      new URL("./m3u.ts", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
      "utf-8",
    );
    expect(m3uSource).not.toMatch(/from\s+["']node:/);
    expect(m3uSource).not.toMatch(/require\s*\(\s*["']node:/);
  });

  it("classify.ts node: içe aktarması içermiyor", () => {
    const source = readFileSync(
      new URL("./classify.ts", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
      "utf-8",
    );
    expect(source).not.toMatch(/from\s+["']node:/);
  });

  it("series.ts node: içe aktarması içermiyor", () => {
    const source = readFileSync(
      new URL("./series.ts", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
      "utf-8",
    );
    expect(source).not.toMatch(/from\s+["']node:/);
  });

  it("playlist-worker.ts node: içe aktarması içermiyor", () => {
    const source = readFileSync(
      new URL("../playlist-worker.ts", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
      "utf-8",
    );
    expect(source).not.toMatch(/from\s+["']node:/);
    expect(source).not.toMatch(/require\s*\(\s*["']node:/);
  });
});
