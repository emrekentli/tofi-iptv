import { describe, expect, it } from "vitest";
import { nextFocusableIndex } from "./series-focus";

/** Tipik bölüm listesi: her sezon bir başlıkla açılır. */
const ROWS = [
  { type: "season" }, // 0  Sezon 1
  { type: "episode" }, // 1
  { type: "episode" }, // 2
  { type: "season" }, // 3  Sezon 2
  { type: "episode" }, // 4
  { type: "episode" }, // 5
];

describe("nextFocusableIndex", () => {
  it("aşağı yönde sezon başlığını atlar", () => {
    // 2. satırdan aşağı: 3 sezon başlığı, 4'e geçilmeli.
    expect(nextFocusableIndex(ROWS, 3, 1)).toBe(4);
  });

  it("yukarı yönde sezon başlığını atlayıp önceki sezona geçer", () => {
    // P3 hatası: 4. satırdan (Sezon 2'nin ilk bölümü) yukarı ok, 3'ü atlayıp
    // 2'ye gitmeli. Eski kod önce ileri tarayıp tekrar 4'e dönüyordu.
    expect(nextFocusableIndex(ROWS, 3, -1)).toBe(2);
  });

  it("listenin başındaki sezon başlığından ilk bölüme iner", () => {
    // Yukarı gidilecek bölüm yok; ters yönde en yakın bölüm 1.
    expect(nextFocusableIndex(ROWS, 0, -1)).toBe(1);
  });

  it("Home tuşu ilk bölümü seçer (başlığı değil)", () => {
    expect(nextFocusableIndex(ROWS, 0, 1)).toBe(1);
  });

  it("End tuşu son bölümü seçer", () => {
    expect(nextFocusableIndex(ROWS, ROWS.length - 1, -1)).toBe(5);
  });

  it("sınırların dışındaki hedefi listeye sıkıştırır", () => {
    expect(nextFocusableIndex(ROWS, 99, 1)).toBe(5);
    expect(nextFocusableIndex(ROWS, -5, 1)).toBe(1);
  });

  it("bölüm satırında zaten duruyorsa yerinde kalır", () => {
    expect(nextFocusableIndex(ROWS, 2, 1)).toBe(2);
    expect(nextFocusableIndex(ROWS, 2, -1)).toBe(2);
  });

  it("ardışık sezon başlıklarını tek seferde atlar", () => {
    const rows = [
      { type: "season" },
      { type: "season" },
      { type: "episode" },
    ];
    expect(nextFocusableIndex(rows, 0, 1)).toBe(2);
    expect(nextFocusableIndex(rows, 1, -1)).toBe(2);
  });

  it("hiç bölüm yoksa null döner", () => {
    expect(nextFocusableIndex([{ type: "season" }], 0, 1)).toBeNull();
  });

  it("boş listede null döner", () => {
    expect(nextFocusableIndex([], 0, 1)).toBeNull();
  });
});
