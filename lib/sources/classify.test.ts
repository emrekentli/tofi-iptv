import { describe, expect, it } from "vitest";
import { classifyChannel } from "./classify";

describe("classifyChannel", () => {
  it("/series/ yolunu dizi sayar", () => {
    expect(classifyChannel("http://s:8080/series/u/p/210007.mkv")).toBe("series");
  });

  it("/movie/ yolunu film sayar", () => {
    expect(classifyChannel("http://s:8080/movie/u/p/353915.mkv")).toBe("movie");
  });

  it("kullanıcı adıyla başlayan yolu canlı sayar", () => {
    expect(classifyChannel("http://s:8080/KULLANICI/SIFRE/290092")).toBe("live");
  });

  it("index.m3u8 adresini canlı sayar", () => {
    expect(classifyChannel("http://s:8080/abc/index.m3u8")).toBe("live");
  });

  it("büyük harfli segmenti tanır", () => {
    expect(classifyChannel("http://s:8080/SERIES/u/p/1.mkv")).toBe("series");
  });

  it("yalnızca ilk segmente bakar, ad içinde geçene aldanmaz", () => {
    expect(classifyChannel("http://s:8080/u/p/movie-channel-5")).toBe("live");
  });

  it("çözümlenemeyen adresi canlı sayar", () => {
    expect(classifyChannel("bozuk")).toBe("live");
  });
});
