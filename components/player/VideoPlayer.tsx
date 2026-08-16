"use client";

import { AlertCircle, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { detectEngine } from "@/lib/stream-type";

const MAX_AUTO_RETRIES = 3;

type Status = "loading" | "ready" | "error";

export function VideoPlayer({ src, title }: { src: string; title?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState("");
  const [attempt, setAttempt] = useState(0);
  const autoRetries = useRef(0);

  // Yeni yayına geçildiğinde deneme sayacı sıfırlanır; aksi halde önceki
  // kanalda tükenen hak yeni kanalı da anında hataya düşürür.
  useEffect(() => {
    autoRetries.current = 0;
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
      fail(text);
    }

    async function start() {
      const engine = detectEngine(src);

      if (engine === "native") {
        vid.src = src;
        vid.addEventListener("error", () =>
          fail("Bu dosya biçimi tarayıcıda oynatılamıyor."),
        );
        cleanup = () => {
          vid.removeAttribute("src");
          vid.load();
        };
        return;
      }

      if (engine === "hls") {
        // Safari HLS'i kendi oynatır; hls.js'e gerek yok.
        if (vid.canPlayType("application/vnd.apple.mpegurl")) {
          vid.src = src;
          cleanup = () => {
            vid.removeAttribute("src");
            vid.load();
          };
          return;
        }

        const { default: Hls } = await import("hls.js");
        if (disposed) return;
        if (!Hls.isSupported()) {
          fail("Tarayıcınız bu yayın türünü desteklemiyor.");
          return;
        }

        const hls = new Hls({ enableWorker: true, lowLatencyMode: false });
        hls.loadSource(src);
        hls.attachMedia(vid);
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal) return;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            retryOrFail("Yayına ulaşılamıyor. Kaynak yanıt vermiyor olabilir.");
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            fail(
              "Yayın çözülemedi. Görüntü veya ses codec'i tarayıcıda desteklenmiyor olabilir (H.265/AC3).",
            );
          } else {
            fail("Yayın açılamadı.");
          }
        });
        cleanup = () => hls.destroy();
        return;
      }

      const { default: mpegts } = await import("mpegts.js");
      if (disposed) return;
      if (!mpegts.isSupported()) {
        fail("Tarayıcınız bu yayın türünü desteklemiyor.");
        return;
      }

      const player = mpegts.createPlayer({
        type: "mpegts",
        isLive: true,
        url: src,
      });
      player.attachMediaElement(vid);
      player.load();
      player.on(mpegts.Events.ERROR, () =>
        retryOrFail("Yayın kesildi veya kaynak yanıt vermiyor."),
      );
      cleanup = () => {
        player.destroy();
      };
    }

    void start();

    return () => {
      disposed = true;
      cleanup();
    };
  }, [src, attempt]);

  function handleManualRetry() {
    autoRetries.current = 0;
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
        onPlaying={() => setStatus("ready")}
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
