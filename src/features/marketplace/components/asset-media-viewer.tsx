"use client";

import { type ComponentProps, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Expand, Image as ImageIcon, Pause, Play, RotateCcw, RotateCw, Volume2, VolumeX, X, ZoomIn, ZoomOut } from "lucide-react";
import screenfull from "screenfull";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/components/providers/language-provider";
import { getEmbeddableVideoUrl, getVideoThumbnailUrl } from "@/lib/media";
import type { AssetMediaItem } from "@/types/market";

interface AssetMediaViewerProps {
  media: AssetMediaItem[];
  title: string;
  className?: string;
}

const SWIPE_THRESHOLD = 56;
const SEEK_STEP = 10;
const SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;

const copy = {
  es: { noMedia: "Sin multimedia", image: "Imagen", video: "Video", hint: "Doble toque para zoom", reset: "Reiniciar", fit: "Ajustar", gallery: "Galeria multimedia", swipe: "Desliza o toca miniaturas", nav: "Navegacion de galeria", play: "Reproducir", pause: "Pausar", mute: "Silenciar", unmute: "Activar audio", fullscreen: "Pantalla completa", exitFullscreen: "Salir de pantalla completa", speed: "Velocidad" },
  en: { noMedia: "No media available", image: "Image", video: "Video", hint: "Double tap to zoom", reset: "Reset", fit: "Fit", gallery: "Media gallery", swipe: "Swipe or tap thumbnails", nav: "Gallery navigation", play: "Play", pause: "Pause", mute: "Mute", unmute: "Unmute", fullscreen: "Fullscreen", exitFullscreen: "Exit fullscreen", speed: "Speed" },
  pt: { noMedia: "Sem midia", image: "Imagem", video: "Video", hint: "Toque duplo para zoom", reset: "Reset", fit: "Ajustar", gallery: "Galeria de midia", swipe: "Deslize ou toque miniaturas", nav: "Navegacao da galeria", play: "Reproduzir", pause: "Pausar", mute: "Silenciar", unmute: "Ativar audio", fullscreen: "Tela cheia", exitFullscreen: "Sair da tela cheia", speed: "Velocidade" },
  fr: { noMedia: "Aucun media", image: "Image", video: "Video", hint: "Double appui pour zoom", reset: "Reset", fit: "Ajuster", gallery: "Galerie media", swipe: "Balayez ou touchez les miniatures", nav: "Navigation galerie", play: "Lire", pause: "Pause", mute: "Couper le son", unmute: "Activer le son", fullscreen: "Plein ecran", exitFullscreen: "Quitter plein ecran", speed: "Vitesse" },
} as const;

function clampIndex(index: number, total: number) {
  if (total <= 0) return 0;
  if (index < 0) return total - 1;
  if (index >= total) return 0;
  return index;
}

function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const s = Math.floor(value % 60);
  const m = Math.floor((value / 60) % 60);
  const h = Math.floor(value / 3600);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

function getStageHeight(fullscreen: boolean, lightbox: boolean) {
  if (lightbox) return "min-h-[68svh] sm:min-h-[78svh]";
  if (fullscreen) return "h-full";
  return "h-[17rem] sm:h-[22rem] lg:h-[28rem]";
}

function ControlButton({ children, className = "", ...props }: ComponentProps<typeof Button>) {
  return (
    <Button
      type="button"
      variant="outline"
      className={`inline-flex h-10 min-w-10 items-center justify-center rounded-full border-[color:color-mix(in_oklab,var(--color-border)_76%,white_24%)] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--color-surface)_94%,white_6%),color-mix(in_oklab,var(--color-surface-soft)_72%,var(--color-surface)))] px-3 text-[var(--color-foreground)] shadow-[0_10px_26px_rgba(15,23,42,0.12)] backdrop-blur-xl hover:bg-[color:color-mix(in_oklab,var(--color-surface)_86%,white_14%)] ${className}`}
      {...props}
    >
      {children}
    </Button>
  );
}

function MediaThumb({ item, title, active, index, onClick }: { item: AssetMediaItem; title: string; active: boolean; index: number; onClick: () => void; }) {
  const thumb = item.kind === "video" ? getVideoThumbnailUrl(item.url) : item.url;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative overflow-hidden rounded-[1.35rem] border bg-[linear-gradient(180deg,color-mix(in_oklab,var(--color-surface)_96%,white_4%),color-mix(in_oklab,var(--color-surface-soft)_76%,var(--color-surface)))] transition duration-200 ${
        active ? "border-[var(--color-primary)] shadow-[0_14px_30px_-18px_rgba(106,166,78,0.78)] ring-2 ring-[color:color-mix(in_oklab,var(--color-primary)_24%,transparent)]" : "border-[var(--color-border)] hover:border-[var(--color-primary)]/55 hover:shadow-[0_12px_24px_-18px_rgba(15,23,42,0.22)]"
      }`}
      aria-label={`${title} ${index + 1}`}
    >
      <div className="relative aspect-square w-[5.2rem] overflow-hidden sm:w-[6rem] lg:w-[6.5rem]">
        {thumb ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={thumb} alt={`${title}-${index + 1}`} loading="lazy" decoding="async" className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.03]" />
          </>
        ) : (
          <div className="grid h-full w-full place-items-center bg-[var(--color-surface-soft)] text-[var(--color-muted)]">{item.kind === "image" ? <ImageIcon size={20} /> : <Play size={20} />}</div>
        )}
        {item.kind === "video" && <span className="absolute bottom-1.5 right-1.5 grid h-7 w-7 place-items-center rounded-full bg-black/72 text-white shadow-md backdrop-blur-md"><Play size={13} className="translate-x-[1px]" /></span>}
      </div>
    </button>
  );
}

function ImageStage({ item, title, heightClass, showHint, labels }: { item: AssetMediaItem; title: string; heightClass: string; showHint: boolean; labels: { image: string; hint: string; reset: string; fit: string; }; }) {
  const [scale, setScale] = useState(1);
  return (
    <TransformWrapper minScale={1} maxScale={5} initialScale={1} centerOnInit limitToBounds smooth wheel={{ step: 0.16 }} pinch={{ step: 5 }} doubleClick={{ mode: "zoomIn", step: 1.6 }} panning={{ velocityDisabled: false }} onTransformed={(_, next) => setScale(next.scale)}>
      {({ zoomIn, zoomOut, resetTransform }) => (
        <div className={`relative flex w-full items-center justify-center overflow-hidden rounded-[1.9rem] border border-[color:color-mix(in_oklab,var(--color-border)_70%,white_30%)] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--color-surface)_96%,white_4%),color-mix(in_oklab,var(--color-surface-soft)_78%,var(--color-background)))] ${heightClass}`}>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,color-mix(in_oklab,var(--color-primary)_16%,transparent),transparent_34%)]" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-[linear-gradient(180deg,color-mix(in_oklab,var(--color-surface)_78%,white_22%),transparent)]" />
          <TransformComponent wrapperClass="!h-full !w-full" contentClass="!relative !h-full !w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.url} alt={title} decoding="async" className="absolute inset-0 h-full w-full select-none object-cover" draggable={false} />
          </TransformComponent>
          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 px-4 py-4 sm:px-5 sm:py-5">
            <div className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[color:color-mix(in_oklab,var(--color-surface)_90%,white_10%)] px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--color-foreground)] shadow-[0_10px_20px_rgba(15,23,42,0.12)] backdrop-blur-xl"><ImageIcon size={15} />{labels.image}</div>
            {showHint && <div className="hidden rounded-full border border-[var(--color-border)] bg-[color:color-mix(in_oklab,var(--color-surface-soft)_84%,var(--color-surface))] px-4 py-2 text-[12px] font-medium text-[var(--color-muted)] shadow-[0_10px_20px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:block">{labels.hint}</div>}
          </div>
          <div className="absolute bottom-4 left-1/2 flex w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 items-center justify-between gap-4 rounded-[1.4rem] border border-[color:color-mix(in_oklab,var(--color-border)_72%,white_28%)] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--color-surface)_96%,white_4%),color-mix(in_oklab,var(--color-surface-soft)_70%,var(--color-surface)))] px-4 py-4 shadow-[0_18px_42px_rgba(15,23,42,0.14)] backdrop-blur-xl">
            <div className="flex items-center gap-3"><ControlButton className="h-12 w-12 px-0" onClick={() => zoomOut()}><ZoomOut size={17} /></ControlButton><ControlButton className="h-12 w-12 px-0" onClick={() => zoomIn()}><ZoomIn size={17} /></ControlButton></div>
            <div className="min-w-[5rem] text-center text-base font-semibold text-[var(--color-foreground)]">{Math.round(scale * 100)}%</div>
            <ControlButton className="min-w-[6rem] text-sm" onClick={() => resetTransform()}>{scale > 1.01 ? labels.reset : labels.fit}</ControlButton>
          </div>
        </div>
      )}
    </TransformWrapper>
  );
}

function VideoStage({ item, title, heightClass, isMuted, playbackRate, isFullscreen, onMutedChange, onPlaybackRateChange, onFullscreenToggle, videoRef, labels }: { item: AssetMediaItem; title: string; heightClass: string; isMuted: boolean; playbackRate: number; isFullscreen: boolean; onMutedChange: (next: boolean) => void; onPlaybackRateChange: (next: number) => void; onFullscreenToggle: () => Promise<boolean>; videoRef: React.RefObject<HTMLVideoElement | null>; labels: { video: string; play: string; pause: string; mute: string; unmute: string; fullscreen: string; exitFullscreen: string; speed: string; }; }) {
  const embedded = getEmbeddableVideoUrl(item.url);
  const poster = getVideoThumbnailUrl(item.url);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [showUi, setShowUi] = useState(true);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || embedded) return;
    video.muted = isMuted;
    video.playbackRate = playbackRate;
  }, [embedded, isMuted, playbackRate, videoRef]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || embedded) return;
    const onPlay = () => { setIsPlaying(true); setShowUi(false); };
    const onPause = () => { setIsPlaying(false); setShowUi(true); };
    const onDuration = () => setDuration(video.duration || 0);
    const onTime = () => setCurrentTime(video.currentTime || 0);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("durationchange", onDuration);
    video.addEventListener("timeupdate", onTime);
    onDuration();
    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("durationchange", onDuration);
      video.removeEventListener("timeupdate", onTime);
    };
  }, [embedded, item.id, videoRef]);

  const togglePlay = async () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      await video.play().catch(() => undefined);
      return;
    }
    video.pause();
  };

  const seek = (delta: number) => {
    const video = videoRef.current;
    if (!video || duration <= 0) return;
    const next = Math.max(0, Math.min(duration, (video.currentTime || 0) + delta));
    video.currentTime = next;
    setCurrentTime(next);
  };

  const onSeek = (value: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = value;
    setCurrentTime(value);
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const volumeIcon = isMuted ? <VolumeX size={19} /> : <Volume2 size={19} />;

  return (
    <div className={`group relative overflow-hidden rounded-[1.7rem] border border-white/8 bg-[linear-gradient(180deg,#11151c,#090b10)] shadow-[0_18px_38px_rgba(0,0,0,0.28)] ${heightClass}`} onMouseEnter={() => setShowUi(true)} onMouseLeave={() => setShowUi(!isPlaying)} onTouchStart={() => setShowUi(true)}>
      {embedded ? (
        <>
          <iframe src={embedded} title={title} className="absolute inset-0 h-full w-full" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />
          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 px-4 py-4 sm:px-5 sm:py-5">
            <div className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-white/12 bg-black/42 px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.16em] text-white shadow-sm backdrop-blur-xl"><Play size={13} />{labels.video}</div>
          </div>
        </>
      ) : (
        <>
          <video ref={videoRef} muted={isMuted} playsInline preload="metadata" poster={poster || undefined} className="absolute inset-0 h-full w-full object-cover" src={item.url} onClick={() => { void togglePlay(); }} />
          <button type="button" className={`absolute left-1/2 top-1/2 grid h-20 w-20 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-white shadow-lg backdrop-blur-md transition ${isPlaying ? "opacity-0" : "opacity-100"}`} aria-label={isPlaying ? labels.pause : labels.play} onClick={() => { void togglePlay(); }}>{isPlaying ? <Pause size={28} /> : <Play size={28} className="translate-x-[1px]" />}</button>
          <div className={`absolute inset-x-0 bottom-0 bg-[linear-gradient(180deg,transparent,rgba(0,0,0,0.78)_35%,rgba(0,0,0,0.94))] px-4 pb-4 pt-12 transition ${showUi ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
            <input type="range" min={0} max={Math.max(duration, 1)} step={0.1} value={Math.min(currentTime, duration || 0)} onChange={(event) => onSeek(Number(event.target.value))} className="h-2 w-full cursor-pointer accent-red-500" aria-label="Seek" />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-white">
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" className="rounded-xl p-3 transition hover:bg-white/16" onClick={() => { void togglePlay(); }} aria-label={isPlaying ? labels.pause : labels.play}>{isPlaying ? <Pause size={19} /> : <Play size={19} className="translate-x-[1px]" />}</button>
                <button type="button" className="rounded-xl p-3 transition hover:bg-white/16" onClick={() => onMutedChange(!isMuted)} aria-label={isMuted ? labels.unmute : labels.mute}>{volumeIcon}</button>
                <button type="button" className="rounded-xl p-3 transition hover:bg-white/16" onClick={() => seek(-SEEK_STEP)} aria-label={`Retroceder ${SEEK_STEP} segundos`}><RotateCcw size={19} /></button>
                <button type="button" className="rounded-xl p-3 transition hover:bg-white/16" onClick={() => seek(SEEK_STEP)} aria-label={`Avanzar ${SEEK_STEP} segundos`}><RotateCw size={19} /></button>
                <p className="text-sm font-semibold tabular-nums text-white/88">{formatTime(currentTime)} / {formatTime(duration)}</p>
              </div>
              <div className="flex items-center gap-3">
                <label className="rounded-full border border-white/10 bg-white/8 px-3 py-2 text-[12px] font-semibold text-white/90">
                  <span className="hidden min-[360px]:inline">{labels.speed}</span>
                  <select value={playbackRate} onChange={(event) => onPlaybackRateChange(Number(event.target.value))} className="bg-transparent text-white outline-none min-[360px]:ml-1">
                    {SPEEDS.map((rate) => <option key={rate} value={rate}>{rate}x</option>)}
                  </select>
                </label>
                <button type="button" className="rounded-xl p-3 transition hover:bg-white/16" onClick={() => { void onFullscreenToggle(); }} aria-label={isFullscreen ? labels.exitFullscreen : labels.fullscreen}><Expand size={19} /></button>
              </div>
            </div>
            <div className="mt-1 h-1 rounded-full bg-white/20"><div className="h-full rounded-full bg-red-500" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} /></div>
          </div>
          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 px-4 py-4 sm:px-5 sm:py-5">
            <div className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-white/12 bg-black/42 px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.16em] text-white shadow-sm backdrop-blur-xl"><Play size={13} />{labels.video}</div>
            <div className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-white/12 bg-black/42 px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.16em] text-white shadow-sm backdrop-blur-xl">{labels.speed} {playbackRate}x</div>
          </div>
        </>
      )}
    </div>
  );
}

export function AssetMediaViewer({ media, title, className }: AssetMediaViewerProps) {
  const { language } = useLanguage();
  const t = copy[language];
  const items = useMemo(() => media.filter((row) => Boolean(row?.url)), [media]);
  const [index, setIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(true);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [swipeStart, setSwipeStart] = useState<number | null>(null);
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lightboxVideoRef = useRef<HTMLVideoElement | null>(null);

  const total = items.length;
  const safeIndex = clampIndex(index, total);
  const current = items[safeIndex];
  const heightClass = getStageHeight(isFullscreen, false);
  const lightboxHeightClass = getStageHeight(false, true);

  useEffect(() => {
    const active = lightboxOpen ? lightboxVideoRef.current : videoRef.current;
    if (!active) return;
    active.muted = isMuted;
    active.playbackRate = playbackRate;
  }, [isMuted, lightboxOpen, playbackRate, safeIndex]);

  useEffect(() => {
    if (!lightboxOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLightboxOpen(false);
      if (event.key === "ArrowLeft" && total > 1) setIndex((prev) => clampIndex(prev - 1, total));
      if (event.key === "ArrowRight" && total > 1) setIndex((prev) => clampIndex(prev + 1, total));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightboxOpen, total]);

  useEffect(() => {
    const onChange = () => setIsFullscreen(screenfull.isFullscreen);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("overflow-hidden", lightboxOpen);
    return () => document.body.classList.remove("overflow-hidden");
  }, [lightboxOpen]);

  if (!current) {
    return (
      <div className={className}>
        <div className="grid min-h-[22rem] place-items-center rounded-[1.7rem] border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-muted)]">
          {t.noMedia}
        </div>
      </div>
    );
  }

  const goTo = (nextIndex: number) => setIndex(clampIndex(nextIndex, total));

  const toggleFullscreen = async () => {
    const viewer = viewerRef.current;
    if (!viewer || !screenfull.isEnabled) return false;
    if (screenfull.isFullscreen) {
      await screenfull.exit().catch(() => undefined);
      return false;
    }
    await screenfull.request(viewer).catch(() => undefined);
    return screenfull.isFullscreen;
  };

  const renderStage = (isLightbox: boolean) => {
    const stageHeight = isLightbox ? lightboxHeightClass : heightClass;
    if (current.kind === "image") {
      return (
        <ImageStage
          item={current}
          title={title}
          heightClass={stageHeight}
          showHint={!isLightbox}
          labels={{ image: t.image, hint: t.hint, reset: t.reset, fit: t.fit }}
        />
      );
    }
    return (
      <VideoStage
        item={current}
        title={title}
        heightClass={stageHeight}
        isMuted={isMuted}
        playbackRate={playbackRate}
        isFullscreen={isFullscreen}
        onMutedChange={setIsMuted}
        onPlaybackRateChange={setPlaybackRate}
        onFullscreenToggle={toggleFullscreen}
        videoRef={isLightbox ? lightboxVideoRef : videoRef}
        labels={{ video: t.video, play: t.play, pause: t.pause, mute: t.mute, unmute: t.unmute, fullscreen: t.fullscreen, exitFullscreen: t.exitFullscreen, speed: t.speed }}
      />
    );
  };

  return (
    <div ref={viewerRef} className={`${className ?? ""} ${isFullscreen ? "fixed inset-0 z-[140] h-[100dvh] w-[100vw] overflow-hidden bg-[var(--color-background)] p-0" : ""}`.trim()}>
      <div className={`relative overflow-hidden rounded-[2.2rem] border border-[color:color-mix(in_oklab,var(--color-border)_78%,white_22%)] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--color-surface)_98%,white_2%),color-mix(in_oklab,var(--color-background)_88%,white_12%))] p-4 shadow-[0_24px_50px_-34px_rgba(15,23,42,0.34)] sm:p-5 ${isFullscreen ? "h-full rounded-none border-0 p-3 sm:p-4" : ""}`}>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,color-mix(in_oklab,var(--color-primary)_14%,transparent),transparent_34%),radial-gradient(circle_at_top_right,color-mix(in_oklab,var(--color-secondary)_12%,transparent),transparent_28%)]" />
        <div className="relative mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">{t.gallery}</p>
            <p className="mt-1 truncate text-sm font-semibold text-[var(--color-foreground)]">{safeIndex + 1} / {total} - {current.kind === "image" ? t.image : t.video}</p>
          </div>
          <ControlButton
            className="h-11 w-11 px-0"
            onClick={() => {
              void (async () => {
                const expanded = await toggleFullscreen();
                if (!expanded && !lightboxOpen) setLightboxOpen(true);
              })();
            }}
            aria-label={isFullscreen ? t.exitFullscreen : t.fullscreen}
          >
            <Expand size={16} />
          </ControlButton>
        </div>

        <div className="relative grid gap-4">
          <div
            className="relative"
            onTouchStart={(event) => {
              if (total <= 1) return;
              setSwipeStart(event.touches[0]?.clientX ?? null);
            }}
            onTouchEnd={(event) => {
              if (total <= 1 || swipeStart === null) return;
              const delta = (event.changedTouches[0]?.clientX ?? swipeStart) - swipeStart;
              setSwipeStart(null);
              if (Math.abs(delta) < SWIPE_THRESHOLD) return;
              goTo(delta > 0 ? safeIndex - 1 : safeIndex + 1);
            }}
          >
            <div className={`relative overflow-hidden rounded-[1.95rem] border border-[color:color-mix(in_oklab,var(--color-border)_72%,white_28%)] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--color-surface)_95%,white_5%),color-mix(in_oklab,var(--color-surface-soft)_70%,var(--color-surface)))] shadow-[0_22px_46px_rgba(15,23,42,0.12)] ${isFullscreen ? "h-full rounded-none border-0 shadow-none" : ""}`}>
              {renderStage(false)}

              {total > 1 && !isFullscreen && (
                <>
                  <ControlButton className="absolute left-4 top-1/2 z-10 hidden h-14 w-14 -translate-y-1/2 rounded-2xl border border-[var(--color-border)] bg-[color:color-mix(in_oklab,var(--color-surface)_94%,white_6%)] px-0 shadow-[0_14px_30px_rgba(15,23,42,0.14)] hover:bg-[color:color-mix(in_oklab,var(--color-surface)_88%,white_12%)] lg:inline-flex" onClick={() => goTo(safeIndex - 1)}><ChevronLeft size={20} /></ControlButton>
                  <ControlButton className="absolute right-4 top-1/2 z-10 hidden h-14 w-14 -translate-y-1/2 rounded-2xl border border-[var(--color-border)] bg-[color:color-mix(in_oklab,var(--color-surface)_94%,white_6%)] px-0 shadow-[0_14px_30px_rgba(15,23,42,0.14)] hover:bg-[color:color-mix(in_oklab,var(--color-surface)_88%,white_12%)] lg:inline-flex" onClick={() => goTo(safeIndex + 1)}><ChevronRight size={20} /></ControlButton>
                </>
              )}
            </div>

            {total > 1 && !isFullscreen && (
              <div className="mt-3 flex items-center justify-between gap-3 rounded-[1.2rem] border border-[var(--color-border)] bg-[color:color-mix(in_oklab,var(--color-surface)_92%,white_8%)] px-3 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:hidden">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">{t.swipe}</p>
                  <p className="mt-1 text-sm font-semibold text-[var(--color-foreground)]">{t.nav}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" className="h-12 w-12 rounded-2xl px-0" onClick={() => goTo(safeIndex - 1)}><ChevronLeft size={18} /></Button>
                  <Button type="button" variant="outline" className="h-12 w-12 rounded-2xl px-0" onClick={() => goTo(safeIndex + 1)}><ChevronRight size={18} /></Button>
                </div>
              </div>
            )}
          </div>

          {total > 1 && !isFullscreen && (
            <div className="tc-mobile-scroll -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
              {items.map((item, itemIndex) => (
                <MediaThumb key={item.id} item={item} title={title} active={itemIndex === safeIndex} index={itemIndex} onClick={() => goTo(itemIndex)} />
              ))}
            </div>
          )}
        </div>
      </div>

      {lightboxOpen && (
        <div className="fixed inset-0 z-[120] bg-[radial-gradient(circle_at_top,rgba(24,38,29,0.18),rgba(2,6,11,0.92)_34%,rgba(2,6,11,0.98))] p-3 sm:p-6" role="dialog" aria-modal="true">
          <div className="mx-auto flex h-full w-full max-w-7xl flex-col">
            <div className="mb-3 flex items-center justify-between gap-3 rounded-[1.4rem] border border-white/10 bg-white/6 px-4 py-3 shadow-[0_16px_32px_rgba(0,0,0,0.22)] backdrop-blur-xl">
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-white">{title}</p>
                <p className="text-sm text-white/70">{safeIndex + 1} / {total}</p>
              </div>
              <Button type="button" variant="outline" className="h-11 w-11 rounded-2xl border-white/12 bg-white/10 px-0 text-white shadow-lg shadow-black/20 hover:bg-white/18" onClick={() => setLightboxOpen(false)}>
                <X size={18} />
              </Button>
            </div>

            <div className="relative min-h-0 flex-1">
              {renderStage(true)}
              {total > 1 && (
                <>
                  <Button type="button" variant="outline" className="absolute left-3 top-1/2 z-10 h-14 w-14 -translate-y-1/2 rounded-2xl border-white/12 bg-white/10 px-0 text-white shadow-lg shadow-black/20 hover:bg-white/18" onClick={() => goTo(safeIndex - 1)}><ChevronLeft size={20} /></Button>
                  <Button type="button" variant="outline" className="absolute right-3 top-1/2 z-10 h-14 w-14 -translate-y-1/2 rounded-2xl border-white/12 bg-white/10 px-0 text-white shadow-lg shadow-black/20 hover:bg-white/18" onClick={() => goTo(safeIndex + 1)}><ChevronRight size={20} /></Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
