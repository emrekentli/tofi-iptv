import { describe, expect, it } from "vitest";
import {
  detectEngine,
  fallbackEngine,
  isCodecError,
  isContainerMismatch,
  isUnavailableStatus,
} from "./stream-type";

describe("detectEngine", () => {
  it("m3u8 uzantısını HLS olarak tanır", () => {
    expect(detectEngine("http://a.example/live/x.m3u8")).toBe("hls");
  });

  it("URL fragment uzantı tespitini bozmaz", () => {
    expect(detectEngine("http://a.example/x.m3u8#bolum")).toBe("hls");
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

  it("çözümlenemeyen girdide HLS varsayar", () => {
    expect(detectEngine("")).toBe("hls");
  });

  it("geçersiz URL girdisinde throw etmez", () => {
    expect(detectEngine("http://[")).toBe("hls");
  });
});

// P1: Sahibin sağlayıcısında ölçülen gerçek adres biçimi.
// Bu adres `video/mp2t` (ham MPEG-TS) döndürüyor; eskiden HLS varsayılıp
// hls.js'e veriliyordu ve canlı yayınlar hiç açılmıyordu.
describe("detectEngine — uzantısız Xtream canlı adresleri", () => {
  it("uzantısız `/KULLANICI/SIFRE/AKIS_ID` adresini MPEG-TS olarak tanır", () => {
    expect(detectEngine("http://host:8080/USER/PASS/290092")).toBe("mpegts");
  });

  it("açık `/live/KULLANICI/SIFRE/AKIS_ID` biçimini de tanır", () => {
    expect(detectEngine("http://host:8080/live/USER/PASS/290092")).toBe(
      "mpegts",
    );
  });

  it("uzantı varsa uzantı kazanır (canlı biçiminde olsa bile)", () => {
    expect(detectEngine("http://host:8080/live/USER/PASS/290092.m3u8")).toBe(
      "hls",
    );
  });

  it("akış kimliği sayısal değilse canlı sayılmaz", () => {
    expect(detectEngine("http://host:8080/a/b/c")).toBe("hls");
  });

  it("proxy adresi verilirse HLS varsayılır (token çözülemez)", () => {
    // Bu yüzden VideoPlayer ham adresi `sourceUrl` prop'uyla ayrıca alır.
    expect(detectEngine("/api/stream?t=opak-token")).toBe("hls");
  });
});

describe("fallbackEngine", () => {
  it("hls başarısız olursa mpegts denenir", () => {
    expect(fallbackEngine("hls")).toBe("mpegts");
  });

  it("mpegts başarısız olursa hls denenir", () => {
    expect(fallbackEngine("mpegts")).toBe("hls");
  });

  it("native için alternatif yoktur", () => {
    expect(fallbackEngine("native")).toBeNull();
  });

  it("takas kendi kendini tersler — döngü tek adımda kapanır", () => {
    const first = fallbackEngine("hls")!;
    expect(fallbackEngine(first)).toBe("hls");
  });
});

describe("isContainerMismatch / isCodecError", () => {
  it("hls.js manifest ayrıştırma hatası konteyner uyuşmazlığıdır", () => {
    expect(isContainerMismatch("hls", "manifestParsingError")).toBe(true);
    expect(isContainerMismatch("hls", "manifestLoadError")).toBe(true);
    expect(isContainerMismatch("hls", "fragParsingError")).toBe(true);
  });

  it("hls.js codec hatası konteyner uyuşmazlığı DEĞİLDİR", () => {
    expect(isContainerMismatch("hls", "bufferAddCodecError")).toBe(false);
    expect(isCodecError("hls", "bufferAddCodecError")).toBe(true);
    expect(isCodecError("hls", "bufferIncompatibleCodecsError")).toBe(true);
    expect(isCodecError("hls", "manifestIncompatibleCodecsError")).toBe(true);
  });

  it("mpegts.js biçim hatası konteyner uyuşmazlığıdır", () => {
    expect(isContainerMismatch("mpegts", "FormatError")).toBe(true);
    expect(isContainerMismatch("mpegts", "FormatUnsupported")).toBe(true);
  });

  it("mpegts.js codec hatası motor takası tetiklemez", () => {
    expect(isContainerMismatch("mpegts", "CodecUnsupported")).toBe(false);
    expect(isCodecError("mpegts", "CodecUnsupported")).toBe(true);
    expect(isCodecError("mpegts", "MediaMSEError")).toBe(true);
  });

  it("native motorda ne takas ne codec sınıflaması vardır", () => {
    expect(isContainerMismatch("native", "manifestParsingError")).toBe(false);
    expect(isCodecError("native", "CodecUnsupported")).toBe(false);
  });

  it("bilinmeyen hata detayı hiçbir sınıfa girmez", () => {
    expect(isContainerMismatch("hls", "bilinmeyenHata")).toBe(false);
    expect(isCodecError("hls", "bilinmeyenHata")).toBe(false);
  });
});

describe("isUnavailableStatus", () => {
  it("502 kanal kullanılamaz durumudur", () => {
    expect(isUnavailableStatus(502)).toBe(true);
  });

  it("504 kanal kullanılamaz değil, geçici erişim hatasıdır", () => {
    expect(isUnavailableStatus(504)).toBe(false);
  });

  it("404 kanal bulunamadı — passthrough, kullanılamaz DEĞİL", () => {
    expect(isUnavailableStatus(404)).toBe(false);
  });

  it("0 veya -1 gibi sahte kodlar kullanılamaz sayılmaz", () => {
    expect(isUnavailableStatus(0)).toBe(false);
    expect(isUnavailableStatus(-1)).toBe(false);
  });
});
