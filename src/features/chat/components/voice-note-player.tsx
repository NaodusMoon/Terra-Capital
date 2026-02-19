"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Pause, Play } from "lucide-react";
import WaveSurfer from "wavesurfer.js";
import styles from "./voice-note-player.module.css";

const audioSpeeds = [1, 1.5, 2] as const;

function formatAudioTime(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60).toString().padStart(2, "0");
  const seconds = (safe % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function getMediaErrorLabel(code: number) {
  if (code === 1) return "MEDIA_ERR_ABORTED";
  if (code === 2) return "MEDIA_ERR_NETWORK";
  if (code === 3) return "MEDIA_ERR_DECODE";
  if (code === 4) return "MEDIA_ERR_SRC_NOT_SUPPORTED";
  return "MEDIA_ERR_UNKNOWN";
}

type VoiceNotePlayerProps = {
  audioUrl?: string;
  audioBlob?: Blob | null;
  tone?: "incoming" | "outgoing";
  waveColor?: string;
  progressColor?: string;
  className?: string;
};

export function VoiceNotePlayer({
  audioUrl,
  audioBlob,
  tone = "incoming",
  waveColor,
  progressColor,
  className = "",
}: VoiceNotePlayerProps) {
  const waveformRef = useRef<HTMLDivElement | null>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speedIndex, setSpeedIndex] = useState(0);
  const [waveReady, setWaveReady] = useState(false);
  const [errorDetail, setErrorDetail] = useState("");

  const source = useMemo(() => {
    if (audioBlob) {
      return { url: URL.createObjectURL(audioBlob), revoke: true };
    }
    if (!audioUrl) {
      return { url: "", revoke: false };
    }
    if (!audioUrl.startsWith("data:")) {
      return { url: audioUrl, revoke: false };
    }
    try {
      const [meta, base64] = audioUrl.split(",");
      if (!meta || !base64) {
        return { url: audioUrl, revoke: false };
      }
      const mimeMatch = meta.match(/data:(.*?);base64/);
      const mimeType = mimeMatch?.[1] ?? "audio/webm";
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      return { url: URL.createObjectURL(new Blob([bytes], { type: mimeType })), revoke: true };
    } catch {
      return { url: audioUrl, revoke: false };
    }
  }, [audioBlob, audioUrl]);

  useEffect(() => {
    return () => {
      if (source.revoke && source.url.startsWith("blob:")) {
        URL.revokeObjectURL(source.url);
      }
    };
  }, [source]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !source.url) return;

    const onReady = () => {
      setStatus("ready");
      setErrorDetail("");
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
      setCurrentTime(audio.currentTime || 0);
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onTime = () => {
      const next = audio.currentTime || 0;
      setCurrentTime(next);
      const ws = wavesurferRef.current;
      if (ws && waveReady) {
        try {
          ws.setTime(next);
        } catch {
          // fallback keeps playing with native audio
        }
      }
    };
    const onEnded = () => {
      setPlaying(false);
      setCurrentTime(0);
    };
    const onError = () => {
      const errorCode = audio.error?.code ?? 0;
      const browserMessage = audio.error?.message?.trim();
      const detail = `code=${errorCode} (${getMediaErrorLabel(errorCode)})${browserMessage ? ` - ${browserMessage}` : ""}`;
      setErrorDetail(detail);
      setStatus("error");
      setPlaying(false);
    };

    audio.addEventListener("loadedmetadata", onReady);
    audio.addEventListener("canplay", onReady);
    audio.addEventListener("durationchange", onReady);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    audio.preload = "metadata";
    audio.src = source.url;
    audio.load();

    return () => {
      setStatus("loading");
      setErrorDetail("");
      setPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      audio.pause();
      audio.removeEventListener("loadedmetadata", onReady);
      audio.removeEventListener("canplay", onReady);
      audio.removeEventListener("durationchange", onReady);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
    };
  }, [source.url, waveReady]);

  useEffect(() => {
    const container = waveformRef.current;
    if (!container || !source.url) return;

    const ws = WaveSurfer.create({
      container,
      url: source.url,
      height: 34,
      barWidth: 3,
      barGap: 2,
      barRadius: 99,
      normalize: true,
      fillParent: true,
      dragToSeek: true,
      waveColor: waveColor ?? (tone === "outgoing" ? "rgba(255,255,255,.45)" : "rgba(142,163,177,.65)"),
      progressColor: progressColor ?? (tone === "outgoing" ? "rgba(255,255,255,.96)" : "#3cc8ff"),
      cursorWidth: 0,
      autoScroll: false,
      autoCenter: true,
    });

    wavesurferRef.current = ws;

    const handleReady = () => {
      setWaveReady(true);
    };
    const handleError = (error: unknown) => {
      setWaveReady(false);
      const rawMessage = typeof (error as { message?: unknown })?.message === "string"
        ? String((error as { message?: string }).message).trim()
        : "";
      if (rawMessage) {
        setErrorDetail((current) => current || `wavesurfer: ${rawMessage}`);
      }
    };
    ws.on("ready", handleReady);
    ws.on("error", handleError);

    return () => {
      setWaveReady(false);
      ws.unAll();
      ws.destroy();
      wavesurferRef.current = null;
    };
  }, [progressColor, source.url, tone, waveColor]);

  useEffect(() => {
    wavesurferRef.current?.setPlaybackRate(audioSpeeds[speedIndex]);
    if (audioRef.current) {
      audioRef.current.playbackRate = audioSpeeds[speedIndex];
    }
  }, [speedIndex]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio || status !== "ready") return;
    if (audio.paused) {
      void audio.play().catch(() => setStatus("error"));
    } else {
      audio.pause();
    }
  };

  const handleWaveSeek = (event: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || duration <= 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width) return;
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const next = ratio * duration;
    audio.currentTime = next;
    setCurrentTime(next);
  };

  const cycleSpeed = () => {
    const next = (speedIndex + 1) % audioSpeeds.length;
    setSpeedIndex(next);
    wavesurferRef.current?.setPlaybackRate(audioSpeeds[next]);
  };

  const progress = duration > 0 ? Math.max(0, Math.min(100, (currentTime / duration) * 100)) : 0;
  const wrapperClass = `${styles.player} ${tone === "outgoing" ? styles.outgoing : ""} ${className}`.trim();
  const hasValidSource = Boolean(source.url);
  const visualStatus = hasValidSource ? status : "error";

  return (
    <div className={wrapperClass}>
      <audio ref={audioRef} className="hidden" />
      <button type="button" className={styles.button} onClick={togglePlay} disabled={visualStatus !== "ready"} aria-label={playing ? "Pausar audio" : "Reproducir audio"}>
        {playing ? <Pause size={14} /> : <Play size={14} />}
      </button>
      <div className={styles.body}>
        <div className={styles.waveWrap} onClick={handleWaveSeek}>
          <div ref={waveformRef} className={styles.wave} />
          {(!waveReady || visualStatus === "loading") && <div className={styles.loadingSkeleton} />}
          <motion.div
            className={styles.dot}
            animate={{ left: `${progress}%` }}
            transition={playing ? { type: "spring", stiffness: 230, damping: 30, mass: 0.5 } : { duration: 0.12 }}
          />
        </div>
        <div className={styles.meta}>
          <span>{formatAudioTime(currentTime)} / {formatAudioTime(duration)}</span>
          <button type="button" className={styles.speed} onClick={cycleSpeed} disabled={visualStatus !== "ready"}>
            {audioSpeeds[speedIndex]}x
          </button>
        </div>
        {visualStatus === "error" && <p className={styles.error}>No se pudo reproducir el audio. {errorDetail}</p>}
      </div>
    </div>
  );
}
