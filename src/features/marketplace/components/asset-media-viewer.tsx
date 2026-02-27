"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import { ChevronLeft, ChevronRight, Expand, Minus, MonitorPlay, Plus, RotateCcw, Volume2, VolumeX, X } from "lucide-react";
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

function clampZoom(value: number) {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, value));
}

function clampPanValue(value: number, maxOffset: number) {
  return Math.max(-maxOffset, Math.min(maxOffset, value));
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

  const containerRef = useRef<HTMLDivElement | null>(null);
  const imageViewportRef = useRef<HTMLDivElement | null>(null);
  const lightboxImageViewportRef = useRef<HTMLDivElement | null>(null);
  const embeddedVideoIframeRef = useRef<HTMLIFrameElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lightboxVideoRef = useRef<HTMLVideoElement | null>(null);
  const controlHideTimeoutRef = useRef<number | null>(null);
  const dragStateRef = useRef<{ pointerId: number; pointerX: number; pointerY: number; originX: number; originY: number } | null>(null);

  const normalizedMedia = useMemo(() => media.filter((row) => Boolean(row?.url)), [media]);
  const total = normalizedMedia.length;
  const safeIndex = Math.min(index, Math.max(0, total - 1));
  const current = normalizedMedia[safeIndex];
  const currentEmbeddedVideoUrl = current?.kind === "video" ? getEmbeddableVideoUrl(current.url) : null;
  const supportsPressSpeed = current?.kind === "video" && !currentEmbeddedVideoUrl;
  const isLocalVideo = current?.kind === "video" && !currentEmbeddedVideoUrl;
  const isExternalVideo = current?.kind === "video" && Boolean(currentEmbeddedVideoUrl);
  const viewerHeightClass = isNativeFullscreen ? "h-[100dvh]" : isTheaterMode ? "h-[30rem] sm:h-[40rem]" : "h-[24rem] sm:h-[28rem]";

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

  const applyActivePlaybackRate = (value: number) => {
    if (videoRef.current) videoRef.current.playbackRate = value;
    if (lightboxVideoRef.current) lightboxVideoRef.current.playbackRate = value;
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
        className={`relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] ${isTheaterMode ? "shadow-[0_24px_80px_-38px_rgba(0,0,0,0.9)]" : ""}`}
        onMouseMove={revealOverlayControls}
        onMouseEnter={revealOverlayControls}
        onTouchStart={revealOverlayControls}
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
                  revealOverlayControls();
                }}
                onPause={() => {
                  setIsVideoPlaying(false);
                  setShowOverlayControls(true);
                }}
                onEnded={() => {
                  setIsVideoPlaying(false);
                  setShowOverlayControls(true);
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

        <div className={`pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/55 to-transparent p-3 transition-opacity duration-200 ${showOverlayControls ? "opacity-100" : "opacity-0"}`}>
          <span className="pointer-events-auto rounded-full bg-black/50 px-3 py-1 text-xs font-semibold text-white">
            {safeIndex + 1}/{total}
          </span>
          <div className="pointer-events-auto flex gap-2">
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
            <Button type="button" variant="outline" className="h-8 border-white/50 bg-black/50 px-2 text-white hover:bg-black/70" onClick={() => { void requestBestFullscreen(); }}>
              <Expand size={14} />
            </Button>
          </div>
        </div>

        <div className={`absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/50 px-2 py-1 transition-opacity duration-200 ${showOverlayControls ? "opacity-100" : "pointer-events-none opacity-0"} ${isExternalVideo ? "hidden" : ""}`}>
          <Button type="button" variant="outline" className="h-8 border-white/40 bg-black/40 px-2 text-white hover:bg-black/70" onClick={goPrev} disabled={total <= 1}>
            <ChevronLeft size={14} />
          </Button>
          <Button type="button" variant="outline" className="h-8 border-white/40 bg-black/40 px-2 text-white hover:bg-black/70" onClick={goNext} disabled={total <= 1}>
            <ChevronRight size={14} />
          </Button>
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
              className={`h-[5.5rem] w-36 shrink-0 overflow-hidden rounded-xl border sm:h-24 sm:w-40 ${itemIndex === safeIndex ? "border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/25" : "border-[var(--color-border)]"}`}
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
                      revealOverlayControls();
                    }}
                    onPause={() => {
                      setIsVideoPlaying(false);
                      setShowOverlayControls(true);
                    }}
                    onEnded={() => {
                      setIsVideoPlaying(false);
                      setShowOverlayControls(true);
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
