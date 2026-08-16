import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AUDIO_TRANSCODE_ARGS,
  ffmpegBinary,
  needsAudioTranscode,
  spawnAudioTranscoder,
} from "./transcode";

describe("needsAudioTranscode", () => {
  it("H264 + MP2 sesi transcode edilir — asıl hedef bu", () => {
    expect(needsAudioTranscode({ video: "H264", audio: ["MP2"] })).toBe(true);
  });

  it("H264 + AC3 sesi transcode edilir", () => {
    expect(needsAudioTranscode({ video: "H264", audio: ["AC3"] })).toBe(true);
  });

  it("H264 + E-AC3 sesi transcode edilir", () => {
    expect(needsAudioTranscode({ video: "H264", audio: ["E-AC3"] })).toBe(true);
  });

  it("H264 + DTS sesi transcode edilir", () => {
    expect(needsAudioTranscode({ video: "H264", audio: ["DTS"] })).toBe(true);
  });

  it("H264 + AAC zaten oynatılabilir, dokunulmaz", () => {
    expect(needsAudioTranscode({ video: "H264", audio: ["AAC"] })).toBe(false);
  });

  it("H264 + AAC-LATM zaten oynatılabilir, dokunulmaz", () => {
    expect(needsAudioTranscode({ video: "H264", audio: ["AAC-LATM"] })).toBe(
      false,
    );
  });

  // Video zaten açılamıyorsa sesi düzeltmek kanalı kurtarmaz; boşuna CPU yakılır.
  it("H265 videoda ses transcode edilmez — video zaten oynatılamaz", () => {
    expect(needsAudioTranscode({ video: "H265", audio: ["MP2"] })).toBe(false);
  });

  it("MPEG2 videoda ses transcode edilmez — video zaten oynatılamaz", () => {
    expect(needsAudioTranscode({ video: "MPEG2", audio: ["MP2"] })).toBe(false);
  });

  it("video bilinmiyorsa transcode edilmez", () => {
    expect(needsAudioTranscode({ video: null, audio: ["MP2"] })).toBe(false);
  });

  it("ses akışı yoksa transcode edilmez", () => {
    expect(needsAudioTranscode({ video: "H264", audio: [] })).toBe(false);
  });

  it("tanınmayan ses codec'i transcode tetiklemez", () => {
    expect(needsAudioTranscode({ video: "H264", audio: ["OPUS"] })).toBe(false);
  });

  // ffmpeg `-map 0:a:0` ile yalnızca ilk ses parçasını alır; karar da ona bakar.
  it("ilk parça AAC ise ikinci parça MP2 olsa da transcode edilmez", () => {
    expect(needsAudioTranscode({ video: "H264", audio: ["AAC", "MP2"] })).toBe(
      false,
    );
  });

  it("ilk parça MP2 ise ikinci parça AAC olsa da transcode edilir", () => {
    expect(needsAudioTranscode({ video: "H264", audio: ["MP2", "AAC"] })).toBe(
      true,
    );
  });
});

describe("ffmpegBinary", () => {
  const original = process.env.FFMPEG_PATH;

  afterEach(() => {
    if (original === undefined) delete process.env.FFMPEG_PATH;
    else process.env.FFMPEG_PATH = original;
  });

  it("FFMPEG_PATH tanımlıysa onu kullanır", () => {
    process.env.FFMPEG_PATH = "C:\\ffmpeg\\bin\\ffmpeg.exe";
    expect(ffmpegBinary()).toBe("C:\\ffmpeg\\bin\\ffmpeg.exe");
  });

  it("FFMPEG_PATH yoksa PATH üzerindeki ffmpeg'e düşer", () => {
    delete process.env.FFMPEG_PATH;
    expect(ffmpegBinary()).toBe("ffmpeg");
  });

  it("FFMPEG_PATH boş veya yalnızca boşluksa PATH'e düşer", () => {
    process.env.FFMPEG_PATH = "   ";
    expect(ffmpegBinary()).toBe("ffmpeg");
  });

  it("baştaki ve sondaki boşlukları kırpar", () => {
    process.env.FFMPEG_PATH = "  /usr/bin/ffmpeg  ";
    expect(ffmpegBinary()).toBe("/usr/bin/ffmpeg");
  });
});

describe("AUDIO_TRANSCODE_ARGS", () => {
  it("videoyu kopyalar, sesi AAC'ye çevirir", () => {
    const args = AUDIO_TRANSCODE_ARGS.join(" ");
    expect(args).toContain("-c:v copy");
    expect(args).toContain("-c:a aac");
    expect(args).toContain("-b:a 128k");
  });

  it("MPEG-TS olarak stdout'a yazar, stdin'den okur", () => {
    const args = AUDIO_TRANSCODE_ARGS.join(" ");
    expect(args).toContain("-i pipe:0");
    expect(args).toContain("-f mpegts");
    expect(AUDIO_TRANSCODE_ARGS[AUDIO_TRANSCODE_ARGS.length - 1]).toBe("pipe:1");
  });

  it("yalnızca ilk video ve ilk ses parçasını alır", () => {
    const args = AUDIO_TRANSCODE_ARGS.join(" ");
    expect(args).toContain("-map 0:v:0");
    expect(args).toContain("-map 0:a:0");
  });

  it("gereksiz çıktı üretmemesi için loglama kısılır", () => {
    expect(AUDIO_TRANSCODE_ARGS.join(" ")).toContain("-loglevel error");
  });
});

describe("spawnAudioTranscoder", () => {
  const original = process.env.FFMPEG_PATH;

  beforeEach(() => {
    process.env.FFMPEG_PATH = original;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.FFMPEG_PATH;
    else process.env.FFMPEG_PATH = original;
  });

  // Eksik ikili dosyada spawn() senkron throw etmez, asenkron `error` yayar.
  // Bu yüzden çağıran taraf beklemeli ve null görmelidir — istek düşmemeli.
  it("ikili dosya bulunamazsa null döner, throw etmez", async () => {
    process.env.FFMPEG_PATH = "C:\\yok\\boyle\\bir\\ffmpeg-yok.exe";
    await expect(spawnAudioTranscoder()).resolves.toBeNull();
  });

  it("ikili dosya çalışıyorsa süreç döner ve öldürülebilir", async () => {
    if (!original) return; // FFMPEG_PATH tanımlı değilse bu ortamda atlanır
    const transcoder = await spawnAudioTranscoder();
    expect(transcoder).not.toBeNull();
    transcoder?.kill();
    // kill() birden çok kez çağrılabilmeli.
    expect(() => transcoder?.kill()).not.toThrow();
  });
});
