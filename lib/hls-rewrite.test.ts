import { describe, expect, it } from "vitest";
import { isHlsResponse, rewriteHlsPlaylist } from "./hls-rewrite";
import { decryptToken } from "./sign";

const SECRET = "test-secret-long-enough";
const BASE = "http://provider.example/live/stream.m3u8";

/** Yeniden yazılmış satırdan şifreli token'ı çözüp orijinal hedefi geri çıkarır. */
function targetOf(line: string): string {
  const token = new URL(line, "http://localhost").searchParams.get("t") ?? "";
  return decryptToken(token, SECRET) ?? "";
}

describe("rewriteHlsPlaylist", () => {
  it("göreli segment URL'lerini mutlak hale getirip proxy'ler", () => {
    const input = "#EXTM3U\n#EXTINF:10,\nsegment1.ts\n";
    const lines = rewriteHlsPlaylist(input, BASE, SECRET).split("\n");
    expect(lines[2]).toContain("/api/stream?");
    expect(targetOf(lines[2])).toBe("http://provider.example/live/segment1.ts");
  });

  it("mutlak segment URL'lerini olduğu gibi hedef alır", () => {
    const input = "#EXTM3U\n#EXTINF:10,\nhttp://cdn.example/a.ts\n";
    const lines = rewriteHlsPlaylist(input, BASE, SECRET).split("\n");
    expect(targetOf(lines[2])).toBe("http://cdn.example/a.ts");
  });

  it("EXT-X-KEY içindeki URI'yi proxy'ler", () => {
    const input = '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\n';
    const lines = rewriteHlsPlaylist(input, BASE, SECRET).split("\n");
    expect(lines[1]).toContain("METHOD=AES-128");
    expect(targetOf(lines[1].match(/URI="([^"]+)"/)![1])).toBe(
      "http://provider.example/live/key.bin",
    );
  });

  it("EXT-X-MEDIA içindeki URI'yi proxy'ler", () => {
    const input = '#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,URI="audio/tr.m3u8"\n';
    const lines = rewriteHlsPlaylist(input, BASE, SECRET).split("\n");
    expect(targetOf(lines[1].match(/URI="([^"]+)"/)![1])).toBe(
      "http://provider.example/live/audio/tr.m3u8",
    );
  });

  it("EXT-X-MAP içindeki URI'yi proxy'ler", () => {
    const input = '#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n';
    const lines = rewriteHlsPlaylist(input, BASE, SECRET).split("\n");
    expect(targetOf(lines[1].match(/URI="([^"]+)"/)![1])).toBe(
      "http://provider.example/live/init.mp4",
    );
  });

  it("URI içermeyen etiketlere dokunmaz", () => {
    const input = "#EXTM3U\n#EXT-X-TARGETDURATION:10\n#EXTINF:10,\n";
    const output = rewriteHlsPlaylist(input, BASE, SECRET);
    expect(output).toContain("#EXT-X-TARGETDURATION:10");
    expect(output).toContain("#EXTINF:10,");
  });

  it("boş satırları korur", () => {
    const input = "#EXTM3U\n\n#EXTINF:10,\nseg.ts\n";
    expect(rewriteHlsPlaylist(input, BASE, SECRET).split("\n")[1]).toBe("");
  });

  it("belirsiz/geçersiz göreli yolları bozmadan bırakır", () => {
    // RFC 3986: göreli yolun ilk segmenti ':' ile başlayamaz
    const input = "#EXTM3U\n::gecersiz::\n";
    expect(rewriteHlsPlaylist(input, BASE, SECRET)).toContain("::gecersiz::");
  });

  it("gerçekten çözümlenemeyen URL'leri bozmadan bırakır", () => {
    const input = "#EXTM3U\nhttp://\n";
    expect(rewriteHlsPlaylist(input, BASE, SECRET)).toContain("http://");
  });
});

describe("isHlsResponse", () => {
  it("mpegurl içerik tipini tanır", () => {
    expect(isHlsResponse("application/vnd.apple.mpegurl", "http://a/b")).toBe(true);
    expect(isHlsResponse("audio/x-mpegurl", "http://a/b")).toBe(true);
  });

  it("içerik tipi yoksa uzantıya bakar", () => {
    expect(isHlsResponse(null, "http://a/b.m3u8")).toBe(true);
    expect(isHlsResponse(null, "http://a/b.m3u8?token=1")).toBe(true);
  });

  it("video akışlarını HLS saymaz", () => {
    expect(isHlsResponse("video/mp2t", "http://a/b.ts")).toBe(false);
    expect(isHlsResponse("video/mp4", "http://a/b.mp4")).toBe(false);
  });
});
