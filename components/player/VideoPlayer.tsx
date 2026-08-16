"use client";

import {
  AlertCircle,
  Maximize,
  Minimize,
  Pause,
  PictureInPicture2,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  detectEngine,
  fallbackEngine,
  isCodecError,
  isContainerMismatch,
  isUnavailableStatus,
  type StreamEngine,
} from "@/lib/stream-type";
import type { ChannelKind } from "@/lib/types";

const MAX_AUTO_RETRIES = 3;
// Kontroller bu kadar hareketsizlik sonrası gizlenir (ms).
const HIDE_DELAY_MS = 3000;

const MSG_UNREACHABLE = "Yayına ulaşılamıyor. Kaynak yanıt vermiyor olabilir.";
// Tarayıcı bu yayının video veya ses biçimini çözemedi.
// Bu bir tarayıcı sınırlamasıdır; kanalda veya uygulamada hata yoktur.
const MSG_CODEC =
  "Bu yayının görüntü veya ses biçimi tarayıcıda desteklenmiyor. Tarayıcı sınırlamasıdır, kanalda sorun yok.";
// Kanal sağlayıcı tarafında kapalı — yeniden deneme anlamsız.
const MSG_UNAVAILABLE =
  "Bu kanal şu anda yayında değil. Sağlayıcıda kapalı olabilir — listeden başka bir kanal deneyin.";

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

// ---- Yardımcı kancalar ----

/** Tam ekran değişikliklerini izler. */
function useFullscreen(containerRef: React.RefObject<HTMLDivElement | null>) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    function onChange() {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    }
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [containerRef]);

  const toggle = useCallback(() => {
    if (!containerRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      containerRef.current.requestFullscreen().catch(() => {});
    }
  }, [containerRef]);

  return { isFullscreen, toggle };
}

/** Resim içinde resim desteğini ve durumunu izler. */
function usePictureInPicture(videoRef: React.RefObject<HTMLVideoElement | null>) {
  const [isPip, setIsPip] = useState(false);
  const supported =
    typeof document !== "undefined" && "pictureInPictureEnabled" in document;

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    function onEnter() { setIsPip(true); }
    function onLeave() { setIsPip(false); }
    vid.addEventListener("enterpictureinpicture", onEnter);
    vid.addEventListener("leavepictureinpicture", onLeave);
    return () => {
      vid.removeEventListener("enterpictureinpicture", onEnter);
      vid.removeEventListener("leavepictureinpicture", onLeave);
    };
  }, [videoRef]);

  const toggle = useCallback(() => {
    const vid = videoRef.current;
    if (!vid) return;
    if (document.pictureInPictureElement) {
      document.exitPictureInPicture().catch(() => {});
    } else {
      vid.requestPictureInPicture().catch(() => {});
    }
  }, [videoRef]);

  return { isPip, supported, toggle };
}

// ---- Ana bileşen ----

export function VideoPlayer({
  src,
  sourceUrl,
  kind,
  title,
  onUnreachable,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
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
     * Kanal sağlayıcı tarafında kapalı.
     * 502 kodu yeniden denemede düzelmez; otomatik yeniden deneme ve motor
     * takası atlanır. Kullanıcı elle "Tekrar dene" tuşuna basabilir.
     */
    function failUnavailable() {
      if (disposed) return;
      fail(MSG_UNAVAILABLE);
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
              // 502 = proxy'nin "kanal yayında değil" kodu.
              // Yeniden deneme veya motor takası bu durumu çözmez.
              if (isUnavailableStatus(data.response?.code ?? 0)) {
                failUnavailable();
                return;
              }
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
          (
            errorType: string,
            errorDetail: string,
            errorMessage: { code: number; msg: string } | undefined,
          ) => {
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
            } else if (
              errorDetail === "HttpStatusCodeInvalid" &&
              isUnavailableStatus(errorMessage?.code ?? 0)
            ) {
              // 502 = proxy'nin "kanal yayında değil" kodu.
              // Yeniden deneme veya motor takası bu durumu çözmez.
              failUnavailable();
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

  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(containerRef);
  const { isPip, supported: pipSupported, toggle: togglePip } = usePictureInPicture(videoRef);

  return (
    <div
      ref={containerRef}
      className="relative aspect-video w-full overflow-hidden rounded-xl bg-black"
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        title={title}
        onPlaying={() => {
          hasPlayed.current = true;
          setStatus("ready");
        }}
        className="h-full w-full"
      />

      {/* Kontrol katmanı: yalnızca video yüklendiğinde ve hata yokken */}
      {status !== "error" && (
        <PlayerControls
          videoRef={videoRef}
          kind={kind}
          title={title}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
          isPip={isPip}
          pipSupported={pipSupported}
          onTogglePip={togglePip}
        />
      )}

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

// ---- Oynatıcı kontrol katmanı ----

interface PlayerControlsProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  kind?: ChannelKind;
  title?: string;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  isPip: boolean;
  pipSupported: boolean;
  onTogglePip: () => void;
}

function PlayerControls({
  videoRef,
  kind,
  title,
  isFullscreen,
  onToggleFullscreen,
  isPip,
  pipSupported,
  onTogglePip,
}: PlayerControlsProps) {
  const isLive = kind === "live";

  // Oynatma durumu
  const [paused, setPaused] = useState(false);
  // Ses durumu
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  // Konum (VOD)
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Kontrol görünürlüğü
  const [visible, setVisible] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Herhangi bir kontrol odaklanmış mı? Odak varken asla gizleme.
  const focusedRef = useRef(false);
  // Kontroller paneline ref (odak tespiti için)
  const barRef = useRef<HTMLDivElement>(null);

  // Video olaylarını dinle
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    function onPause() { setPaused(true); }
    function onPlay() { setPaused(false); }
    function onVolumeChange() {
      setMuted(vid!.muted);
      setVolume(vid!.muted ? 0 : vid!.volume);
    }
    function onTimeUpdate() { setCurrentTime(vid!.currentTime); }
    function onDurationChange() { setDuration(vid!.duration); }

    vid.addEventListener("pause", onPause);
    vid.addEventListener("play", onPlay);
    vid.addEventListener("volumechange", onVolumeChange);
    vid.addEventListener("timeupdate", onTimeUpdate);
    vid.addEventListener("durationchange", onDurationChange);
    return () => {
      vid.removeEventListener("pause", onPause);
      vid.removeEventListener("play", onPlay);
      vid.removeEventListener("volumechange", onVolumeChange);
      vid.removeEventListener("timeupdate", onTimeUpdate);
      vid.removeEventListener("durationchange", onDurationChange);
    };
  }, [videoRef]);

  // Otomatik gizleme — 3 saniye hareketsizlikte gizle
  const scheduleHide = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      if (!focusedRef.current) setVisible(false);
    }, HIDE_DELAY_MS);
  }, []);

  const showControls = useCallback(() => {
    setVisible(true);
    scheduleHide();
  }, [scheduleHide]);

  useEffect(() => {
    scheduleHide();
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [scheduleHide]);

  // Klavye kısayolları — yalnızca oynatıcı konteyner içindeyken ya da
  // video odakta değil de genel pencerede basıldığında çalışır.
  // Metin girişlerinde tuşları yutmaz.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Metin girişi odaktaysa müdahale etme.
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const vid = videoRef.current;
      if (!vid) return;

      switch (e.key) {
        case " ":
        case "Space":
          e.preventDefault();
          showControls();
          if (vid.paused) vid.play().catch(() => {});
          else vid.pause();
          break;
        case "m":
        case "M":
          e.preventDefault();
          showControls();
          vid.muted = !vid.muted;
          break;
        case "f":
        case "F":
          e.preventDefault();
          showControls();
          onToggleFullscreen();
          break;
        case "ArrowUp":
          e.preventDefault();
          showControls();
          vid.volume = Math.min(1, vid.volume + 0.1);
          vid.muted = false;
          break;
        case "ArrowDown":
          e.preventDefault();
          showControls();
          vid.volume = Math.max(0, vid.volume - 0.1);
          break;
        case "ArrowLeft":
          if (!isLive) {
            e.preventDefault();
            showControls();
            vid.currentTime = Math.max(0, vid.currentTime - 10);
          }
          break;
        case "ArrowRight":
          if (!isLive) {
            e.preventDefault();
            showControls();
            vid.currentTime = Math.min(vid.duration || 0, vid.currentTime + 10);
          }
          break;
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [videoRef, isLive, showControls, onToggleFullscreen]);

  function handlePlayPause() {
    const vid = videoRef.current;
    if (!vid) return;
    showControls();
    if (vid.paused) vid.play().catch(() => {});
    else vid.pause();
  }

  function handleMute() {
    const vid = videoRef.current;
    if (!vid) return;
    showControls();
    vid.muted = !vid.muted;
  }

  function handleVolumeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const vid = videoRef.current;
    if (!vid) return;
    const v = Number(e.target.value);
    vid.volume = v;
    vid.muted = v === 0;
    showControls();
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const vid = videoRef.current;
    if (!vid) return;
    vid.currentTime = Number(e.target.value);
    showControls();
  }

  // Odak takibi: kontroller paneli odak alırsa gizleme
  function handleFocusIn() {
    focusedRef.current = true;
    setVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
  }
  function handleFocusOut(e: React.FocusEvent) {
    // Panel içinde odak kaldıysa sayma
    if (barRef.current?.contains(e.relatedTarget as Node)) return;
    focusedRef.current = false;
    scheduleHide();
  }

  return (
    <div
      className="absolute inset-0"
      onMouseMove={showControls}
      onTouchStart={showControls}
    >
      {/* Tıklanabilir video alanı — oynat/duraklat */}
      <button
        type="button"
        aria-label={paused ? "Oynat" : "Duraklat"}
        onClick={handlePlayPause}
        className="absolute inset-0 w-full h-full cursor-default"
      />

      {/* Alt gradyan + kontroller */}
      <div
        ref={barRef}
        onFocusCapture={handleFocusIn}
        onBlurCapture={handleFocusOut}
        aria-hidden={!visible}
        style={{
          // gradyan: backdrop-filter yok (kare bütçesini videoya bırak)
          background:
            "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 50%, transparent 100%)",
          transition: "opacity 150ms ease-out",
          opacity: visible ? 1 : 0,
          pointerEvents: visible ? "auto" : "none",
        }}
        className="absolute bottom-0 left-0 right-0 px-3 pt-8 pb-3 flex flex-col gap-2"
      >
        {/* Arama çubuğu — yalnızca VOD */}
        {!isLive && duration > 0 && (
          <div className="flex items-center gap-2">
            <span className="tabular text-xs text-white/80 shrink-0">
              {formatTime(currentTime)}
            </span>
            <input
              type="range"
              min={0}
              max={duration}
              step={1}
              value={currentTime}
              onChange={handleSeek}
              aria-label="Konum"
              className="flex-1 h-1 accent-accent cursor-pointer rounded-full"
            />
            <span className="tabular text-xs text-white/80 shrink-0">
              {formatTime(duration)}
            </span>
          </div>
        )}

        {/* Kontrol satırı */}
        <div className="flex items-center gap-1">
          {/* Oynat/Duraklat */}
          <ControlButton
            aria-label={paused ? "Oynat" : "Duraklat"}
            onClick={handlePlayPause}
          >
            {paused ? (
              <Play aria-hidden className="size-5 fill-white stroke-none" />
            ) : (
              <Pause aria-hidden className="size-5 fill-white stroke-none" />
            )}
          </ControlButton>

          {/* Ses kapat/aç */}
          <ControlButton
            aria-label={muted || volume === 0 ? "Sesi aç" : "Sesi kapat"}
            onClick={handleMute}
          >
            {muted || volume === 0 ? (
              <VolumeX aria-hidden className="size-5 text-white" />
            ) : (
              <Volume2 aria-hidden className="size-5 text-white" />
            )}
          </ControlButton>

          {/* Ses seviyesi kaydırıcısı */}
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            onChange={handleVolumeChange}
            aria-label="Ses seviyesi"
            className="w-20 h-1 accent-accent cursor-pointer rounded-full"
          />

          {/* Kanal adı + CANLI rozeti */}
          <div className="flex-1 flex items-center gap-2 px-2 min-w-0">
            {title && (
              <span
                className="truncate text-sm font-medium text-white/90"
                title={title}
              >
                {title}
              </span>
            )}
            {isLive && (
              <span
                className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold tracking-[0.04em] text-white"
                style={{ background: "var(--color-accent)" }}
                aria-label="Canlı yayın"
              >
                CANLI
              </span>
            )}
          </div>

          {/* Resim içinde resim */}
          {pipSupported && (
            <ControlButton
              aria-label={isPip ? "Resim içinde resimden çık" : "Resim içinde resim"}
              onClick={onTogglePip}
            >
              <PictureInPicture2 aria-hidden className="size-5 text-white" />
            </ControlButton>
          )}

          {/* Tam ekran */}
          <ControlButton
            aria-label={isFullscreen ? "Tam ekrandan çık" : "Tam ekran"}
            onClick={onToggleFullscreen}
          >
            {isFullscreen ? (
              <Minimize aria-hidden className="size-5 text-white" />
            ) : (
              <Maximize aria-hidden className="size-5 text-white" />
            )}
          </ControlButton>
        </div>
      </div>
    </div>
  );
}

// ---- Küçük yardımcılar ----

interface ControlButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
}

function ControlButton({ children, className, ...props }: ControlButtonProps) {
  return (
    <button
      type="button"
      className={[
        // ≥44×44px dokunma hedefi, görünür odak halkası
        "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg",
        "text-white transition-colors duration-150 hover:bg-white/10",
        "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </button>
  );
}

/** Saniyeyi `SS:DD` veya `SS:DD:SS` biçimine çevirir. */
function formatTime(seconds: number): string {
  if (!isFinite(seconds)) return "0:00";
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  return `${m}:${String(sec).padStart(2, "0")}`;
}
