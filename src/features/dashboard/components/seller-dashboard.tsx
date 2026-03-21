"use client";

import { ChangeEvent, DragEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, CircleCheck, CircleDashed, Eye, ListChecks, MoveDown, MoveUp, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FadeIn } from "@/components/ui/fade-in";
import { MARKETPLACE_EVENT } from "@/lib/constants";
import { formatUSDT } from "@/lib/format";
import { extractFirstUrl, getEmbeddableVideoUrl, getVideoThumbnailUrl, inferRemoteMediaKind, isKnownExternalVideoHost, validateRemoteMediaUrl } from "@/lib/media";
import { createAsset, getSellerAssets, getSellerSalesSummary, syncMarketplace } from "@/lib/marketplace";
import {
  fetchOracleSnapshot,
  verifyAssetEvidence,
  verifyOracleAnchor,
  type AssetVerificationReport,
  type OracleSnapshot,
} from "@/lib/oracle";
import type { AssetCategory, AssetMediaItem } from "@/types/market";

const MAX_MEDIA_SIZE_MB = 25;
type ClipboardMediaResult =
  | { type: "file"; file: File; kind: "image" | "video" }
  | { type: "url"; url: string };

function toDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
    reader.readAsDataURL(file);
  });
}

async function readMediaFromClipboard(): Promise<ClipboardMediaResult> {
  if (navigator.clipboard?.read) {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const mediaTypes = item.types.filter((type) => type.startsWith("image/") || type.startsWith("video/"));
      if (mediaTypes.length > 0) {
        const blob = await item.getType(mediaTypes[0]);
        const kind = mediaTypes[0].startsWith("image/") ? "image" : "video";
        const file = new File([blob], `${kind}-clipboard.${mediaTypes[0].split("/")[1] ?? "bin"}`, { type: mediaTypes[0] });
        return { type: "file", file, kind };
      }
      if (item.types.includes("text/plain")) {
        const textBlob = await item.getType("text/plain");
        const text = await textBlob.text();
        const url = extractFirstUrl(text);
        if (url) return { type: "url", url };
      }
    }
  }

  if (navigator.clipboard?.readText) {
    const rawText = await navigator.clipboard.readText();
    const url = extractFirstUrl(rawText);
    if (url) return { type: "url", url };
  }

  throw new Error("No hay imagen, video ni URL en el clipboard.");
}

export function SellerDashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const sellerVerified = user?.sellerVerificationStatus === "verified";
  const canUseOracle = user?.appRole === "admin";

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<AssetCategory>("cultivo");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [tokenPriceSats, setTokenPriceSats] = useState("");
  const [totalTokens, setTotalTokens] = useState("");
  const [cycleDurationDays, setCycleDurationDays] = useState<30 | 60 | 90>(30);
  const [estimatedApyPct, setEstimatedApyPct] = useState("10.50");
  const [historicalRoiPct, setHistoricalRoiPct] = useState("10.50");
  const [expectedYield, setExpectedYield] = useState("");
  const [proofOfAssetHash, setProofOfAssetHash] = useState("");
  const [externalRefsRaw, setExternalRefsRaw] = useState("");
  const [mediaItems, setMediaItems] = useState<AssetMediaItem[]>([]);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [formMessage, setFormMessage] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
  const [oracleSnapshot, setOracleSnapshot] = useState<OracleSnapshot | null>(null);
  const [oracleError, setOracleError] = useState("");
  const [assetVerification, setAssetVerification] = useState<AssetVerificationReport | null>(null);
  const [verifyingAsset, setVerifyingAsset] = useState(false);
  const [anchorCheckMessage, setAnchorCheckMessage] = useState("");
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);
  const [summary, setSummary] = useState({ soldTokens: 0, grossAmount: 0, operations: 0, publishedAssets: 0 });
  const [touched, setTouched] = useState({
    title: false,
    location: false,
    description: false,
    tokenPriceSats: false,
    totalTokens: false,
    estimatedApyPct: false,
    historicalRoiPct: false,
    expectedYield: false,
    proofOfAssetHash: false,
  });

  const mediaInputRef = useRef<HTMLInputElement | null>(null);

  const syncData = useCallback(async () => {
    if (!user) return;
    try {
      await syncMarketplace(user.id);
      setSummary({
        ...getSellerSalesSummary(user.id),
        publishedAssets: getSellerAssets(user.id).length,
      });
    } catch {
      // keep latest local state
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const boot = window.setTimeout(() => {
      void syncData();
    }, 0);
    const listener = () => {
      void syncData();
    };
    window.addEventListener(MARKETPLACE_EVENT, listener);
    return () => {
      window.clearTimeout(boot);
      window.removeEventListener(MARKETPLACE_EVENT, listener);
    };
  }, [syncData, user]);

  useEffect(() => {
    if (currentStep !== 2 || !canUseOracle) return;
    let active = true;
    void (async () => {
      try {
        const snapshot = await fetchOracleSnapshot(category, location);
        if (!active) return;
        setOracleSnapshot(snapshot);
        setOracleError("");
      } catch (error) {
        if (!active) return;
        setOracleSnapshot(null);
        setOracleError(error instanceof Error ? error.message : "No se pudo cargar el oraculo.");
      }
    })();
    return () => {
      active = false;
    };
  }, [canUseOracle, category, currentStep, location]);

  async function addMediaFile(file: File, kind: "image" | "video") {
    if (file.size > MAX_MEDIA_SIZE_MB * 1024 * 1024) {
      setFormMessage(`El archivo supera ${MAX_MEDIA_SIZE_MB}MB.`);
      return;
    }
    const dataUrl = await toDataUrl(file);
    setMediaItems((prev) => [...prev, { id: crypto.randomUUID(), kind, url: dataUrl }]);
    setFormMessage(`${kind === "image" ? "Imagen" : "Video"} agregado.`);
  }

  function addMediaUrl(rawUrl: string, forcedKind?: "image" | "video") {
    const safeUrl = validateRemoteMediaUrl(rawUrl);
    if (!safeUrl) {
      setFormMessage("La URL no es valida. Usa http:// o https://");
      return false;
    }
    const kind = forcedKind ?? inferRemoteMediaKind(safeUrl);
    if (kind === "video" && isKnownExternalVideoHost(safeUrl) && !getEmbeddableVideoUrl(safeUrl)) {
      setFormMessage("No pude reconocer el link de YouTube/Vimeo. Copia la URL completa del video.");
      return false;
    }
    setMediaItems((prev) => {
      const exists = prev.some((item) => item.kind === kind && item.url === safeUrl);
      if (exists) return prev;
      return [...prev, { id: crypto.randomUUID(), kind, url: safeUrl }];
    });
    setFormMessage(
      kind === "video" && getEmbeddableVideoUrl(safeUrl)
        ? "Video externo agregado (YouTube/Vimeo)."
        : `${kind === "image" ? "Imagen" : "Video"} por URL agregado.`,
    );
    return true;
  }

  const addMediaFromAnyFile = async (file: File) => {
    const kind = file.type.startsWith("video/") ? "video" : file.type.startsWith("image/") ? "image" : null;
    if (!kind) return;
    await addMediaFile(file, kind);
  };

  const handleMediaFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;
    for (const file of files) {
      try {
        await addMediaFromAnyFile(file);
      } catch (error) {
        setFormMessage(error instanceof Error ? error.message : "No se pudo cargar archivo.");
      }
    }
  };

  const pickFromClipboard = async () => {
    try {
      const media = await readMediaFromClipboard();
      if (media.type === "file") {
        await addMediaFile(media.file, media.kind);
      } else {
        addMediaUrl(media.url);
      }
    } catch (error) {
      setFormMessage(
        error instanceof Error
          ? `${error.message} Si tu navegador bloquea lectura directa, presiona Ctrl+V para pegar imagen/video/link.`
          : "No se pudo leer el clipboard. Presiona Ctrl+V para pegar imagen/video/link.",
      );
    }
  };

  const handleMediaDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!sellerVerified || isPublishing) return;
    const files = Array.from(event.dataTransfer.files ?? []).filter((file) => file.type.startsWith("image/") || file.type.startsWith("video/"));
    if (files.length > 0) {
      for (const file of files) {
        try {
          await addMediaFromAnyFile(file);
        } catch (error) {
          setFormMessage(error instanceof Error ? error.message : "No se pudo cargar archivo.");
        }
      }
      return;
    }
    const droppedText = event.dataTransfer.getData("text/uri-list") || event.dataTransfer.getData("text/plain");
    const url = extractFirstUrl(droppedText);
    if (url) {
      addMediaUrl(url);
    }
  };

  useEffect(() => {
    if (currentStep !== 3 || !sellerVerified || isPublishing) return;
    const onPaste = (event: ClipboardEvent) => {
      const items = Array.from(event.clipboardData?.items ?? []);
      const files = items
        .filter((item) => item.kind === "file")
        .map((item) => item.getAsFile())
        .filter((file): file is File => Boolean(file))
        .filter((file) => file.type.startsWith("image/") || file.type.startsWith("video/"));
      if (files.length > 0) {
        event.preventDefault();
        for (const file of files) {
          const kind = file.type.startsWith("video/") ? "video" : file.type.startsWith("image/") ? "image" : null;
          if (!kind) continue;
          void addMediaFile(file, kind);
        }
        return;
      }
      const pastedText = event.clipboardData?.getData("text/plain") ?? "";
      const url = extractFirstUrl(pastedText);
      if (!url) return;
      event.preventDefault();
      addMediaUrl(url);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [currentStep, isPublishing, sellerVerified]);

  const moveMedia = (index: number, direction: -1 | 1) => {
    setMediaItems((prev) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= prev.length) return prev;
      const copy = [...prev];
      const tmp = copy[index];
      copy[index] = copy[nextIndex];
      copy[nextIndex] = tmp;
      return copy;
    });
    setPreviewIndex((prev) => {
      if (prev === index) return index + direction;
      if (prev === index + direction) return index;
      return prev;
    });
  };

  const removeMedia = (index: number) => {
    setMediaItems((prev) => {
      const next = prev.filter((_, idx) => idx !== index);
      setPreviewIndex((current) => Math.max(0, Math.min(current, next.length - 1)));
      return next;
    });
  };

  const previewTotal = useMemo(() => {
    const price = Number(tokenPriceSats);
    const tokens = Number(totalTokens);
    if (!Number.isFinite(price) || !Number.isFinite(tokens)) return 0;
    return Math.max(0, price * tokens);
  }, [tokenPriceSats, totalTokens]);

  const parsedTokenPrice = Number(tokenPriceSats);
  const parsedTotalTokens = Number(totalTokens);

  const liveValidation = useMemo(() => {
    const titleError = title.trim().length >= 6 ? "" : "Minimo 6 caracteres.";
    const locationError = location.trim().length >= 3 ? "" : "Indica una ubicacion valida.";
    const descriptionError = description.trim().length >= 40 ? "" : "Describe el activo con al menos 40 caracteres.";
    const priceError = Number.isFinite(parsedTokenPrice) && parsedTokenPrice > 0 ? "" : "Precio por token debe ser mayor a 0 USDT.";
    const tokensError = Number.isFinite(parsedTotalTokens) && Number.isInteger(parsedTotalTokens) && parsedTotalTokens > 0
      ? ""
      : "Total tokens debe ser entero mayor a 0.";
    const estimatedApyError = Number.isFinite(Number(estimatedApyPct)) && Number(estimatedApyPct) >= 0 ? "" : "APY estimado invalido.";
    const historicalRoiError = Number.isFinite(Number(historicalRoiPct)) && Number(historicalRoiPct) >= 0 ? "" : "ROI historico invalido.";
    const expectedYieldError = expectedYield.trim().length >= 4 ? "" : "Especifica un rendimiento esperado.";
    const proofHashWarning = proofOfAssetHash.trim().length === 0 || proofOfAssetHash.trim().length >= 10
      ? ""
      : "Hash corto: recomendado minimo 10 caracteres.";

    return {
      titleError,
      locationError,
      descriptionError,
      priceError,
      tokensError,
      estimatedApyError,
      historicalRoiError,
      expectedYieldError,
      proofHashWarning,
    };
  }, [description, estimatedApyPct, expectedYield, historicalRoiPct, location, parsedTokenPrice, parsedTotalTokens, proofOfAssetHash, title]);

  const hasBlockingErrors = useMemo(() => {
    return Boolean(
      liveValidation.titleError ||
      liveValidation.locationError ||
      liveValidation.descriptionError ||
      liveValidation.priceError ||
      liveValidation.tokensError ||
      liveValidation.estimatedApyError ||
      liveValidation.historicalRoiError ||
      liveValidation.expectedYieldError,
    );
  }, [liveValidation]);

  const stepStatus = useMemo(() => {
    const step1Done = !liveValidation.titleError && !liveValidation.locationError && !liveValidation.descriptionError;
    const step2Done =
      !liveValidation.priceError &&
      !liveValidation.tokensError &&
      !liveValidation.estimatedApyError &&
      !liveValidation.historicalRoiError &&
      !liveValidation.expectedYieldError;
    const step3Done = mediaItems.length > 0;
    return { step1Done, step2Done, step3Done };
  }, [liveValidation, mediaItems.length]);

  const canGoNext = useMemo(() => {
    if (currentStep === 1) return stepStatus.step1Done;
    if (currentStep === 2) return stepStatus.step2Done;
    if (currentStep === 3) return true;
    return false;
  }, [currentStep, stepStatus]);

  const publishingChecklist = useMemo(() => {
    return [
      { id: "title", label: "Titulo y categoria", done: title.trim().length >= 6 && category.length > 0 },
      { id: "desc", label: "Descripcion productiva", done: description.trim().length >= 40 },
      { id: "pricing", label: "Precio y tokens", done: Number(tokenPriceSats) > 0 && Number(totalTokens) > 0 },
      { id: "yield", label: "Metricas de retorno", done: Number(estimatedApyPct) >= 0 && Number(historicalRoiPct) >= 0 && expectedYield.trim().length > 0 },
      { id: "media", label: "Multimedia cargada", done: mediaItems.length > 0 },
    ];
  }, [category, description, estimatedApyPct, expectedYield, historicalRoiPct, mediaItems.length, title, tokenPriceSats, totalTokens]);

  const checklistCompleted = publishingChecklist.filter((item) => item.done).length;
  const checklistPct = Math.round((checklistCompleted / publishingChecklist.length) * 100);
  const formMessageClassName = formMessage.toLowerCase().includes("correctamente")
    ? "text-emerald-500"
    : formMessage.toLowerCase().includes("no se pudo") || formMessage.toLowerCase().includes("deben")
      ? "text-amber-500"
      : "text-[var(--color-primary)]";

  const previewMedia = mediaItems[previewIndex];
  const previewEmbedUrl = previewMedia?.kind === "video" ? getEmbeddableVideoUrl(previewMedia.url) : null;
  const fieldClassName = "terra-seller-field h-11";
  const labelClassName = "text-sm font-medium text-[var(--color-muted)]";
  const shouldShowError = (fieldTouched: boolean) => submitAttempted || fieldTouched;

  const handleCreateAsset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitAttempted(true);
    if (isPublishing) return;
    setFormMessage("");

    if (!user) return;
    if (!sellerVerified) {
      setFormMessage("Tu modo vendedor esta bloqueado hasta completar verificacion.");
      return;
    }

    const parsedTokenPriceSats = Number(tokenPriceSats);
    const parsedTokens = Number(totalTokens);
    const parsedEstimatedApyBps = Math.round(Number(estimatedApyPct) * 100);
    const parsedHistoricalRoiBps = Math.round(Number(historicalRoiPct) * 100);

    if (Number.isNaN(parsedTokenPriceSats) || Number.isNaN(parsedTokens) || parsedTokenPriceSats <= 0 || parsedTokens <= 0) {
      setFormMessage("Precio en USDT y tokens deben ser mayores a cero.");
      return;
    }
    if (Number.isNaN(parsedEstimatedApyBps) || Number.isNaN(parsedHistoricalRoiBps) || parsedEstimatedApyBps < 0 || parsedHistoricalRoiBps < 0) {
      setFormMessage("APY y ROI historico deben ser porcentajes validos.");
      return;
    }

    try {
      setIsPublishing(true);
      const firstImage = mediaItems.find((item) => item.kind === "image")?.url;
      const firstVideo = mediaItems.find((item) => item.kind === "video")?.url;
      await createAsset(user, {
        title,
        category,
        description,
        location,
        tokenPriceSats: Number(parsedTokenPriceSats.toFixed(2)),
        totalTokens: parsedTokens,
        cycleDurationDays,
        estimatedApyBps: parsedEstimatedApyBps,
        historicalRoiBps: parsedHistoricalRoiBps,
        expectedYield,
        proofOfAssetHash: proofOfAssetHash.trim() || undefined,
        imageUrl: firstImage,
        imageUrls: mediaItems.filter((item) => item.kind === "image").map((item) => item.url),
        videoUrl: firstVideo,
        mediaGallery: mediaItems,
      });
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : "No se pudo guardar el activo.");
      setIsPublishing(false);
      return;
    }

    setTitle("");
    setCategory("cultivo");
    setDescription("");
    setLocation("");
    setTokenPriceSats("");
    setTotalTokens("");
    setCycleDurationDays(30);
    setEstimatedApyPct("10.50");
    setHistoricalRoiPct("10.50");
    setExpectedYield("");
    setProofOfAssetHash("");
    setExternalRefsRaw("");
    setMediaItems([]);
    setPreviewIndex(0);
    setCurrentStep(1);
    setSubmitAttempted(false);
    setTouched({
      title: false,
      location: false,
      description: false,
      tokenPriceSats: false,
      totalTokens: false,
      estimatedApyPct: false,
      historicalRoiPct: false,
      expectedYield: false,
      proofOfAssetHash: false,
    });
    setFormMessage("Activo publicado correctamente.");
    await syncData();
    setIsPublishing(false);
  };

  const markStepTouched = (step: 1 | 2 | 3 | 4) => {
    if (step === 1) {
      setTouched((prev) => ({ ...prev, title: true, location: true, description: true }));
      return;
    }
    if (step === 2) {
      setTouched((prev) => ({
        ...prev,
        tokenPriceSats: true,
        totalTokens: true,
        estimatedApyPct: true,
        historicalRoiPct: true,
        expectedYield: true,
        proofOfAssetHash: true,
      }));
    }
  };

  const goToNextStep = () => {
    if (currentStep >= 4) return;
    if (!canGoNext) {
      markStepTouched(currentStep);
      return;
    }
    setCurrentStep((prev) => (prev < 4 ? ((prev + 1) as 1 | 2 | 3 | 4) : prev));
  };

  const goToPrevStep = () => {
    setCurrentStep((prev) => (prev > 1 ? ((prev - 1) as 1 | 2 | 3 | 4) : prev));
  };

  const applyOracleSuggestion = () => {
    if (!canUseOracle || !oracleSnapshot) return;
    setTokenPriceSats(String(oracleSnapshot.suggestedTokenPriceUsdt));
    setTouched((prev) => ({ ...prev, tokenPriceSats: true }));
    setFormMessage(`Precio sugerido por oraculo aplicado: ${formatUSDT(oracleSnapshot.suggestedTokenPriceUsdt)}.`);
  };

  const runAssetVerification = async () => {
    if (!canUseOracle) {
      setFormMessage("Solo admin puede ejecutar verificacion Oracle.");
      return;
    }
    setFormMessage("");
    setAnchorCheckMessage("");
    setVerifyingAsset(true);
    const externalRefs = externalRefsRaw
      .split(/\r?\n/g)
      .map((row) => row.trim())
      .filter(Boolean);
    try {
      const report = await verifyAssetEvidence({
        title,
        category,
        location,
        description,
        mediaUrls: mediaItems.map((item) => item.url),
        declaredProofHash: proofOfAssetHash,
        externalRefs,
      });
      setAssetVerification(report);
      if (!proofOfAssetHash.trim()) {
        setProofOfAssetHash(report.evidenceHash);
      }
      setFormMessage(`Verificacion completada (${report.verdict}). Integridad: ${report.integrityScore}%.`);
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : "No se pudo verificar evidencia del activo.");
    } finally {
      setVerifyingAsset(false);
    }
  };

  const runAnchorVerification = async () => {
    if (!canUseOracle) {
      setAnchorCheckMessage("Solo admin puede validar anclaje Oracle.");
      return;
    }
    if (!assetVerification?.attestation.anchored.txHash) {
      setAnchorCheckMessage("Esta atestacion no tiene txHash anclado en blockchain.");
      return;
    }
    try {
      const result = await verifyOracleAnchor({
        txHash: assetVerification.attestation.anchored.txHash,
        digest: assetVerification.attestation.digest,
        network: assetVerification.attestation.anchored.network,
      });
      setAnchorCheckMessage(
        result.memoMatches || result.manageDataMatch
          ? "Anclaje validado en Horizon."
          : "No se pudo validar memo/manage_data en la transaccion.",
      );
    } catch (error) {
      setAnchorCheckMessage(error instanceof Error ? error.message : "Fallo validando anclaje on-chain.");
    }
  };

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-5 sm:py-9">
      <FadeIn>
        <div className="terra-seller-shell flex flex-wrap items-center justify-between gap-3 rounded-3xl p-5 sm:p-6">
          <div>
            <p className="terra-badge">Panel de emision</p>
            <h1 className="tc-heading mt-3 text-3xl font-black sm:text-4xl">Panel de emision y tokenizacion</h1>
            <p className="tc-subtitle mt-2 max-w-2xl">Publica ciclos productivos en USDT y ordena tu carrusel multimedia.</p>
          </div>
          <Button variant="secondary" onClick={() => router.push("/seller/assets")}>Ver mis activos publicados</Button>
        </div>
      </FadeIn>

      {!sellerVerified && (
        <section className="mt-5">
          <Card className="terra-seller-panel">
            <p className="text-sm font-semibold text-amber-500">Modo vendedor bloqueado</p>
            <p className="mt-1 text-sm text-[var(--color-muted)]">Completa tu verificacion desde Cuenta para habilitar publicaciones.</p>
          </Card>
        </section>
      )}

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="terra-seller-kpi relative overflow-hidden p-4">
          <p className="text-sm text-[var(--color-muted)]">Activos publicados</p>
          <p className="mt-2 text-2xl font-bold">{summary.publishedAssets}</p>
        </Card>
        <Card className="terra-seller-kpi relative overflow-hidden p-4">
          <p className="text-sm text-[var(--color-muted)]">Operaciones cerradas</p>
          <p className="mt-2 text-2xl font-bold">{summary.operations}</p>
        </Card>
        <Card className="terra-seller-kpi relative overflow-hidden p-4">
          <p className="text-sm text-[var(--color-muted)]">Tokens vendidos</p>
          <p className="mt-2 text-2xl font-bold">{summary.soldTokens.toLocaleString("es-AR")}</p>
        </Card>
        <Card className="terra-seller-kpi relative overflow-hidden p-4">
          <p className="text-sm text-[var(--color-muted)]">Ingresos</p>
          <p className="mt-2 text-2xl font-bold">{formatUSDT(summary.grossAmount)}</p>
        </Card>
      </section>

      <section className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="terra-seller-panel">
          <h2 className="tc-heading flex items-center gap-2 text-xl font-bold"><ListChecks size={18} /> Estado de publicacion</h2>
          <p className="tc-subtitle mt-2 text-sm">Avanza por etapas para crear la publicacion de forma guiada.</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--color-surface-soft)]">
            <div className="h-full rounded-full bg-[linear-gradient(90deg,color-mix(in_oklab,var(--color-primary)_84%,white)_0%,color-mix(in_oklab,var(--color-secondary)_72%,white)_100%)] transition-all" style={{ width: `${checklistPct}%` }} />
          </div>
          <p className="mt-2 text-xs text-[var(--color-muted)]">{checklistCompleted}/{publishingChecklist.length} bloques listos ({checklistPct}%)</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {[
              { step: 1 as const, label: "Datos basicos", done: stepStatus.step1Done },
              { step: 2 as const, label: "Economia", done: stepStatus.step2Done },
              { step: 3 as const, label: "Multimedia", done: stepStatus.step3Done },
              { step: 4 as const, label: "Revision", done: false },
            ].map((item) => (
              <button
                key={item.step}
                type="button"
                onClick={() => setCurrentStep(item.step)}
                className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                  currentStep === item.step
                    ? "border-[var(--color-primary)] bg-[color:color-mix(in_oklab,var(--color-primary)_16%,transparent)]"
                    : "border-[var(--color-border)] bg-[var(--color-surface-soft)] hover:bg-[color:color-mix(in_oklab,var(--color-surface-soft)_82%,white_18%)]"
                }`}
              >
                {item.done ? <CircleCheck size={15} className="text-emerald-500" /> : <CircleDashed size={15} className="text-[var(--color-muted)]" />}
                Paso {item.step}: {item.label}
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-[var(--color-muted)]">Paso actual: {currentStep} de 4</p>
        </Card>
        <Card className="terra-seller-panel">
          <h2 className="tc-heading flex items-center gap-2 text-xl font-bold"><BarChart3 size={18} /> Proyeccion de emision</h2>
          <p className="mt-3 text-sm text-[var(--color-muted)]">Capital objetivo estimado con la configuracion actual:</p>
          <p className="mt-2 text-3xl font-black">{formatUSDT(previewTotal)}</p>
          <p className="mt-3 text-xs text-[var(--color-muted)]">
            Ciclo seleccionado: {cycleDurationDays} dias - APY estimado: {estimatedApyPct || "0.00"}% - ROI historico: {historicalRoiPct || "0.00"}%
          </p>
          <Button variant="secondary" className="mt-4 w-full" onClick={() => router.push("/seller/assets")}>
            Revisar cartera publicada
          </Button>
        </Card>
      </section>

      <section className="mt-7 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="terra-seller-panel">
          <h2 className="tc-heading flex items-center gap-2 text-xl font-bold"><Upload size={18} /> Nueva publicacion</h2>

          <form className="mt-4 grid gap-3" onSubmit={handleCreateAsset}>
            {currentStep === 1 && (
              <>
                <div className="space-y-1">
                  <label className={labelClassName}>Titulo del activo</label>
                  <input className={fieldClassName} placeholder="Ej: Tierra premium en Santa Fe" value={title} onBlur={() => setTouched((prev) => ({ ...prev, title: true }))} onChange={(event) => setTitle(event.target.value)} required disabled={!sellerVerified || isPublishing} />
                  {shouldShowError(touched.title) && liveValidation.titleError && <p className="text-xs text-amber-500">{liveValidation.titleError}</p>}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className={labelClassName}>Categoria</label>
                    <select className={fieldClassName} value={category} onChange={(event) => setCategory(event.target.value as AssetCategory)} disabled={!sellerVerified || isPublishing}>
                      <option value="cultivo">Cultivo</option>
                      <option value="tierra">Tierra</option>
                      <option value="ganaderia">Ganaderia</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className={labelClassName}>Ubicacion</label>
                    <input className={fieldClassName} placeholder="Provincia, pais o zona" value={location} onBlur={() => setTouched((prev) => ({ ...prev, location: true }))} onChange={(event) => setLocation(event.target.value)} required disabled={!sellerVerified || isPublishing} />
                    {shouldShowError(touched.location) && liveValidation.locationError && <p className="text-xs text-amber-500">{liveValidation.locationError}</p>}
                  </div>
                </div>
                <div className="space-y-1">
                  <label className={labelClassName}>Descripcion legal y productiva</label>
                  <textarea className="terra-seller-field h-24 resize-none" placeholder="Resumen del activo, estructura legal y alcance productivo" value={description} onBlur={() => setTouched((prev) => ({ ...prev, description: true }))} onChange={(event) => setDescription(event.target.value)} required disabled={!sellerVerified || isPublishing} />
                  {shouldShowError(touched.description) && liveValidation.descriptionError && <p className="text-xs text-amber-500">{liveValidation.descriptionError}</p>}
                </div>
              </>
            )}

            {currentStep === 2 && (
              <>
                <Card className="terra-seller-panel">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">Oraculo de referencia ({category})</p>
                      <p className="text-xs text-[var(--color-muted)]">Indice de mercado: {oracleSnapshot ? oracleSnapshot.marketIndex.toFixed(2) : "--"}</p>
                    </div>
                    <Button type="button" variant="secondary" onClick={applyOracleSuggestion} disabled={!canUseOracle || !oracleSnapshot || !sellerVerified || isPublishing}>
                      Usar precio sugerido
                    </Button>
                  </div>
                  <p className="mt-2 text-sm text-[var(--color-muted)]">
                    Precio sugerido: <strong className="text-[var(--color-foreground)]">{oracleSnapshot ? formatUSDT(oracleSnapshot.suggestedTokenPriceUsdt) : "--"}</strong>
                  </p>
                  {oracleSnapshot && (
                    <p className="mt-1 text-xs text-[var(--color-muted)]">
                      Base {formatUSDT(Number(oracleSnapshot.basePriceUsdt ?? 0))} x mercado {Number(oracleSnapshot.marketIndex ?? 1).toFixed(2)} x ubicacion {Number(oracleSnapshot.locationFactor ?? 1).toFixed(2)}
                    </p>
                  )}
                  {!canUseOracle && <p className="mt-2 text-xs text-[var(--color-muted)]">Oracle disponible solo para admin.</p>}
                  {canUseOracle && !oracleSnapshot && !oracleError && <p className="mt-2 text-xs text-[var(--color-muted)]">Consultando oraculo...</p>}
                  {oracleError && <p className="mt-2 text-xs text-amber-500">{oracleError}</p>}
                  {oracleSnapshot && (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {oracleSnapshot.feeds.map((feed) => (
                        <p key={feed.id} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-2 text-xs">
                          <strong>{feed.symbol}</strong>: {feed.value.toLocaleString("es-AR")} {feed.unit}
                        </p>
                      ))}
                    </div>
                  )}
                </Card>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className={labelClassName}>Precio por token (USDT)</label>
                    <input type="number" step="0.01" className={fieldClassName} placeholder="Ej: 10.50" value={tokenPriceSats} onBlur={() => setTouched((prev) => ({ ...prev, tokenPriceSats: true }))} onChange={(event) => setTokenPriceSats(event.target.value)} required disabled={!sellerVerified || isPublishing} />
                    {shouldShowError(touched.tokenPriceSats) && liveValidation.priceError && <p className="text-xs text-amber-500">{liveValidation.priceError}</p>}
                  </div>
                  <div className="space-y-1">
                    <label className={labelClassName}>Total tokens</label>
                    <input type="number" className={fieldClassName} placeholder="Ej: 1000" value={totalTokens} onBlur={() => setTouched((prev) => ({ ...prev, totalTokens: true }))} onChange={(event) => setTotalTokens(event.target.value)} required disabled={!sellerVerified || isPublishing} />
                    {shouldShowError(touched.totalTokens) && liveValidation.tokensError && <p className="text-xs text-amber-500">{liveValidation.tokensError}</p>}
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <label className={labelClassName}>Duracion del ciclo</label>
                    <select className={fieldClassName} value={cycleDurationDays} onChange={(event) => setCycleDurationDays(Number(event.target.value) as 30 | 60 | 90)} disabled={!sellerVerified || isPublishing}>
                      <option value={30}>Ciclo 30 dias</option>
                      <option value={60}>Ciclo 60 dias</option>
                      <option value={90}>Ciclo 90 dias</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className={labelClassName}>APY estimado (%)</label>
                    <input type="number" step="0.01" className={fieldClassName} placeholder="Ej: 10.50" value={estimatedApyPct} onBlur={() => setTouched((prev) => ({ ...prev, estimatedApyPct: true }))} onChange={(event) => setEstimatedApyPct(event.target.value)} required disabled={!sellerVerified || isPublishing} />
                    {shouldShowError(touched.estimatedApyPct) && liveValidation.estimatedApyError && <p className="text-xs text-amber-500">{liveValidation.estimatedApyError}</p>}
                  </div>
                  <div className="space-y-1">
                    <label className={labelClassName}>ROI historico (%)</label>
                    <input type="number" step="0.01" className={fieldClassName} placeholder="Ej: 10.50" value={historicalRoiPct} onBlur={() => setTouched((prev) => ({ ...prev, historicalRoiPct: true }))} onChange={(event) => setHistoricalRoiPct(event.target.value)} required disabled={!sellerVerified || isPublishing} />
                    {shouldShowError(touched.historicalRoiPct) && liveValidation.historicalRoiError && <p className="text-xs text-amber-500">{liveValidation.historicalRoiError}</p>}
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className={labelClassName}>Rendimiento esperado (texto)</label>
                    <input className={fieldClassName} placeholder="Ej: 10.5% neto por ciclo" value={expectedYield} onBlur={() => setTouched((prev) => ({ ...prev, expectedYield: true }))} onChange={(event) => setExpectedYield(event.target.value)} required disabled={!sellerVerified || isPublishing} />
                    {shouldShowError(touched.expectedYield) && liveValidation.expectedYieldError && <p className="text-xs text-amber-500">{liveValidation.expectedYieldError}</p>}
                  </div>
                  <div className="space-y-1">
                    <label className={labelClassName}>Hash de prueba del activo (opcional)</label>
                    <input className={fieldClassName} placeholder="Hash documental o de auditoria" value={proofOfAssetHash} onBlur={() => setTouched((prev) => ({ ...prev, proofOfAssetHash: true }))} onChange={(event) => setProofOfAssetHash(event.target.value)} disabled={!sellerVerified || isPublishing} />
                    {shouldShowError(touched.proofOfAssetHash) && liveValidation.proofHashWarning && <p className="text-xs text-[var(--color-muted)]">{liveValidation.proofHashWarning}</p>}
                  </div>
                </div>
                <div className="space-y-1">
                  <label className={labelClassName}>Referencias de registro/catastro (una URL por linea)</label>
                <textarea
                    className="terra-seller-field h-24 resize-none"
                    placeholder="https://registro-pais/expediente/123&#10;https://catastro-pais/ficha/ABC"
                    value={externalRefsRaw}
                    onChange={(event) => setExternalRefsRaw(event.target.value)}
                    disabled={!sellerVerified || isPublishing}
                  />
                </div>
              </>
            )}

            {currentStep === 3 && (
              <>
                <Card className="terra-seller-panel">
                  <p className="text-sm font-semibold">Agregar multimedia (imagenes y videos)</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <Button type="button" variant="outline" className="gap-2" disabled={!sellerVerified || isPublishing} onClick={() => mediaInputRef.current?.click()}><Upload size={15} /> Buscar en PC</Button>
                    <Button type="button" variant="outline" disabled={!sellerVerified || isPublishing} onClick={() => { void pickFromClipboard(); }}>Desde clipboard</Button>
                  </div>
                  <div
                    className="mt-3 min-h-36 rounded-xl border-2 border-dashed border-[var(--color-border)] bg-[var(--color-surface-soft)] p-4 text-sm text-[var(--color-muted)]"
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => { void handleMediaDrop(event); }}
                  >
                    Arrastra y suelta aqui imagenes, videos o links (YouTube/Vimeo/archivo).
                    <br />
                    Tambien puedes usar Ctrl+V para pegar imagen, video o URL directamente.
                  </div>
                  <input ref={mediaInputRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={(event) => { void handleMediaFile(event); }} />
                </Card>
                <Card className="terra-seller-panel">
                  <p className="text-sm font-semibold">Orden del carrusel ({mediaItems.length})</p>
                  <div className="mt-3 space-y-2">
                    {mediaItems.map((item, index) => (
                      <div key={item.id} className="flex items-center justify-between gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-sm">
                        <p className="truncate"><strong>{index + 1}.</strong> {item.kind === "image" ? "Imagen" : "Video"}</p>
                        <div className="flex items-center gap-1">
                          <Button type="button" variant="outline" className="h-8 px-2" onClick={() => moveMedia(index, -1)} disabled={index === 0}><MoveUp size={14} /></Button>
                          <Button type="button" variant="outline" className="h-8 px-2" onClick={() => moveMedia(index, 1)} disabled={index === mediaItems.length - 1}><MoveDown size={14} /></Button>
                          <Button type="button" variant="outline" className="h-8 px-2 text-red-500" onClick={() => removeMedia(index)}><Trash2 size={14} /></Button>
                        </div>
                      </div>
                    ))}
                    {mediaItems.length === 0 && <p className="text-sm text-[var(--color-muted)]">Aun no agregaste contenido multimedia. Puedes continuar, pero se recomienda al menos 1 imagen.</p>}
                  </div>
                </Card>
              </>
            )}

            {currentStep === 4 && (
              <Card className="terra-seller-panel">
                <p className="text-sm font-semibold">Revision final antes de publicar</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <p className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-2 text-sm">Activo: <strong>{title || "Sin titulo"}</strong></p>
                  <p className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-2 text-sm">Categoria: <strong>{category}</strong></p>
                  <p className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-2 text-sm">Ubicacion: <strong>{location || "Pendiente"}</strong></p>
                  <p className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-2 text-sm">Precio token: <strong>{formatUSDT(Number(tokenPriceSats) || 0)}</strong></p>
                  <p className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-2 text-sm">Supply: <strong>{Number(totalTokens || 0).toLocaleString("es-AR")}</strong></p>
                  <p className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-2 text-sm">Meta estimada: <strong>{formatUSDT(previewTotal)}</strong></p>
                  <p className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-2 text-sm">Ciclo: <strong>{cycleDurationDays} dias</strong></p>
                  <p className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-2 text-sm">Multimedia: <strong>{mediaItems.length} items</strong></p>
                </div>
                <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold">Verificacion de evidencia y anclaje blockchain</p>
                    <Button type="button" variant="secondary" onClick={() => { void runAssetVerification(); }} disabled={!canUseOracle || !sellerVerified || isPublishing || verifyingAsset}>
                      {verifyingAsset ? "Verificando..." : "Verificar activo"}
                    </Button>
                  </div>
                  {assetVerification && (
                    <div className="mt-3 space-y-1 text-xs text-[var(--color-muted)]">
                      <p>Veredicto: <strong className="text-[var(--color-foreground)]">{assetVerification.verdict}</strong></p>
                      <p>Integridad: <strong className="text-[var(--color-foreground)]">{assetVerification.integrityScore}%</strong></p>
                      <p>Data quality: <strong className="text-[var(--color-foreground)]">{assetVerification.dataQualityScore}%</strong></p>
                      <p>
                        Registro catastral ({assetVerification.landRegistry.countryCode}):{" "}
                        <strong className="text-[var(--color-foreground)]">{assetVerification.landRegistry.status}</strong>
                      </p>
                      <p>{assetVerification.landRegistry.message}</p>
                      <p className="break-all">Evidence hash: <strong className="text-[var(--color-foreground)]">{assetVerification.evidenceHash}</strong></p>
                      <p className="break-all">Digest: <strong className="text-[var(--color-foreground)]">{assetVerification.attestation.digest}</strong></p>
                      <p>
                        Tx anclaje: <strong className="text-[var(--color-foreground)]">{assetVerification.attestation.anchored.txHash ?? "No anclado"}</strong>
                      </p>
                      <div className="pt-1">
                        <Button
                          type="button"
                          variant="outline"
                          className="h-8"
                          onClick={() => { void runAnchorVerification(); }}
                          disabled={!canUseOracle || !assetVerification.attestation.anchored.txHash}
                        >
                          Validar anclaje on-chain
                        </Button>
                      </div>
                      {anchorCheckMessage && <p>{anchorCheckMessage}</p>}
                    </div>
                  )}
                </div>
              </Card>
            )}

            {formMessage && <p className={`text-sm ${formMessageClassName}`}>{formMessage}</p>}
            <p className="text-xs text-[var(--color-muted)]">
              Recomendacion: agrega al menos una imagen y un hash de respaldo para acelerar verificacion del activo.
            </p>
            {submitAttempted && hasBlockingErrors && (
              <p className="text-xs text-amber-500">
                Completa los campos marcados antes de publicar.
              </p>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              <Button type="button" variant="outline" className="w-full" onClick={goToPrevStep} disabled={currentStep === 1 || isPublishing}>
                Atras
              </Button>
              {currentStep < 4 ? (
                <Button type="button" variant="secondary" className="w-full" onClick={goToNextStep} disabled={!sellerVerified || isPublishing}>
                  Continuar
                </Button>
              ) : (
                <Button type="submit" className="w-full" disabled={!sellerVerified || isPublishing || hasBlockingErrors}>
                  {sellerVerified ? (isPublishing ? "Publicando..." : "Publicar activo") : "Bloqueado por verificacion"}
                </Button>
              )}
            </div>
          </form>
        </Card>

        <Card className="terra-seller-panel">
          <h2 className="tc-heading flex items-center gap-2 text-xl font-bold"><Eye size={18} /> Previsualizacion comprador</h2>
          <p className="tc-subtitle mt-2 text-sm">Carrusel ordenado como se mostrara en la ficha del activo.</p>
          <div className="sticky top-20 z-10 mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-muted)]">Resumen financiero (USDT)</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <p className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm">Precio token: <strong>{formatUSDT(Number(tokenPriceSats) || 0)}</strong></p>
              <p className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm">Supply: <strong>{Number(totalTokens || 0).toLocaleString("es-AR")}</strong></p>
              <p className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm">Meta total: <strong>{formatUSDT(previewTotal)}</strong></p>
              <p className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm">Ciclo: <strong>{cycleDurationDays} dias</strong></p>
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)]">
            <div className="h-56 bg-[var(--color-surface-soft)]">
              {!previewMedia && <div className="grid h-full place-items-center text-sm text-[var(--color-muted)]">Sin multimedia</div>}
              {previewMedia?.kind === "image" && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewMedia.url} alt="Preview" className="h-full w-full object-cover" />
              )}
              {previewMedia?.kind === "video" && (
                previewEmbedUrl ? (
                  <iframe
                    src={previewEmbedUrl}
                    title="Preview video"
                    className="h-full w-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    referrerPolicy="strict-origin-when-cross-origin"
                    allowFullScreen
                  />
                ) : (
                  <video controls className="h-full w-full object-contain" src={previewMedia.url} />
                )
              )}
            </div>
            <div className="flex gap-2 overflow-x-auto border-t border-[var(--color-border)] p-2">
              {mediaItems.map((item, index) => (
                <button key={item.id} type="button" onClick={() => setPreviewIndex(index)} className={`h-20 w-32 shrink-0 overflow-hidden rounded-lg border sm:h-24 sm:w-40 ${index === previewIndex ? "border-[var(--color-primary)]" : "border-[var(--color-border)]"}`}>
                  {item.kind === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.url} alt={`thumb-${index}`} className="h-full w-full object-cover" />
                  ) : (
                    getVideoThumbnailUrl(item.url) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={getVideoThumbnailUrl(item.url) ?? ""} alt={`thumb-video-${index}`} className="h-full w-full object-cover" />
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
            <div className="space-y-2 p-3 text-sm">
              <p className="text-xs uppercase tracking-[0.12em] text-[var(--color-muted)] break-words [overflow-wrap:anywhere]">{category} - {location || "Ubicacion pendiente"}</p>
              <h3 className="tc-heading text-lg font-bold break-words [overflow-wrap:anywhere]">{title || "Titulo del activo"}</h3>
              <p className="text-[var(--color-muted)] break-words [overflow-wrap:anywhere]">{description || "Descripcion del activo para compradores."}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <p className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-2">Precio token: <strong>{formatUSDT(Number(tokenPriceSats) || 0)}</strong></p>
                <p className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-2">Supply: <strong>{Number(totalTokens || 0).toLocaleString("es-AR")}</strong></p>
                <p className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-2">Ciclo: <strong>{cycleDurationDays} dias</strong></p>
                <p className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-2">ROI proyectado: <strong>{historicalRoiPct || "0.00"}%</strong></p>
              </div>
              <p className="text-xs text-[var(--color-muted)]">Meta de recaudacion aproximada: {formatUSDT(previewTotal)}</p>
            </div>
          </div>
        </Card>
      </section>
    </main>
  );
}

