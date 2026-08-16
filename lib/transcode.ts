import { spawn } from "node:child_process";
import type { Readable, Writable } from "node:stream";
import type { TsCodecs } from "./ts-probe";

/**
 * Yalnızca ses transcode etme.
 *
 * Sahibin sağlayıcısında ölçüldü: kanalların büyük çoğunluğu H.264 + AAC ve
 * sorunsuz oynuyor. Bir azınlık ise H.264 videoyu MP2 sesle taşıyor; tarayıcı
 * sesi çözemediği için görüntü sorunsuz olmasına rağmen akışın tamamını
 * reddediyor. Bu modül tam olarak o durumu hedefler: video kopyalanır, ses
 * AAC'ye çevrilir. Ölçümde 8 saniyelik akış 0,03 s CPU ile işlendi.
 *
 * Videosu zaten desteklenmeyen kanallar (H.265, MPEG-2) kapsam dışıdır —
 * sesi düzeltmek onları oynatılabilir yapmaz, yalnızca CPU harcar.
 */

/** Tarayıcının MSE ile oynatabildiği video codec'leri. */
const BROWSER_VIDEO_CODECS = new Set(["H264"]);

/** Tarayıcının çözemediği, AAC'ye çevrilmesi gereken ses codec'leri. */
const BROWSER_HOSTILE_AUDIO_CODECS = new Set(["MP2", "AC3", "E-AC3", "DTS"]);

/**
 * Bu akışın sesi transcode edilmeli mi?
 *
 * Karar ilk ses parçasına bakar; ffmpeg de `-map 0:a:0` ile yalnızca onu
 * alır, dolayısıyla ikisi aynı parçayı değerlendirir.
 */
export function needsAudioTranscode(codecs: TsCodecs): boolean {
  // Video oynatılamıyorsa sesi kurtarmak kanalı açmaz.
  if (codecs.video === null || !BROWSER_VIDEO_CODECS.has(codecs.video)) {
    return false;
  }
  const firstAudio = codecs.audio[0];
  if (firstAudio === undefined) return false;
  return BROWSER_HOSTILE_AUDIO_CODECS.has(firstAudio);
}

/**
 * Komut satırında doğrulanmış argümanlar: video kopyalanır, ses 128 kbit/s
 * AAC'ye çevrilir, sonuç MPEG-TS olarak stdout'a yazılır.
 *
 * Girdi biçimi `-f mpegts` ile açıkça verilir; PMT zaten çözümlendiği için
 * ffmpeg'in konteyneri yeniden tahmin etmesine gerek yoktur.
 */
export const AUDIO_TRANSCODE_ARGS: readonly string[] = [
  "-hide_banner",
  "-loglevel",
  "error", // stderr'in gereksiz yere dolmasını engeller
  "-f",
  "mpegts",
  "-i",
  "pipe:0",
  "-map",
  "0:v:0",
  "-map",
  "0:a:0",
  "-c:v",
  "copy", // video bit bit kopyalanır — asıl ucuzluk buradan gelir
  "-c:a",
  "aac",
  "-b:a",
  "128k",
  "-f",
  "mpegts",
  "pipe:1",
];

/**
 * ffmpeg ikili dosyasının yolu.
 *
 * winget kurulumu PATH kısayolu oluşturmadığı için yol `FFMPEG_PATH` ile
 * verilir; tanımlı değilse PATH üzerindeki `ffmpeg` denenir.
 */
export function ffmpegBinary(): string {
  const configured = process.env.FFMPEG_PATH?.trim();
  return configured !== undefined && configured !== "" ? configured : "ffmpeg";
}

/** stderr'den loglanacak azami bayt — hatalı bir süreç günlüğü doldurmasın. */
const STDERR_LOG_LIMIT = 2_000;

export interface AudioTranscoder {
  /** Ham MPEG-TS buraya yazılır. */
  readonly stdin: Writable;
  /** Sesi AAC'ye çevrilmiş MPEG-TS buradan okunur. */
  readonly stdout: Readable;
  /** Süreci ve borularını kapatır. Birden çok kez çağrılabilir. */
  kill(): void;
}

/**
 * ffmpeg'i stdin→stdout boru hattı olarak başlatır.
 *
 * İkili dosya bulunamazsa `null` döner — `spawn()` bu durumda senkron throw
 * etmez, asenkron `error` olayı yayar; bu yüzden süreç gerçekten başlayana
 * kadar beklenir. Çağıran taraf `null` görürse akışı transcode etmeden
 * geçirmelidir: sessiz oynayan bir yayın, hiç oynamayandan iyidir.
 */
export async function spawnAudioTranscoder(): Promise<AudioTranscoder | null> {
  const binary = ffmpegBinary();
  const child = spawn(binary, [...AUDIO_TRANSCODE_ARGS], {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });

  const started = await new Promise<boolean>((resolve) => {
    const onSpawn = (): void => {
      child.off("error", onError);
      resolve(true);
    };
    const onError = (error: Error): void => {
      child.off("spawn", onSpawn);
      console.error(`ffmpeg başlatılamadı (${binary}):`, error.message);
      resolve(false);
    };
    child.once("spawn", onSpawn);
    child.once("error", onError);
  });

  const { stdin, stdout, stderr } = child;
  if (!started || stdin === null || stdout === null) {
    child.kill("SIGKILL");
    return null;
  }

  // Süreç başladıktan sonra da hata gelebilir (EPIPE dahil); route çökmemeli.
  child.on("error", () => {});
  stdin.on("error", () => {});
  stdout.on("error", () => {});

  // stderr okunmazsa boru dolar ve ffmpeg kilitlenir. `-loglevel error`
  // sayesinde burada yalnızca gerçek hatalar birikir; sınırlı biçimde loglanır.
  if (stderr !== null) {
    let loggedBytes = 0;
    stderr.on("data", (chunk: Buffer) => {
      if (loggedBytes >= STDERR_LOG_LIMIT) return;
      loggedBytes += chunk.length;
      const message = chunk.toString("utf8").trim();
      if (message !== "") console.error("ffmpeg:", message);
    });
    stderr.on("error", () => {});
  }

  let killed = false;
  return {
    stdin,
    stdout,
    kill(): void {
      if (killed) return;
      killed = true;
      child.kill("SIGKILL");
      stdin.destroy();
      stdout.destroy();
      stderr?.destroy();
    },
  };
}
