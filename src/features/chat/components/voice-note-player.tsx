"use client";

import { useEffect, useRef, useState } from "react";
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
  audioMimeType?: string;
  tone?: "incoming" | "outgoing";
  waveColor?: string;
  progressColor?: string;
  className?: string;
};

type ResolvedSource = {
  url: string;
  revoke: boolean;
  blob: Blob | null;
};

function detectAudioMime(bytes: Uint8Array) {
  if (bytes.length >= 12) {
    const head = String.fromCharCode(...bytes.slice(0, 4));
    if (head === "RIFF") {
      const wave = String.fromCharCode(...bytes.slice(8, 12));
      if (wave === "WAVE") return "audio/wav";
    }
    if (head === "OggS") return "audio/ogg";
    if (head === "fLaC") return "audio/flac";
    if (head === "ID3") return "audio/mpeg";
    const ftyp = String.fromCharCode(...bytes.slice(4, 8));
    if (ftyp === "ftyp") return "audio/mp4";
  }
  if (bytes.length >= 4) {
    if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return "audio/webm";
    if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return "audio/mpeg";
  }
  return "";
}

function audioBufferToWav(audioBuffer: AudioBuffer) {
  const channelCount = Math.min(2, Math.max(1, audioBuffer.numberOfChannels));
  const sampleRate = audioBuffer.sampleRate;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = channelCount * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const frameCount = audioBuffer.length;
  const dataSize = frameCount * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeText = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index));
    }
  };

  writeText(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeText(36, "data");
  view.setUint32(40, dataSize, true);

  const channels = Array.from({ length: channelCount }, (_, index) => audioBuffer.getChannelData(index));
  let offset = 44;
  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
      const sample = Math.max(-1, Math.min(1, channels[channelIndex][frameIndex] ?? 0));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }

  return buffer;
}

async function convertAudioBlobToWav(blob: Blob) {
  if (blob.type.toLowerCase().includes("wav")) return blob;
  const audioContext = new AudioContext();
  try {
    const sourceBuffer = await blob.arrayBuffer();
    const decoded = await audioContext.decodeAudioData(sourceBuffer.slice(0));
    const wavBuffer = audioBufferToWav(decoded);
    return new Blob([wavBuffer], { type: "audio/wav" });
  } finally {
    void audioContext.close();
  }
}

export function VoiceNotePlayer({
  audioUrl,
  audioBlob,
  audioMimeType,
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
  const [source, setSource] = useState<ResolvedSource>({ url: "", revoke: false, blob: null });
  const fallbackTriedRef = useRef(false);

  useEffect(() => {
    fallbackTriedRef.current = false;
    if (audioBlob) {
      setSource({ url: URL.createObjectURL(audioBlob), revoke: true, blob: audioBlob });
      return;
    }
    if (!audioUrl) {
      setSource({ url: "", revoke: false, blob: null });
      return;
    }
    if (!audioUrl.startsWith("data:")) {
      setSource({ url: audioUrl, revoke: false, blob: null });
      return;
    }
    try {
      const [meta, base64] = audioUrl.split(",");
      if (!meta || !base64) {
        setSource({ url: audioUrl, revoke: false, blob: null });
        return;
      }
      const mimeMatch = meta.match(/data:(.*?);base64/);
      const declaredMime = mimeMatch?.[1] ?? audioMimeType ?? "";
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      const sniffedMime = detectAudioMime(bytes);
      const mimeType = sniffedMime || declaredMime || "audio/wav";
      const blob = new Blob([bytes], { type: mimeType });
      setSource({ url: URL.createObjectURL(blob), revoke: true, blob });
    } catch {
      setSource({ url: audioUrl, revoke: false, blob: null });
    }
  }, [audioBlob, audioMimeType, audioUrl]);

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
      if (ws) {
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
      if (errorCode === 4 && !fallbackTriedRef.current && source.blob) {
        fallbackTriedRef.current = true;
        setStatus("loading");
        setErrorDetail("Convirtiendo audio para compatibilidad...");
        void convertAudioBlobToWav(source.blob)
          .then((wavBlob) => {
            setSource((current) => {
              if (current.revoke && current.url.startsWith("blob:")) URL.revokeObjectURL(current.url);
              return { url: URL.createObjectURL(wavBlob), revoke: true, blob: wavBlob };
            });
          })
          .catch(() => {
            const detail = `code=${errorCode} (${getMediaErrorLabel(errorCode)})${browserMessage ? ` - ${browserMessage}` : ""}`;
            setErrorDetail(detail);
            setStatus("error");
            setPlaying(false);
          });
        return;
      }
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
  }, [source.blob, source.url]);

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
