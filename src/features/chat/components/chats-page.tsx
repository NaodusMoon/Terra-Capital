"use client";

import Link from "next/link";
import { ChangeEvent, CSSProperties, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import EmojiPicker, { EmojiClickData, Theme } from "emoji-picker-react";
import Webcam from "react-webcam";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  ArrowLeft,
  ArrowUp,
  Check,
  CheckCheck,
  FileText,
  ImageIcon,
  MessageCircle,
  Mic,
  Pause,
  Play,
  Plus,
  Search,
  Smile,
  Star,
  Square,
  Trash2,
  Camera,
  X,
} from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { useResponsive } from "@/components/providers/responsive-provider";
import { useTheme } from "@/components/providers/theme-provider";
import { useWallet } from "@/components/providers/wallet-provider";
import { Button } from "@/components/ui/button";
import { MARKETPLACE_EVENT, STORAGE_KEYS } from "@/lib/constants";
import {
  appendFailedThreadMessage,
  ensureBuyerThreadForAsset,
  getAssets,
  getThreadMessages,
  getThreadRoleForUser,
  getUserThreads,
  markThreadMessagesRead,
  sendThreadMessage,
  syncMarketplace,
} from "@/lib/marketplace";
import { readLocalStorage, writeLocalStorage } from "@/lib/storage";
import type { ChatMessage } from "@/types/market";

const quickFilters = ["Todos", "No leidos", "Favoritos"];
type VoiceRecordState = "idle" | "recording" | "paused" | "preview";
const audioSpeeds = [1, 1.5, 2] as const;

function toDataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
    reader.readAsDataURL(file);
  });
}

function dataUrlToFile(dataUrl: string, filename: string) {
  const [meta, base64] = dataUrl.split(",");
  if (!meta || !base64) {
    throw new Error("Imagen capturada invalida.");
  }
  const mimeMatch = meta.match(/data:(.*?);base64/);
  const mimeType = mimeMatch?.[1] ?? "image/jpeg";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new File([bytes], filename, { type: mimeType });
}

function encodeWavFromAudioBuffer(buffer: AudioBuffer) {
  const channels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length * channels * 2;
  const wav = new ArrayBuffer(44 + length);
  const view = new DataView(wav);

  const writeString = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + length, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, length, true);

  let offset = 44;
  for (let sampleIndex = 0; sampleIndex < buffer.length; sampleIndex += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const value = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[sampleIndex]));
      view.setInt16(offset, value < 0 ? value * 0x8000 : value * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([wav], { type: "audio/wav" });
}

async function mergeAudioSegmentsAsWav(segments: Blob[]) {
  if (segments.length === 0) return null;

  const audioContext = new AudioContext();
  try {
    let decoded: AudioBuffer[];
    try {
      decoded = await Promise.all(
        segments.map(async (segment) => {
          const arrayBuffer = await segment.arrayBuffer();
          return audioContext.decodeAudioData(arrayBuffer.slice(0));
        }),
      );
    } catch {
      return new Blob(segments, { type: segments[0].type || "audio/webm" });
    }
    const channelCount = Math.max(...decoded.map((buffer) => buffer.numberOfChannels));
    const sampleRate = decoded[0].sampleRate;
    const totalLength = decoded.reduce((sum, buffer) => sum + buffer.length, 0);
    const merged = audioContext.createBuffer(channelCount, totalLength, sampleRate);

    let cursor = 0;
    for (const chunk of decoded) {
      for (let channel = 0; channel < channelCount; channel += 1) {
        const target = merged.getChannelData(channel);
        const source = chunk.getChannelData(Math.min(channel, chunk.numberOfChannels - 1));
        target.set(source, cursor);
      }
      cursor += chunk.length;
    }

    return encodeWavFromAudioBuffer(merged);
  } finally {
    await audioContext.close();
  }
}

function getAttachmentKind(file: File): "image" | "video" | "audio" | "document" {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return "document";
}

function formatTime(iso: string) {
  return new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

function formatDay(iso: string) {
  return new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "short" }).format(new Date(iso));
}

function formatAudioTime(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60).toString().padStart(2, "0");
  const seconds = (safe % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function StatusIcon({ message }: { message: ChatMessage }) {
  if (message.status === "failed") return <AlertCircle size={13} className="text-red-400" />;
  if (message.status === "read") return <CheckCheck size={13} className="text-sky-400" />;
  if (message.status === "sent") return <CheckCheck size={13} className="opacity-70" />;
  return <Check size={13} className="opacity-60" />;
}

function WaveAudioPlayer({
  src,
  compact = false,
}: {
  src: string;
  compact?: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [speedIndex, setSpeedIndex] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onLoaded = () => {
      setReady(true);
      setDuration(audio.duration || 0);
      setCurrentTime(audio.currentTime || 0);
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onTimeUpdate = () => setCurrentTime(audio.currentTime || 0);
    const onEnded = () => setPlaying(false);
    const onError = () => {
      setReady(false);
      setPlaying(false);
    };

    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    audio.preload = "metadata";
    audio.src = src;
    audio.load();
    if (audio.readyState >= 1 && Number.isFinite(audio.duration)) {
      onLoaded();
    }

    return () => {
      audio.pause();
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
    };
  }, [src]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = audioSpeeds[speedIndex];
    }
  }, [speedIndex]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio || !ready) return;
    if (audio.paused) {
      void audio.play();
    } else {
      audio.pause();
    }
  };

  const cycleSpeed = () => {
    const next = (speedIndex + 1) % audioSpeeds.length;
    setSpeedIndex(next);
    if (audioRef.current) {
      audioRef.current.playbackRate = audioSpeeds[next];
    }
  };

  const remaining = Math.max(0, duration - currentTime);
  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <div className={`terra-wave-player ${compact ? "terra-wave-player--compact" : ""}`}>
      <audio ref={audioRef} className="hidden" />
      <button type="button" className="terra-wave-btn" onClick={togglePlay} disabled={!ready}>
        {playing ? <Pause size={14} /> : <Play size={14} />}
      </button>
      <div className="terra-wave-content">
        <div className="terra-wave-canvas">
          <span className="terra-wave-progress" style={{ width: `${progress}%` }} />
        </div>
        <div className="terra-wave-meta">
          <span>{duration > 0 ? `-${formatAudioTime(remaining)}` : "--:--"}</span>
          <button type="button" className="terra-wave-speed" onClick={cycleSpeed} disabled={!ready}>
            {audioSpeeds[speedIndex]}x
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageBody({ message }: { message: ChatMessage }) {
  const attachment = message.attachment;
  if (!attachment) return <p className="whitespace-pre-wrap">{message.text}</p>;

  if (message.kind === "image") {
    return (
      <div className="space-y-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={attachment.dataUrl} alt={attachment.name} className="max-h-56 w-full rounded-xl object-cover" />
        {message.text && <p>{message.text}</p>}
      </div>
    );
  }

  if (message.kind === "video") {
    return (
      <div className="space-y-2">
        <video controls className="max-h-56 w-full rounded-xl">
          <source src={attachment.dataUrl} type={attachment.mimeType} />
        </video>
        {message.text && <p>{message.text}</p>}
      </div>
    );
  }

  if (message.kind === "audio") {
    return (
      <div className="space-y-2 min-w-[220px] sm:min-w-[240px]">
        <WaveAudioPlayer src={attachment.dataUrl} compact />
        {message.text && <p>{message.text}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <a href={attachment.dataUrl} download={attachment.name} className="font-semibold underline">
        {attachment.name}
      </a>
      <p className="text-xs opacity-80">{Math.ceil(attachment.size / 1024)} KB</p>
      {message.text && <p>{message.text}</p>}
    </div>
  );
}

export function ChatsPage() {
  const { user, loading, activeMode } = useAuth();
  const { walletAddress, walletReady } = useWallet();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const router = useRouter();
  const searchParams = useSearchParams();
  const assetIdParam = searchParams.get("assetId");
  const handledAssetIdRef = useRef<string | null>(null);
  const photoVideoInputRef = useRef<HTMLInputElement | null>(null);
  const docsInputRef = useRef<HTMLInputElement | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);
  const voiceSegmentsRef = useRef<Blob[]>([]);
  const voiceStopReasonRef = useRef<"pause" | "finish" | "delete" | null>(null);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const voiceTimerRef = useRef<number | null>(null);
  const voiceRecorderRef = useRef<MediaRecorder | null>(null);
  const voicePreviewBlobRef = useRef<Blob | null>(null);
  const voiceLiveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const voiceLiveAnimationRef = useRef<number | null>(null);
  const voiceLiveAudioContextRef = useRef<AudioContext | null>(null);
  const voiceLiveAnalyserRef = useRef<AnalyserNode | null>(null);
  const voiceLiveSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const webcamRef = useRef<Webcam | null>(null);
  const cameraRecorderRef = useRef<MediaRecorder | null>(null);
  const cameraChunksRef = useRef<Blob[]>([]);
  const { isMobile } = useResponsive();

  const [threads, setThreads] = useState<ReturnType<typeof getUserThreads>>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatError, setChatError] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceRecordState>("idle");
  const [voicePreviewBlob, setVoicePreviewBlob] = useState<Blob | null>(null);
  const [voicePreviewUrl, setVoicePreviewUrl] = useState<string | null>(null);
  const [retryMessageId, setRetryMessageId] = useState<string | null>(null);
  const [retryingMessageId, setRetryingMessageId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("Todos");
  const [manuallyClosedChat, setManuallyClosedChat] = useState(false);
  const [favoriteThreadIds, setFavoriteThreadIds] = useState<string[]>([]);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showAttachCameraSubmenu, setShowAttachCameraSubmenu] = useState(false);
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [cameraMode, setCameraMode] = useState<"photo" | "video">("photo");
  const [cameraRecording, setCameraRecording] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [capturedVideoBlob, setCapturedVideoBlob] = useState<Blob | null>(null);
  const [capturedVideoUrl, setCapturedVideoUrl] = useState<string | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [assets, setAssets] = useState<ReturnType<typeof getAssets>>([]);

  const assetsMap = useMemo(() => new Map(assets.map((asset) => [asset.id, asset.title])), [assets]);
  const activeThread = threads.find((thread) => thread.id === activeThreadId) ?? null;
  const activeMessages = activeThreadId ? getThreadMessages(activeThreadId) : [];
  const activeRole = activeThread && user ? getThreadRoleForUser(activeThread, user.id) : null;
  const senderRole = activeRole ?? (activeMode === "seller" ? "seller" : "buyer");
  const mobileThreadOpen = isMobile && Boolean(activeThread);

  useEffect(() => {
    if (!user) return;
    const boot = window.setTimeout(() => {
      const map = readLocalStorage<Record<string, string[]>>(STORAGE_KEYS.chatFavorites, {});
      setFavoriteThreadIds(Array.isArray(map[user.id]) ? map[user.id] : []);
    }, 0);
    return () => window.clearTimeout(boot);
  }, [user]);

  const syncData = useCallback(async () => {
    if (!user) return;

    try {
      let preferredThreadId: string | null = null;
      if (assetIdParam && handledAssetIdRef.current !== assetIdParam) {
        handledAssetIdRef.current = assetIdParam;
        const ensuredThread = await ensureBuyerThreadForAsset(assetIdParam, user);
        if (!ensuredThread.ok) {
          setChatError(ensuredThread.message);
        } else {
          preferredThreadId = ensuredThread.thread.id;
        }
      }

      await syncMarketplace(user.id, { includeChat: true });
      setAssets(getAssets());
      const nextThreads = getUserThreads(user.id);
      setThreads(nextThreads);

      if (nextThreads.length === 0) {
        setActiveThreadId(null);
        return;
      }
      if (preferredThreadId && nextThreads.some((thread) => thread.id === preferredThreadId)) {
        setManuallyClosedChat(false);
      }

      setActiveThreadId((current) => {
        if (preferredThreadId && nextThreads.some((thread) => thread.id === preferredThreadId)) return preferredThreadId;
        if (current && nextThreads.some((thread) => thread.id === current)) return current;
        if (manuallyClosedChat) return null;
        return current ?? null;
      });
    } catch {
      setAssets(getAssets());
      setThreads(getUserThreads(user.id));
    }
  }, [assetIdParam, manuallyClosedChat, user]);

  useEffect(() => {
    if (loading || !walletReady) return;
    if (!user) {
      router.replace("/auth/login");
      return;
    }
    if (!walletAddress) {
      router.replace("/");
    }
  }, [loading, router, user, walletAddress, walletReady]);

  useEffect(() => {
    if (!user) return;

    let interval: number | null = null;
    let boot: number | null = null;

    const runSync = () => {
      if (document.visibilityState !== "visible") return;
      void syncData();
    };

    const startSync = () => {
      runSync();
      if (interval) window.clearInterval(interval);
      interval = window.setInterval(runSync, 2500);
    };

    if (document.visibilityState === "visible") {
      boot = window.setTimeout(startSync, 0);
    }

    const marketListener = () => { void syncData(); };
    const visibilityListener = () => {
      if (document.visibilityState === "visible") {
        startSync();
      } else if (interval) {
        window.clearInterval(interval);
        interval = null;
      }
    };
    const storageListener = (event: StorageEvent) => {
      if (!event.key || event.key.startsWith("terra_capital_")) void syncData();
    };

    window.addEventListener(MARKETPLACE_EVENT, marketListener);
    window.addEventListener("storage", storageListener);
    document.addEventListener("visibilitychange", visibilityListener);

    return () => {
      if (boot) window.clearTimeout(boot);
      window.removeEventListener(MARKETPLACE_EVENT, marketListener);
      window.removeEventListener("storage", storageListener);
      document.removeEventListener("visibilitychange", visibilityListener);
      if (interval) window.clearInterval(interval);
    };
  }, [syncData, user]);

  useEffect(() => {
    if (!activeThreadId || !activeRole) return;
    void markThreadMessagesRead(activeThreadId, activeRole);
  }, [activeRole, activeThreadId, activeMessages.length]);

  useEffect(() => {
    return () => {
      if (voiceTimerRef.current) {
        window.clearInterval(voiceTimerRef.current);
        voiceTimerRef.current = null;
      }
      const recorder = voiceRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.stop();
      }
      voiceStreamRef.current?.getTracks().forEach((track) => track.stop());
      voiceStreamRef.current = null;
      if (voiceLiveAnimationRef.current) {
        window.cancelAnimationFrame(voiceLiveAnimationRef.current);
        voiceLiveAnimationRef.current = null;
      }
      voiceLiveSourceRef.current?.disconnect();
      voiceLiveAnalyserRef.current = null;
      voiceLiveSourceRef.current = null;
      if (voiceLiveAudioContextRef.current) {
        void voiceLiveAudioContextRef.current.close();
        voiceLiveAudioContextRef.current = null;
      }
      cameraRecorderRef.current?.stream.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    return () => {
      if (capturedVideoUrl) URL.revokeObjectURL(capturedVideoUrl);
    };
  }, [capturedVideoUrl]);

  useEffect(() => {
    return () => {
      if (voicePreviewUrl) URL.revokeObjectURL(voicePreviewUrl);
    };
  }, [voicePreviewUrl]);

  useEffect(() => {
    document.body.classList.add("chat-page-lock");
    return () => document.body.classList.remove("chat-page-lock");
  }, []);

  useEffect(() => {
    if (mobileThreadOpen) {
      document.body.classList.add("chat-thread-open");
    } else {
      document.body.classList.remove("chat-thread-open");
    }
    return () => document.body.classList.remove("chat-thread-open");
  }, [mobileThreadOpen]);

  const term = search.trim().toLowerCase();
  const hasTextToSend = chatInput.trim().length > 0;
  const visibleThreads = threads.filter((thread) => {
    const counterpart = thread.buyerId === user?.id ? thread.sellerName : thread.buyerName;
    const assetTitle = assetsMap.get(thread.assetId) ?? "";
    const termMatch = !term || counterpart.toLowerCase().includes(term) || assetTitle.toLowerCase().includes(term);
    if (!termMatch) return false;
    if (filter === "No leidos") {
      return getThreadMessages(thread.id).some((message) => message.senderRole !== senderRole && message.status !== "read");
    }
    if (filter === "Favoritos") {
      return favoriteThreadIds.includes(thread.id);
    }
    return true;
  });

  const handleSendText = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setChatError("");
    if (!activeThreadId || !user) return;

    const result = await sendThreadMessage(activeThreadId, user, senderRole, chatInput, { kind: "text" });
    if (!result.ok) {
      appendFailedThreadMessage(activeThreadId, user, senderRole, chatInput, result.message, { kind: "text" });
      setChatError(result.message);
      void syncData();
      return;
    }

    setChatInput("");
    setShowEmoji(false);
    void syncData();
  };

  const removeLocalMessage = (messageId: string) => {
    const messages = readLocalStorage<ChatMessage[]>(STORAGE_KEYS.chatMessages, []);
    const next = messages.filter((message) => message.id !== messageId);
    if (next.length === messages.length) return;
    writeLocalStorage(STORAGE_KEYS.chatMessages, next);
  };

  const handleRetryFailedMessage = async (message: ChatMessage) => {
    if (!user || message.status !== "failed") return;
    setRetryingMessageId(message.id);
    setChatError("");
    try {
      const result = await sendThreadMessage(
        message.threadId,
        user,
        message.senderRole,
        message.text,
        {
          kind: message.kind ?? "text",
          attachment: message.attachment,
        },
      );
      if (!result.ok) {
        setChatError(result.message);
        return;
      }
      removeLocalMessage(message.id);
      setRetryMessageId(null);
      await syncData();
    } finally {
      setRetryingMessageId(null);
    }
  };

  const handleOpenThread = (threadId: string) => {
    setManuallyClosedChat(false);
    setActiveThreadId(threadId);
  };

  const handleCloseThread = () => {
    setManuallyClosedChat(true);
    setActiveThreadId(null);
    setShowEmoji(false);
    setShowAttachMenu(false);
    setShowAttachCameraSubmenu(false);
  };

  const toggleFavoriteThread = (threadId: string) => {
    if (!user) return;
    const next = favoriteThreadIds.includes(threadId)
      ? favoriteThreadIds.filter((id) => id !== threadId)
      : [...favoriteThreadIds, threadId];
    setFavoriteThreadIds(next);
    const map = readLocalStorage<Record<string, string[]>>(STORAGE_KEYS.chatFavorites, {});
    map[user.id] = next;
    writeLocalStorage(STORAGE_KEYS.chatFavorites, map);
  };

  const sendFileMessage = async (file: File) => {
    if (!activeThreadId || !user) return;
    const dataUrl = await toDataUrl(file);
    const kind = getAttachmentKind(file);
    const result = await sendThreadMessage(activeThreadId, user, senderRole, chatInput, {
      kind,
      attachment: {
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        dataUrl,
      },
    });
    if (!result.ok) {
      appendFailedThreadMessage(activeThreadId, user, senderRole, chatInput, result.message, {
        kind,
        attachment: {
          name: file.name,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
          dataUrl,
        },
      });
      throw new Error(result.message);
    }
    setChatInput("");
    void syncData();
  };

  const handleFilePick = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setChatError("");
    try {
      await sendFileMessage(file);
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "No se pudo adjuntar el archivo.");
    }
  };

  const stopLiveVoiceVisualization = () => {
    if (voiceLiveAnimationRef.current) {
      window.cancelAnimationFrame(voiceLiveAnimationRef.current);
      voiceLiveAnimationRef.current = null;
    }
    voiceLiveSourceRef.current?.disconnect();
    voiceLiveAnalyserRef.current = null;
    voiceLiveSourceRef.current = null;
    if (voiceLiveAudioContextRef.current) {
      void voiceLiveAudioContextRef.current.close();
      voiceLiveAudioContextRef.current = null;
    }
    const canvas = voiceLiveCanvasRef.current;
    if (canvas) {
      const context = canvas.getContext("2d");
      if (context) context.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  const drawLiveVoiceVisualization = () => {
    const canvas = voiceLiveCanvasRef.current;
    const analyser = voiceLiveAnalyserRef.current;
    if (!canvas || !analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);

    const context = canvas.getContext("2d");
    if (!context) return;

    const ratio = window.devicePixelRatio || 1;
    const cssWidth = Math.max(canvas.clientWidth, 120);
    const cssHeight = Math.max(canvas.clientHeight, 38);
    if (canvas.width !== Math.floor(cssWidth * ratio) || canvas.height !== Math.floor(cssHeight * ratio)) {
      canvas.width = Math.floor(cssWidth * ratio);
      canvas.height = Math.floor(cssHeight * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    analyser.getByteFrequencyData(data);
    context.clearRect(0, 0, cssWidth, cssHeight);
    const bars = 42;
    const gap = 2;
    const barWidth = Math.max((cssWidth - gap * (bars - 1)) / bars, 1);
    for (let index = 0; index < bars; index += 1) {
      const bucket = Math.floor((index / bars) * data.length);
      const amplitude = data[bucket] / 255;
      const barHeight = Math.max(4, amplitude * cssHeight);
      const x = index * (barWidth + gap);
      const y = (cssHeight - barHeight) / 2;
      context.fillStyle = isDark ? "#7ce3c9" : "#1f8c72";
      context.fillRect(x, y, barWidth, barHeight);
    }

    if (voiceRecorderRef.current?.state === "recording") {
      voiceLiveAnimationRef.current = window.requestAnimationFrame(drawLiveVoiceVisualization);
    }
  };

  const startLiveVoiceVisualization = (stream: MediaStream) => {
    stopLiveVoiceVisualization();
    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.65;
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);
    voiceLiveAudioContextRef.current = audioContext;
    voiceLiveAnalyserRef.current = analyser;
    voiceLiveSourceRef.current = source;
    voiceLiveAnimationRef.current = window.requestAnimationFrame(drawLiveVoiceVisualization);
  };

  const clearVoicePreview = () => {
    if (voicePreviewUrl) URL.revokeObjectURL(voicePreviewUrl);
    voicePreviewBlobRef.current = null;
    setVoicePreviewBlob(null);
    setVoicePreviewUrl(null);
  };

  const stopVoiceTimer = () => {
    if (voiceTimerRef.current) {
      window.clearInterval(voiceTimerRef.current);
      voiceTimerRef.current = null;
    }
  };

  const stopVoiceTracks = () => {
    voiceStreamRef.current?.getTracks().forEach((track) => track.stop());
    voiceStreamRef.current = null;
  };

  const rebuildVoicePreview = async () => {
    const merged = await mergeAudioSegmentsAsWav(voiceSegmentsRef.current);
    if (!merged || merged.size === 0) return false;
    voicePreviewBlobRef.current = merged;
    setVoicePreviewBlob(merged);
    setVoicePreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(merged);
    });
    return true;
  };

  const createVoiceRecorder = (stream: MediaStream) => {
    const preferredTypes = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4", "audio/webm"];
    const selectedMimeType = preferredTypes.find((entry) => MediaRecorder.isTypeSupported(entry)) ?? "";
    const recorder = selectedMimeType ? new MediaRecorder(stream, { mimeType: selectedMimeType }) : new MediaRecorder(stream);
    voiceChunksRef.current = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        voiceChunksRef.current.push(event.data);
      }
    };

    recorder.onstop = () => {
      const segmentType = recorder.mimeType || "audio/webm";
      if (voiceChunksRef.current.length > 0) {
        const segment = new Blob(voiceChunksRef.current, { type: segmentType });
        if (segment.size > 0) {
          voiceSegmentsRef.current.push(segment);
        }
      }
      voiceChunksRef.current = [];

      const reason = voiceStopReasonRef.current;
      voiceStopReasonRef.current = null;

      void (async () => {
        const hasPreview = await rebuildVoicePreview();
        if (reason === "delete") {
          setVoiceState("idle");
          setRecordingDuration(0);
          return;
        }
        if (reason === "pause") {
          stopVoiceTimer();
          stopLiveVoiceVisualization();
          setVoiceState(hasPreview ? "paused" : "idle");
          return;
        }
        stopVoiceRuntime();
        if (hasPreview) {
          setVoiceState("preview");
        } else {
          setVoiceState("idle");
          setRecordingDuration(0);
        }
      })();
    };

    voiceRecorderRef.current = recorder;
    recorder.start(250);
  };

  const stopVoiceRuntime = () => {
    stopVoiceTimer();
    stopVoiceTracks();
    stopLiveVoiceVisualization();
    voiceRecorderRef.current = null;
  };

  const startVoiceRecording = async () => {
    if (!activeThreadId || !user || hasTextToSend || voiceState === "recording") return;
    setChatError("");

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setChatError("Tu navegador no soporta notas de voz.");
      return;
    }

    if (!window.isSecureContext) {
      setChatError("Para grabar voz, abre la app en HTTPS o desde localhost.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      voiceStreamRef.current = stream;
      voiceSegmentsRef.current = [];
      clearVoicePreview();
      setRecordingDuration(0);
      createVoiceRecorder(stream);
      startLiveVoiceVisualization(stream);
      setVoiceState("recording");
      voiceTimerRef.current = window.setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch (error) {
      stopVoiceRuntime();
      const mediaError = error as DOMException | undefined;
      if (mediaError?.name === "NotAllowedError") {
        setChatError("Permiso de microfono denegado o bloqueado. Si usas localhost/HTTPS, habilitalo en permisos del navegador.");
        return;
      }
      if (mediaError?.name === "NotFoundError") {
        setChatError("No se detecto ningun microfono en este dispositivo.");
        return;
      }
      if (mediaError?.name === "NotReadableError") {
        setChatError("El microfono esta en uso por otra aplicacion. Cierra esa app e intenta de nuevo.");
        return;
      }
      setChatError("No se pudo acceder al microfono.");
    }
  };

  const pauseVoiceRecording = () => {
    const recorder = voiceRecorderRef.current;
    if (!recorder) return;
    if (recorder.state === "recording") {
      voiceStopReasonRef.current = "pause";
      recorder.stop();
    }
  };

  const resumeVoiceRecording = () => {
    const stream = voiceStreamRef.current;
    if (!stream) return;
    createVoiceRecorder(stream);
    setVoiceState("recording");
    startLiveVoiceVisualization(stream);
    voiceTimerRef.current = window.setInterval(() => {
      setRecordingDuration((prev) => prev + 1);
    }, 1000);
  };

  const finalizeVoiceRecording = () => {
    const recorder = voiceRecorderRef.current;
    if (!recorder) return;
    if (recorder.state !== "inactive") {
      voiceStopReasonRef.current = "finish";
      recorder.stop();
    }
  };

  const deleteVoiceRecording = () => {
    const recorder = voiceRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      voiceStopReasonRef.current = "delete";
      recorder.stop();
    }
    stopVoiceRuntime();
    voiceRecorderRef.current = null;
    voiceChunksRef.current = [];
    voiceSegmentsRef.current = [];
    clearVoicePreview();
    setRecordingDuration(0);
    setVoiceState("idle");
  };

  const sendVoiceRecording = async () => {
    if (!activeThreadId || !user) return;
    if (voiceState === "recording") return;
    const blob = voicePreviewBlobRef.current ?? voicePreviewBlob;
    if (!blob || blob.size === 0) {
      setChatError("No hay audio para enviar.");
      return;
    }

    try {
      const dataUrl = await toDataUrl(blob);
      const extension = blob.type.includes("wav")
        ? "wav"
        : blob.type.includes("ogg")
          ? "ogg"
          : blob.type.includes("mp4")
            ? "m4a"
            : "webm";
      const result = await sendThreadMessage(activeThreadId, user, senderRole, "", {
        kind: "audio",
        attachment: {
          name: `nota-voz-${Date.now()}.${extension}`,
          mimeType: blob.type || "audio/webm",
          size: blob.size,
          dataUrl,
        },
      });

      if (!result.ok) {
        appendFailedThreadMessage(activeThreadId, user, senderRole, "", result.message, {
          kind: "audio",
          attachment: {
            name: `nota-voz-${Date.now()}.${extension}`,
            mimeType: blob.type || "audio/webm",
            size: blob.size,
            dataUrl,
          },
        });
        setChatError(result.message);
        return;
      }
      deleteVoiceRecording();
      void syncData();
    } catch {
      appendFailedThreadMessage(activeThreadId, user, senderRole, "", "No se pudo procesar la nota de voz.", {
        kind: "audio",
      });
      setChatError("No se pudo enviar la nota de voz.");
    }
  };

  const formatRecordingDuration = (totalSeconds: number) => {
    const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
    const seconds = (totalSeconds % 60).toString().padStart(2, "0");
    return `${minutes}:${seconds}`;
  };

  const handleEmojiPick = (emoji: EmojiClickData) => {
    setChatInput((prev) => `${prev}${emoji.emoji}`);
  };

  const stopCameraTracks = () => {
    const stream = webcamRef.current?.stream as MediaStream | undefined;
    stream?.getTracks().forEach((track) => track.stop());
  };

  const closeCameraModal = () => {
    if (cameraRecording) {
      cameraRecorderRef.current?.stop();
    }
    stopCameraTracks();
    setShowCameraModal(false);
    setCameraError("");
    setCameraRecording(false);
    setCapturedPhoto(null);
    setCapturedVideoBlob(null);
    if (capturedVideoUrl) URL.revokeObjectURL(capturedVideoUrl);
    setCapturedVideoUrl(null);
  };

  const openCameraModal = async (mode: "photo" | "video") => {
    setShowAttachMenu(false);
    setShowAttachCameraSubmenu(false);
    setShowEmoji(false);
    setCameraMode(mode);
    setCameraError("");
    setCapturedPhoto(null);
    setCapturedVideoBlob(null);
    if (capturedVideoUrl) URL.revokeObjectURL(capturedVideoUrl);
    setCapturedVideoUrl(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Tu navegador no soporta acceso a camara.");
      return;
    }

    if (!window.isSecureContext) {
      setCameraError("Para usar la camara, abre la app en HTTPS o localhost.");
      return;
    }

    try {
      const preflight = await navigator.mediaDevices.getUserMedia({ video: true, audio: mode === "video" });
      preflight.getTracks().forEach((track) => track.stop());
      setShowCameraModal(true);
    } catch (error) {
      const mediaError = error as DOMException | undefined;
      if (mediaError?.name === "NotAllowedError") {
        setCameraError("Permiso de camara denegado o bloqueado. Si usas localhost/HTTPS, habilitala en permisos del navegador.");
      } else if (mediaError?.name === "NotFoundError") {
        setCameraError("No se detecto camara en este dispositivo.");
      } else if (mediaError?.name === "NotReadableError") {
        setCameraError("La camara esta en uso por otra aplicacion.");
      } else {
        setCameraError("No se pudo iniciar la camara.");
      }
    }
  };

  const handleTakePhoto = () => {
    setCameraError("");
    const snapshot = webcamRef.current?.getScreenshot();
    if (!snapshot) {
      setCameraError("No se pudo tomar la foto. Verifica permisos de camara.");
      return;
    }
    setCapturedPhoto(snapshot);
    setCapturedVideoBlob(null);
    if (capturedVideoUrl) URL.revokeObjectURL(capturedVideoUrl);
    setCapturedVideoUrl(null);
  };

  const handleStartVideoRecording = () => {
    setCameraError("");
    const stream = webcamRef.current?.stream as MediaStream | undefined;
    if (!stream) {
      setCameraError("No hay acceso a camara para grabar video.");
      return;
    }
    try {
      const preferredTypes = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
      const selectedMimeType = preferredTypes.find((entry) => MediaRecorder.isTypeSupported(entry)) ?? "";
      const recorder = selectedMimeType ? new MediaRecorder(stream, { mimeType: selectedMimeType }) : new MediaRecorder(stream);
      cameraChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) cameraChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(cameraChunksRef.current, { type: recorder.mimeType || "video/webm" });
        cameraChunksRef.current = [];
        setCameraRecording(false);
        setCapturedPhoto(null);
        setCapturedVideoBlob(blob);
        if (capturedVideoUrl) URL.revokeObjectURL(capturedVideoUrl);
        setCapturedVideoUrl(URL.createObjectURL(blob));
      };
      cameraRecorderRef.current = recorder;
      recorder.start(200);
      setCameraRecording(true);
    } catch {
      setCameraError("No se pudo iniciar la grabacion de video.");
    }
  };

  const handleStopVideoRecording = () => {
    cameraRecorderRef.current?.stop();
  };

  const handleSendCapturedMedia = async () => {
    if (!activeThreadId || !user) return;
    try {
      if (capturedPhoto) {
        const photoFile = dataUrlToFile(capturedPhoto, `foto-chat-${Date.now()}.jpg`);
        await sendFileMessage(photoFile);
        closeCameraModal();
        return;
      }

      if (capturedVideoBlob) {
        const videoFile = new File([capturedVideoBlob], `video-chat-${Date.now()}.webm`, { type: capturedVideoBlob.type || "video/webm" });
        await sendFileMessage(videoFile);
        closeCameraModal();
        return;
      }

      setCameraError(cameraMode === "photo" ? "Primero toma una foto." : "Primero graba un video.");
    } catch (error) {
      setCameraError(error instanceof Error ? error.message : "No se pudo enviar el archivo capturado.");
    }
  };

  if (loading || !walletReady || !user || !walletAddress) {
    return (
      <div className="mx-auto grid min-h-[60vh] max-w-6xl place-items-center px-4 text-center text-sm text-[var(--color-muted)]">
        Cargando chats...
      </div>
    );
  }

  const asideBg = "bg-[var(--color-surface)] text-[var(--color-foreground)]";
  const headerBg = "bg-[var(--color-surface-soft)] border-[var(--color-border)]";
  const panelBg = "bg-[var(--color-background)] text-[var(--color-foreground)]";
  const bubbleIn = "bg-[var(--color-surface-soft)] text-[var(--color-foreground)]";
  const bubbleOut = "bg-[var(--color-primary)] text-[var(--color-primary-contrast)]";
  const iconBtn = "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-foreground)] hover:bg-[var(--color-surface-soft)]";
  const inputBg = "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-foreground)] placeholder:text-[var(--color-muted)]";
  const emojiPickerStyle = {
    "--epr-bg-color": "var(--color-surface)",
    "--epr-category-label-bg-color": "var(--color-surface)",
    "--epr-hover-bg-color": "var(--color-surface-soft)",
    "--epr-search-input-bg-color": "var(--color-surface-soft)",
    "--epr-search-input-text-color": "var(--color-foreground)",
    "--epr-search-border-color": "transparent",
    "--epr-picker-border-color": "transparent",
    "--epr-scrollbar-track-color": "transparent",
    "--epr-scrollbar-thumb-color": "var(--color-border)",
    "--epr-text-color": "var(--color-foreground)",
  } as CSSProperties;
  const emojiPickerWidth = isMobile ? 300 : 340;
  const actionIconSize = isMobile ? 21 : 17;
  const sendIconSize = isMobile ? 20 : 16;

  return (
    <main className={`mx-auto w-full overflow-hidden px-0 pb-0 pt-0 ${mobileThreadOpen ? "max-w-none" : "max-w-[1500px] sm:px-5 sm:pb-4 sm:pt-6"}`}>
      <section className={`grid gap-0 overflow-hidden ${mobileThreadOpen ? "h-dvh border-0 rounded-none" : "h-[calc(100dvh-152px)] rounded-none border border-[var(--color-border)] sm:rounded-2xl md:h-[calc(100dvh-64px)] lg:h-[82vh]"} lg:grid-cols-[420px_1fr]`}>
        <aside className={`${activeThread ? "hidden lg:block" : "block"} ${asideBg} border-[var(--color-border)] lg:border-r`}>
          <div className="flex items-center justify-between px-5 pb-3 pt-4">
            <div>
              <p className="text-3xl font-black tracking-tight text-[var(--color-foreground)]">Chat</p>
              <p className="text-xs text-[var(--color-muted)]">Terra Chat</p>
            </div>
          </div>

          <div className="px-4 pb-3">
            <label className="relative block">
              <Search size={18} className="pointer-events-none absolute left-3 top-3 text-[var(--color-muted)]" />
              <input
                className="h-12 w-full rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] pl-11 pr-3 text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-muted)]"
                placeholder="Buscar chat"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              {quickFilters.map((entry) => (
                <button
                  key={entry}
                  type="button"
                  onClick={() => setFilter(entry)}
                  className={`rounded-full border px-4 py-2 text-sm font-semibold ${filter === entry ? "border-transparent bg-[var(--color-primary)] text-[var(--color-primary-contrast)]" : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)]"}`}
                >
                  {entry}
                </button>
              ))}
            </div>
          </div>

          <div className="max-h-[calc(100dvh-308px)] overflow-y-auto pb-2 md:max-h-[calc(100dvh-230px)] lg:max-h-[calc(82vh-175px)]">
            <AnimatePresence initial={false}>
              {visibleThreads.map((thread, index) => {
              const counterpart = thread.buyerId === user.id ? thread.sellerName : thread.buyerName;
              const subtitle = assetsMap.get(thread.assetId) ?? "Activo";
              const latest = getThreadMessages(thread.id).at(-1);
              const preview = latest ? `${latest.senderId === user.id ? "Tu: " : ""}${latest.text || (latest.kind ?? "Adjunto")}` : "Sin mensajes";
              const isActive = thread.id === activeThreadId;
              const isFavorite = favoriteThreadIds.includes(thread.id);

              return (
                <motion.div
                  key={thread.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2, delay: Math.min(index * 0.025, 0.2) }}
                >
                  <button
                    type="button"
                    onClick={() => handleOpenThread(thread.id)}
                    className={`flex w-full items-start gap-3 border-b border-[var(--color-border)] px-4 py-3 text-left transition-colors ${isActive ? "bg-[var(--color-surface-soft)]" : "hover:bg-[var(--color-surface-soft)]/70"}`}
                  >
                    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[var(--color-surface-soft)] text-[var(--color-foreground)]">
                      <MessageCircle size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-lg font-semibold text-[var(--color-foreground)]">{counterpart}</p>
                        <div className="flex items-center gap-2">
                          <p className="text-xs text-[var(--color-muted)]">{latest ? formatDay(latest.createdAt) : formatDay(thread.updatedAt)}</p>
                          <motion.span
                            role="button"
                            tabIndex={0}
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              toggleFavoriteThread(thread.id);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                toggleFavoriteThread(thread.id);
                              }
                            }}
                            aria-label={isFavorite ? "Quitar de favoritos" : "Agregar a favoritos"}
                            className="grid h-7 w-7 place-items-center rounded-full transition-colors hover:bg-[var(--color-surface-soft)]"
                            whileTap={{ scale: 0.84 }}
                            animate={{ scale: isFavorite ? [1, 1.24, 1] : [1, 0.9, 1], rotate: isFavorite ? [0, -8, 8, 0] : [0, -4, 0] }}
                            transition={{ duration: 0.28, ease: "easeOut" }}
                          >
                            <Star size={15} className={isFavorite ? "fill-[#facc15] text-[#facc15]" : "text-[var(--color-muted)]"} />
                          </motion.span>
                        </div>
                      </div>
                      <p className="truncate text-xs uppercase tracking-[0.12em] text-[var(--color-primary)]">{subtitle}</p>
                      <p className="truncate text-sm text-[var(--color-muted)]">{preview}</p>
                    </div>
                  </button>
                </motion.div>
              );
              })}
            </AnimatePresence>
          </div>
        </aside>

        <section className={`relative ${activeThread ? "flex" : "hidden lg:flex"} h-full flex-col overflow-hidden ${panelBg}`}>
          {activeThread ? (
            <>
              <header className={`flex items-center justify-between border-b px-4 py-3 ${headerBg}`}>
                <div className="flex min-w-0 items-center gap-3">
                  <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${isDark ? "bg-[#1f2c34]" : "bg-white text-[#23415a]"}`}>
                    <MessageCircle size={16} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className={`grid h-8 w-8 place-items-center rounded-full lg:hidden ${isDark ? "hover:bg-[#1f2c34]" : "hover:bg-[#e8f3fc]"}`}
                        onClick={handleCloseThread}
                        aria-label="Volver a chats"
                      >
                        <ArrowLeft size={17} />
                      </button>
                      <p className="truncate text-xl font-bold lg:text-2xl">
                        {activeThread.buyerId === user.id ? activeThread.sellerName : activeThread.buyerName}
                      </p>
                    </div>
                    <p className={`truncate text-xs ${isDark ? "text-[#aebac1]" : "text-[#5f7487]"}`}>{assetsMap.get(activeThread.assetId) ?? "Activo tokenizado"}</p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className={`hidden h-11 rounded-xl px-3 text-sm font-semibold lg:inline-flex ${iconBtn}`}
                  onClick={handleCloseThread}
                >
                  <X size={16} className="mr-2" /> Cerrar chat
                </Button>
              </header>

              <div className={`flex-1 overflow-y-auto px-3 py-4 sm:px-4 ${isDark ? "bg-[radial-gradient(circle_at_15%_20%,rgba(34,53,62,.45),transparent_40%),radial-gradient(circle_at_80%_75%,rgba(21,32,39,.55),transparent_40%),#0b141a]" : "bg-[radial-gradient(circle_at_15%_20%,rgba(180,210,234,.45),transparent_40%),radial-gradient(circle_at_80%_75%,rgba(210,230,244,.55),transparent_40%),#eef6fc]"}`}>
                <div className="space-y-2.5">
                  <AnimatePresence initial={false}>
                    {activeMessages.map((message) => (
                      <motion.div
                        key={message.id}
                        initial={{ opacity: 0, y: 8, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -6, scale: 0.98 }}
                        transition={{ duration: 0.16 }}
                        className={`flex ${message.senderId === user.id ? "justify-end" : "justify-start"}`}
                      >
                        <article
                          className={`inline-block rounded-2xl px-3 py-2 text-sm shadow-sm ${
                            message.kind === "audio"
                              ? "w-full max-w-[78%] min-w-[220px] sm:max-w-[68%]"
                              : "w-fit max-w-[82%] sm:max-w-[78%]"
                          } ${message.senderId === user.id ? bubbleOut : bubbleIn}`}
                          onClick={() => {
                            if (message.status === "failed" && message.senderId === user.id) {
                              setRetryMessageId((current) => (current === message.id ? null : message.id));
                            }
                          }}
                        >
                          <MessageBody message={message} />
                          <div className="mt-1 flex items-center justify-end gap-1 text-[10px] opacity-75">
                            <span>{formatTime(message.createdAt)}</span>
                            {message.senderId === user.id && <StatusIcon message={message} />}
                          </div>
                          {message.status === "failed" && message.errorMessage && (
                            <>
                              <p className="mt-1 text-[11px] text-red-400">{message.errorMessage}</p>
                              <p className="mt-1 text-[10px] text-red-300/90">Toca este mensaje para reintentar envio.</p>
                            </>
                          )}
                          {message.status === "failed" && retryMessageId === message.id && (
                            <button
                              type="button"
                              className="mt-2 rounded-lg border border-red-400 px-2 py-1 text-[11px] font-semibold text-red-300 hover:bg-red-500/10"
                              disabled={retryingMessageId === message.id}
                              onClick={(event) => {
                                event.stopPropagation();
                                void handleRetryFailedMessage(message);
                              }}
                            >
                              {retryingMessageId === message.id ? "Reintentando..." : "Reintentar envio"}
                            </button>
                          )}
                        </article>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>

              <footer className={`relative border-t p-2 pb-[max(env(safe-area-inset-bottom),10px)] sm:p-2 ${headerBg}`}>
                <AnimatePresence>
                  {showEmoji && (
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.98 }}
                      transition={{ duration: 0.18 }}
                      className="absolute bottom-full left-2 z-20 mb-2 flex justify-start"
                    >
                      <div className="overflow-hidden rounded-2xl shadow-lg">
                        <EmojiPicker
                          onEmojiClick={handleEmojiPick}
                          lazyLoadEmojis
                          searchDisabled={false}
                          width={emojiPickerWidth}
                          height={390}
                          previewConfig={{ showPreview: false }}
                          skinTonesDisabled={false}
                          autoFocusSearch={false}
                          theme={isDark ? Theme.DARK : Theme.LIGHT}
                          style={emojiPickerStyle}
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {voiceState !== "idle" && (
                  <div className={`mb-2 rounded-xl border px-3 py-2 text-xs ${iconBtn}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className={`font-semibold ${voiceState === "recording" ? "text-red-400" : "text-[var(--color-muted)]"}`}>
                        {voiceState === "recording" ? "Grabando" : voiceState === "paused" ? "Pausado" : "Listo para enviar"} {formatRecordingDuration(recordingDuration)}
                      </span>
                    </div>
                    <div className="mt-2 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2 py-2">
                      {voiceState === "recording" && (
                        <canvas ref={voiceLiveCanvasRef} className="h-[38px] w-full" />
                      )}
                      {!voicePreviewBlob && voiceState === "preview" && (
                        <p className="px-2 py-2 text-[11px] text-[var(--color-muted)]">Sin audio disponible.</p>
                      )}
                    </div>
                    {(voiceState === "paused" || voiceState === "preview") && voicePreviewUrl && (
                      <div className="mt-2">
                        <WaveAudioPlayer src={voicePreviewUrl} />
                      </div>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {voiceState === "recording" && (
                        <>
                          <Button type="button" variant="outline" className={`h-9 rounded-xl px-3 ${iconBtn}`} onClick={pauseVoiceRecording}>
                            <Pause size={14} className="mr-1" /> Pausar
                          </Button>
                          <Button type="button" variant="outline" className={`h-9 rounded-xl px-3 ${iconBtn}`} onClick={finalizeVoiceRecording}>
                            <Square size={14} className="mr-1" /> Terminar
                          </Button>
                        </>
                      )}
                      {voiceState === "paused" && (
                        <>
                          <Button type="button" variant="outline" className={`h-9 rounded-xl px-3 ${iconBtn}`} onClick={resumeVoiceRecording}>
                            <Play size={14} className="mr-1" /> Reanudar
                          </Button>
                          <Button type="button" variant="outline" className={`h-9 rounded-xl px-3 ${iconBtn}`} onClick={finalizeVoiceRecording}>
                            <Square size={14} className="mr-1" /> Terminar
                          </Button>
                          <Button type="button" className="h-9 rounded-xl bg-[#63c35c] px-3 text-[#08260d] hover:bg-[#7ed877]" onClick={() => { void sendVoiceRecording(); }}>
                            <ArrowUp size={14} className="mr-1" /> Enviar
                          </Button>
                        </>
                      )}
                      {voiceState === "preview" && (
                        <Button type="button" className="h-9 rounded-xl bg-[#63c35c] px-3 text-[#08260d] hover:bg-[#7ed877]" onClick={() => { void sendVoiceRecording(); }}>
                          <ArrowUp size={14} className="mr-1" /> Enviar audio
                        </Button>
                      )}
                      <Button type="button" variant="outline" className="h-9 rounded-xl border-red-400 px-3 text-red-400 hover:bg-red-500/10" onClick={deleteVoiceRecording}>
                        <Trash2 size={14} className="mr-1" /> Eliminar
                      </Button>
                    </div>
                  </div>
                )}

                <form className="relative flex items-center gap-2" onSubmit={handleSendText}>
  <input ref={photoVideoInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleFilePick} />
  <input ref={docsInputRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.txt" className="hidden" onChange={handleFilePick} />

  <motion.div whileHover={{ y: -1 }} whileTap={{ scale: 0.92 }}>
                    <Button
                      type="button"
                      variant="outline"
                      className={`h-11 w-11 rounded-xl px-0 sm:h-12 sm:w-12 sm:rounded-2xl ${iconBtn}`}
                      onClick={() => {
                        setShowAttachMenu(false);
                        setShowAttachCameraSubmenu(false);
                        setShowEmoji((prev) => !prev);
                      }}
      disabled={!activeThreadId}
    >
      <Smile size={actionIconSize} />
    </Button>
  </motion.div>

  <div className="relative flex-1">
    <textarea
      className={`max-h-24 min-h-11 min-w-0 w-full rounded-2xl border p-2.5 text-sm sm:max-h-28 sm:min-h-12 sm:rounded-3xl sm:p-3 ${inputBg}`}
      placeholder={activeThreadId ? "Escribe un mensaje" : "Selecciona una conversacion"}
      value={chatInput}
      onChange={(event) => setChatInput(event.target.value)}
      disabled={!activeThreadId}
    />
  </div>

  <div className="relative flex items-end gap-2">
    <motion.div whileHover={{ y: -1 }} whileTap={{ scale: 0.92 }}>
      <Button
        type="button"
        variant="outline"
        className={`h-11 w-11 rounded-xl px-0 sm:h-12 sm:w-12 sm:rounded-2xl ${iconBtn}`}
        onClick={() => {
          setShowAttachCameraSubmenu(false);
          setShowEmoji(false);
          setShowAttachMenu((prev) => !prev);
        }}
        disabled={!activeThreadId}
      >
        <Plus size={actionIconSize + 1} />
      </Button>
    </motion.div>
  </div>

  <AnimatePresence>
    {showAttachMenu && (
      <motion.div
        initial={{ opacity: 0, y: 8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.98 }}
        transition={{ duration: 0.16 }}
        className={`absolute bottom-12 right-12 z-20 w-60 rounded-2xl border p-2 shadow-xl sm:bottom-14 ${isDark ? "border-[#2a3942] bg-[#111b21]" : "border-[#bfd6e8] bg-white"}`}
      >
        <motion.button type="button" whileHover={{ x: 2 }} whileTap={{ scale: 0.98 }} className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm ${isDark ? "hover:bg-[#1f2c34]" : "hover:bg-[#eef6fc]"}`} onClick={() => { setShowAttachMenu(false); photoVideoInputRef.current?.click(); }}>
          <ImageIcon size={16} /> Fotos y videos
        </motion.button>
        <motion.button type="button" whileHover={{ x: 2 }} whileTap={{ scale: 0.98 }} className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm ${isDark ? "hover:bg-[#1f2c34]" : "hover:bg-[#eef6fc]"}`} onClick={() => { setShowAttachMenu(false); docsInputRef.current?.click(); }}>
          <FileText size={16} /> Documentos
        </motion.button>

        <div>
          <motion.button
            type="button"
            whileHover={{ x: 2 }}
            whileTap={{ scale: 0.98 }}
            className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm ${isDark ? "hover:bg-[#1f2c34]" : "hover:bg-[#eef6fc]"}`}
            onClick={() => setShowAttachCameraSubmenu((prev) => !prev)}
          >
            <span className="flex items-center gap-2"><Camera size={16} /> Camara</span>
            <span className="text-xs opacity-70">{showAttachCameraSubmenu ? "^" : "v"}</span>
          </motion.button>
          <AnimatePresence>
            {showAttachCameraSubmenu && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
                <motion.button type="button" whileHover={{ x: 2 }} whileTap={{ scale: 0.98 }} className={`mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm ${isDark ? "hover:bg-[#1f2c34]" : "hover:bg-[#eef6fc]"}`} onClick={() => openCameraModal("photo")}>
                  <Camera size={16} /> Tomar foto
                </motion.button>
                <motion.button type="button" whileHover={{ x: 2 }} whileTap={{ scale: 0.98 }} className={`mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm ${isDark ? "hover:bg-[#1f2c34]" : "hover:bg-[#eef6fc]"}`} onClick={() => openCameraModal("video")}>
                  <Camera size={16} /> Grabar video
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    )}
  </AnimatePresence>

  <AnimatePresence mode="wait" initial={false}>
    {hasTextToSend ? (
      <motion.div key="send" whileHover={{ y: -1 }} whileTap={{ scale: 0.92 }} initial={{ opacity: 0, scale: 0.86 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.86 }} transition={{ duration: 0.15 }}>
        <Button type="submit" className="h-11 w-11 rounded-xl bg-[#63c35c] px-0 text-[#08260d] hover:bg-[#7ed877] sm:h-12 sm:w-12 sm:rounded-2xl" disabled={!activeThreadId}>
          <ArrowUp size={sendIconSize} />
        </Button>
      </motion.div>
    ) : voiceState === "idle" ? (
      <motion.div
        key="mic"
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.92 }}
        initial={{ opacity: 0, scale: 0.86 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.86 }}
        transition={{ duration: 0.2 }}
      >
        <Button
          type="button"
          variant="outline"
          className={`h-11 w-11 rounded-xl px-0 sm:h-12 sm:w-12 sm:rounded-2xl ${iconBtn}`}
          onClick={() => { void startVoiceRecording(); }}
          disabled={!activeThreadId}
        >
          <Mic size={actionIconSize} />
        </Button>
      </motion.div>
    ) : (
      <div className="h-11 w-11 sm:h-12 sm:w-12" />
    )}
  </AnimatePresence>
</form>
                {chatError && <p className="mt-2 text-xs text-red-500">{chatError}</p>}
              </footer>

              {showCameraModal && (
                <div className="absolute inset-0 z-30 grid place-items-center bg-black/70 p-4">
                  <div className={`w-full max-w-xl rounded-2xl border p-3 ${isDark ? "border-[#2a3942] bg-[#111b21]" : "border-[#bfd6e8] bg-white"}`}>
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-sm font-semibold">{cameraMode === "photo" ? "Tomar foto" : "Grabar video"}</p>
                      <Button type="button" variant="outline" className={`h-9 rounded-lg px-3 ${iconBtn}`} onClick={closeCameraModal}>
                        <X size={14} className="mr-1" /> Cerrar
                      </Button>
                    </div>

                    <div className="overflow-hidden rounded-xl">
                      {capturedPhoto ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={capturedPhoto} alt="Foto capturada" className="max-h-[380px] w-full object-cover" />
                      ) : capturedVideoUrl ? (
                        <video controls className="max-h-[380px] w-full">
                          <source src={capturedVideoUrl} type={capturedVideoBlob?.type || "video/webm"} />
                        </video>
                      ) : (
                        <Webcam
                          ref={webcamRef}
                          screenshotFormat="image/jpeg"
                          audio={cameraMode === "video"}
                          mirrored={false}
                          className="max-h-[380px] w-full object-cover"
                          videoConstraints={{ facingMode: { ideal: "environment" } }}
                          onUserMediaError={() => setCameraError("No se pudo acceder a la camara. Revisa permisos del navegador.")}
                        />
                      )}
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {cameraMode === "photo" ? (
                        <>
                          <Button type="button" variant="outline" className={`h-10 rounded-xl px-3 ${iconBtn}`} onClick={handleTakePhoto}>
                            <Camera size={16} className="mr-2" /> Capturar
                          </Button>
                          {capturedPhoto && (
                            <>
                              <Button type="button" variant="outline" className={`h-10 rounded-xl px-3 ${iconBtn}`} onClick={() => setCapturedPhoto(null)}>
                                Repetir
                              </Button>
                              <Button type="button" className="h-10 rounded-xl bg-[#63c35c] px-3 text-[#08260d] hover:bg-[#7ed877]" onClick={handleSendCapturedMedia}>
                                Enviar foto
                              </Button>
                            </>
                          )}
                        </>
                      ) : (
                        <>
                          {!cameraRecording ? (
                            <Button type="button" variant="outline" className={`h-10 rounded-xl px-3 ${iconBtn}`} onClick={handleStartVideoRecording}>
                              <Camera size={16} className="mr-2" /> Iniciar grabacion
                            </Button>
                          ) : (
                            <Button type="button" variant="outline" className="h-10 rounded-xl border-red-400 px-3 text-red-400 hover:bg-red-500/10" onClick={handleStopVideoRecording}>
                              <Square size={16} className="mr-2" /> Detener
                            </Button>
                          )}
                          {capturedVideoBlob && !cameraRecording && (
                            <>
                              <Button type="button" variant="outline" className={`h-10 rounded-xl px-3 ${iconBtn}`} onClick={() => { setCapturedVideoBlob(null); if (capturedVideoUrl) URL.revokeObjectURL(capturedVideoUrl); setCapturedVideoUrl(null); }}>
                                Repetir
                              </Button>
                              <Button type="button" className="h-10 rounded-xl bg-[#63c35c] px-3 text-[#08260d] hover:bg-[#7ed877]" onClick={handleSendCapturedMedia}>
                                Enviar video
                              </Button>
                            </>
                          )}
                        </>
                      )}
                    </div>
                    {cameraError && <p className="mt-2 text-xs text-red-500">{cameraError}</p>}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="grid flex-1 place-items-center px-5">
              <div className={`max-w-md rounded-3xl px-8 py-10 text-center ${isDark ? "bg-[#111b21]" : "bg-white shadow-sm"}`}>
                <div className={`mx-auto grid h-20 w-20 place-items-center rounded-2xl ${isDark ? "bg-[#1f2c34] text-[#00a884]" : "bg-[#eaf4fd] text-[#1f8c72]"}`}>
                  <MessageCircle size={34} />
                </div>
                <p className={`mt-4 text-4xl font-black ${isDark ? "text-white" : "text-[#142739]"}`}>Terra Chat</p>
                <p className={`mt-2 text-sm ${isDark ? "text-[#8696a0]" : "text-[#627a8d]"}`}>
                  Selecciona una conversacion desde la columna izquierda para abrir el chat.
                </p>
                <Link href={activeMode === "seller" ? "/seller" : "/buyer"} className={`mt-5 inline-flex items-center gap-2 text-sm font-semibold ${isDark ? "text-[#7ce3c9]" : "text-[#1f8c72]"}`}>
                  <ArrowLeft size={14} /> Volver al panel
                </Link>
              </div>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}


