import { describe, expect, it } from "vitest";
import { detectEngine } from "./stream-type";

describe("detectEngine", () => {
  it("m3u8 uzantısını HLS olarak tanır", () => {
    expect(detectEngine("http://a.example/live/x.m3u8")).toBe("hls");
  });

  it("ts uzantısını MPEG-TS olarak tanır", () => {
    expect(detectEngine("http://a.example/live/x.ts")).toBe("mpegts");
  });

  it("mp4 uzantısını yerel oynatıcıya yönlendirir", () => {
    expect(detectEngine("http://a.example/movie/x.mp4")).toBe("native");
  });

  it("mkv uzantısını yerel oynatıcıya yönlendirir", () => {
    expect(detectEngine("http://a.example/movie/x.mkv")).toBe("native");
  });

  it("sorgu parametresi uzantı tespitini bozmaz", () => {
    expect(detectEngine("http://a.example/x.m3u8?token=abc")).toBe("hls");
  });

  it("büyük harfli uzantıyı tanır", () => {
    expect(detectEngine("http://a.example/X.M3U8")).toBe("hls");
  });

  it("proxy URL'inin içindeki gerçek hedefe bakar", () => {
    const src = "/api/stream?u=" + encodeURIComponent("http://a.example/x.ts") + "&sig=z";
    expect(detectEngine(src)).toBe("mpegts");
  });

  it("uzantısız adreslerde HLS varsayar", () => {
    expect(detectEngine("http://a.example/live/12345")).toBe("hls");
  });

  it("çözümlenemeyen girdide HLS varsayar", () => {
    expect(detectEngine("")).toBe("hls");
  });
});
