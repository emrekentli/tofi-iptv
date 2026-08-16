import { describe, expect, it } from "vitest";
import { parseM3U } from "./m3u";

const HEADER = "#EXTM3U\n";

describe("parseM3U", () => {
  it("ad, adres ve öznitelikleri ayırır", () => {
    const input =
      HEADER +
      '#EXTINF:-1 tvg-id="trt1" tvg-logo="http://a/l.png" group-title="ULUSAL",TRT 1\n' +
      "http://s:8080/u/p/1\n";
    const { channels } = parseM3U(input);
    expect(channels).toHaveLength(1);
    expect(channels[0].name).toBe("TRT 1");
    expect(channels[0].logo).toBe("http://a/l.png");
    expect(channels[0].group).toBe("ULUSAL");
    expect(channels[0].rawUrl).toBe("http://s:8080/u/p/1");
  });

  it("öznitelik değerindeki virgül adı bozmaz", () => {
    const input =
      HEADER + '#EXTINF:-1 group-title="Spor, Futbol",bein SPORTS 1\n' + "http://s/1\n";
    const { channels } = parseM3U(input);
    expect(channels[0].group).toBe("Spor, Futbol");
    expect(channels[0].name).toBe("bein SPORTS 1");
  });

  it("addaki virgülü korur", () => {
    const input = HEADER + "#EXTINF:-1,Kanal D, HD\n" + "http://s/1\n";
    expect(parseM3U(input).channels[0].name).toBe("Kanal D, HD");
  });

  it("özniteliksiz satırı okur", () => {
    const input = HEADER + "#EXTINF:-1,Basit Kanal\n" + "http://s/1\n";
    const { channels } = parseM3U(input);
    expect(channels[0].name).toBe("Basit Kanal");
    expect(channels[0].logo).toBeUndefined();
    expect(channels[0].group).toBeUndefined();
  });

  it("çok sayıda kanalı sırayla okur", () => {
    const input =
      HEADER +
      "#EXTINF:-1,A\nhttp://s/a\n" +
      "#EXTINF:-1,B\nhttp://s/b\n" +
      "#EXTINF:-1,C\nhttp://s/c\n";
    expect(parseM3U(input).channels.map((c) => c.name)).toEqual(["A", "B", "C"]);
  });

  it("adresi olmayan son kaydı atlar ve sayar", () => {
    const input = HEADER + "#EXTINF:-1,A\nhttp://s/a\n#EXTINF:-1,Yarim\n";
    const result = parseM3U(input);
    expect(result.channels).toHaveLength(1);
    expect(result.skipped).toBe(1);
  });

  it("bozuk EXTINF satırını atlar, kalanı okumaya devam eder", () => {
    const input = HEADER + "#EXTINF:bozuk\nhttp://s/x\n#EXTINF:-1,B\nhttp://s/b\n";
    const result = parseM3U(input);
    expect(result.channels.map((c) => c.name)).toEqual(["B"]);
    expect(result.skipped).toBe(1);
  });

  it("araya giren diğer etiketleri yok sayar", () => {
    const input = HEADER + "#EXTINF:-1,A\n#EXTVLCOPT:network-caching=1000\nhttp://s/a\n";
    expect(parseM3U(input).channels[0].rawUrl).toBe("http://s/a");
  });

  it("CRLF satır sonlarını işler", () => {
    const input = "#EXTM3U\r\n#EXTINF:-1,A\r\nhttp://s/a\r\n";
    expect(parseM3U(input).channels[0].name).toBe("A");
  });

  it("boş girdide boş sonuç döner", () => {
    expect(parseM3U("").channels).toEqual([]);
  });

  it("aynı adres için aynı kimliği üretir", () => {
    const a = parseM3U(HEADER + "#EXTINF:-1,A\nhttp://s/1\n").channels[0];
    const b = parseM3U(HEADER + "#EXTINF:-1,Farkli Ad\nhttp://s/1\n").channels[0];
    expect(a.id).toBe(b.id);
  });

  it("farklı adresler için farklı kimlik üretir", () => {
    const { channels } = parseM3U(
      HEADER + "#EXTINF:-1,A\nhttp://s/1\n#EXTINF:-1,B\nhttp://s/2\n",
    );
    expect(channels[0].id).not.toBe(channels[1].id);
  });
});
