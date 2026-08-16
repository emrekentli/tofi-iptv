"use client";

import { AlertCircle, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  detectEngine,
  fallbackEngine,
  isCodecError,
  isContainerMismatch,
  type StreamEngine,
} from "@/lib/stream-type";
import type { ChannelKind } from "@/lib/types";

const MAX_AUTO_RETRIES = 3;

const MSG_UNREACHABLE = "Yayına ulaşılamıyor. Kaynak yanıt vermiyor olabilir.";
const MSG_CODEC =
  "Yayın çözülemedi. Görüntü veya ses codec'i tarayıcıda desteklenmiyor olabilir (H.265/AC3).";

type Status = "loading" | "ready" | "error";

interface Props {
  /** Oynatıcıya verilecek adres: proxy (`/api/stream?t=…`) veya ham adres. */
  src: string;
  /**
   * Ham sağlayıcı adresi. Motor tespiti BUNUN üzerinden yapılır.
   * `src` proxy adresi olduğunda token şifreli olduğu için uzantı görünmez;
   * ham adres olmadan tespit varsayılana düşer ve canlı yayınlar açılmaz.
   * Verilmezse `src` üzerinden tespit edilir (eski davranış).
   */
  sourceUrl?: string;
  /** Kanal türü. Yalnızca `live` için mpegts.js canlı kipinde açılır. */
  kind?: ChannelKind;
  title?: string;
  /**
   * Ağ hatası yüzünden yayın açılamadığında çağrılır.
   * Doğrudan kipte sağlayıcı CORS başlığı göndermiyorsa da bu yola girilir;
   * sayfa buna karşılık proxy'ye düşebilir.
   */
  onUnreachable?: () => void;
}

export function VideoPlayer({
  src,
  sourceUrl,
  kind,
  title,
  onUnreachable,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState("");
  const [attempt, setAttempt] = useState(0);
  const autoRetries = useRef(0);

  // Yayın gerçekten başladı mı? İlk kareden ÖNCE gelen ölümcül medya hatası
  // genelde konteynerin yanlış tanındığını gösterir; oynatma başladıktan sonra
  // gelen aynı hata gerçek bir codec sorunudur.
  const hasPlayed = useRef(false);

  // Motor takası: `src` ile birlikte saklanır. Böylece ayrı bir sıfırlama
  // efektine gerek kalmaz ve takasın bu yayın için zaten denenmiş olduğu
  // tek bir karşılaştırmayla anlaşılır — sonsuz takas döngüsü imkânsızdır.
  const [engineOverride, setEngineOverride] = useState<{
    src: string;
    engine: StreamEngine;
  } | null>(null);

  // Prop'u ref'te tut; efekt bağımlılıklarını her renderda değiştirmesin.
  const onUnreachableRef = useRef(onUnreachable);
  useEffect(() => {
    onUnreachableRef.current = onUnreachable;
  }, [onUnreachable]);

  const detected = detectEngine(sourceUrl ?? src);
  const swapped = engineOverride?.src === src;
  const engine = swapped ? engineOverride.engine : detected;

  // Yeni yayına geçildiğinde deneme sayacı sıfırlanır; aksi halde önceki
  // kanalda tükenen hak yeni kanalı da anında hataya düşürür.
  useEffect(() => {
    autoRetries.current = 0;
    hasPlayed.current = false;
  }, [src]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    // TypeScript iç closure'larda daraltmayı kaybeder; non-nullable sabite atıyoruz.
    const vid = video;

    let disposed = false;
    let cleanup = () => {};

    setStatus("loading");
    setMessage("");

    function fail(text: string) {
      if (disposed) return;
      setStatus("error");
      setMessage(text);
    }

    /** Ağ kaynaklı kopmalarda sınırlı sayıda sessizce yeniden dener. */
    function retryOrFail(text: string) {
      if (disposed) return;
      if (autoRetries.current < MAX_AUTO_RETRIES) {
        autoRetries.current += 1;
        setAttempt((value) => value + 1);
        return;
      }
      // Doğrudan kipte CORS engeli de ağ hatası gibi görünür. Sayfaya haber ver;
      // proxy'ye düşerse `src` değişir ve efekt yeniden kurulur.
      onUnreachableRef.current?.();
      fail(text);
    }

    /**
     * Konteyner yanlış tanınmış olabilir: diğer motorla BİR KEZ dener.
     *
     * Özgün planda motor yedeklemesi "spekülatif" diye ertelenmişti; artık
     * değil. Sahibin sağlayıcısı uzantısız canlı adreslerde ham MPEG-TS
     * (`video/mp2t`) sunuyor, yani adres biçiminden yapılan tahmin ölçülebilir
     * biçimde yanılabiliyor. Bu yüzden çalışma anında yedek motor gerekiyor.
     *
     * Döngü güvenliği: takas yalnızca `engineOverride` bu `src` için henüz
     * yazılmamışken yapılır; yazıldıktan sonra aynı yayında bir daha giremez.
     */
    function swapEngine(text: string) {
      if (disposed) return;
      const alternative = fallbackEngine(engine);
      if (alternative === null || swapped) {
        fail(text);
        return;
      }
      // Yeni motora temiz bir yeniden deneme hakkı ver.
      autoRetries.current = 0;
      setEngineOverride({ src, engine: alternative });
    }

    async function start() {
      if (engine === "native") {
        const onNativeError = () => {
          // Doğrudan kipte CORS engeli burada da biçim hatası gibi görünür.
          onUnreachableRef.current?.();
          fail("Bu dosya biçimi tarayıcıda oynatılamıyor.");
        };
        vid.src = src;
        vid.addEventListener("error", onNativeError);
        cleanup = () => {
          vid.removeEventListener("error", onNativeError);
          vid.removeAttribute("src");
          vid.load();
        };
        return;
      }

      if (engine === "hls") {
        // Safari HLS'i kendi oynatır; hls.js'e gerek yok.
        if (vid.canPlayType("application/vnd.apple.mpegurl")) {
          const onSafariError = () => retryOrFail(MSG_UNREACHABLE);
          vid.src = src;
          vid.addEventListener("error", onSafariError);
          cleanup = () => {
            vid.removeEventListener("error", onSafariError);
            vid.removeAttribute("src");
            vid.load();
          };
          return;
        }

        let hls: import("hls.js").default | null = null;
        try {
          const { default: Hls } = await import("hls.js");
          if (disposed) return;
          if (!Hls.isSupported()) {
            fail("Tarayıcınız bu yayın türünü desteklemiyor.");
            return;
          }

          hls = new Hls({ enableWorker: true, lowLatencyMode: false });
          hls.loadSource(src);
          hls.attachMedia(vid);
          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (!data.fatal) return;
            const details = String(data.details);

            // Codec hatası motor takasıyla çözülmez — ayrı yolda kalır.
            if (isCodecError("hls", details)) {
              fail(MSG_CODEC);
              return;
            }

            // Manifest ayrıştırılamadı/yüklenemedi: kaynak muhtemelen HLS değil.
            if (isContainerMismatch("hls", details) && !hasPlayed.current) {
              swapEngine(MSG_UNREACHABLE);
              return;
            }

            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
              retryOrFail(MSG_UNREACHABLE);
            } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
              // İlk yüklemede gelen ölümcül medya hatası: konteyner yanlış
              // tanınmış olabilir. Oynatma başladıysa gerçek codec sorunudur.
              if (hasPlayed.current) fail(MSG_CODEC);
              else swapEngine(MSG_CODEC);
            } else {
              fail("Yayın açılamadı.");
            }
          });
          cleanup = () => hls!.destroy();
        } catch {
          if (!disposed) fail("Oynatıcı yüklenemedi. Lütfen tekrar deneyin.");
        }
        return;
      }

      let player: import("mpegts.js").default.Player | null = null;
      try {
        const { default: mpegts } = await import("mpegts.js");
        if (disposed) return;
        if (!mpegts.isSupported()) {
          fail("Tarayıcınız bu yayın türünü desteklemiyor.");
          return;
        }

        player = mpegts.createPlayer({
          type: "mpegts",
          // Yalnızca canlı yayında canlı kip. Film ve bölümlerde `false`
          // olmalı ki arama çubuğu çalışsın — `/api/stream` bu yüzden
          // `Range` başlığını sağlayıcıya iletiyor.
          isLive: kind === "live",
          url: src,
        });
        player.attachMediaElement(vid);
        player.load();
        player.on(
          mpegts.Events.ERROR,
          (errorType: string, errorDetail: string) => {
            // Codec hatası motor takasıyla çözülmez — ayrı yolda kalır.
            if (isCodecError("mpegts", errorDetail)) {
              fail(MSG_CODEC);
              return;
            }

            // Veri MPEG-TS olarak ayrıştırılamadı: kaynak muhtemelen HLS.
            if (
              isContainerMismatch("mpegts", errorDetail) &&
              !hasPlayed.current
            ) {
              swapEngine(MSG_UNREACHABLE);
              return;
            }

            if (errorType === mpegts.ErrorTypes.MEDIA_ERROR) {
              if (hasPlayed.current) fail(MSG_CODEC);
              else swapEngine(MSG_CODEC);
            } else {
              retryOrFail("Yayın kesildi veya kaynak yanıt vermiyor.");
            }
          },
        );
        cleanup = () => {
          player!.destroy();
        };
      } catch {
        if (!disposed) fail("Oynatıcı yüklenemedi. Lütfen tekrar deneyin.");
      }
    }

    void start();

    return () => {
      disposed = true;
      cleanup();
    };
  }, [src, attempt, engine, swapped, kind]);

  function handleManualRetry() {
    autoRetries.current = 0;
    hasPlayed.current = false;
    // Elle denemede tespit edilen motora dön; kullanıcı baştan başlatıyor.
    setEngineOverride(null);
    setAttempt((value) => value + 1);
  }

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
      <video
        ref={videoRef}
        controls
        autoPlay
        playsInline
        title={title}
        onPlaying={() => {
          hasPlayed.current = true;
          setStatus("ready");
        }}
        className="h-full w-full"
      />

      {status === "loading" && (
        <div
          aria-live="polite"
          className="pointer-events-none absolute inset-0 grid place-items-center bg-background/60 text-sm text-muted-foreground"
        >
          Yayın açılıyor…
        </div>
      )}

      {status === "error" && (
        <div
          role="alert"
          className="absolute inset-0 grid place-items-center bg-background/90 p-6"
        >
          <div className="flex max-w-sm flex-col items-center gap-3 text-center">
            <AlertCircle aria-hidden className="size-8 text-accent-text" />
            <p className="text-sm text-foreground">{message}</p>
            <button
              type="button"
              onClick={handleManualRetry}
              className="inline-flex h-11 items-center gap-2 rounded-lg bg-accent px-5 font-semibold text-white transition-colors duration-150 hover:bg-accent-hover"
            >
              <RotateCcw aria-hidden className="size-4" />
              Tekrar dene
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
