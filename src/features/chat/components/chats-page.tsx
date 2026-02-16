"use client";

import Link from "next/link";
import { ChangeEvent, CSSProperties, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import EmojiPicker, { EmojiClickData, Theme } from "emoji-picker-react";
import Webcam from "react-webcam";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCheck,
  Clock3,
  FileText,
  ImageIcon,
  MessageCircle,
  Mic,
  Plus,
  Search,
  Send,
  Smile,
  Square,
  Camera,
  X,
} from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { useTheme } from "@/components/providers/theme-provider";
import { useWallet } from "@/components/providers/wallet-provider";
import { Button } from "@/components/ui/button";
import { MARKETPLACE_EVENT } from "@/lib/constants";
import {
  appendFailedThreadMessage,
  ensureBuyerThreadForAsset,
  getAssets,
  getThreadMessages,
  getThreadRoleForUser,
  getUserThreads,
  markThreadMessagesRead,
  sendThreadMessage,
} from "@/lib/marketplace";
import type { ChatMessage } from "@/types/market";

const quickFilters = ["Todos", "No leidos", "Favoritos", "Grupos"];

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
  const webcamRef = useRef<Webcam | null>(null);
  const cameraRecorderRef = useRef<MediaRecorder | null>(null);
  const cameraChunksRef = useRef<Blob[]>([]);

  const [threads, setThreads] = useState<ReturnType<typeof getUserThreads>>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatError, setChatError] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [recording, setRecording] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("Todos");
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showCameraMenu, setShowCameraMenu] = useState(false);
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [cameraMode, setCameraMode] = useState<"photo" | "video">("photo");
  const [cameraRecording, setCameraRecording] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [capturedVideoBlob, setCapturedVideoBlob] = useState<Blob | null>(null);
  const [capturedVideoUrl, setCapturedVideoUrl] = useState<string | null>(null);

  const assetsMap = useMemo(() => new Map(getAssets().map((asset) => [asset.id, asset.title])), []);
  const activeThread = threads.find((thread) => thread.id === activeThreadId) ?? null;
  const activeMessages = activeThreadId ? getThreadMessages(activeThreadId) : [];
  const activeRole = activeThread && user ? getThreadRoleForUser(activeThread, user.id) : null;
  const senderRole = activeRole ?? (activeMode === "seller" ? "seller" : "buyer");

  const syncData = useCallback(() => {
    if (!user) return;

    let preferredThreadId: string | null = null;
    if (assetIdParam && handledAssetIdRef.current !== assetIdParam) {
      handledAssetIdRef.current = assetIdParam;
      const ensuredThread = ensureBuyerThreadForAsset(assetIdParam, user);
      if (!ensuredThread.ok) {
        setChatError(ensuredThread.message);
      } else {
        preferredThreadId = ensuredThread.thread.id;
      }
    }

    const nextThreads = getUserThreads(user.id);
    setThreads(nextThreads);

    if (nextThreads.length === 0) {
      setActiveThreadId(null);
      return;
    }

    setActiveThreadId((current) => {
      if (preferredThreadId && nextThreads.some((thread) => thread.id === preferredThreadId)) return preferredThreadId;
      if (current && nextThreads.some((thread) => thread.id === current)) return current;
      return nextThreads[0].id;
    });
  }, [assetIdParam, user]);

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

    const boot = window.setTimeout(() => syncData(), 0);
    const marketListener = () => syncData();
    const storageListener = (event: StorageEvent) => {
      if (!event.key || event.key.startsWith("terra_capital_")) syncData();
    };

    window.addEventListener(MARKETPLACE_EVENT, marketListener);
    window.addEventListener("storage", storageListener);
    const interval = window.setInterval(syncData, 2000);

    return () => {
      window.clearTimeout(boot);
      window.removeEventListener(MARKETPLACE_EVENT, marketListener);
      window.removeEventListener("storage", storageListener);
      window.clearInterval(interval);
    };
  }, [syncData, user]);

  useEffect(() => {
    if (!activeThreadId || !activeRole) return;
    markThreadMessagesRead(activeThreadId, activeRole);
  }, [activeRole, activeThreadId, activeMessages.length]);

  useEffect(() => {
    return () => {
      mediaRecorderRef.current?.stream.getTracks().forEach((track) => track.stop());
      cameraRecorderRef.current?.stream.getTracks().forEach((track) => track.stop());
      if (capturedVideoUrl) URL.revokeObjectURL(capturedVideoUrl);
    };
  }, [capturedVideoUrl]);

  const term = search.trim().toLowerCase();
  const visibleThreads = threads.filter((thread) => {
    const counterpart = thread.buyerId === user?.id ? thread.sellerName : thread.buyerName;
    const assetTitle = assetsMap.get(thread.assetId) ?? "";
    const termMatch = !term || counterpart.toLowerCase().includes(term) || assetTitle.toLowerCase().includes(term);
    if (!termMatch) return false;
    if (filter === "No leidos") {
      return getThreadMessages(thread.id).some((message) => message.senderRole !== senderRole && message.status !== "read");
    }
    return true;
  });

  const handleSendText = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setChatError("");
    if (!activeThreadId || !user) return;

    const result = sendThreadMessage(activeThreadId, user, senderRole, chatInput, { kind: "text" });
    if (!result.ok) {
      appendFailedThreadMessage(activeThreadId, user, senderRole, chatInput, result.message);
      setChatError(result.message);
      syncData();
      return;
    }

    setChatInput("");
    setShowEmoji(false);
    syncData();
  };

  const sendFileMessage = async (file: File) => {
    if (!activeThreadId || !user) return;
    const dataUrl = await toDataUrl(file);
    const kind = getAttachmentKind(file);
    const result = sendThreadMessage(activeThreadId, user, senderRole, chatInput, {
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
    syncData();
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

  const handleVoiceToggle = async () => {
    if (!activeThreadId || !user) return;
    setChatError("");

    if (recording) {
      mediaRecorderRef.current?.stop();
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setChatError("Tu navegador no soporta notas de voz.");
      return;
    }

    if (!window.isSecureContext) {
      setChatError("Para grabar voz, abre la app en HTTPS o desde localhost.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredTypes = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/webm"];
      const selectedMimeType = preferredTypes.find((entry) => MediaRecorder.isTypeSupported(entry)) ?? "";
      const recorder = selectedMimeType ? new MediaRecorder(stream, { mimeType: selectedMimeType }) : new MediaRecorder(stream);
      voiceChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) voiceChunksRef.current.push(event.data);
      };

      recorder.onstop = async () => {
        const blob = new Blob(voiceChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        voiceChunksRef.current = [];
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);

        if (!activeThreadId || !user) return;
        try {
          const dataUrl = await toDataUrl(blob);
          const result = sendThreadMessage(activeThreadId, user, senderRole, chatInput, {
            kind: "audio",
            attachment: {
              name: `nota-voz-${Date.now()}.webm`,
              mimeType: blob.type || "audio/webm",
              size: blob.size,
              dataUrl,
            },
          });

          if (!result.ok) {
            appendFailedThreadMessage(activeThreadId, user, senderRole, chatInput, result.message);
            setChatError(result.message);
            return;
          }

          setChatInput("");
          syncData();
        } catch {
          appendFailedThreadMessage(activeThreadId, user, senderRole, chatInput, "No se pudo procesar la nota de voz.");
          setChatError("No se pudo enviar la nota de voz.");
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch (error) {
      const mediaError = error as DOMException | undefined;
      if (mediaError?.name === "NotAllowedError") {
        setChatError("Permiso de microfono denegado o bloqueado. Activalo en permisos del navegador.");
        return;
      }
      if (mediaError?.name === "NotFoundError") {
        setChatError("No se detecto ningun microfono en este dispositivo.");
        return;
      }
      setChatError("No se pudo acceder al microfono.");
    }
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

  const openCameraModal = (mode: "photo" | "video") => {
    setShowAttachMenu(false);
    setShowCameraMenu(false);
    setShowEmoji(false);
    setCameraMode(mode);
    setShowCameraModal(true);
    setCameraError("");
    setCapturedPhoto(null);
    setCapturedVideoBlob(null);
    if (capturedVideoUrl) URL.revokeObjectURL(capturedVideoUrl);
    setCapturedVideoUrl(null);
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

  const asideBg = isDark ? "bg-[#111b21] text-[#d1d7db]" : "bg-[#e8f0f6] text-[#1d2733]";
  const headerBg = isDark ? "bg-[#202c33] border-[#2b3942]" : "bg-[#d7e6f3] border-[#bdd4e6]";
  const panelBg = isDark ? "bg-[#0b141a] text-[#e9edef]" : "bg-[#f5fbff] text-[#1c2730]";
  const bubbleIn = isDark ? "bg-[#202c33] text-[#e9edef]" : "bg-[#ddebf7] text-[#22313d]";
  const bubbleOut = isDark ? "bg-[#005c4b] text-[#dff7f0]" : "bg-[#b9f5df] text-[#123c30]";
  const iconBtn = isDark
    ? "border-[#2a3942] bg-[#111b21] text-[#d1d7db] hover:bg-[#1f2c34]"
    : "border-[#bdd4e6] bg-white text-[#1d2733] hover:bg-[#eef6fc]";
  const inputBg = isDark
    ? "border-[#2a3942] bg-[#111b21] text-[#e9edef] placeholder:text-[#8696a0]"
    : "border-[#bdd4e6] bg-white text-[#22313d] placeholder:text-[#6f8294]";
  const emojiPickerStyle = {
    "--epr-bg-color": isDark ? "#111b21" : "#ffffff",
    "--epr-category-label-bg-color": isDark ? "#111b21" : "#ffffff",
    "--epr-hover-bg-color": isDark ? "#1f2c34" : "#eef6fc",
    "--epr-search-input-bg-color": isDark ? "#202c33" : "#f2f8fd",
    "--epr-search-input-text-color": isDark ? "#d1d7db" : "#1d2733",
    "--epr-search-border-color": "transparent",
    "--epr-picker-border-color": "transparent",
    "--epr-scrollbar-track-color": "transparent",
    "--epr-scrollbar-thumb-color": isDark ? "#41535f" : "#aec4d7",
    "--epr-text-color": isDark ? "#d1d7db" : "#1d2733",
  } as CSSProperties;

  return (
    <main className="mx-auto w-full max-w-[1500px] px-3 pb-4 pt-4 sm:px-5 sm:pt-6">
      <section className={`grid min-h-[82vh] gap-0 overflow-hidden rounded-2xl border ${isDark ? "border-[#23323b]" : "border-[#bfd6e8]"} lg:grid-cols-[420px_1fr]`}>
        <aside className={`border-r ${isDark ? "border-[#23323b]" : "border-[#bfd6e8]"} ${asideBg}`}>
          <div className="flex items-center justify-between px-5 pb-3 pt-4">
            <div>
              <p className={`text-3xl font-black tracking-tight ${isDark ? "text-white" : "text-[#102136]"}`}>Terra Chat</p>
              <p className={`text-xs ${isDark ? "text-[#8696a0]" : "text-[#607788]"}`}>Mensajeria de operaciones</p>
            </div>
          </div>

          <div className="px-4 pb-3">
            <label className="relative block">
              <Search size={18} className={`pointer-events-none absolute left-3 top-3 ${isDark ? "text-[#8696a0]" : "text-[#698195]"}`} />
              <input
                className={`h-12 w-full rounded-full border pl-11 pr-3 text-[22px] text-sm ${isDark ? "border-[#2a3942] bg-[#202c33] text-white placeholder:text-[#8696a0]" : "border-[#bfd6e8] bg-white text-[#1c2730] placeholder:text-[#6f8294]"}`}
                placeholder="Buscar chat o iniciar uno nuevo"
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
                  className={`rounded-full border px-4 py-2 text-sm font-semibold ${
                    filter === entry
                      ? isDark ? "border-[#00a884] bg-[#09362f] text-[#7ce3c9]" : "border-[#1f8c72] bg-[#d1f3e8] text-[#116a55]"
                      : isDark ? "border-[#2a3942] bg-transparent text-[#aebac1]" : "border-[#bfd6e8] bg-white text-[#5d7387]"
                  }`}
                >
                  {entry}
                </button>
              ))}
            </div>
          </div>

          <div className="max-h-[calc(82vh-175px)] overflow-y-auto pb-2">
            {visibleThreads.map((thread) => {
              const counterpart = thread.buyerId === user.id ? thread.sellerName : thread.buyerName;
              const subtitle = assetsMap.get(thread.assetId) ?? "Activo";
              const latest = getThreadMessages(thread.id).at(-1);
              const preview = latest ? `${latest.senderId === user.id ? "Tu: " : ""}${latest.text || (latest.kind ?? "Adjunto")}` : "Sin mensajes";
              const isActive = thread.id === activeThreadId;

              return (
                <button
                  key={thread.id}
                  type="button"
                  onClick={() => setActiveThreadId(thread.id)}
                  className={`flex w-full items-start gap-3 border-b px-4 py-3 text-left ${
                    isDark
                      ? `${isActive ? "bg-[#2a3942]" : "hover:bg-[#182229]"} border-[#1f2c34]`
                      : `${isActive ? "bg-[#d8e9f8]" : "hover:bg-[#edf6fd]"} border-[#d6e5f1]`
                  }`}
                >
                  <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-full ${isDark ? "bg-[#2a3942] text-white" : "bg-white text-[#23415a]"}`}>
                    <MessageCircle size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className={`truncate text-lg font-semibold ${isDark ? "text-white" : "text-[#12263a]"}`}>{counterpart}</p>
                      <p className={`text-xs ${isDark ? "text-[#8696a0]" : "text-[#688096]"}`}>{latest ? formatDay(latest.createdAt) : formatDay(thread.updatedAt)}</p>
                    </div>
                    <p className={`truncate text-xs uppercase tracking-[0.12em] ${isDark ? "text-[#00a884]" : "text-[#1b8168]"}`}>{subtitle}</p>
                    <p className={`truncate text-sm ${isDark ? "text-[#aebac1]" : "text-[#5f7487]"}`}>{preview}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <section className={`relative flex min-h-[82vh] flex-col ${panelBg}`}>
          {activeThread ? (
            <>
              <header className={`flex items-center justify-between border-b px-4 py-3 ${headerBg}`}>
                <div className="min-w-0">
                  <p className="truncate text-2xl font-bold">
                    {activeThread.buyerId === user.id ? activeThread.sellerName : activeThread.buyerName}
                  </p>
                  <p className={`truncate text-xs ${isDark ? "text-[#aebac1]" : "text-[#5f7487]"}`}>{assetsMap.get(activeThread.assetId) ?? "Activo tokenizado"}</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className={`h-11 rounded-xl px-3 text-sm font-semibold ${iconBtn}`}
                  onClick={() => setActiveThreadId(null)}
                >
                  <X size={16} className="mr-2" /> Cerrar chat
                </Button>
              </header>

              <div className={`flex-1 overflow-y-auto px-4 py-4 ${isDark ? "bg-[radial-gradient(circle_at_15%_20%,rgba(34,53,62,.45),transparent_40%),radial-gradient(circle_at_80%_75%,rgba(21,32,39,.55),transparent_40%),#0b141a]" : "bg-[radial-gradient(circle_at_15%_20%,rgba(180,210,234,.45),transparent_40%),radial-gradient(circle_at_80%_75%,rgba(210,230,244,.55),transparent_40%),#eef6fc]"}`}>
                <div className="space-y-3">
                  {activeMessages.map((message) => (
                    <article
                      key={message.id}
                      className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm shadow-sm ${message.senderId === user.id ? `ml-auto ${bubbleOut}` : bubbleIn}`}
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
                  ))}
                </div>
              </div>

              <footer className={`border-t p-2 ${headerBg}`}>
                {showEmoji && (
                  <div className="mb-2 flex justify-start">
                    <div className="overflow-hidden rounded-2xl shadow-lg">
                      <EmojiPicker
                        onEmojiClick={handleEmojiPick}
                        lazyLoadEmojis
                        searchDisabled={false}
                        width={340}
                        height={390}
                        previewConfig={{ showPreview: false }}
                        skinTonesDisabled={false}
                        autoFocusSearch={false}
                        theme={isDark ? Theme.DARK : Theme.LIGHT}
                        style={emojiPickerStyle}
                      />
                    </div>
                  </div>
                )}

                <form className="relative flex items-end gap-2" onSubmit={handleSendText}>
                  <input ref={photoVideoInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleFilePick} />
                  <input ref={docsInputRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.txt" className="hidden" onChange={handleFilePick} />

                  <Button
                    type="button"
                    variant="outline"
                    className={`h-12 w-12 rounded-2xl px-0 ${iconBtn}`}
                    onClick={() => {
                      setShowCameraMenu(false);
                      setShowAttachMenu((prev) => !prev);
                    }}
                    disabled={!activeThreadId}
                  >
                    <Plus size={19} />
                  </Button>
                  {showAttachMenu && (
                    <div className={`absolute bottom-14 left-0 z-20 w-56 rounded-2xl border p-2 shadow-xl ${isDark ? "border-[#2a3942] bg-[#111b21]" : "border-[#bfd6e8] bg-white"}`}>
                      <button type="button" className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm ${isDark ? "hover:bg-[#1f2c34]" : "hover:bg-[#eef6fc]"}`} onClick={() => { setShowAttachMenu(false); photoVideoInputRef.current?.click(); }}>
                        <ImageIcon size={16} /> Fotos y videos
                      </button>
                      <button type="button" className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm ${isDark ? "hover:bg-[#1f2c34]" : "hover:bg-[#eef6fc]"}`} onClick={() => { setShowAttachMenu(false); docsInputRef.current?.click(); }}>
                        <FileText size={16} /> Documentos
                      </button>
                    </div>
                  )}

                  <div className="relative">
                    <Button
                      type="button"
                      variant="outline"
                      className={`h-12 w-12 rounded-2xl px-0 ${iconBtn}`}
                      onClick={() => {
                        setShowEmoji(false);
                        setShowCameraMenu((prev) => !prev);
                      }}
                      disabled={!activeThreadId}
                    >
                      <Camera size={18} />
                    </Button>
                    {showCameraMenu && (
                      <div className={`absolute bottom-14 left-0 z-20 w-44 rounded-2xl border p-2 shadow-xl ${isDark ? "border-[#2a3942] bg-[#111b21]" : "border-[#bfd6e8] bg-white"}`}>
                        <button type="button" className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm ${isDark ? "hover:bg-[#1f2c34]" : "hover:bg-[#eef6fc]"}`} onClick={() => openCameraModal("photo")}>
                          <Camera size={16} /> Tomar foto
                        </button>
                        <button type="button" className={`mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm ${isDark ? "hover:bg-[#1f2c34]" : "hover:bg-[#eef6fc]"}`} onClick={() => openCameraModal("video")}>
                          <Camera size={16} /> Grabar video
                        </button>
                      </div>
                    )}
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    className={`h-12 w-12 rounded-2xl px-0 ${iconBtn}`}
                    onClick={() => {
                      setShowAttachMenu(false);
                      setShowCameraMenu(false);
                      setShowEmoji((prev) => !prev);
                    }}
                    disabled={!activeThreadId}
                  >
                    <Smile size={19} />
                  </Button>

                  <textarea
                    className={`max-h-28 min-h-12 flex-1 rounded-3xl border p-3 text-sm ${inputBg}`}
                    placeholder={activeThreadId ? "Escribe un mensaje" : "Selecciona una conversacion"}
                    value={chatInput}
                    onChange={(event) => setChatInput(event.target.value)}
                    disabled={!activeThreadId}
                  />

                  <Button type="button" variant="outline" className={`h-12 w-12 rounded-2xl px-0 ${recording ? "border-red-400 text-red-400" : ""} ${iconBtn}`} onClick={handleVoiceToggle} disabled={!activeThreadId}>
                    {recording ? <Square size={18} /> : <Mic size={19} />}
                  </Button>
                  <Button type="submit" className="h-12 w-12 rounded-2xl bg-[#63c35c] px-0 text-[#08260d] hover:bg-[#7ed877]" disabled={!activeThreadId}>
                    <Send size={17} />
                  </Button>
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

