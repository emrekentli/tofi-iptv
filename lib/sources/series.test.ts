import { describe, expect, it } from "vitest";
import { parseSeriesInfo } from "./series";

describe("parseSeriesInfo", () => {
  it("temel biçimi ayrıştırır", () => {
    expect(parseSeriesInfo("Lioness S03 Lioness - S03E03")).toEqual({
      title: "Lioness", season: 3, episode: 3,
    });
  });

  it("bölüm başlığı olan kaydı ayrıştırır", () => {
    expect(parseSeriesInfo("Silo S01 Silo - S01E08 - Hanna")).toEqual({
      title: "Silo", season: 1, episode: 8,
    });
  });

  it("dizi adındaki tireyi korur", () => {
    expect(
      parseSeriesInfo(
        "Oak Island - Fluch und Legende S03 Oak Island - Fluch und Legende - S03E08 - Fundstück",
      ),
    ).toEqual({ title: "Oak Island - Fluch und Legende", season: 3, episode: 8 });
  });

  it("yıl parantezini adın parçası sayar", () => {
    expect(parseSeriesInfo("Vagabond (2019) S01 Vagabond (2019) - S01E06")).toEqual({
      title: "Vagabond (2019)", season: 1, episode: 6,
    });
  });

  it("rakamla başlayan adı ayrıştırır", () => {
    expect(parseSeriesInfo("1670 S03 1670 - S03E04 - 4. Bölüm")).toEqual({
      title: "1670", season: 3, episode: 4,
    });
  });

  it("iki haneli sezonu okur", () => {
    const r = parseSeriesInfo(
      "Oak Island - Fluch und Legende S11 Oak Island - Fluch und Legende - S11E15 - Ziel",
    );
    expect(r?.season).toBe(11);
    expect(r?.episode).toBe(15);
  });

  it("Türkçe karakterli adı bozmaz", () => {
    expect(parseSeriesInfo("İkiz Tepeler (1990) S02 İkiz Tepeler (1990) - S02E01 - 1. Bölüm")?.title)
      .toBe("İkiz Tepeler (1990)");
  });

  it("iki nokta üst üste içeren adı korur", () => {
    expect(parseSeriesInfo("Law & Order: Organized Crime (2021) S02 Law & Order: Organized Crime (2021) - S02E04")?.title)
      .toBe("Law & Order: Organized Crime (2021)");
  });

  it("S00 sınırı yoksa ilk SxxEyy öncesini ad sayar", () => {
    expect(parseSeriesInfo("cuero y boogaloo (2026) - S01E01")).toEqual({
      title: "cuero y boogaloo (2026)", season: 1, episode: 1,
    });
  });

  it("hiç bölüm işareti yoksa null döner", () => {
    expect(parseSeriesInfo("Reporterkönig")).toBeNull();
    expect(parseSeriesInfo("Teil 2")).toBeNull();
    expect(parseSeriesInfo("")).toBeNull();
  });

  it("adı boş kalacak girdide null döner", () => {
    expect(parseSeriesInfo("S01E01")).toBeNull();
  });
});
