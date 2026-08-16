import { describe, expect, it } from "vitest";
import { playlistIdFromUrl } from "./playlist-id";

describe("playlistIdFromUrl", () => {
  it("aynı adres için aynı kimliği üretir", async () => {
    const a = await playlistIdFromUrl("http://sunucu:8080/get.php?username=u&password=p&type=m3u");
    const b = await playlistIdFromUrl("http://sunucu:8080/get.php?username=u&password=p&type=m3u");
    expect(a).toBe(b);
  });

  it("farklı adresler için farklı kimlik üretir", async () => {
    const a = await playlistIdFromUrl("http://sunucu1:8080/playlist.m3u");
    const b = await playlistIdFromUrl("http://sunucu2:8080/playlist.m3u");
    expect(a).not.toBe(b);
  });

  it("12 karakter uzunluğunda kimlik üretir", async () => {
    const id = await playlistIdFromUrl("http://sunucu/playlist.m3u");
    expect(id).toHaveLength(12);
  });

  it("yalnızca URL-güvenli karakterler içerir", async () => {
    const id = await playlistIdFromUrl("http://sunucu/playlist.m3u");
    // Base64url: A-Z a-z 0-9 - _
    expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("boş adres için de kimlik üretir", async () => {
    const id = await playlistIdFromUrl("");
    expect(id).toHaveLength(12);
  });
});
