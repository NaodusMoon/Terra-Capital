"use client";

import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MoveDown, MoveUp, Trash2, Upload } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MARKETPLACE_EVENT } from "@/lib/constants";
import { formatShortDate, formatUSDT } from "@/lib/format";
import { extractFirstUrl, getEmbeddableVideoUrl, inferRemoteMediaKind, isKnownExternalVideoHost, validateRemoteMediaUrl } from "@/lib/media";
import { deleteAsset, getPurchases, getSellerAssets, syncMarketplace, updateAsset } from "@/lib/marketplace";
import { AssetMediaViewer } from "@/features/marketplace/components/asset-media-viewer";
import type { AssetCategory, AssetMediaItem } from "@/types/market";

type ChartPoint = {
  label: string;
  value: number;
};

type BuyerSummary = {
  buyerId: string;
  buyerName: string;
  operations: number;
  tokens: number;
  totalPaid: number;
  avgTicket: number;
  lastPurchaseAt: string;
};

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
    const text = await navigator.clipboard.readText();
    const url = extractFirstUrl(text);
    if (url) return { type: "url", url };
  }
  throw new Error("No hay imagen, video ni URL en el clipboard.");
}

function LineChart({ data }: { data: ChartPoint[] }) {
  const maxValue = Math.max(1, ...data.map((point) => point.value));
  const points = data
    .map((point, index) => {
      const x = data.length <= 1 ? 6 : 6 + (index * 88) / Math.max(1, data.length - 1);
      const y = 94 - (point.value / maxValue) * 88;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox="0 0 100 100" className="h-44 w-full rounded-xl bg-[var(--color-surface-soft)] p-2">
      <line x1="6" y1="94" x2="96" y2="94" className="stroke-[var(--color-border)]" strokeWidth="1" />
      <polyline fill="none" points={points} stroke="var(--color-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {data.map((point, index) => {
        const x = data.length <= 1 ? 6 : 6 + (index * 88) / Math.max(1, data.length - 1);
        const y = 94 - (point.value / maxValue) * 88;
        return <circle key={`${point.label}-${index}`} cx={x} cy={y} r="2.2" fill="var(--color-primary)" />;
      })}
    </svg>
  );
}

function BarsChart({ data }: { data: ChartPoint[] }) {
  const maxValue = Math.max(1, ...data.map((point) => point.value));
  return (
    <div className="grid h-44 grid-cols-5 items-end gap-2 rounded-xl bg-[var(--color-surface-soft)] p-3">
      {data.map((point, index) => {
        const pct = (point.value / maxValue) * 100;
        return (
          <div key={`${point.label}-${index}`} className="flex h-full flex-col justify-end">
            <div className="rounded-md bg-[var(--color-primary)]/85" style={{ height: `${Math.max(6, pct)}%` }} title={`${point.label}: ${point.value.toLocaleString("es-AR")}`} />
            <p className="mt-1 truncate text-center text-[10px] text-[var(--color-muted)]">{point.label}</p>
          </div>
        );
      })}
    </div>
  );
}

export function SellerAssetDetailPage({ assetId }: { assetId: string }) {
  const { user } = useAuth();
  const router = useRouter();
  const [revision, setRevision] = useState(0);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<AssetCategory>("cultivo");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [tokenPrice, setTokenPrice] = useState("");
  const [totalTokens, setTotalTokens] = useState("");
  const [cycleDurationDays, setCycleDurationDays] = useState<30 | 60 | 90>(30);
  const [estimatedApyPct, setEstimatedApyPct] = useState("0");
  const [historicalRoiPct, setHistoricalRoiPct] = useState("0");
  const [expectedYield, setExpectedYield] = useState("");
  const [proofOfAssetHash, setProofOfAssetHash] = useState("");
  const [mediaItems, setMediaItems] = useState<AssetMediaItem[]>([]);
  const mediaInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!user) return;
    const sync = async () => {
      try {
        await syncMarketplace(user.id);
      } catch {}
      setRevision((prev) => prev + 1);
    };
    void sync();
    const listener = () => setRevision((prev) => prev + 1);
    window.addEventListener(MARKETPLACE_EVENT, listener);
    return () => window.removeEventListener(MARKETPLACE_EVENT, listener);
  }, [user]);

  const data = useMemo(() => {
    if (!user) return null;
    if (revision < 0) return null;

    const sellerAssets = getSellerAssets(user.id);
    const asset = sellerAssets.find((row) => row.id === assetId);
    if (!asset) return null;

    const allSales = getPurchases().filter((row) => row.sellerId === user.id);
    const sales = allSales
      .filter((row) => row.assetId === assetId)
      .sort((a, b) => +new Date(a.purchasedAt) - +new Date(b.purchasedAt));

    const soldTokens = sales.reduce((sum, row) => sum + row.quantity, 0);
    const grossAmount = sales.reduce((sum, row) => sum + row.totalPaid, 0);
    const fillPct = (soldTokens / Math.max(1, asset.totalTokens)) * 100;

    const buyersMap = new Map<string, BuyerSummary>();
    for (const sale of sales) {
      const current = buyersMap.get(sale.buyerId) ?? {
        buyerId: sale.buyerId,
        buyerName: sale.buyerName,
        operations: 0,
        tokens: 0,
        totalPaid: 0,
        avgTicket: 0,
        lastPurchaseAt: sale.purchasedAt,
      };
      current.operations += 1;
      current.tokens += sale.quantity;
      current.totalPaid += sale.totalPaid;
      if (+new Date(sale.purchasedAt) > +new Date(current.lastPurchaseAt)) {
        current.lastPurchaseAt = sale.purchasedAt;
      }
      buyersMap.set(sale.buyerId, current);
    }

    const buyers = Array.from(buyersMap.values())
      .map((buyer) => ({
        ...buyer,
        avgTicket: buyer.totalPaid / Math.max(1, buyer.operations),
      }))
      .sort((a, b) => b.totalPaid - a.totalPaid);

    const uniqueBuyers = buyers.length;
    const topBuyersBars = buyers.slice(0, 5).map((buyer, idx) => ({
      label: buyer.buyerName.split(" ")[0] || `B${idx + 1}`,
      value: buyer.totalPaid,
    }));

    let cumulativeIncome = 0;
    const incomeTrend = sales.map((sale, index) => {
      cumulativeIncome += sale.totalPaid;
      return {
        label: `${index + 1}`,
        value: cumulativeIncome,
      };
    });

    const salesVolumeBars = sales.slice(-5).map((sale) => ({
      label: new Date(sale.purchasedAt).toLocaleDateString("es-AR", { month: "short", day: "numeric" }),
      value: sale.quantity,
    }));

    const specificCurrentGain = Math.max(0, asset.currentYieldAccruedSats ?? 0);
    const specificProjectedGain = typeof asset.netProfitSats === "number"
      ? Math.max(0, asset.netProfitSats)
      : Math.max(0, (grossAmount * (asset.estimatedApyBps / 10000) * asset.cycleDurationDays) / 365);

    const soldPrincipalByAsset = new Map<string, number>();
    for (const sale of allSales) {
      soldPrincipalByAsset.set(sale.assetId, (soldPrincipalByAsset.get(sale.assetId) ?? 0) + sale.totalPaid);
    }

    const generalGross = allSales.reduce((sum, row) => sum + row.totalPaid, 0);
    const generalCurrentGain = sellerAssets.reduce((sum, row) => sum + Math.max(0, row.currentYieldAccruedSats ?? 0), 0);
    const generalProjectedGain = sellerAssets.reduce((sum, row) => {
      if (typeof row.netProfitSats === "number") return sum + Math.max(0, row.netProfitSats);
      const principal = soldPrincipalByAsset.get(row.id) ?? 0;
      const estimate = (principal * (row.estimatedApyBps / 10000) * row.cycleDurationDays) / 365;
      return sum + Math.max(0, estimate);
    }, 0);

    const specificMarginPct = (specificCurrentGain / Math.max(1, grossAmount)) * 100;
    const generalMarginPct = (generalCurrentGain / Math.max(1, generalGross)) * 100;

    return {
      asset,
      sales,
      soldTokens,
      grossAmount,
      uniqueBuyers,
      fillPct,
      buyers,
      topBuyersBars,
      incomeTrend,
      salesVolumeBars,
      specificCurrentGain,
      specificProjectedGain,
      specificMarginPct,
      generalGross,
      generalCurrentGain,
      generalProjectedGain,
      generalMarginPct,
    };
  }, [assetId, revision, user]);

  useEffect(() => {
    if (!data || editOpen) return;
    setTitle(data.asset.title);
    setCategory(data.asset.category);
    setDescription(data.asset.description);
    setLocation(data.asset.location);
    setTokenPrice(String(data.asset.tokenPriceSats));
    setTotalTokens(String(data.asset.totalTokens));
    setCycleDurationDays(data.asset.cycleDurationDays);
    setEstimatedApyPct((data.asset.estimatedApyBps / 100).toFixed(2));
    setHistoricalRoiPct((data.asset.historicalRoiBps / 100).toFixed(2));
    setExpectedYield(data.asset.expectedYield);
    setProofOfAssetHash(data.asset.proofOfAssetHash);
    const fallbackGallery = data.asset.mediaGallery && data.asset.mediaGallery.length > 0
      ? data.asset.mediaGallery
      : [
        ...(data.asset.imageUrl ? [{ id: "legacy-image", kind: "image" as const, url: data.asset.imageUrl }] : []),
        ...((data.asset.imageUrls ?? []).map((url, idx) => ({ id: `legacy-gallery-${idx}`, kind: "image" as const, url }))),
        ...(data.asset.videoUrl ? [{ id: "legacy-video", kind: "video" as const, url: data.asset.videoUrl }] : []),
      ];
    setMediaItems(fallbackGallery);
  }, [data, editOpen]);

  async function addMediaFile(file: File, kind: "image" | "video") {
    if (file.size > MAX_MEDIA_SIZE_MB * 1024 * 1024) {
      setActionMessage(`El archivo supera ${MAX_MEDIA_SIZE_MB}MB.`);
      return;
    }
    const dataUrl = await toDataUrl(file);
    setMediaItems((prev) => [...prev, { id: crypto.randomUUID(), kind, url: dataUrl }]);
    setActionMessage(`${kind === "image" ? "Imagen" : "Video"} agregado.`);
  }

  function addMediaUrl(rawUrl: string, forcedKind?: "image" | "video") {
    const safeUrl = validateRemoteMediaUrl(rawUrl);
    if (!safeUrl) {
      setActionMessage("La URL no es valida. Usa http:// o https://");
      return false;
    }
    const kind = forcedKind ?? inferRemoteMediaKind(safeUrl);
    if (kind === "video" && isKnownExternalVideoHost(safeUrl) && !getEmbeddableVideoUrl(safeUrl)) {
      setActionMessage("No pude reconocer el link de YouTube/Vimeo. Copia la URL completa del video.");
      return false;
    }
    setMediaItems((prev) => {
      const exists = prev.some((item) => item.kind === kind && item.url === safeUrl);
      if (exists) return prev;
      return [...prev, { id: crypto.randomUUID(), kind, url: safeUrl }];
    });
    setActionMessage(
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
        setActionMessage(error instanceof Error ? error.message : "No se pudo cargar archivo.");
      }
    }
  };

  const handleMediaDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (saving) return;
    const files = Array.from(event.dataTransfer.files ?? []).filter((file) => file.type.startsWith("image/") || file.type.startsWith("video/"));
    if (files.length > 0) {
      for (const file of files) {
        try {
          await addMediaFromAnyFile(file);
        } catch (error) {
          setActionMessage(error instanceof Error ? error.message : "No se pudo cargar archivo.");
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

  const pickFromClipboard = async () => {
    try {
      const media = await readMediaFromClipboard();
      if (media.type === "file") {
        await addMediaFile(media.file, media.kind);
      } else {
        addMediaUrl(media.url);
      }
    } catch (error) {
      setActionMessage(
        error instanceof Error
          ? `${error.message} Si tu navegador bloquea lectura directa, presiona Ctrl+V para pegar imagen/video/link.`
          : "No se pudo leer el clipboard. Presiona Ctrl+V para pegar imagen/video/link.",
      );
    }
  };

  useEffect(() => {
    if (!editOpen || saving) return;
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
  }, [editOpen, saving]);

  const moveMedia = (index: number, direction: -1 | 1) => {
    setMediaItems((prev) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= prev.length) return prev;
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[nextIndex];
      copy[nextIndex] = temp;
      return copy;
    });
  };

  const removeMedia = (index: number) => {
    setMediaItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSave = async () => {
    if (!user || !data) return;
    setActionMessage("");
    const parsedTokenPrice = Number(tokenPrice);
    const parsedTotalTokens = Math.floor(Number(totalTokens));
    const parsedEstimatedApyBps = Math.round(Number(estimatedApyPct) * 100);
    const parsedHistoricalRoiBps = Math.round(Number(historicalRoiPct) * 100);

    if (!Number.isFinite(parsedTokenPrice) || parsedTokenPrice <= 0 || !Number.isFinite(parsedTotalTokens) || parsedTotalTokens <= 0) {
      setActionMessage("Precio y total de tokens deben ser mayores a cero.");
      return;
    }
    if (!Number.isFinite(parsedEstimatedApyBps) || parsedEstimatedApyBps < 0 || !Number.isFinite(parsedHistoricalRoiBps) || parsedHistoricalRoiBps < 0) {
      setActionMessage("APY y ROI historico deben ser validos.");
      return;
    }

    setSaving(true);
    try {
      const firstImage = mediaItems.find((item) => item.kind === "image")?.url;
      const firstVideo = mediaItems.find((item) => item.kind === "video")?.url;
      await updateAsset(user, data.asset.id, {
        title,
        category,
        description,
        location,
        tokenPriceSats: parsedTokenPrice,
        totalTokens: parsedTotalTokens,
        cycleDurationDays,
        estimatedApyBps: parsedEstimatedApyBps,
        historicalRoiBps: parsedHistoricalRoiBps,
        expectedYield,
        proofOfAssetHash,
        imageUrl: firstImage,
        imageUrls: mediaItems.filter((item) => item.kind === "image").map((item) => item.url),
        videoUrl: firstVideo,
        mediaGallery: mediaItems,
      });
      setActionMessage("Activo actualizado correctamente.");
      setEditOpen(false);
      setRevision((prev) => prev + 1);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "No se pudo guardar cambios.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!user || !data) return;
    const confirmed = window.confirm("¿Seguro que deseas eliminar este activo? Si tiene compras no se podra eliminar.");
    if (!confirmed) return;
    setSaving(true);
    setActionMessage("");
    try {
      const result = await deleteAsset(user, data.asset.id);
      if (!result.ok) {
        setActionMessage(result.message);
        return;
      }
      router.push("/seller/assets");
    } finally {
      setSaving(false);
    }
  };

  if (!data) {
    return (
      <main className="mx-auto grid min-h-[60vh] w-full max-w-6xl place-items-center px-4 text-center">
        <div>
          <p className="text-sm text-[var(--color-muted)]">No encontramos ese activo en tus publicaciones.</p>
          <Button className="mt-3" onClick={() => router.push("/seller/assets")}>Volver</Button>
        </div>
      </main>
    );
  }

  const assetMedia = data.asset.mediaGallery && data.asset.mediaGallery.length > 0
    ? data.asset.mediaGallery
    : [
      ...(data.asset.imageUrl ? [{ id: "legacy-image", kind: "image" as const, url: data.asset.imageUrl }] : []),
      ...((data.asset.imageUrls ?? []).map((url, idx) => ({ id: `legacy-gallery-${idx}`, kind: "image" as const, url }))),
      ...(data.asset.videoUrl ? [{ id: "legacy-video", kind: "video" as const, url: data.asset.videoUrl }] : []),
    ];

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-5 sm:py-9">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="tc-heading text-2xl font-black sm:text-3xl">{data.asset.title}</h1>
          <p className="tc-subtitle mt-1 text-sm">Metricas completas de publicacion para vendedor.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button className="bg-[#c4a037] text-[#1f2328] hover:brightness-110" onClick={() => setEditOpen((prev) => !prev)}>{editOpen ? "Cerrar edicion" : "Editar activo"}</Button>
          <Button variant="outline" className="border-red-500 text-red-500 hover:bg-red-500/10" onClick={handleDelete} disabled={saving}>Eliminar activo</Button>
          <Button variant="outline" onClick={() => router.push("/seller/assets")}>Volver</Button>
        </div>
      </div>

      {actionMessage && (
        <section className="mt-4">
          <Card>
            <p className="text-sm text-[var(--color-muted)]">{actionMessage}</p>
          </Card>
        </section>
      )}

      {editOpen && (
        <section className="mt-6">
          <Card>
            <h2 className="tc-heading text-lg font-bold">Editar activo publicado</h2>
            <div className="mt-4 grid gap-3">
              <input className="h-11 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Titulo" />
              <div className="grid gap-3 sm:grid-cols-2">
                <select className="h-11 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3" value={category} onChange={(event) => setCategory(event.target.value as AssetCategory)}>
                  <option value="cultivo">Cultivo</option>
                  <option value="tierra">Tierra</option>
                  <option value="ganaderia">Ganaderia</option>
                </select>
                <input className="h-11 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3" value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Ubicacion" />
              </div>
              <textarea className="h-24 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-3" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Descripcion" />
              <div className="grid gap-3 sm:grid-cols-2">
                <input type="number" step="0.01" className="h-11 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3" value={tokenPrice} onChange={(event) => setTokenPrice(event.target.value)} placeholder="Precio token (USDT)" />
                <input type="number" className="h-11 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3" value={totalTokens} onChange={(event) => setTotalTokens(event.target.value)} placeholder="Total tokens" />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <select className="h-11 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3" value={cycleDurationDays} onChange={(event) => setCycleDurationDays(Number(event.target.value) as 30 | 60 | 90)}>
                  <option value={30}>Ciclo 30 dias</option>
                  <option value={60}>Ciclo 60 dias</option>
                  <option value={90}>Ciclo 90 dias</option>
                </select>
                <input type="number" step="0.01" className="h-11 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3" value={estimatedApyPct} onChange={(event) => setEstimatedApyPct(event.target.value)} placeholder="APY estimado (%)" />
                <input type="number" step="0.01" className="h-11 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3" value={historicalRoiPct} onChange={(event) => setHistoricalRoiPct(event.target.value)} placeholder="ROI historico (%)" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <input className="h-11 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3" value={expectedYield} onChange={(event) => setExpectedYield(event.target.value)} placeholder="Rendimiento esperado" />
                <input className="h-11 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3" value={proofOfAssetHash} onChange={(event) => setProofOfAssetHash(event.target.value)} placeholder="Hash de prueba" />
              </div>

              <Card>
                <p className="text-sm font-semibold">Agregar multimedia (imagenes y videos)</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <Button type="button" variant="outline" className="gap-2" onClick={() => mediaInputRef.current?.click()}><Upload size={15} /> Buscar en PC</Button>
                  <Button type="button" variant="outline" onClick={() => { void pickFromClipboard(); }}>Desde clipboard</Button>
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

              <Card>
                <p className="text-sm font-semibold">Orden del carrusel ({mediaItems.length})</p>
                <div className="mt-3 space-y-2">
                  {mediaItems.map((item, index) => (
                    <div key={item.id} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm">
                      <p className="truncate"><strong>{index + 1}.</strong> {item.kind === "image" ? "Imagen" : "Video"}</p>
                      <div className="flex items-center gap-1">
                        <Button type="button" variant="outline" className="h-8 px-2" onClick={() => moveMedia(index, -1)} disabled={index === 0}><MoveUp size={14} /></Button>
                        <Button type="button" variant="outline" className="h-8 px-2" onClick={() => moveMedia(index, 1)} disabled={index === mediaItems.length - 1}><MoveDown size={14} /></Button>
                        <Button type="button" variant="outline" className="h-8 px-2 text-red-500" onClick={() => removeMedia(index)}><Trash2 size={14} /></Button>
                      </div>
                    </div>
                  ))}
                  {mediaItems.length === 0 && <p className="text-sm text-[var(--color-muted)]">Aun no agregaste contenido multimedia.</p>}
                </div>
              </Card>

              <Card>
                <p className="text-sm font-semibold">Previsualizacion multimedia</p>
                <AssetMediaViewer className="mt-3" media={mediaItems} title={title || "Previsualizacion"} />
              </Card>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>Cancelar</Button>
                <Button onClick={handleSave} disabled={saving}>{saving ? "Guardando..." : "Guardar cambios"}</Button>
              </div>
            </div>
          </Card>
        </section>
      )}

      <section className="mt-6">
        <Card>
          <h2 className="tc-heading text-lg font-bold">Multimedia de la publicacion</h2>
          <AssetMediaViewer className="mt-4" media={assetMedia} title={data.asset.title} />
        </Card>
      </section>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <p className="text-sm text-[var(--color-muted)]">Estado</p>
          <p className="mt-2 text-2xl font-bold">{data.asset.lifecycleStatus}</p>
        </Card>
        <Card>
          <p className="text-sm text-[var(--color-muted)]">Tokens vendidos</p>
          <p className="mt-2 text-2xl font-bold">{data.soldTokens.toLocaleString("es-AR")}</p>
        </Card>
        <Card>
          <p className="text-sm text-[var(--color-muted)]">Ingresos del activo</p>
          <p className="mt-2 text-2xl font-bold">{formatUSDT(data.grossAmount)}</p>
        </Card>
        <Card>
          <p className="text-sm text-[var(--color-muted)]">Compradores unicos</p>
          <p className="mt-2 text-2xl font-bold">{data.uniqueBuyers}</p>
        </Card>
      </section>

      <section className="mt-6 grid gap-5 lg:grid-cols-[1fr_1fr]">
        <Card>
          <h2 className="tc-heading text-lg font-bold">Ganancias especificas del activo</h2>
          <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <p className="rounded-lg bg-[var(--color-surface-soft)] px-3 py-2 text-[var(--color-muted)]">Ingresos brutos: <strong className="text-[var(--color-foreground)]">{formatUSDT(data.grossAmount)}</strong></p>
            <p className="rounded-lg bg-[var(--color-surface-soft)] px-3 py-2 text-[var(--color-muted)]">Ganancia actual ciclo: <strong className="text-emerald-500">{formatUSDT(data.specificCurrentGain)}</strong></p>
            <p className="rounded-lg bg-[var(--color-surface-soft)] px-3 py-2 text-[var(--color-muted)]">Ganancia proyectada: <strong className="text-emerald-500">{formatUSDT(data.specificProjectedGain)}</strong></p>
            <p className="rounded-lg bg-[var(--color-surface-soft)] px-3 py-2 text-[var(--color-muted)]">Margen actual: <strong>{data.specificMarginPct.toFixed(2)}%</strong></p>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--color-surface-soft)]">
            <div className="h-full rounded-full bg-[var(--color-primary)]" style={{ width: `${data.fillPct}%` }} />
          </div>
          <p className="mt-2 text-sm text-[var(--color-muted)]">Absorcion del activo: {data.fillPct.toFixed(2)}%</p>
        </Card>

        <Card>
          <h2 className="tc-heading text-lg font-bold">Ganancias generales (todos tus activos)</h2>
          <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <p className="rounded-lg bg-[var(--color-surface-soft)] px-3 py-2 text-[var(--color-muted)]">Ingresos brutos totales: <strong className="text-[var(--color-foreground)]">{formatUSDT(data.generalGross)}</strong></p>
            <p className="rounded-lg bg-[var(--color-surface-soft)] px-3 py-2 text-[var(--color-muted)]">Ganancia actual total: <strong className="text-emerald-500">{formatUSDT(data.generalCurrentGain)}</strong></p>
            <p className="rounded-lg bg-[var(--color-surface-soft)] px-3 py-2 text-[var(--color-muted)]">Ganancia proyectada total: <strong className="text-emerald-500">{formatUSDT(data.generalProjectedGain)}</strong></p>
            <p className="rounded-lg bg-[var(--color-surface-soft)] px-3 py-2 text-[var(--color-muted)]">Margen actual total: <strong>{data.generalMarginPct.toFixed(2)}%</strong></p>
          </div>
          <p className="mt-3 text-sm text-[var(--color-muted)]">Proof of Asset: {data.asset.proofOfAssetHash}</p>
          <p className="mt-2 text-sm text-[var(--color-muted)]">Audit hash: {data.asset.auditHash ?? "Pendiente"}</p>
        </Card>
      </section>

      <section className="mt-6 grid gap-5 lg:grid-cols-2">
        <Card>
          <h2 className="tc-heading text-lg font-bold">Evolucion de ingresos del activo</h2>
          <p className="tc-subtitle mt-1 text-xs">Crecimiento acumulado del monto cobrado en cada compra.</p>
          <div className="mt-3">
            <LineChart data={data.incomeTrend.length > 0 ? data.incomeTrend : [{ label: "0", value: 0 }]} />
          </div>
        </Card>
        <Card>
          <h2 className="tc-heading text-lg font-bold">Top compradores por monto</h2>
          <p className="tc-subtitle mt-1 text-xs">Comparativa de los compradores que mas han invertido en este activo.</p>
          <div className="mt-3">
            <BarsChart data={data.topBuyersBars.length > 0 ? data.topBuyersBars : [{ label: "N/A", value: 0 }]} />
          </div>
        </Card>
      </section>

      <section className="mt-6">
        <Card>
          <h2 className="tc-heading text-lg font-bold">Quienes te han comprado</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.14em] text-[var(--color-muted)]">
                <tr>
                  <th className="py-2 pr-4">Comprador</th>
                  <th className="py-2 pr-4">Operaciones</th>
                  <th className="py-2 pr-4">Tokens</th>
                  <th className="py-2 pr-4">Invertido</th>
                  <th className="py-2 pr-4">Ticket prom.</th>
                  <th className="py-2">Ultima compra</th>
                </tr>
              </thead>
              <tbody>
                {data.buyers.map((buyer) => (
                  <tr key={buyer.buyerId} className="border-t border-[var(--color-border)]">
                    <td className="py-3 pr-4">{buyer.buyerName}</td>
                    <td className="py-3 pr-4">{buyer.operations}</td>
                    <td className="py-3 pr-4">{buyer.tokens.toLocaleString("es-AR")}</td>
                    <td className="py-3 pr-4">{formatUSDT(buyer.totalPaid)}</td>
                    <td className="py-3 pr-4">{formatUSDT(buyer.avgTicket)}</td>
                    <td className="py-3">{formatShortDate(buyer.lastPurchaseAt)}</td>
                  </tr>
                ))}
                {data.buyers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-[var(--color-muted)]">Aun no tienes compradores en este activo.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      <section className="mt-6">
        <Card>
          <h2 className="tc-heading text-lg font-bold">Operaciones de compra</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.14em] text-[var(--color-muted)]">
                <tr>
                  <th className="py-2 pr-4">Fecha</th>
                  <th className="py-2 pr-4">Comprador</th>
                  <th className="py-2 pr-4">Cantidad</th>
                  <th className="py-2">Monto</th>
                </tr>
              </thead>
              <tbody>
                {data.sales.map((sale) => (
                  <tr key={sale.id} className="border-t border-[var(--color-border)]">
                    <td className="py-3 pr-4">{formatShortDate(sale.purchasedAt)}</td>
                    <td className="py-3 pr-4">{sale.buyerName}</td>
                    <td className="py-3 pr-4">{sale.quantity.toLocaleString("es-AR")}</td>
                    <td className="py-3">{formatUSDT(sale.totalPaid)}</td>
                  </tr>
                ))}
                {data.sales.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-[var(--color-muted)]">Sin compras para este activo todavia.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      <section className="mt-6">
        <Card>
          <h2 className="tc-heading text-lg font-bold">Volumen por operacion reciente</h2>
          <p className="tc-subtitle mt-1 text-xs">Ultimas compras medidas por cantidad de tokens.</p>
          <div className="mt-3">
            <BarsChart data={data.salesVolumeBars.length > 0 ? data.salesVolumeBars : [{ label: "N/A", value: 0 }]} />
          </div>
        </Card>
      </section>
    </main>
  );
}
