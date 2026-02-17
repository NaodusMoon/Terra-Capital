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
  Clock3,
  FileText,
  ImageIcon,
  MessageCircle,
  Mic,
  Plus,
  Search,
  Smile,
  Star,
  Square,
  Camera,
  X,
} from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
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

function toDataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
    reader.readAsDataURL(file);
  });
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

function StatusIcon({ message }: { message: ChatMessage }) {
  if (message.status === "failed") return <AlertCircle size={13} className="text-red-400" />;
  if (message.status === "read") return <CheckCheck size={13} className="text-sky-400" />;
  if (message.status === "sent") return <Check size={13} className="opacity-70" />;
  return <Clock3 size={13} className="opacity-60" />;
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
      <div className="space-y-2">
        <audio controls className="w-full">
          <source src={attachment.dataUrl} type={attachment.mimeType} />
        </audio>
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
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const voiceTimerRef = useRef<number | null>(null);
  const cancelVoiceRef = useRef(false);
  const webcamRef = useRef<Webcam | null>(null);
  const cameraRecorderRef = useRef<MediaRecorder | null>(null);
  const cameraChunksRef = useRef<Blob[]>([]);
  const mediaPermissionCheckedRef = useRef(false);

  const [threads, setThreads] = useState<ReturnType<typeof getUserThreads>>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatError, setChatError] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [recording, setRecording] = useState(false);
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
    if (!activeThreadId) return;
    if (mediaPermissionCheckedRef.current) return;
    if (!window.isSecureContext) return;
    if (!navigator.mediaDevices?.getUserMedia) return;

    const askForMediaPermissions = async () => {
      mediaPermissionCheckedRef.current = true;

      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioStream.getTracks().forEach((track) => track.stop());
      } catch {
        // ignore
      }

      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
        videoStream.getTracks().forEach((track) => track.stop());
      } catch {
        // ignore
      }
    };

    const timer = window.setTimeout(() => {
      void askForMediaPermissions();
    }, 250);

    return () => window.clearTimeout(timer);
  }, [activeThreadId]);

  useEffect(() => {
    return () => {
      if (voiceTimerRef.current) {
        window.clearInterval(voiceTimerRef.current);
        voiceTimerRef.current = null;
      }
      voiceStreamRef.current?.getTracks().forEach((track) => track.stop());
      voiceStreamRef.current = null;
      cameraRecorderRef.current?.stream.getTracks().forEach((track) => track.stop());
      if (capturedVideoUrl) URL.revokeObjectURL(capturedVideoUrl);
    };
  }, [capturedVideoUrl]);

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
      appendFailedThreadMessage(activeThreadId, user, senderRole, chatInput, result.message);
      setChatError(result.message);
      void syncData();
      return;
    }

    setChatInput("");
    setShowEmoji(false);
    void syncData();
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
      appendFailedThreadMessage(activeThreadId, user, senderRole, chatInput, result.message);
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

  const stopVoiceRuntime = () => {
    if (voiceTimerRef.current) {
      window.clearInterval(voiceTimerRef.current);
      voiceTimerRef.current = null;
    }
    voiceStreamRef.current?.getTracks().forEach((track) => track.stop());
    voiceStreamRef.current = null;
  };

  const startVoiceRecording = async () => {
    if (!activeThreadId || !user || hasTextToSend || recording) return;
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
      const preferredTypes = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/webm"];
      const selectedMimeType = preferredTypes.find((entry) => MediaRecorder.isTypeSupported(entry)) ?? "";
      const recorder = selectedMimeType ? new MediaRecorder(stream, { mimeType: selectedMimeType }) : new MediaRecorder(stream);
      voiceChunksRef.current = [];
      cancelVoiceRef.current = false;
      setRecordingDuration(0);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) voiceChunksRef.current.push(event.data);
      };

      recorder.onstop = async () => {
        const blob = new Blob(voiceChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const wasCancelled = cancelVoiceRef.current;
        voiceChunksRef.current = [];
        stopVoiceRuntime();
        setRecording(false);
        setRecordingDuration(0);

        if (wasCancelled || blob.size === 0 || !activeThreadId || !user) return;
        try {
          const dataUrl = await toDataUrl(blob);
          const result = await sendThreadMessage(activeThreadId, user, senderRole, "", {
            kind: "audio",
            attachment: {
              name: `nota-voz-${Date.now()}.webm`,
              mimeType: blob.type || "audio/webm",
              size: blob.size,
              dataUrl,
            },
          });

          if (!result.ok) {
            appendFailedThreadMessage(activeThreadId, user, senderRole, "", result.message);
            setChatError(result.message);
            return;
          }
          void syncData();
        } catch {
          appendFailedThreadMessage(activeThreadId, user, senderRole, "", "No se pudo procesar la nota de voz.");
          setChatError("No se pudo enviar la nota de voz.");
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start(200);
      setRecording(true);
      voiceTimerRef.current = window.setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch (error) {
      stopVoiceRuntime();
      const mediaError = error as DOMException | undefined;
      if (mediaError?.name === "NotAllowedError") {
        setChatError("Permiso de microfono denegado o bloqueado. Activalo en permisos del navegador.");
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

  const stopVoiceRecording = (cancel: boolean) => {
    cancelVoiceRef.current = cancel;
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    if (recorder.state !== "inactive") {
      recorder.stop();
    } else {
      stopVoiceRuntime();
      setRecording(false);
      setRecordingDuration(0);
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
        setCameraError("Permiso de camara denegado o bloqueado. Activalo en permisos del navegador.");
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
        const photoBlob = await fetch(capturedPhoto).then((response) => response.blob());
        const photoFile = new File([photoBlob], `foto-chat-${Date.now()}.jpg`, { type: photoBlob.type || "image/jpeg" });
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
  const emojiPickerWidth = typeof window === "undefined" ? 320 : Math.min(340, window.innerWidth - 24);

  return (
    <main className="mx-auto w-full max-w-[1500px] px-0 pb-[88px] pt-0 sm:px-5 sm:pb-4 sm:pt-6">
      <section className="grid min-h-[calc(100dvh-152px)] gap-0 overflow-hidden rounded-none border border-[var(--color-border)] sm:rounded-2xl md:min-h-[calc(100dvh-64px)] lg:min-h-[82vh] lg:grid-cols-[420px_1fr]">
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

        <section className={`relative ${activeThread ? "flex" : "hidden lg:flex"} min-h-[calc(100dvh-152px)] flex-col ${panelBg} md:min-h-[calc(100dvh-64px)] lg:min-h-[82vh]`}>
          {activeThread ? (
            <>
              <header className={`flex items-center justify-between border-b px-4 py-3 ${headerBg}`}>
                <div className="flex min-w-0 items-center gap-3">
                  <button
                    type="button"
                    className={`grid h-10 w-10 place-items-center rounded-full lg:hidden ${isDark ? "hover:bg-[#1f2c34]" : "hover:bg-[#e8f3fc]"}`}
                    onClick={handleCloseThread}
                    aria-label="Volver a chats"
                  >
                    <ArrowLeft size={19} />
                  </button>
                  <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${isDark ? "bg-[#1f2c34]" : "bg-white text-[#23415a]"}`}>
                    <MessageCircle size={16} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xl font-bold lg:text-2xl">
                      {activeThread.buyerId === user.id ? activeThread.sellerName : activeThread.buyerName}
                    </p>
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
                          className={`inline-block w-fit max-w-[82%] rounded-2xl px-3 py-2 text-sm shadow-sm sm:max-w-[78%] ${message.senderId === user.id ? bubbleOut : bubbleIn}`}
                        >
                          <MessageBody message={message} />
                          <div className="mt-1 flex items-center justify-end gap-1 text-[10px] opacity-75">
                            <span>{formatTime(message.createdAt)}</span>
                            {message.senderId === user.id && <StatusIcon message={message} />}
                          </div>
                          {message.status === "failed" && message.errorMessage && (
                            <p className="mt-1 text-[11px] text-red-400">{message.errorMessage}</p>
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

                {recording && (
                  <div className={`mb-2 flex items-center justify-between rounded-xl border px-3 py-2 text-xs ${iconBtn}`}>
                    <span className="font-semibold text-red-400">Grabando {formatRecordingDuration(recordingDuration)}</span>
                    <button
                      type="button"
                      className="rounded-lg px-2 py-1 text-xs font-semibold hover:bg-red-500/15"
                      onClick={() => stopVoiceRecording(true)}
                    >
                      Cancelar
                    </button>
                  </div>
                )}

                <form className="relative flex items-end gap-2" onSubmit={handleSendText}>
  <input ref={photoVideoInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleFilePick} />
  <input ref={docsInputRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.txt" className="hidden" onChange={handleFilePick} />

  <motion.div whileHover={{ y: -1 }} whileTap={{ scale: 0.92 }}>
                    <Button
                      type="button"
                      variant="outline"
                      className={`h-10 w-10 rounded-xl px-0 sm:h-12 sm:w-12 sm:rounded-2xl ${iconBtn}`}
                      onClick={() => {
                        setShowAttachMenu(false);
                        setShowAttachCameraSubmenu(false);
                        setShowEmoji((prev) => !prev);
                      }}
      disabled={!activeThreadId}
    >
      <Smile size={17} />
    </Button>
  </motion.div>

  <div className="relative flex-1">
    <textarea
      className={`max-h-24 min-h-10 min-w-0 w-full rounded-2xl border p-2.5 text-sm sm:max-h-28 sm:min-h-12 sm:rounded-3xl sm:p-3 ${inputBg}`}
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
        className={`h-10 w-10 rounded-xl px-0 sm:h-12 sm:w-12 sm:rounded-2xl ${iconBtn}`}
        onClick={() => {
          setShowAttachCameraSubmenu(false);
          setShowEmoji(false);
          setShowAttachMenu((prev) => !prev);
        }}
        disabled={!activeThreadId}
      >
        <Plus size={18} />
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
        <Button type="submit" className="h-10 w-10 rounded-xl bg-[#63c35c] px-0 text-[#08260d] hover:bg-[#7ed877] sm:h-12 sm:w-12 sm:rounded-2xl" disabled={!activeThreadId}>
          <ArrowUp size={16} />
        </Button>
      </motion.div>
    ) : (
      <motion.div
        key="mic"
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.92 }}
        initial={{ opacity: 0, scale: 0.86 }}
        animate={recording ? { opacity: 1, scale: [1, 1.06, 1] } : { opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.86 }}
        transition={recording ? { duration: 0.9, repeat: Infinity, ease: "easeInOut" } : { duration: 0.2 }}
      >
        <Button
          type="button"
          variant="outline"
          className={`h-10 w-10 rounded-xl px-0 sm:h-12 sm:w-12 sm:rounded-2xl ${recording ? "border-red-400 text-red-400" : ""} ${iconBtn}`}
          onPointerDown={() => { void startVoiceRecording(); }}
          onPointerUp={() => stopVoiceRecording(false)}
          onPointerLeave={() => { if (recording) stopVoiceRecording(false); }}
          onPointerCancel={() => stopVoiceRecording(true)}
          disabled={!activeThreadId}
        >
          {recording ? <Square size={17} /> : <Mic size={17} />}
        </Button>
      </motion.div>
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


