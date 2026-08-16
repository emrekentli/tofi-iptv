import { describe, it, expect } from "vitest";
import { deriveCategories } from "./category-groups";
import type { Channel } from "./types";

// Minimal kanal yardımcısı — test için yalnızca id, group ve gerekli alanlar.
function ch(id: string, group?: string): Channel {
  return {
    id,
    playlistId: "pl",
    name: `Kanal ${id}`,
    url: `http://example.com/${id}`,
    kind: "live",
    group,
  };
}

describe("deriveCategories", () => {
  it("boş kanallar için sadece Tümü girişi döner", () => {
    const result = deriveCategories([]);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ group: "", count: 0 });
  });

  it("Tümü girişi her zaman ilk sıradadır", () => {
    const channels = [ch("1", "Spor"), ch("2", "Haber"), ch("3", "Spor")];
    const result = deriveCategories(channels);
    expect(result[0]!.group).toBe("");
  });

  it("Tümü sayısı toplam kanal sayısına eşittir", () => {
    const channels = [ch("1", "Spor"), ch("2", "Haber"), ch("3")];
    const result = deriveCategories(channels);
    expect(result[0]!.count).toBe(3);
  });

  it("gruplar Türkçe sırayla döner", () => {
    // Türkçe sıralamada: Çizgi > Haber > Spor (ç, h, s)
    const channels = [ch("1", "Spor"), ch("2", "Haber"), ch("3", "Çizgi")];
    const result = deriveCategories(channels);
    const groups = result.slice(1).map((e) => e.group);
    expect(groups).toEqual(["Çizgi", "Haber", "Spor"]);
  });

  it("grup sayısı doğru hesaplanır", () => {
    const channels = [ch("1", "Spor"), ch("2", "Spor"), ch("3", "Haber")];
    const result = deriveCategories(channels);
    const spor = result.find((e) => e.group === "Spor");
    const haber = result.find((e) => e.group === "Haber");
    expect(spor?.count).toBe(2);
    expect(haber?.count).toBe(1);
  });

  it("group alanı boş kanallar ayrı gruba girmez", () => {
    const channels = [ch("1", "Spor"), ch("2"), ch("3")];
    const result = deriveCategories(channels);
    // Tümü + Spor; group=="" olanlar ayrı satır değil
    expect(result).toHaveLength(2);
    expect(result[0]!.count).toBe(3);
  });

  it("273 farklı grup için doğru uzunluk ve sıralama korunur", () => {
    // 273 gruba 1'er kanal ekle
    const channels = Array.from({ length: 273 }, (_, i) => ch(String(i), `Grup ${i}`));
    const result = deriveCategories(channels);
    expect(result).toHaveLength(274); // Tümü + 273 grup
    expect(result[0]!.count).toBe(273);

    // Sıralama tutarlı: her giriş bir öncekinden büyük eşit
    for (let i = 2; i < result.length; i++) {
      const a = result[i - 1]!.group;
      const b = result[i]!.group;
      expect(a.localeCompare(b, "tr")).toBeLessThanOrEqual(0);
    }
  });
});
