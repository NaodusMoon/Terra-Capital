"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Expand, Maximize2, Minus, MonitorPlay, Plus, RotateCcw, Volume2, VolumeX, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AssetMediaItem } from "@/types/market";

interface AssetMediaViewerProps {
  media: AssetMediaItem[];
  title: string;
  className?: string;
}

const ZOOM_MIN = 1;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.25;

function clampZoom(value: number) {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, value));
}

export function AssetMediaViewer({ media, title, className }: AssetMediaViewerProps) {
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [playbackRate, setPlaybackRate] = useState(1);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lightboxVideoRef = useRef<HTMLVideoElement | null>(null);

  const normalizedMedia = useMemo(() => media.filter((row) => Boolean(row?.url)), [media]);
  const total = normalizedMedia.length;
  const safeIndex = Math.min(index, Math.max(0, total - 1));
  const current = normalizedMedia[safeIndex];

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
        setZoom(1);
        setIndex((prev) => (prev - 1 + total) % total);
      }
      if (event.key === "ArrowRight" && total > 1) {
        setZoom(1);
        setIndex((prev) => (prev + 1) % total);
      }
      if (event.key === "+" || event.key === "=") {
        setZoom((prev) => clampZoom(prev + ZOOM_STEP));
      }
      if (event.key === "-") {
        setZoom((prev) => clampZoom(prev - ZOOM_STEP));
      }
      if (event.key.toLowerCase() === "0") {
        setZoom(1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightboxOpen, total]);

  const goPrev = () => {
    if (total <= 1) return;
    setZoom(1);
    setIndex((prev) => (prev - 1 + total) % total);
  };
  const goNext = () => {
    if (total <= 1) return;
    setZoom(1);
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
      <div ref={containerRef} className="relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-soft)]">
        <div className={isNativeFullscreen ? "h-[100dvh]" : "h-[24rem] sm:h-[28rem]"}>
          {current.kind === "image" && (
            <div className="flex h-full w-full items-center justify-center overflow-hidden bg-black/10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={current.url}
                alt={title}
                className="h-full w-full object-contain transition-transform duration-200"
                style={{ transform: `scale(${zoom})` }}
              />
            </div>
          )}
          {current.kind === "video" && (
            <video
              ref={videoRef}
              controls
              muted={isMuted}
              playsInline
              className="h-full w-full bg-black object-contain"
              src={current.url}
            />
          )}
        </div>

        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/55 to-transparent p-3">
          <span className="pointer-events-auto rounded-full bg-black/50 px-3 py-1 text-xs font-semibold text-white">
            {safeIndex + 1}/{total}
          </span>
          <div className="pointer-events-auto flex gap-2">
            <Button type="button" variant="outline" className="h-8 border-white/50 bg-black/50 px-2 text-white hover:bg-black/70" onClick={requestFullscreen}>
              <Expand size={14} />
            </Button>
            <Button type="button" variant="outline" className="h-8 border-white/50 bg-black/50 px-2 text-white hover:bg-black/70" onClick={() => setLightboxOpen(true)}>
              <Maximize2 size={14} />
            </Button>
          </div>
        </div>

        <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/50 px-2 py-1">
          <Button type="button" variant="outline" className="h-8 border-white/40 bg-black/40 px-2 text-white hover:bg-black/70" onClick={goPrev} disabled={total <= 1}>
            <ChevronLeft size={14} />
          </Button>
          <Button type="button" variant="outline" className="h-8 border-white/40 bg-black/40 px-2 text-white hover:bg-black/70" onClick={goNext} disabled={total <= 1}>
            <ChevronRight size={14} />
          </Button>
          {current.kind === "image" && (
            <>
              <Button type="button" variant="outline" className="h-8 border-white/40 bg-black/40 px-2 text-white hover:bg-black/70" onClick={() => setZoom((prev) => clampZoom(prev - ZOOM_STEP))}>
                <Minus size={14} />
              </Button>
              <Button type="button" variant="outline" className="h-8 border-white/40 bg-black/40 px-2 text-white hover:bg-black/70" onClick={() => setZoom((prev) => clampZoom(prev + ZOOM_STEP))}>
                <Plus size={14} />
              </Button>
              <Button type="button" variant="outline" className="h-8 border-white/40 bg-black/40 px-2 text-white hover:bg-black/70" onClick={() => setZoom(1)}>
                <RotateCcw size={14} />
              </Button>
            </>
          )}
          {current.kind === "video" && (
            <>
              <Button type="button" variant="outline" className="h-8 border-white/40 bg-black/40 px-2 text-white hover:bg-black/70" onClick={() => setIsMuted((prev) => !prev)}>
                {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
              </Button>
              <Button type="button" variant="outline" className="h-8 border-white/40 bg-black/40 px-2 text-white hover:bg-black/70" onClick={togglePictureInPicture}>
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
        </div>
      </div>

      {total > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {normalizedMedia.map((item, itemIndex) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setZoom(1);
                setIndex(itemIndex);
              }}
              className={`h-20 w-28 shrink-0 overflow-hidden rounded-xl border ${itemIndex === safeIndex ? "border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/25" : "border-[var(--color-border)]"}`}
            >
              {item.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.url} alt={`${title}-${itemIndex + 1}`} className="h-full w-full object-cover" />
              ) : (
                <div className="grid h-full w-full place-items-center bg-black/75 text-xs font-bold text-white">VIDEO</div>
              )}
            </button>
          ))}
        </div>
      )}

      {lightboxOpen && (
        <div className="fixed inset-0 z-[120] bg-black/90 p-3 sm:p-6" role="dialog" aria-modal="true">
          <div className="mx-auto flex h-full w-full max-w-7xl flex-col">
            <div className="mb-3 flex items-center justify-between">
              <p className="truncate text-sm text-white">{title} · {safeIndex + 1}/{total}</p>
              <Button type="button" variant="outline" className="h-9 border-white/40 bg-black/40 px-3 text-white hover:bg-black/70" onClick={() => setLightboxOpen(false)}>
                <X size={14} />
              </Button>
            </div>
            <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-2xl border border-white/20 bg-black">
              {current.kind === "image" && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={current.url}
                  alt={title}
                  className="h-full w-full object-contain transition-transform duration-200"
                  style={{ transform: `scale(${zoom})` }}
                />
              )}
              {current.kind === "video" && (
                <video
                  ref={lightboxVideoRef}
                  controls
                  autoPlay
                  muted={isMuted}
                  playsInline
                  className="h-full w-full object-contain"
                  src={current.url}
                />
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
