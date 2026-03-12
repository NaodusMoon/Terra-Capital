"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Expand, Image as ImageIcon, Play, Volume2, VolumeX, X, ZoomIn, ZoomOut } from "lucide-react";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";
import { Button } from "@/components/ui/button";
import { getEmbeddableVideoUrl, getVideoThumbnailUrl } from "@/lib/media";
import type { AssetMediaItem } from "@/types/market";

interface AssetMediaViewerProps {
  media: AssetMediaItem[];
  title: string;
  className?: string;
}

const SWIPE_THRESHOLD = 56;

function clampIndex(index: number, total: number) {
  if (total === 0) return 0;
  if (index < 0) return total - 1;
  if (index >= total) return 0;
  return index;
}

function buildViewerHeightClass(isTheaterMode: boolean, isLightbox: boolean) {
  if (isLightbox) return "min-h-[58svh] sm:min-h-[70svh]";
  if (isTheaterMode) return "min-h-[24rem] sm:min-h-[32rem]";
  return "min-h-[18rem] sm:min-h-[24rem] lg:min-h-[28rem]";
}

function ImageStage({
  item,
  title,
  heightClass,
  showHint,
}: {
  item: AssetMediaItem;
  title: string;
  heightClass: string;
  showHint: boolean;
}) {
  const [scale, setScale] = useState(1);

  return (
    <TransformWrapper
      minScale={1}
      maxScale={5}
      initialScale={1}
      centerOnInit
      limitToBounds
      smooth
      wheel={{ step: 0.16 }}
      pinch={{ step: 5 }}
      doubleClick={{ mode: "zoomIn", step: 1.6 }}
      panning={{ velocityDisabled: false }}
      onTransformed={(_, nextState) => setScale(nextState.scale)}
    >
      {({ zoomIn, zoomOut, resetTransform }) => (
        <div className={`relative flex w-full items-center justify-center overflow-hidden rounded-[1.6rem] bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.12),transparent_38%),linear-gradient(180deg,rgba(8,12,18,0.94),rgba(7,10,16,0.98))] ${heightClass}`}>
          <TransformComponent
            wrapperClass="!h-full !w-full"
            contentClass="!flex !h-full !w-full !items-center !justify-center"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.url}
              alt={title}
              className="max-h-full w-auto max-w-full select-none object-contain"
              draggable={false}
            />
          </TransformComponent>

          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 bg-gradient-to-b from-black/60 via-black/18 to-transparent px-3 py-3 sm:px-4">
            <div className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-white/12 bg-black/35 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/88 backdrop-blur-md">
              <ImageIcon size={14} />
              Imagen
            </div>
            {showHint && (
              <div className="hidden rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-[11px] font-medium text-white/78 backdrop-blur-md sm:block">
                Doble toque para zoom
              </div>
            )}
          </div>

          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/12 bg-[linear-gradient(180deg,rgba(14,20,28,0.84),rgba(8,12,18,0.9))] px-2 py-2 shadow-[0_22px_42px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:bottom-4">
            <Button type="button" variant="outline" className="h-9 w-9 border-white/12 bg-white/5 px-0 text-white hover:bg-white/12" onClick={() => zoomOut()}>
              <ZoomOut size={15} />
            </Button>
            <div className="min-w-[5.5rem] text-center text-xs font-semibold text-white/86">
              {Math.round(scale * 100)}%
            </div>
            <Button type="button" variant="outline" className="h-9 w-9 border-white/12 bg-white/5 px-0 text-white hover:bg-white/12" onClick={() => zoomIn()}>
              <ZoomIn size={15} />
            </Button>
            <Button type="button" variant="outline" className="h-9 border-white/12 bg-white/5 px-3 text-white hover:bg-white/12" onClick={() => resetTransform()}>
              {scale > 1.01 ? "Reset" : "Fit"}
            </Button>
          </div>
        </div>
      )}
    </TransformWrapper>
  );
}

function VideoStage({
  item,
  title,
  heightClass,
  isMuted,
  playbackRate,
  videoRef,
}: {
  item: AssetMediaItem;
  title: string;
  heightClass: string;
  isMuted: boolean;
  playbackRate: number;
  videoRef: React.RefObject<HTMLVideoElement | null>;
}) {
  const embeddedVideoUrl = getEmbeddableVideoUrl(item.url);

  return (
    <div className={`relative overflow-hidden rounded-[1.6rem] bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.12),transparent_38%),linear-gradient(180deg,rgba(8,12,18,0.94),rgba(7,10,16,0.98))] ${heightClass}`}>
      {embeddedVideoUrl ? (
        <iframe
          src={embeddedVideoUrl}
          title={title}
          className="absolute inset-0 h-full w-full"
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
          preload="metadata"
          className="absolute inset-0 h-full w-full object-contain"
          src={item.url}
          onLoadedMetadata={(event) => {
            event.currentTarget.playbackRate = playbackRate;
          }}
        />
      )}

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 bg-gradient-to-b from-black/60 via-black/18 to-transparent px-3 py-3 sm:px-4">
        <div className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-white/12 bg-black/35 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/88 backdrop-blur-md">
          Video
        </div>
        <div className="hidden rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-[11px] font-medium text-white/78 backdrop-blur-md sm:block">
          {embeddedVideoUrl ? "Controles nativos del proveedor" : "Controles nativos del navegador"}
        </div>
      </div>
    </div>
  );
}

export function AssetMediaViewer({ media, title, className }: AssetMediaViewerProps) {
  const normalizedMedia = useMemo(() => media.filter((row) => Boolean(row?.url)), [media]);
  const [index, setIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(true);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [theaterMode, setTheaterMode] = useState(false);
  const [swipeStart, setSwipeStart] = useState<number | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lightboxVideoRef = useRef<HTMLVideoElement | null>(null);

  const total = normalizedMedia.length;
  const safeIndex = clampIndex(index, total);
  const current = normalizedMedia[safeIndex];
  const heightClass = buildViewerHeightClass(theaterMode, false);
  const lightboxHeightClass = buildViewerHeightClass(false, true);

  useEffect(() => {
    const activeVideo = lightboxOpen ? lightboxVideoRef.current : videoRef.current;
    if (!activeVideo) return;
    activeVideo.muted = isMuted;
    activeVideo.playbackRate = playbackRate;
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

  if (!current) {
    return (
      <div className={className}>
        <div className="grid min-h-[18rem] place-items-center rounded-[1.6rem] border border-[var(--color-border)] bg-[var(--color-surface-soft)] text-sm text-[var(--color-muted)]">
          Sin multimedia
        </div>
      </div>
    );
  }

  const goTo = (nextIndex: number) => {
    setIndex(clampIndex(nextIndex, total));
  };

  const renderStage = (isLightbox: boolean) => {
    const stageHeight = isLightbox ? lightboxHeightClass : heightClass;
    if (current.kind === "image") {
      return <ImageStage item={current} title={title} heightClass={stageHeight} showHint={!isLightbox} />;
    }
    return (
      <VideoStage
        item={current}
        title={title}
        heightClass={stageHeight}
        isMuted={isMuted}
        playbackRate={playbackRate}
        videoRef={isLightbox ? lightboxVideoRef : videoRef}
      />
    );
  };

  return (
    <div className={className}>
      <div
        className="relative overflow-hidden rounded-[1.85rem] border border-[color:color-mix(in_oklab,var(--color-border)_78%,white_22%)] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--color-surface)_94%,white_6%),color-mix(in_oklab,var(--color-surface-soft)_78%,black_22%))] p-2 shadow-[0_26px_56px_-32px_rgba(15,23,42,0.5)] sm:p-3"
        onTouchStart={(event) => {
          if (total <= 1) return;
          setSwipeStart(event.touches[0]?.clientX ?? null);
        }}
        onTouchEnd={(event) => {
          if (total <= 1 || swipeStart === null) return;
          const endX = event.changedTouches[0]?.clientX ?? swipeStart;
          const delta = endX - swipeStart;
          setSwipeStart(null);
          if (Math.abs(delta) < SWIPE_THRESHOLD) return;
          if (delta > 0) {
            goTo(safeIndex - 1);
            return;
          }
          goTo(safeIndex + 1);
        }}
      >
        {renderStage(false)}

        <div className="pointer-events-none absolute inset-x-2 top-2 flex items-start justify-between gap-2 sm:inset-x-3 sm:top-3">
          <div className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-white/12 bg-black/35 px-3 py-1.5 text-[11px] font-semibold text-white/86 backdrop-blur-md">
            {safeIndex + 1}/{total}
          </div>
          <div className="pointer-events-auto flex items-center gap-2">
            {current.kind === "video" && !getEmbeddableVideoUrl(current.url) && (
              <>
                <Button type="button" variant="outline" className="h-9 w-9 border-white/12 bg-black/30 px-0 text-white hover:bg-black/45" onClick={() => setIsMuted((prev) => !prev)}>
                  {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                </Button>
                <div className="hidden rounded-full border border-white/10 bg-black/32 px-2 py-1 text-[10px] font-semibold text-white/76 backdrop-blur-md sm:block">
                  <select
                    value={playbackRate}
                    onChange={(event) => setPlaybackRate(Number(event.target.value))}
                    className="bg-transparent text-white outline-none"
                  >
                    <option className="text-black" value={0.75}>0.75x</option>
                    <option className="text-black" value={1}>1x</option>
                    <option className="text-black" value={1.25}>1.25x</option>
                    <option className="text-black" value={1.5}>1.5x</option>
                    <option className="text-black" value={2}>2x</option>
                  </select>
                </div>
              </>
            )}
            <Button type="button" variant="outline" className="h-9 border-white/12 bg-black/30 px-3 text-white hover:bg-black/45" onClick={() => setTheaterMode((prev) => !prev)}>
              {theaterMode ? "Compacto" : "Teatro"}
            </Button>
            <Button type="button" variant="outline" className="h-9 w-9 border-white/12 bg-black/30 px-0 text-white hover:bg-black/45" onClick={() => setLightboxOpen(true)}>
              <Expand size={15} />
            </Button>
          </div>
        </div>

        {total > 1 && (
          <>
            <Button type="button" variant="outline" className="absolute left-3 top-1/2 z-10 h-10 w-10 -translate-y-1/2 border-white/12 bg-black/35 px-0 text-white hover:bg-black/50" onClick={() => goTo(safeIndex - 1)}>
              <ChevronLeft size={17} />
            </Button>
            <Button type="button" variant="outline" className="absolute right-3 top-1/2 z-10 h-10 w-10 -translate-y-1/2 border-white/12 bg-black/35 px-0 text-white hover:bg-black/50" onClick={() => goTo(safeIndex + 1)}>
              <ChevronRight size={17} />
            </Button>
          </>
        )}
      </div>

      {total > 1 && (
        <div className="tc-mobile-scroll mt-4 flex gap-2 overflow-x-auto pb-1">
          {normalizedMedia.map((item, itemIndex) => {
            const thumbnailUrl = item.kind === "video" ? getVideoThumbnailUrl(item.url) : item.url;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => goTo(itemIndex)}
                className={`group relative h-22 w-24 shrink-0 overflow-hidden rounded-[1.2rem] border transition duration-300 sm:h-24 sm:w-32 ${itemIndex === safeIndex ? "border-[var(--color-primary)] shadow-[0_16px_34px_-24px_rgba(106,166,78,0.8)]" : "border-[var(--color-border)] hover:border-[var(--color-primary)]/55"}`}
              >
                {thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumbnailUrl} alt={`${title}-${itemIndex + 1}`} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" />
                ) : (
                  <div className="grid h-full w-full place-items-center bg-[var(--color-surface-soft)] text-[var(--color-muted)]">
                    {item.kind === "image" ? <ImageIcon size={18} /> : <Play size={18} />}
                  </div>
                )}
                <span className="absolute inset-x-2 bottom-2 rounded-full bg-black/52 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white">
                  {item.kind === "image" ? "Foto" : "Video"}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {lightboxOpen && (
        <div className="fixed inset-0 z-[120] bg-[radial-gradient(circle_at_top,rgba(24,38,29,0.45),rgba(2,6,11,0.92)_36%,rgba(2,6,11,0.98))] p-3 sm:p-6" role="dialog" aria-modal="true">
          <div className="mx-auto flex h-full w-full max-w-7xl flex-col">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-white">{title}</p>
                <p className="text-sm text-white/68">{safeIndex + 1} de {total}</p>
              </div>
              <Button type="button" variant="outline" className="h-10 w-10 border-white/12 bg-black/30 px-0 text-white hover:bg-black/45" onClick={() => setLightboxOpen(false)}>
                <X size={16} />
              </Button>
            </div>

            <div className="relative min-h-0 flex-1">
              {renderStage(true)}
              {total > 1 && (
                <>
                  <Button type="button" variant="outline" className="absolute left-3 top-1/2 z-10 h-11 w-11 -translate-y-1/2 border-white/12 bg-black/35 px-0 text-white hover:bg-black/50" onClick={() => goTo(safeIndex - 1)}>
                    <ChevronLeft size={18} />
                  </Button>
                  <Button type="button" variant="outline" className="absolute right-3 top-1/2 z-10 h-11 w-11 -translate-y-1/2 border-white/12 bg-black/35 px-0 text-white hover:bg-black/50" onClick={() => goTo(safeIndex + 1)}>
                    <ChevronRight size={18} />
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
