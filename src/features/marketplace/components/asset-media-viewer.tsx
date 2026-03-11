"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import { ChevronLeft, ChevronRight, Expand, Minus, MonitorPlay, Pause, Play, Plus, RotateCcw, Volume2, VolumeX, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getEmbeddableVideoUrl, getVideoThumbnailUrl } from "@/lib/media";
import type { AssetMediaItem } from "@/types/market";

interface AssetMediaViewerProps {
  media: AssetMediaItem[];
  title: string;
  className?: string;
}

const ZOOM_MIN = 1;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.25;
const HOLD_FAST_RATE = 2;
const CONTROL_HIDE_DELAY = 2200;
const SWIPE_THRESHOLD = 54;

function clampZoom(value: number) {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, value));
}

function clampPanValue(value: number, maxOffset: number) {
  return Math.max(-maxOffset, Math.min(maxOffset, value));
}

function formatPlaybackTime(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60).toString().padStart(2, "0");
  const seconds = (safeSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function AssetMediaViewer({ media, title, className }: AssetMediaViewerProps) {
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);
  const [isTheaterMode, setIsTheaterMode] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [showOverlayControls, setShowOverlayControls] = useState(true);
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [videoTelemetry, setVideoTelemetry] = useState({ currentTime: 0, duration: 0 });

  const containerRef = useRef<HTMLDivElement | null>(null);
  const imageViewportRef = useRef<HTMLDivElement | null>(null);
  const lightboxImageViewportRef = useRef<HTMLDivElement | null>(null);
  const embeddedVideoIframeRef = useRef<HTMLIFrameElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lightboxVideoRef = useRef<HTMLVideoElement | null>(null);
  const controlHideTimeoutRef = useRef<number | null>(null);
  const dragStateRef = useRef<{ pointerId: number; pointerX: number; pointerY: number; originX: number; originY: number } | null>(null);
  const swipeStartXRef = useRef<number | null>(null);

  const normalizedMedia = useMemo(() => media.filter((row) => Boolean(row?.url)), [media]);
  const total = normalizedMedia.length;
  const safeIndex = Math.min(index, Math.max(0, total - 1));
  const current = normalizedMedia[safeIndex];
  const currentEmbeddedVideoUrl = current?.kind === "video" ? getEmbeddableVideoUrl(current.url) : null;
  const supportsPressSpeed = current?.kind === "video" && !currentEmbeddedVideoUrl;
  const isLocalVideo = current?.kind === "video" && !currentEmbeddedVideoUrl;
  const isExternalVideo = current?.kind === "video" && Boolean(currentEmbeddedVideoUrl);
  const viewerHeightClass = isNativeFullscreen ? "h-[100dvh]" : isTheaterMode ? "h-[34rem] sm:h-[40rem]" : "h-[19.5rem] sm:h-[24rem] lg:h-[28rem]";

  const getActiveImageViewport = useCallback(() => {
    if (lightboxOpen && lightboxImageViewportRef.current) return lightboxImageViewportRef.current;
    return imageViewportRef.current;
  }, [lightboxOpen]);

  const clampPanToViewport = useCallback((rawPan: { x: number; y: number }, targetZoom: number) => {
    if (targetZoom <= 1) return { x: 0, y: 0 };
    const viewport = getActiveImageViewport();
    if (!viewport) return rawPan;
    const rect = viewport.getBoundingClientRect();
    const maxX = Math.max(0, ((rect.width * targetZoom) - rect.width) / 2);
    const maxY = Math.max(0, ((rect.height * targetZoom) - rect.height) / 2);
    return {
      x: clampPanValue(rawPan.x, maxX),
      y: clampPanValue(rawPan.y, maxY),
    };
  }, [getActiveImageViewport]);

  const applyZoom = useCallback((updater: (previous: number) => number) => {
    setZoom((previous) => {
      const next = clampZoom(updater(previous));
      setPan((oldPan) => clampPanToViewport(oldPan, next));
      return next;
    });
  }, [clampPanToViewport]);

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setIsDraggingImage(false);
    setIsVideoPlaying(false);
    setShowOverlayControls(true);
    dragStateRef.current = null;
  }, []);

  const clearControlHideTimeout = useCallback(() => {
    if (controlHideTimeoutRef.current !== null) {
      window.clearTimeout(controlHideTimeoutRef.current);
      controlHideTimeoutRef.current = null;
    }
  }, []);

  const scheduleOverlayAutoHide = useCallback(() => {
    clearControlHideTimeout();
    if (current?.kind !== "video") return;
    if (isLocalVideo && !isVideoPlaying) return;
    controlHideTimeoutRef.current = window.setTimeout(() => {
      setShowOverlayControls(false);
    }, CONTROL_HIDE_DELAY);
  }, [clearControlHideTimeout, current?.kind, isLocalVideo, isVideoPlaying]);

  const revealOverlayControls = useCallback(() => {
    setShowOverlayControls(true);
    scheduleOverlayAutoHide();
  }, [scheduleOverlayAutoHide]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsNativeFullscreen(document.fullscreenElement === containerRef.current);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    if (!lightboxOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setLightboxOpen(false);
      }
      if (event.key === "ArrowLeft" && total > 1) {
        resetView();
        setIndex((prev) => (prev - 1 + total) % total);
      }
      if (event.key === "ArrowRight" && total > 1) {
        resetView();
        setIndex((prev) => (prev + 1) % total);
      }
      if (event.key === "+" || event.key === "=") {
        applyZoom((prev) => prev + ZOOM_STEP);
      }
      if (event.key === "-") {
        applyZoom((prev) => prev - ZOOM_STEP);
      }
      if (event.key.toLowerCase() === "0") {
        resetView();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [applyZoom, lightboxOpen, resetView, total]);

  useEffect(() => {
    const onResize = () => {
      setPan((oldPan) => clampPanToViewport(oldPan, zoom));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [clampPanToViewport, zoom]);

  useEffect(() => () => clearControlHideTimeout(), [clearControlHideTimeout]);

  useEffect(() => {
    if (current?.kind !== "video") {
      clearControlHideTimeout();
      return;
    }
    scheduleOverlayAutoHide();
    return () => clearControlHideTimeout();
  }, [clearControlHideTimeout, current?.kind, safeIndex, scheduleOverlayAutoHide]);

  const goPrev = () => {
    if (total <= 1) return;
    resetView();
    setIndex((prev) => (prev - 1 + total) % total);
  };

  const goNext = () => {
    if (total <= 1) return;
    resetView();
    setIndex((prev) => (prev + 1) % total);
  };

  const requestFullscreen = async () => {
    if (!containerRef.current || !document.fullscreenEnabled) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
      return;
    }
    await containerRef.current.requestFullscreen().catch(() => {});
  };

  const requestBestFullscreen = async () => {
    if (currentEmbeddedVideoUrl) {
      const iframe = embeddedVideoIframeRef.current;
      if (iframe?.requestFullscreen) {
        await iframe.requestFullscreen().catch(() => {});
        return;
      }
      return;
    }
    await requestFullscreen();
  };

  const togglePictureInPicture = async () => {
    const video = lightboxOpen ? lightboxVideoRef.current : videoRef.current;
    if (!video || typeof document === "undefined") return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled && !video.disablePictureInPicture) {
        await video.requestPictureInPicture();
      }
    } catch {}
  };

  const applyPlaybackRate = (value: number) => {
    setPlaybackRate(value);
    if (videoRef.current) videoRef.current.playbackRate = value;
    if (lightboxVideoRef.current) lightboxVideoRef.current.playbackRate = value;
  };

  const getActiveVideoElement = useCallback(() => {
    if (lightboxOpen && lightboxVideoRef.current) return lightboxVideoRef.current;
    return videoRef.current;
  }, [lightboxOpen]);

  const applyActivePlaybackRate = (value: number) => {
    if (videoRef.current) videoRef.current.playbackRate = value;
    if (lightboxVideoRef.current) lightboxVideoRef.current.playbackRate = value;
  };

  const toggleVideoPlayback = () => {
    const activeVideo = getActiveVideoElement();
    if (!activeVideo) return;
    if (activeVideo.paused) {
      void activeVideo.play().catch(() => {});
      return;
    }
    activeVideo.pause();
  };

  const seekVideoBy = (seconds: number) => {
    const activeVideo = getActiveVideoElement();
    if (!activeVideo) return;
    const duration = Number.isFinite(activeVideo.duration) ? activeVideo.duration : 0;
    const nextTime = Math.max(0, Math.min(duration || 0, activeVideo.currentTime + seconds));
    activeVideo.currentTime = nextTime;
    setVideoTelemetry({ currentTime: nextTime, duration });
    revealOverlayControls();
  };

  const startPressSpeed = () => {
    if (!supportsPressSpeed) return;
    applyActivePlaybackRate(Math.max(playbackRate, HOLD_FAST_RATE));
  };

  const stopPressSpeed = () => {
    if (!supportsPressSpeed) return;
    applyActivePlaybackRate(playbackRate);
  };

  useEffect(() => {
    if (!supportsPressSpeed) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== " " || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || target?.isContentEditable) return;
      event.preventDefault();
      applyActivePlaybackRate(Math.max(playbackRate, HOLD_FAST_RATE));
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key !== " ") return;
      applyActivePlaybackRate(playbackRate);
    };
    const onBlur = () => applyActivePlaybackRate(playbackRate);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [playbackRate, supportsPressSpeed]);

  const onImagePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (zoom <= 1 || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStateRef.current = {
      pointerId: event.pointerId,
      pointerX: event.clientX,
      pointerY: event.clientY,
      originX: pan.x,
      originY: pan.y,
    };
    setIsDraggingImage(true);
    revealOverlayControls();
  };

  const onImagePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragStateRef.current || dragStateRef.current.pointerId !== event.pointerId) return;
    const diffX = event.clientX - dragStateRef.current.pointerX;
    const diffY = event.clientY - dragStateRef.current.pointerY;
    const nextPan = {
      x: dragStateRef.current.originX + diffX,
      y: dragStateRef.current.originY + diffY,
    };
    setPan(clampPanToViewport(nextPan, zoom));
  };

  const stopImageDragging = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragStateRef.current || dragStateRef.current.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragStateRef.current = null;
    setIsDraggingImage(false);
  };

  const onImageWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (current?.kind !== "image") return;
    event.preventDefault();
    applyZoom((previous) => previous + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP));
    revealOverlayControls();
  };

  const onTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (zoom > 1 || total <= 1) return;
    swipeStartXRef.current = event.touches[0]?.clientX ?? null;
    revealOverlayControls();
  };

  const onTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    if (zoom > 1 || total <= 1 || swipeStartXRef.current === null) return;
    const endX = event.changedTouches[0]?.clientX ?? swipeStartXRef.current;
    const delta = endX - swipeStartXRef.current;
    swipeStartXRef.current = null;
    if (Math.abs(delta) < SWIPE_THRESHOLD) return;
    if (delta > 0) {
      goPrev();
      return;
    }
    goNext();
  };

  const activeVideoDuration = videoTelemetry.duration;
  const activeVideoTime = videoTelemetry.currentTime;
  const videoProgressPct = activeVideoDuration > 0 ? Math.max(0, Math.min(100, (activeVideoTime / activeVideoDuration) * 100)) : 0;

  if (!current) {
    return (
      <div className={className}>
        <div className="grid h-[24rem] place-items-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] text-sm text-[var(--color-muted)]">
          Sin multimedia
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <div
        ref={containerRef}
        className={`relative overflow-hidden rounded-[1.6rem] border border-[var(--color-border)] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--color-surface-soft)_94%,white_6%),color-mix(in_oklab,var(--color-surface-soft)_78%,black_22%))] ${isTheaterMode ? "shadow-[0_24px_80px_-38px_rgba(0,0,0,0.9)]" : "shadow-[0_18px_40px_-28px_rgba(16,24,40,0.35)]"}`}
        onMouseMove={revealOverlayControls}
        onMouseEnter={revealOverlayControls}
        onTouchStart={revealOverlayControls}
        onTouchStartCapture={onTouchStart}
        onTouchEndCapture={onTouchEnd}
      >
        <div className={viewerHeightClass}>
          {current.kind === "image" && (
            <div
              ref={imageViewportRef}
              className={`flex h-full w-full items-center justify-center overflow-hidden bg-black/10 ${zoom > 1 ? (isDraggingImage ? "cursor-grabbing" : "cursor-grab") : "cursor-zoom-in"}`}
              onPointerDown={onImagePointerDown}
              onPointerMove={onImagePointerMove}
              onPointerUp={stopImageDragging}
              onPointerCancel={stopImageDragging}
              onWheel={onImageWheel}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={current.url}
                alt={title}
                className="h-full w-full object-contain transition-transform duration-200"
                draggable={false}
                style={{ transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})` }}
              />
            </div>
          )}
          {current.kind === "video" && (
            currentEmbeddedVideoUrl ? (
              <iframe
                ref={embeddedVideoIframeRef}
                src={currentEmbeddedVideoUrl}
                title={title}
                className="h-full w-full bg-black"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            ) : (
              <video
                ref={videoRef}
                controls
                muted={isMuted}
                playsInline
                className="h-full w-full bg-black object-contain"
                src={current.url}
                onPlay={() => {
                  setIsVideoPlaying(true);
                  setVideoTelemetry({
                    currentTime: videoRef.current?.currentTime ?? 0,
                    duration: Number.isFinite(videoRef.current?.duration) ? videoRef.current?.duration ?? 0 : 0,
                  });
                  revealOverlayControls();
                }}
                onPause={() => {
                  setIsVideoPlaying(false);
                  setVideoTelemetry({
                    currentTime: videoRef.current?.currentTime ?? 0,
                    duration: Number.isFinite(videoRef.current?.duration) ? videoRef.current?.duration ?? 0 : 0,
                  });
                  setShowOverlayControls(true);
                }}
                onEnded={() => {
                  setIsVideoPlaying(false);
                  setVideoTelemetry({
                    currentTime: 0,
                    duration: Number.isFinite(videoRef.current?.duration) ? videoRef.current?.duration ?? 0 : 0,
                  });
                  setShowOverlayControls(true);
                }}
                onLoadedMetadata={(event) => {
                  setVideoTelemetry({
                    currentTime: event.currentTarget.currentTime ?? 0,
                    duration: Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0,
                  });
                }}
                onTimeUpdate={(event) => {
                  setVideoTelemetry({
                    currentTime: event.currentTarget.currentTime ?? 0,
                    duration: Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0,
                  });
                }}
                onMouseDown={(event) => {
                  if (event.button !== 0) return;
                  startPressSpeed();
                }}
                onMouseUp={stopPressSpeed}
                onMouseLeave={stopPressSpeed}
              />
            )
          )}
        </div>

        <div className={`pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 bg-gradient-to-b from-black/60 via-black/20 to-transparent p-3 transition-opacity duration-200 ${showOverlayControls ? "opacity-100" : "opacity-0"}`}>
          <div className="pointer-events-auto flex items-center gap-2">
            <span className="rounded-full bg-black/55 px-3 py-1 text-xs font-semibold text-white shadow-[0_10px_20px_rgba(0,0,0,0.18)]">
              {safeIndex + 1}/{total}
            </span>
            <span className="hidden rounded-full bg-black/45 px-3 py-1 text-[11px] font-medium text-white/90 sm:inline-flex">
              {current.kind === "image" ? "Imagen" : isExternalVideo ? "Video externo" : "Video"}
            </span>
          </div>
          <div className="pointer-events-auto flex gap-2">
            <Button type="button" variant="outline" className="h-8 border-white/50 bg-black/50 px-2 text-white hover:bg-black/70" onClick={() => setLightboxOpen(true)}>
              <Expand size={14} />
            </Button>
            <Button
              type="button"
              variant="outline"
              className={`h-8 border-white/50 bg-black/50 px-2 text-white hover:bg-black/70 ${isTheaterMode ? "ring-1 ring-white/50" : ""}`}
              onClick={() => {
                setIsTheaterMode((prev) => !prev);
                revealOverlayControls();
              }}
            >
              Teatro
            </Button>
            <Button type="button" variant="outline" className="hidden h-8 border-white/50 bg-black/50 px-2 text-white hover:bg-black/70 sm:inline-flex" onClick={() => { void requestBestFullscreen(); }}>
              Full
            </Button>
          </div>
        </div>

        <div className={`absolute inset-x-3 bottom-3 rounded-[1.35rem] border border-white/12 bg-[linear-gradient(180deg,rgba(10,15,20,0.48),rgba(10,15,20,0.7))] px-3 py-2.5 shadow-[0_18px_32px_rgba(0,0,0,0.24)] backdrop-blur-md transition-opacity duration-200 ${showOverlayControls ? "opacity-100" : "pointer-events-none opacity-0"}`}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" className="h-9 min-w-9 border-white/40 bg-black/35 px-2 text-white hover:bg-black/70" onClick={goPrev} disabled={total <= 1}>
                <ChevronLeft size={15} />
              </Button>
              <Button type="button" variant="outline" className="h-9 min-w-9 border-white/40 bg-black/35 px-2 text-white hover:bg-black/70" onClick={goNext} disabled={total <= 1}>
                <ChevronRight size={15} />
              </Button>
              {current.kind === "video" && !currentEmbeddedVideoUrl && (
                <Button type="button" variant="outline" className="h-9 min-w-9 border-white/40 bg-black/35 px-2 text-white hover:bg-black/70" onClick={toggleVideoPlayback}>
                  {isVideoPlaying ? <Pause size={15} /> : <Play size={15} />}
                </Button>
              )}
            </div>
            <div className="hidden items-center gap-2 sm:flex">
              <Button type="button" variant="outline" className="h-9 border-white/40 bg-black/35 px-2 text-white hover:bg-black/70" onClick={() => { void requestBestFullscreen(); }}>
                Pantalla
              </Button>
              {current.kind === "image" && (
                <Button type="button" variant="outline" className="h-9 border-white/40 bg-black/35 px-2 text-white hover:bg-black/70" onClick={resetView}>
                  Reiniciar
                </Button>
              )}
            </div>
          </div>

          {current.kind === "video" && !currentEmbeddedVideoUrl && (
            <div className="mt-2.5">
              <div className="h-1.5 overflow-hidden rounded-full bg-white/15">
                <div className="h-full rounded-full bg-[var(--color-secondary)]" style={{ width: `${videoProgressPct}%` }} />
              </div>
              <div className="mt-2 flex items-center justify-between gap-2 text-[11px] font-medium text-white/82">
                <span>{formatPlaybackTime(activeVideoTime)}</span>
                <span>{formatPlaybackTime(activeVideoDuration)}</span>
              </div>
            </div>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-2">
          {current.kind === "image" && (
            <>
              <Button type="button" variant="outline" className="h-8 border-white/40 bg-black/40 px-2 text-white hover:bg-black/70" onClick={() => applyZoom((prev) => prev - ZOOM_STEP)}>
                <Minus size={14} />
              </Button>
              <Button type="button" variant="outline" className="h-8 border-white/40 bg-black/40 px-2 text-white hover:bg-black/70" onClick={() => applyZoom((prev) => prev + ZOOM_STEP)}>
                <Plus size={14} />
              </Button>
              <Button type="button" variant="outline" className="h-8 border-white/40 bg-black/40 px-2 text-white hover:bg-black/70" onClick={resetView}>
                <RotateCcw size={14} />
              </Button>
            </>
          )}
          {current.kind === "video" && !currentEmbeddedVideoUrl && (
            <>
              <Button type="button" variant="outline" className="h-8 border-white/40 bg-black/40 px-2 text-white hover:bg-black/70" onClick={() => setIsMuted((prev) => !prev)}>
                {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
              </Button>
              <Button type="button" variant="outline" className="h-8 border-white/40 bg-black/40 px-2 text-white hover:bg-black/70" onClick={() => seekVideoBy(-10)}>
                -10s
              </Button>
              <Button type="button" variant="outline" className="h-8 border-white/40 bg-black/40 px-2 text-white hover:bg-black/70" onClick={() => seekVideoBy(10)}>
                +10s
              </Button>
              <Button type="button" variant="outline" className="h-8 border-white/40 bg-black/40 px-2 text-white hover:bg-black/70" onClick={() => { void togglePictureInPicture(); }}>
                <MonitorPlay size={14} />
              </Button>
              <select
                value={playbackRate}
                onChange={(event) => applyPlaybackRate(Number(event.target.value))}
                className="h-8 rounded-lg border border-white/40 bg-black/50 px-2 text-xs text-white outline-none"
              >
                <option value={0.75}>0.75x</option>
                <option value={1}>1x</option>
                <option value={1.25}>1.25x</option>
                <option value={1.5}>1.5x</option>
                <option value={2}>2x</option>
              </select>
            </>
          )}
          {current.kind === "video" && currentEmbeddedVideoUrl && (
            <span className="rounded-lg border border-white/30 px-2 py-1 text-[11px] text-white/90">Video externo</span>
          )}
          {supportsPressSpeed && <span className="rounded-lg border border-white/30 px-2 py-1 text-[11px] text-white/90">Mantener Espacio o clic: {Math.max(playbackRate, HOLD_FAST_RATE)}x</span>}
          </div>
        </div>
      </div>

      {total > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {normalizedMedia.map((item, itemIndex) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                resetView();
                setIndex(itemIndex);
              }}
              className={`relative h-[5.8rem] w-28 shrink-0 overflow-hidden rounded-[1.15rem] border bg-[var(--color-surface-soft)] sm:h-24 sm:w-40 ${itemIndex === safeIndex ? "border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/25" : "border-[var(--color-border)]"}`}
            >
              {item.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.url} alt={`${title}-${itemIndex + 1}`} className="h-full w-full object-cover" />
              ) : (
                getVideoThumbnailUrl(item.url) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={getVideoThumbnailUrl(item.url) ?? ""} alt={`${title}-video-${itemIndex + 1}`} className="h-full w-full object-cover" />
                ) : (
                  <video
                    className="h-full w-full object-cover"
                    src={item.url}
                    muted
                    playsInline
                    preload="metadata"
                    onLoadedData={(event) => {
                      try {
                        event.currentTarget.currentTime = 0.1;
                      } catch {
                        // ignore seek errors
                      }
                    }}
                  />
                )
              )}
              <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold text-white">
                {item.kind === "image" ? "Foto" : "Video"}
              </span>
            </button>
          ))}
        </div>
      )}

      {lightboxOpen && (
        <div className="fixed inset-0 z-[120] bg-black/90 p-3 sm:p-6" role="dialog" aria-modal="true">
          <div className="mx-auto flex h-full w-full max-w-7xl flex-col">
            <div className="mb-3 flex items-center justify-between">
              <p className="truncate text-sm text-white">{title} - {safeIndex + 1}/{total}</p>
              <Button type="button" variant="outline" className="h-9 border-white/40 bg-black/40 px-3 text-white hover:bg-black/70" onClick={() => setLightboxOpen(false)}>
                <X size={14} />
              </Button>
            </div>
            <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-2xl border border-white/20 bg-black">
              {current.kind === "image" && (
                <div
                  ref={lightboxImageViewportRef}
                  className={`flex h-full w-full items-center justify-center overflow-hidden ${zoom > 1 ? (isDraggingImage ? "cursor-grabbing" : "cursor-grab") : "cursor-zoom-in"}`}
                  onPointerDown={onImagePointerDown}
                  onPointerMove={onImagePointerMove}
                  onPointerUp={stopImageDragging}
                  onPointerCancel={stopImageDragging}
                  onWheel={onImageWheel}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={current.url}
                    alt={title}
                    className="h-full w-full object-contain transition-transform duration-200"
                    draggable={false}
                    style={{ transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})` }}
                  />
                </div>
              )}
              {current.kind === "video" && (
                currentEmbeddedVideoUrl ? (
                  <iframe
                    src={currentEmbeddedVideoUrl}
                    title={`${title} lightbox`}
                    className="h-full w-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    referrerPolicy="strict-origin-when-cross-origin"
                    allowFullScreen
                  />
                ) : (
                  <video
                    ref={lightboxVideoRef}
                    controls
                    autoPlay
                    muted={isMuted}
                    playsInline
                    className="h-full w-full object-contain"
                    src={current.url}
                    onPlay={() => {
                      setIsVideoPlaying(true);
                      setVideoTelemetry({
                        currentTime: lightboxVideoRef.current?.currentTime ?? 0,
                        duration: Number.isFinite(lightboxVideoRef.current?.duration) ? lightboxVideoRef.current?.duration ?? 0 : 0,
                      });
                      revealOverlayControls();
                    }}
                    onPause={() => {
                      setIsVideoPlaying(false);
                      setVideoTelemetry({
                        currentTime: lightboxVideoRef.current?.currentTime ?? 0,
                        duration: Number.isFinite(lightboxVideoRef.current?.duration) ? lightboxVideoRef.current?.duration ?? 0 : 0,
                      });
                      setShowOverlayControls(true);
                    }}
                    onEnded={() => {
                      setIsVideoPlaying(false);
                      setVideoTelemetry({
                        currentTime: 0,
                        duration: Number.isFinite(lightboxVideoRef.current?.duration) ? lightboxVideoRef.current?.duration ?? 0 : 0,
                      });
                      setShowOverlayControls(true);
                    }}
                    onLoadedMetadata={(event) => {
                      setVideoTelemetry({
                        currentTime: event.currentTarget.currentTime ?? 0,
                        duration: Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0,
                      });
                    }}
                    onTimeUpdate={(event) => {
                      setVideoTelemetry({
                        currentTime: event.currentTarget.currentTime ?? 0,
                        duration: Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0,
                      });
                    }}
                    onMouseDown={(event) => {
                      if (event.button !== 0) return;
                      startPressSpeed();
                    }}
                    onMouseUp={stopPressSpeed}
                    onMouseLeave={stopPressSpeed}
                  />
                )
              )}
              {total > 1 && (
                <>
                  <Button type="button" variant="outline" className="absolute left-3 top-1/2 h-10 -translate-y-1/2 border-white/50 bg-black/50 px-3 text-white hover:bg-black/70" onClick={goPrev}>
                    <ChevronLeft size={16} />
                  </Button>
                  <Button type="button" variant="outline" className="absolute right-3 top-1/2 h-10 -translate-y-1/2 border-white/50 bg-black/50 px-3 text-white hover:bg-black/70" onClick={goNext}>
                    <ChevronRight size={16} />
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
