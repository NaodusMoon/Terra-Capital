"use client";

import Link from "next/link";
import { ChangeEvent, ClipboardEvent as ReactClipboardEvent, CSSProperties, FormEvent, PointerEvent as ReactPointerEvent, TouchEvent as ReactTouchEvent, WheelEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  ImagePlus,
  ScanEye,
  Users,
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { useResponsive } from "@/components/providers/responsive-provider";
import { useTheme } from "@/components/providers/theme-provider";
import { useWallet } from "@/components/providers/wallet-provider";
import { Button } from "@/components/ui/button";
import { VoiceNotePlayer } from "@/features/chat/components/voice-note-player";
import { MARKETPLACE_EVENT, STORAGE_KEYS } from "@/lib/constants";
import {
  appendFailedThreadMessage,
  deleteThreadMessages,
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
type MessageContextMenuState = {
  messageId: string;
  x: number;
  y: number;
} | null;

type PendingImageDraft = {
  file: File;
  previewUrl: string;
};

type LightboxState = {
  src: string;
  alt: string;
} | null;

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

function formatLongDay(iso: string) {
  return new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(iso));
}

function StatusIcon({ message }: { message: ChatMessage }) {
  if (message.status === "failed") return <AlertCircle size={13} className="text-red-400" />;
  if (message.status === "read") return <CheckCheck size={13} className="text-sky-400" />;
  if (message.status === "sent") return <CheckCheck size={13} className="opacity-70" />;
  return <Check size={13} className="opacity-60" />;
}

function MessageBody({
  message,
  isOutgoing,
  onImageOpen,
}: {
  message: ChatMessage;
  isOutgoing: boolean;
  onImageOpen: (src: string, alt: string) => void;
}) {
  if (message.deletedForEveryone) {
    return (
      <p className="italic opacity-85">
        {message.deletedForEveryoneBy === message.senderId && isOutgoing ? "Eliminaste este mensaje." : "Se elimino este mensaje."}
      </p>
    );
  }

  const attachment = message.attachment;
  if (!attachment) return <p className="whitespace-pre-wrap">{message.text}</p>;

  if (message.kind === "image") {
    return (
      <div className="space-y-2">
        <button
          type="button"
          className="block w-full overflow-hidden rounded-xl"
          onClick={(event) => {
            event.stopPropagation();
            onImageOpen(attachment.dataUrl, attachment.name);
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={attachment.dataUrl} alt={attachment.name} className="max-h-56 w-full rounded-xl object-cover transition-transform duration-200 hover:scale-[1.01]" />
        </button>
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
      <div className="space-y-2 w-[clamp(180px,62vw,320px)] max-w-full">
        <VoiceNotePlayer audioUrl={attachment.dataUrl} tone={isOutgoing ? "outgoing" : "incoming"} />
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
  const threadIdParam = searchParams.get("threadId");
  const assetIdParam = searchParams.get("assetId");
  const handledThreadIdRef = useRef<string | null>(null);
  const handledAssetIdRef = useRef<string | null>(null);
  const photoVideoInputRef = useRef<HTMLInputElement | null>(null);
  const docsInputRef = useRef<HTMLInputElement | null>(null);
  const messageInputRef = useRef<HTMLTextAreaElement | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const voiceTimerRef = useRef<number | null>(null);
  const voiceRecorderRef = useRef<MediaRecorder | null>(null);
  const voicePreviewBlobRef = useRef<Blob | null>(null);
  const voiceMimeTypeRef = useRef<string>("audio/webm");
  const voiceLiveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const voiceLiveAnimationRef = useRef<number | null>(null);
  const voiceLiveAudioContextRef = useRef<AudioContext | null>(null);
  const voiceLiveAnalyserRef = useRef<AnalyserNode | null>(null);
  const voiceLiveSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const webcamRef = useRef<Webcam | null>(null);
  const cameraRecorderRef = useRef<MediaRecorder | null>(null);
  const cameraChunksRef = useRef<Blob[]>([]);
  const messagesViewportRef = useRef<HTMLDivElement | null>(null);
  const scrollDateHintTimerRef = useRef<number | null>(null);
  const scrollDateHintCandidateTimerRef = useRef<number | null>(null);
  const scrollDateHintCandidateRef = useRef<string | null>(null);
  const messageLongPressTimerRef = useRef<number | null>(null);
  const lightboxPinchStartDistanceRef = useRef<number | null>(null);
  const lightboxPinchStartZoomRef = useRef(1);
  const { isMobile } = useResponsive();

  const [threads, setThreads] = useState<ReturnType<typeof getUserThreads>>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatError, setChatError] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceRecordState>("idle");
  const [voicePreviewBlob, setVoicePreviewBlob] = useState<Blob | null>(null);
  const [voicePreviewUrl, setVoicePreviewUrl] = useState<string | null>(null);
  const [voicePreparingPreview, setVoicePreparingPreview] = useState(false);
  const [voiceSending, setVoiceSending] = useState(false);
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
  const [scrollDateHint, setScrollDateHint] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);
  const [deletingMessages, setDeletingMessages] = useState(false);
  const [messageContextMenu, setMessageContextMenu] = useState<MessageContextMenuState>(null);
  const [pendingImageDraft, setPendingImageDraft] = useState<PendingImageDraft | null>(null);
  const [pendingImageComment, setPendingImageComment] = useState("");
  const [lightbox, setLightbox] = useState<LightboxState>(null);
  const [lightboxZoom, setLightboxZoom] = useState(1);

  const assetsMap = useMemo(() => new Map(assets.map((asset) => [asset.id, asset.title])), [assets]);
  const activeThread = threads.find((thread) => thread.id === activeThreadId) ?? null;
  const activeMessages = activeThreadId ? getThreadMessages(activeThreadId) : [];
  const activeRole = activeThread && user ? getThreadRoleForUser(activeThread, user.id) : null;
  const senderRole = activeRole ?? (activeMode === "seller" ? "seller" : "buyer");
  const mobileThreadOpen = isMobile && Boolean(activeThread);
  const selectedMessages = activeMessages.filter((message) => selectedMessageIds.includes(message.id));

  const canDeleteForEveryone = useCallback((message: ChatMessage) => {
    if (!user) return false;
    if (message.deletedForEveryone) return false;
    if (message.senderId !== user.id) return false;
    if (message.status === "read" || Boolean(message.readAt)) return false;
    return true;
  }, [user]);

  const canBulkDeleteForEveryone = selectedMessages.length > 0 && selectedMessages.every(canDeleteForEveryone);
  const contextMenuMessage = activeMessages.find((message) => message.id === messageContextMenu?.messageId) ?? null;

  const scrollToLatestMessage = useCallback((smooth = false) => {
    const viewport = messagesViewportRef.current;
    if (!viewport) return;
    viewport.scrollTo({ top: viewport.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

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
      if (threadIdParam && handledThreadIdRef.current !== threadIdParam) {
        handledThreadIdRef.current = threadIdParam;
        preferredThreadId = threadIdParam;
      }
      if (assetIdParam && handledAssetIdRef.current !== assetIdParam) {
        handledAssetIdRef.current = assetIdParam;
        const ensuredThread = await ensureBuyerThreadForAsset(assetIdParam, user);
        if (!ensuredThread.ok) {
          setChatError(ensuredThread.message);
        } else {
          preferredThreadId = preferredThreadId ?? ensuredThread.thread.id;
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
  }, [assetIdParam, manuallyClosedChat, threadIdParam, user]);

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
      if (scrollDateHintTimerRef.current) {
        window.clearTimeout(scrollDateHintTimerRef.current);
        scrollDateHintTimerRef.current = null;
      }
      if (scrollDateHintCandidateTimerRef.current) {
        window.clearTimeout(scrollDateHintCandidateTimerRef.current);
        scrollDateHintCandidateTimerRef.current = null;
      }
      if (messageLongPressTimerRef.current) {
        window.clearTimeout(messageLongPressTimerRef.current);
        messageLongPressTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    document.body.classList.add("chat-page-lock");
    return () => document.body.classList.remove("chat-page-lock");
  }, []);

  useEffect(() => {
    return () => {
      if (pendingImageDraft?.previewUrl) {
        URL.revokeObjectURL(pendingImageDraft.previewUrl);
      }
    };
  }, [pendingImageDraft]);

  useEffect(() => {
    if (mobileThreadOpen) {
      document.body.classList.add("chat-thread-open");
    } else {
      document.body.classList.remove("chat-thread-open");
    }
    return () => document.body.classList.remove("chat-thread-open");
  }, [mobileThreadOpen]);

  useEffect(() => {
    if (!activeThreadId) return;
    const id = window.setTimeout(() => scrollToLatestMessage(false), 0);
    return () => window.clearTimeout(id);
  }, [activeThreadId, scrollToLatestMessage]);

  useEffect(() => {
    setSelectionMode(false);
    setSelectedMessageIds([]);
    setMessageContextMenu(null);
    setPendingImageComment("");
    setNextPendingImageDraft(null);
    scrollDateHintCandidateRef.current = null;
    if (scrollDateHintCandidateTimerRef.current) {
      window.clearTimeout(scrollDateHintCandidateTimerRef.current);
      scrollDateHintCandidateTimerRef.current = null;
    }
  }, [activeThreadId]);

  useEffect(() => {
    const closeMenu = () => setMessageContextMenu(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      closeMenu();
      setLightbox(null);
      setLightboxZoom(1);
      if (pendingImageDraft?.previewUrl) {
        URL.revokeObjectURL(pendingImageDraft.previewUrl);
      }
      setPendingImageDraft(null);
      setPendingImageComment("");
    };
    window.addEventListener("click", closeMenu);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [pendingImageDraft]);

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

  const appendLocalOptimisticMessage = (message: ChatMessage) => {
    try {
      const messages = readLocalStorage<ChatMessage[]>(STORAGE_KEYS.chatMessages, []);
      writeLocalStorage(STORAGE_KEYS.chatMessages, [...messages, message]);
    } catch {
      // Ignorar limite de cuota local; backend sigue siendo la fuente principal.
    }
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
    setScrollDateHint(null);
    setSelectionMode(false);
    setSelectedMessageIds([]);
  };

  const handleCloseThread = () => {
    setManuallyClosedChat(true);
    setActiveThreadId(null);
    setShowEmoji(false);
    setShowAttachMenu(false);
    setShowAttachCameraSubmenu(false);
    closeImageDraft();
    setSelectionMode(false);
    setSelectedMessageIds([]);
  };

  const toggleMessageSelection = (messageId: string) => {
    setSelectedMessageIds((current) => (
      current.includes(messageId)
        ? current.filter((id) => id !== messageId)
        : [...current, messageId]
    ));
  };

  const clearSelection = () => {
    setSelectionMode(false);
    setSelectedMessageIds([]);
  };

  const handleDeleteMessageIds = async (messageIds: string[], mode: "me" | "everyone") => {
    if (!activeThreadId || !user || messageIds.length === 0 || deletingMessages) return;
    setDeletingMessages(true);
    setChatError("");
    try {
      const result = await deleteThreadMessages(activeThreadId, user, messageIds, mode);
      if (!result.ok) {
        setChatError(result.message);
        return;
      }
      if (result.notAllowedIds.length > 0 && mode === "everyone") {
        setChatError("Algunos mensajes ya fueron vistos y no se pueden eliminar para todos.");
      }
      clearSelection();
      setMessageContextMenu(null);
      void syncData();
    } finally {
      setDeletingMessages(false);
    }
  };

  const handleDeleteSelectedMessages = async (mode: "me" | "everyone") => {
    await handleDeleteMessageIds(selectedMessageIds, mode);
  };

  const openMessageContextMenu = (messageId: string, x: number, y: number) => {
    setMessageContextMenu({
      messageId,
      x: Math.max(16, Math.min(window.innerWidth - 220, x)),
      y: Math.max(16, Math.min(window.innerHeight - 180, y)),
    });
  };

  const startMessageLongPress = (event: ReactPointerEvent<HTMLElement>, messageId: string) => {
    if (!isMobile || selectionMode) return;
    if (event.pointerType !== "touch" && event.pointerType !== "pen") return;
    if (messageLongPressTimerRef.current) {
      window.clearTimeout(messageLongPressTimerRef.current);
    }
    const { clientX, clientY } = event;
    messageLongPressTimerRef.current = window.setTimeout(() => {
      openMessageContextMenu(messageId, clientX, clientY);
      messageLongPressTimerRef.current = null;
    }, 520);
  };

  const cancelMessageLongPress = () => {
    if (messageLongPressTimerRef.current) {
      window.clearTimeout(messageLongPressTimerRef.current);
      messageLongPressTimerRef.current = null;
    }
  };

  const handleMessagesScroll = () => {
    const viewport = messagesViewportRef.current;
    if (!viewport) return;
    if (voiceState !== "idle") {
      if (scrollDateHintTimerRef.current) {
        window.clearTimeout(scrollDateHintTimerRef.current);
        scrollDateHintTimerRef.current = null;
      }
      setScrollDateHint(null);
      return;
    }
    const nearBottom = viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 20;
    if (nearBottom) {
      if (scrollDateHintTimerRef.current) {
        window.clearTimeout(scrollDateHintTimerRef.current);
        scrollDateHintTimerRef.current = null;
      }
      setScrollDateHint(null);
      return;
    }
    const items = Array.from(viewport.querySelectorAll<HTMLElement>("[data-message-date]"));
    if (items.length === 0) return;
    const viewportTop = viewport.getBoundingClientRect().top;
    const anchorOffset = 56;
    let selectedDate: string | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const element of items) {
      const top = element.getBoundingClientRect().top - viewportTop;
      const distance = Math.abs(top - anchorOffset);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        selectedDate = element.dataset.messageDate ?? null;
      }
    }

    if (!selectedDate) return;

    const commitSelectedDate = () => {
      const dateChanged = selectedDate !== scrollDateHint;
      if (dateChanged) {
        setScrollDateHint(selectedDate);
      }
      if (scrollDateHintTimerRef.current) {
        window.clearTimeout(scrollDateHintTimerRef.current);
      }
      scrollDateHintTimerRef.current = window.setTimeout(() => {
        setScrollDateHint(null);
        scrollDateHintTimerRef.current = null;
      }, 1400);
      scrollDateHintCandidateRef.current = null;
      scrollDateHintCandidateTimerRef.current = null;
    };

    if (!scrollDateHint) {
      commitSelectedDate();
      return;
    }

    if (selectedDate === scrollDateHint) {
      if (scrollDateHintCandidateTimerRef.current) {
        window.clearTimeout(scrollDateHintCandidateTimerRef.current);
        scrollDateHintCandidateTimerRef.current = null;
      }
      scrollDateHintCandidateRef.current = null;
      if (scrollDateHintTimerRef.current) {
        window.clearTimeout(scrollDateHintTimerRef.current);
      }
      scrollDateHintTimerRef.current = window.setTimeout(() => {
        setScrollDateHint(null);
        scrollDateHintTimerRef.current = null;
      }, 1400);
      return;
    }

    if (scrollDateHintCandidateRef.current !== selectedDate) {
      scrollDateHintCandidateRef.current = selectedDate;
      if (scrollDateHintCandidateTimerRef.current) {
        window.clearTimeout(scrollDateHintCandidateTimerRef.current);
      }
      scrollDateHintCandidateTimerRef.current = window.setTimeout(() => {
        commitSelectedDate();
      }, 160);
    }
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

  const setNextPendingImageDraft = (next: PendingImageDraft | null) => {
    setPendingImageDraft((current) => {
      if (current && current.previewUrl !== next?.previewUrl) {
        URL.revokeObjectURL(current.previewUrl);
      }
      return next;
    });
  };

  const openImageDraftFromFile = (file: File) => {
    const previewUrl = URL.createObjectURL(file);
    setPendingImageComment(chatInput);
    setNextPendingImageDraft({ file, previewUrl });
    setShowAttachMenu(false);
    setShowAttachCameraSubmenu(false);
    setShowEmoji(false);
  };

  const closeImageDraft = () => {
    setNextPendingImageDraft(null);
    setPendingImageComment("");
    window.setTimeout(() => messageInputRef.current?.focus(), 0);
  };

  const sendFileMessage = async (file: File, messageText: string) => {
    if (!activeThreadId || !user) return;
    const dataUrl = await toDataUrl(file);
    const kind = getAttachmentKind(file);
    const result = await sendThreadMessage(activeThreadId, user, senderRole, messageText, {
      kind,
      attachment: {
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        dataUrl,
      },
    });
    if (!result.ok) {
      appendFailedThreadMessage(activeThreadId, user, senderRole, messageText, result.message, {
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
    if (file.type.startsWith("image/")) {
      openImageDraftFromFile(file);
      return;
    }
    setChatError("");
    try {
      await sendFileMessage(file, chatInput);
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "No se pudo adjuntar el archivo.");
    }
  };

  const handleSendPendingImage = async () => {
    if (!pendingImageDraft) return;
    setChatError("");
    try {
      await sendFileMessage(pendingImageDraft.file, pendingImageComment);
      setChatInput("");
      closeImageDraft();
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "No se pudo enviar la imagen.");
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
    if (!analyser) {
      if (voiceRecorderRef.current?.state === "recording") {
        voiceLiveAnimationRef.current = window.requestAnimationFrame(drawLiveVoiceVisualization);
      }
      return;
    }
    if (!canvas) {
      if (voiceRecorderRef.current?.state === "recording") {
        voiceLiveAnimationRef.current = window.requestAnimationFrame(drawLiveVoiceVisualization);
      }
      return;
    }
    const data = new Uint8Array(analyser.frequencyBinCount);

    const context = canvas.getContext("2d");
    if (!context) {
      if (voiceRecorderRef.current?.state === "recording") {
        voiceLiveAnimationRef.current = window.requestAnimationFrame(drawLiveVoiceVisualization);
      }
      return;
    }

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
    if (audioContext.state === "suspended") {
      void audioContext.resume();
    }
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

  const rebuildVoicePreviewFromChunks = () => {
    if (voiceChunksRef.current.length === 0) return false;
    const resolvedMimeType = voiceMimeTypeRef.current
      || voiceChunksRef.current[0]?.type
      || "audio/webm";
    const blob = new Blob(voiceChunksRef.current, { type: resolvedMimeType });
    if (blob.size === 0) return false;
    voicePreviewBlobRef.current = blob;
    setVoicePreviewBlob(blob);
    setVoicePreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(blob);
    });
    return true;
  };

  const createVoiceRecorder = (stream: MediaStream) => {
    const candidateMimeTypes = [
      "audio/webm;codecs=opus",
      "audio/ogg;codecs=opus",
      "audio/webm",
      "",
    ];
    const selectedMimeType = candidateMimeTypes.find((candidate) => candidate && MediaRecorder.isTypeSupported(candidate)) ?? "";
    const recorder = selectedMimeType
      ? new MediaRecorder(stream, { mimeType: selectedMimeType, audioBitsPerSecond: 24000 })
      : new MediaRecorder(stream, { audioBitsPerSecond: 24000 });
    voiceMimeTypeRef.current = recorder.mimeType || selectedMimeType || "audio/webm";
    voiceChunksRef.current = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        voiceChunksRef.current.push(event.data);
      }
      if (recorder.state === "paused") {
        const hasPreview = rebuildVoicePreviewFromChunks();
        setVoicePreparingPreview(false);
        if (hasPreview) {
          setVoiceState("paused");
        }
      }
    };

    recorder.onstop = () => {
      stopVoiceRuntime();
      setVoicePreparingPreview(true);
      const hasPreview = rebuildVoicePreviewFromChunks();
      setVoicePreparingPreview(false);
      setVoiceState(hasPreview ? "preview" : "idle");
      if (!hasPreview) setRecordingDuration(0);
    };

    voiceRecorderRef.current = recorder;
    recorder.start(800);
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
      voiceChunksRef.current = [];
      clearVoicePreview();
      setRecordingDuration(0);
      setVoicePreparingPreview(false);
      setVoiceSending(false);
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
      recorder.pause();
      stopVoiceTimer();
      stopLiveVoiceVisualization();
      setVoiceState("paused");
      setVoicePreparingPreview(true);
      recorder.requestData();
      window.setTimeout(() => {
        if (recorder.state !== "paused") return;
        if (voicePreviewBlobRef.current && voicePreviewBlobRef.current.size > 0) {
          setVoicePreparingPreview(false);
          return;
        }
        const hasPreview = rebuildVoicePreviewFromChunks();
        setVoicePreparingPreview(false);
        if (!hasPreview) {
          setChatError("Aun no hay suficiente audio para previsualizar. Continua grabando unos segundos.");
        }
      }, 420);
    }
  };

  const resumeVoiceRecording = () => {
    const recorder = voiceRecorderRef.current;
    const stream = voiceStreamRef.current;
    if (!recorder || !stream) return;
    if (recorder.state === "paused") {
      recorder.resume();
      setVoiceState("recording");
      startLiveVoiceVisualization(stream);
      voiceTimerRef.current = window.setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    }
  };

  const finalizeVoiceRecording = () => {
    const recorder = voiceRecorderRef.current;
    if (!recorder) return;
    if (recorder.state !== "inactive") {
      recorder.stop();
    }
  };

  const deleteVoiceRecording = () => {
    const recorder = voiceRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = null;
      recorder.stop();
    }
    stopVoiceRuntime();
    voiceRecorderRef.current = null;
    voiceChunksRef.current = [];
    voiceMimeTypeRef.current = "audio/webm";
    clearVoicePreview();
    setRecordingDuration(0);
    setVoicePreparingPreview(false);
    setVoiceSending(false);
    setVoiceState("idle");
  };

  const sendVoiceRecording = async () => {
    if (!activeThreadId || !user) return;
    if (voiceState !== "preview" || voicePreparingPreview || voiceSending) return;
    setVoiceSending(true);
    const sourceBlob = voicePreviewBlobRef.current ?? voicePreviewBlob;
    const blob = sourceBlob ?? null;
    if (!blob || blob.size === 0) {
      setChatError("No hay audio para enviar.");
      setVoiceSending(false);
      return;
    }

    let optimisticId: string | null = null;
    try {
      optimisticId = crypto.randomUUID();
      const optimisticAttachmentUrl = voicePreviewUrl ?? URL.createObjectURL(blob);
      appendLocalOptimisticMessage({
        id: optimisticId,
        threadId: activeThreadId,
        senderId: user.id,
        senderName: user.fullName,
        senderRole,
        text: "",
        status: "sending",
        kind: "audio",
        attachment: {
          name: `nota-voz-temp-${Date.now()}`,
          mimeType: blob.type || "audio/webm",
          size: blob.size,
          dataUrl: optimisticAttachmentUrl,
        },
        createdAt: new Date().toISOString(),
      });
      setThreads((current) => [...current]);
      scrollToLatestMessage(true);

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
        if (optimisticId) removeLocalMessage(optimisticId);
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
        setVoiceSending(false);
        return;
      }
      if (optimisticId) removeLocalMessage(optimisticId);
      deleteVoiceRecording();
      void syncData();
    } catch {
      if (optimisticId) removeLocalMessage(optimisticId);
      appendFailedThreadMessage(activeThreadId, user, senderRole, "", "No se pudo procesar la nota de voz.", {
        kind: "audio",
      });
      setChatError("No se pudo enviar la nota de voz.");
    } finally {
      setVoiceSending(false);
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

  const handleComposerPaste = (event: ReactClipboardEvent<HTMLTextAreaElement>) => {
    if (!activeThreadId) return;
    const clipboardItems = Array.from(event.clipboardData.items ?? []);
    const imageItem = clipboardItems.find((item) => item.kind === "file" && item.type.startsWith("image/"));
    if (!imageItem) return;
    const imageFile = imageItem.getAsFile();
    if (!imageFile) return;
    event.preventDefault();
    setChatError("");
    openImageDraftFromFile(imageFile);
  };

  const openLightbox = (src: string, alt: string) => {
    setLightbox({ src, alt });
    setLightboxZoom(1);
  };

  const closeLightbox = () => {
    setLightbox(null);
    setLightboxZoom(1);
  };

  const handleLightboxWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    setLightboxZoom((current) => {
      const delta = event.deltaY > 0 ? -0.12 : 0.12;
      return Math.max(1, Math.min(4, Number((current + delta).toFixed(2))));
    });
  };

  const handleLightboxTouchStart = (event: ReactTouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 2) return;
    const [touchA, touchB] = Array.from(event.touches);
    const distance = Math.hypot(touchB.clientX - touchA.clientX, touchB.clientY - touchA.clientY);
    lightboxPinchStartDistanceRef.current = distance;
    lightboxPinchStartZoomRef.current = lightboxZoom;
  };

  const handleLightboxTouchMove = (event: ReactTouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 2 || !lightboxPinchStartDistanceRef.current) return;
    event.preventDefault();
    const [touchA, touchB] = Array.from(event.touches);
    const distance = Math.hypot(touchB.clientX - touchA.clientX, touchB.clientY - touchA.clientY);
    const baseDistance = lightboxPinchStartDistanceRef.current || distance;
    if (!baseDistance) return;
    const zoomDelta = distance / baseDistance;
    const nextZoom = lightboxPinchStartZoomRef.current * zoomDelta;
    setLightboxZoom(Math.max(1, Math.min(4, Number(nextZoom.toFixed(2)))));
  };

  const handleLightboxTouchEnd = () => {
    lightboxPinchStartDistanceRef.current = null;
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
        await sendFileMessage(photoFile, chatInput);
        closeCameraModal();
        return;
      }

      if (capturedVideoBlob) {
        const videoFile = new File([capturedVideoBlob], `video-chat-${Date.now()}.webm`, { type: capturedVideoBlob.type || "video/webm" });
        await sendFileMessage(videoFile, chatInput);
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
              const preview = latest
                ? latest.deletedForEveryone
                  ? (latest.senderId === user.id ? "Eliminaste este mensaje." : "Se elimino este mensaje.")
                  : `${latest.senderId === user.id ? "Tu: " : ""}${latest.text || (latest.kind ?? "Adjunto")}`
                : "Sin mensajes";
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
                <div className="flex items-center gap-2">
                  {!selectionMode ? (
                    <Button
                      type="button"
                      variant="outline"
                      className={`h-10 rounded-xl px-3 text-sm font-semibold ${iconBtn}`}
                      onClick={() => {
                        setSelectionMode(true);
                        setSelectedMessageIds([]);
                      }}
                    >
                      Seleccionar
                    </Button>
                  ) : (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        className={`h-10 rounded-xl px-3 text-sm font-semibold ${iconBtn}`}
                        onClick={() => { void handleDeleteSelectedMessages("me"); }}
                        disabled={selectedMessageIds.length === 0 || deletingMessages}
                      >
                        {deletingMessages ? "Eliminando..." : "Eliminar para mi"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className={`h-10 rounded-xl px-3 text-sm font-semibold ${iconBtn}`}
                        onClick={() => { void handleDeleteSelectedMessages("everyone"); }}
                        disabled={!canBulkDeleteForEveryone || deletingMessages}
                      >
                        Eliminar para todos
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className={`h-10 rounded-xl px-3 text-sm font-semibold ${iconBtn}`}
                        onClick={clearSelection}
                        disabled={deletingMessages}
                      >
                        Cancelar
                      </Button>
                    </>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    className={`hidden h-11 rounded-xl px-3 text-sm font-semibold lg:inline-flex ${iconBtn}`}
                    onClick={handleCloseThread}
                  >
                    <X size={16} className="mr-2" /> Cerrar chat
                  </Button>
                </div>
              </header>

              <div
                ref={messagesViewportRef}
                onScroll={handleMessagesScroll}
                className={`relative flex-1 overflow-y-auto px-3 py-4 sm:px-4 ${isDark ? "bg-[radial-gradient(circle_at_15%_20%,rgba(34,53,62,.45),transparent_40%),radial-gradient(circle_at_80%_75%,rgba(21,32,39,.55),transparent_40%),#0b141a]" : "bg-[radial-gradient(circle_at_15%_20%,rgba(180,210,234,.45),transparent_40%),radial-gradient(circle_at_80%_75%,rgba(210,230,244,.55),transparent_40%),#eef6fc]"}`}
              >
                {scrollDateHint && (
                  <div className="pointer-events-none sticky top-2 z-20 mx-auto mb-2 w-fit rounded-full bg-black/70 px-3 py-1 text-[11px] font-semibold text-white shadow-sm">
                    {scrollDateHint}
                  </div>
                )}
                <div className="space-y-2.5">
                  <AnimatePresence initial={false}>
                    {activeMessages.map((message) => (
                      (() => {
                        const isSelected = selectedMessageIds.includes(message.id);
                        return (
                      <motion.div
                        key={message.id}
                        data-message-date={formatLongDay(message.createdAt)}
                        initial={{ opacity: 0, y: 8, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -6, scale: 0.98 }}
                        transition={{ duration: 0.16 }}
                        className={`flex ${message.senderId === user.id ? "justify-end" : "justify-start"}`}
                      >
                        <article
                          className={`inline-block rounded-2xl px-3 py-2 text-sm shadow-sm ${
                            message.kind === "audio"
                              ? "w-fit max-w-[82%] sm:max-w-[72%]"
                              : "w-fit max-w-[82%] sm:max-w-[78%]"
                          } ${message.senderId === user.id ? bubbleOut : bubbleIn} ${isSelected ? "ring-2 ring-[#3cc8ff] ring-offset-1 ring-offset-transparent" : ""}`}
                          onContextMenu={(event) => {
                            if (selectionMode) return;
                            event.preventDefault();
                            event.stopPropagation();
                            openMessageContextMenu(message.id, event.clientX, event.clientY);
                          }}
                          onPointerDown={(event) => startMessageLongPress(event, message.id)}
                          onPointerUp={cancelMessageLongPress}
                          onPointerCancel={cancelMessageLongPress}
                          onPointerLeave={cancelMessageLongPress}
                          onClick={() => {
                            if (selectionMode) {
                              toggleMessageSelection(message.id);
                              return;
                            }
                            if (message.status === "failed" && message.senderId === user.id) {
                              setRetryMessageId((current) => (current === message.id ? null : message.id));
                            }
                          }}
                        >
                          {selectionMode && (
                            <div className="mb-1 flex justify-end">
                              <span className={`grid h-4 w-4 place-items-center rounded-full border ${isSelected ? "border-[#3cc8ff] bg-[#3cc8ff]" : "border-current/40 bg-transparent"}`}>
                                {isSelected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                              </span>
                            </div>
                          )}
                          <MessageBody message={message} isOutgoing={message.senderId === user.id} onImageOpen={openLightbox} />
                          <div className="mt-1 flex items-center justify-end gap-1 text-[10px] opacity-75">
                            {!selectionMode && !message.deletedForEveryone && (
                              <button
                                type="button"
                                className="mr-1 rounded px-1 py-0.5 text-[10px] hover:bg-black/10"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setSelectionMode(true);
                                  setSelectedMessageIds([message.id]);
                                }}
                              >
                                Selec.
                              </button>
                            )}
                            <span>{formatTime(message.createdAt)}</span>
                            {message.senderId === user.id && <StatusIcon message={message} />}
                          </div>
                          {message.status === "failed" && message.errorMessage && !message.deletedForEveryone && (
                            <>
                              <p className="mt-1 text-[11px] text-red-400">{message.errorMessage}</p>
                              <p className="mt-1 text-[10px] text-red-300/90">Toca este mensaje para reintentar envio.</p>
                            </>
                          )}
                          {message.status === "failed" && retryMessageId === message.id && !message.deletedForEveryone && (
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
                        );
                      })()
                    ))}
                  </AnimatePresence>
                </div>
              </div>

              <AnimatePresence>
                {messageContextMenu && contextMenuMessage && !selectionMode && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.94, y: 6 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96, y: 4 }}
                    transition={{ duration: 0.14, ease: "easeOut" }}
                    className={`fixed z-50 min-w-[238px] overflow-hidden rounded-2xl border shadow-2xl ${
                      isDark
                        ? "border-[#2d3e48] bg-[#1f2c34]/95 text-[#d9e6ee] backdrop-blur-sm"
                        : "border-[#c9dceb] bg-white/95 text-[#153548] backdrop-blur-sm"
                    }`}
                    style={{ left: `${messageContextMenu.x}px`, top: `${messageContextMenu.y}px` }}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <button
                      type="button"
                      className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium ${isDark ? "hover:bg-[#2a3942]" : "hover:bg-[#ecf5fc]"}`}
                      onClick={() => { void handleDeleteMessageIds([contextMenuMessage.id], "me"); }}
                    >
                      <span>Eliminar para mi</span>
                      <Trash2 size={16} />
                    </button>
                    <div className={`h-px ${isDark ? "bg-[#2d3e48]" : "bg-[#d8e9f5]"}`} />
                    <button
                      type="button"
                      className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium disabled:opacity-45 ${isDark ? "hover:bg-[#2a3942]" : "hover:bg-[#ecf5fc]"}`}
                      onClick={() => { void handleDeleteMessageIds([contextMenuMessage.id], "everyone"); }}
                      disabled={!canDeleteForEveryone(contextMenuMessage)}
                    >
                      <span>Eliminar para todos</span>
                      <Users size={16} />
                    </button>
                    <div className={`h-px ${isDark ? "bg-[#2d3e48]" : "bg-[#d8e9f5]"}`} />
                    <button
                      type="button"
                      className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium ${isDark ? "hover:bg-[#2a3942]" : "hover:bg-[#ecf5fc]"}`}
                      onClick={() => {
                        setSelectionMode(true);
                        setSelectedMessageIds([contextMenuMessage.id]);
                        setMessageContextMenu(null);
                      }}
                    >
                      <span>Seleccionar</span>
                      <ScanEye size={16} />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

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
                      {voicePreparingPreview && <span className="text-[11px] text-[var(--color-muted)]">Procesando audio...</span>}
                      {voiceSending && <span className="text-[11px] text-[var(--color-muted)]">Enviando audio...</span>}
                    </div>
                    <div className="mt-2 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-2 py-2">
                      {voiceState === "recording" && (
                        <canvas ref={voiceLiveCanvasRef} className="h-[38px] w-full" />
                      )}
                      {voiceState === "paused" && (
                        <p className="px-2 py-2 text-[11px] text-[var(--color-muted)]">Pausado. Puedes escuchar y luego reanudar.</p>
                      )}
                      {!voicePreviewBlob && voiceState === "preview" && (
                        <p className="px-2 py-2 text-[11px] text-[var(--color-muted)]">Sin audio disponible.</p>
                      )}
                    </div>
                    {(voiceState === "paused" || voiceState === "preview") && voicePreviewUrl && (
                      <div className="mt-2">
                        <VoiceNotePlayer audioUrl={voicePreviewUrl} tone="incoming" />
                      </div>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {voiceState === "recording" && (
                        <>
                          <Button type="button" variant="outline" className={`h-9 rounded-xl px-3 ${iconBtn}`} onClick={pauseVoiceRecording}>
                            <Pause size={14} className="mr-1" /> Pausar
                          </Button>
                          <Button type="button" variant="outline" className={`h-9 rounded-xl px-3 ${iconBtn}`} onClick={finalizeVoiceRecording} disabled={voicePreparingPreview || voiceSending}>
                            <Square size={14} className="mr-1" /> Terminar
                          </Button>
                        </>
                      )}
                      {voiceState === "paused" && (
                        <>
                          <Button type="button" variant="outline" className={`h-9 rounded-xl px-3 ${iconBtn}`} onClick={resumeVoiceRecording} disabled={voicePreparingPreview || voiceSending}>
                            <Play size={14} className="mr-1" /> Reanudar
                          </Button>
                          <Button type="button" variant="outline" className={`h-9 rounded-xl px-3 ${iconBtn}`} onClick={finalizeVoiceRecording} disabled={voicePreparingPreview || voiceSending}>
                            <Square size={14} className="mr-1" /> Terminar
                          </Button>
                        </>
                      )}
                      {voiceState === "preview" && (
                        <Button type="button" className="h-9 rounded-xl bg-[#63c35c] px-3 text-[#08260d] hover:bg-[#7ed877]" onClick={() => { void sendVoiceRecording(); }} disabled={voicePreparingPreview || voiceSending}>
                          <ArrowUp size={14} className="mr-1" /> {voiceSending ? "Enviando..." : "Enviar audio"}
                        </Button>
                      )}
                      <Button type="button" variant="outline" className="h-9 rounded-xl border-red-400 px-3 text-red-400 hover:bg-red-500/10" onClick={deleteVoiceRecording} disabled={voicePreparingPreview || voiceSending}>
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
      ref={messageInputRef}
      className={`max-h-24 min-h-11 min-w-0 w-full rounded-2xl border p-2.5 text-sm sm:max-h-28 sm:min-h-12 sm:rounded-3xl sm:p-3 ${inputBg}`}
      placeholder={activeThreadId ? "Escribe un mensaje" : "Selecciona una conversacion"}
      value={chatInput}
      onChange={(event) => setChatInput(event.target.value)}
      onPaste={handleComposerPaste}
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
          disabled={!activeThreadId || voicePreparingPreview || voiceSending}
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

              {pendingImageDraft && (
                <div className="absolute inset-0 z-30 grid place-items-center bg-black/72 p-4">
                  <div className={`w-full max-w-xl rounded-2xl border p-3 ${isDark ? "border-[#2a3942] bg-[#111b21]" : "border-[#bfd6e8] bg-white"}`}>
                    <div className="mb-3 flex items-center justify-between">
                      <p className="flex items-center gap-2 text-sm font-semibold"><ImagePlus size={16} /> Imagen lista para enviar</p>
                      <Button type="button" variant="outline" className={`h-9 rounded-lg px-3 ${iconBtn}`} onClick={closeImageDraft}>
                        <X size={14} className="mr-1" /> Cancelar
                      </Button>
                    </div>
                    <div className="overflow-hidden rounded-xl border border-[var(--color-border)]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={pendingImageDraft.previewUrl} alt="Previsualizacion de imagen" className="max-h-[380px] w-full object-contain bg-black/25" />
                    </div>
                    <div className="mt-3">
                      <textarea
                        className={`max-h-24 min-h-12 w-full rounded-xl border p-3 text-sm ${inputBg}`}
                        placeholder="Escribe un comentario opcional"
                        value={pendingImageComment}
                        onChange={(event) => setPendingImageComment(event.target.value)}
                      />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Button type="button" variant="outline" className={`h-10 rounded-xl px-3 ${iconBtn}`} onClick={closeImageDraft}>
                        Descartar
                      </Button>
                      <Button type="button" className="h-10 rounded-xl bg-[#63c35c] px-3 text-[#08260d] hover:bg-[#7ed877]" onClick={() => { void handleSendPendingImage(); }}>
                        <ArrowUp size={16} className="mr-2" /> Enviar imagen
                      </Button>
                    </div>
                  </div>
                </div>
              )}

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

              {lightbox && (
                <div
                  className="absolute inset-0 z-40 bg-black/88"
                  onClick={closeLightbox}
                  onWheel={handleLightboxWheel}
                  onTouchStart={handleLightboxTouchStart}
                  onTouchMove={handleLightboxTouchMove}
                  onTouchEnd={handleLightboxTouchEnd}
                  onTouchCancel={handleLightboxTouchEnd}
                  style={{ touchAction: "none" }}
                >
                  <div className="absolute right-3 top-3 flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 w-9 rounded-full border-white/35 bg-black/45 px-0 text-white hover:bg-black/65"
                      onClick={(event) => {
                        event.stopPropagation();
                        setLightboxZoom((current) => Math.max(1, Number((current - 0.2).toFixed(2))));
                      }}
                    >
                      <ZoomOut size={15} />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 w-9 rounded-full border-white/35 bg-black/45 px-0 text-white hover:bg-black/65"
                      onClick={(event) => {
                        event.stopPropagation();
                        setLightboxZoom((current) => Math.min(4, Number((current + 0.2).toFixed(2))));
                      }}
                    >
                      <ZoomIn size={15} />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 w-9 rounded-full border-white/35 bg-black/45 px-0 text-white hover:bg-black/65"
                      onClick={(event) => {
                        event.stopPropagation();
                        setLightboxZoom(1);
                      }}
                    >
                      <RotateCcw size={15} />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 w-9 rounded-full border-white/35 bg-black/45 px-0 text-white hover:bg-black/65"
                      onClick={(event) => {
                        event.stopPropagation();
                        closeLightbox();
                      }}
                    >
                      <X size={15} />
                    </Button>
                  </div>
                  <div className="grid h-full place-items-center p-5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={lightbox.src}
                      alt={lightbox.alt}
                      className="max-h-full max-w-full object-contain transition-transform duration-150"
                      style={{ transform: `scale(${lightboxZoom})` }}
                      onClick={(event) => event.stopPropagation()}
                    />
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


