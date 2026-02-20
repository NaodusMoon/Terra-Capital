"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Eye, FileImage, FileVideo, MoveDown, MoveUp, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FadeIn } from "@/components/ui/fade-in";
import { MARKETPLACE_EVENT } from "@/lib/constants";
import { formatUSDT } from "@/lib/format";
import { createAsset, getSellerSalesSummary, syncMarketplace } from "@/lib/marketplace";
import type { AssetCategory, AssetMediaItem } from "@/types/market";

const MAX_MEDIA_SIZE_MB = 25;

function toDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
    reader.readAsDataURL(file);
  });
}

async function readMediaFromClipboard(kind: "image" | "video") {
  if (!navigator.clipboard?.read) {
    throw new Error("Tu navegador no soporta lectura de clipboard para archivos.");
  }
  const items = await navigator.clipboard.read();
  for (const item of items) {
    const types = item.types.filter((type) => type.startsWith(`${kind}/`));
    if (types.length === 0) continue;
    const blob = await item.getType(types[0]);
    const file = new File([blob], `${kind}-clipboard.${types[0].split("/")[1] ?? "bin"}`, { type: types[0] });
    return file;
  }
  throw new Error(`No hay ${kind} en el clipboard.`);
}

export function SellerDashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const sellerVerified = user?.sellerVerificationStatus === "verified";

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
  const [mediaItems, setMediaItems] = useState<AssetMediaItem[]>([]);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [formMessage, setFormMessage] = useState("");
  const [summary, setSummary] = useState({ soldTokens: 0, grossAmount: 0, operations: 0 });

  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);

  const syncData = useCallback(async () => {
    if (!user) return;
    try {
      await syncMarketplace(user.id);
      setSummary(getSellerSalesSummary(user.id));
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

  const addMediaFile = async (file: File, kind: "image" | "video") => {
    if (file.size > MAX_MEDIA_SIZE_MB * 1024 * 1024) {
      setFormMessage(`El archivo supera ${MAX_MEDIA_SIZE_MB}MB.`);
      return;
    }
    const dataUrl = await toDataUrl(file);
    setMediaItems((prev) => [...prev, { id: crypto.randomUUID(), kind, url: dataUrl }]);
    setFormMessage(`${kind === "image" ? "Imagen" : "Video"} agregado.`);
  };

  const handleMediaFile = async (event: ChangeEvent<HTMLInputElement>, kind: "image" | "video") => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;
    for (const file of files) {
      try {
        await addMediaFile(file, kind);
      } catch (error) {
        setFormMessage(error instanceof Error ? error.message : "No se pudo cargar archivo.");
      }
    }
  };

  const pickFromClipboard = async (kind: "image" | "video") => {
    try {
      const file = await readMediaFromClipboard(kind);
      await addMediaFile(file, kind);
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : "No se pudo leer el clipboard.");
    }
  };

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

  const previewMedia = mediaItems[previewIndex];

  const handleCreateAsset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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
    setMediaItems([]);
    setPreviewIndex(0);
    setFormMessage("Activo publicado correctamente.");
    await syncData();
  };

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-5 sm:py-9">
      <FadeIn>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-black">Panel de emision y tokenizacion</h1>
            <p className="mt-2 text-[var(--color-muted)]">Publica ciclos productivos en USDT y ordena tu carrusel multimedia.</p>
          </div>
          <Button variant="outline" onClick={() => router.push("/seller/assets")}>Ver mis activos publicados</Button>
        </div>
      </FadeIn>

      {!sellerVerified && (
        <section className="mt-5">
          <Card>
            <p className="text-sm font-semibold text-amber-600">Modo vendedor bloqueado</p>
            <p className="mt-1 text-sm text-[var(--color-muted)]">Completa tu verificacion desde Cuenta para habilitar publicaciones.</p>
          </Card>
        </section>
      )}

      <section className="mt-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-sm text-[var(--color-muted)]">Operaciones cerradas</p>
          <p className="mt-2 text-2xl font-bold">{summary.operations}</p>
        </Card>
        <Card>
          <p className="text-sm text-[var(--color-muted)]">Tokens vendidos</p>
          <p className="mt-2 text-2xl font-bold">{summary.soldTokens.toLocaleString("es-AR")}</p>
        </Card>
        <Card>
          <p className="text-sm text-[var(--color-muted)]">Ingresos</p>
          <p className="mt-2 text-2xl font-bold">{formatUSDT(summary.grossAmount)}</p>
        </Card>
      </section>

      <section className="mt-7 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <h2 className="flex items-center gap-2 text-xl font-bold"><Upload size={18} /> Nueva publicacion</h2>

          <form className="mt-4 grid gap-3" onSubmit={handleCreateAsset}>
            <input className="h-11 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3" placeholder="Titulo del activo" value={title} onChange={(event) => setTitle(event.target.value)} required disabled={!sellerVerified} />

            <div className="grid gap-3 sm:grid-cols-2">
              <select className="h-11 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3" value={category} onChange={(event) => setCategory(event.target.value as AssetCategory)} disabled={!sellerVerified}>
                <option value="cultivo">Cultivo</option>
                <option value="tierra">Tierra</option>
                <option value="ganaderia">Ganaderia</option>
              </select>
              <input className="h-11 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3" placeholder="Ubicacion" value={location} onChange={(event) => setLocation(event.target.value)} required disabled={!sellerVerified} />
            </div>

            <textarea className="h-24 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-3" placeholder="Descripcion legal y productiva" value={description} onChange={(event) => setDescription(event.target.value)} required disabled={!sellerVerified} />

            <div className="grid gap-3 sm:grid-cols-2">
              <input type="number" step="0.01" className="h-11 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3" placeholder="Precio por token (USDT)" value={tokenPriceSats} onChange={(event) => setTokenPriceSats(event.target.value)} required disabled={!sellerVerified} />
              <input type="number" className="h-11 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3" placeholder="Total tokens" value={totalTokens} onChange={(event) => setTotalTokens(event.target.value)} required disabled={!sellerVerified} />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <select className="h-11 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3" value={cycleDurationDays} onChange={(event) => setCycleDurationDays(Number(event.target.value) as 30 | 60 | 90)} disabled={!sellerVerified}>
                <option value={30}>Ciclo 30 dias</option>
                <option value={60}>Ciclo 60 dias</option>
                <option value={90}>Ciclo 90 dias</option>
              </select>
              <input type="number" step="0.01" className="h-11 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3" placeholder="APY estimado (%)" value={estimatedApyPct} onChange={(event) => setEstimatedApyPct(event.target.value)} required disabled={!sellerVerified} />
              <input type="number" step="0.01" className="h-11 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3" placeholder="ROI historico (%)" value={historicalRoiPct} onChange={(event) => setHistoricalRoiPct(event.target.value)} required disabled={!sellerVerified} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <input className="h-11 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3" placeholder="Rendimiento esperado (texto)" value={expectedYield} onChange={(event) => setExpectedYield(event.target.value)} required disabled={!sellerVerified} />
              <input className="h-11 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3" placeholder="Hash de prueba del activo (opcional)" value={proofOfAssetHash} onChange={(event) => setProofOfAssetHash(event.target.value)} disabled={!sellerVerified} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Card>
                <p className="text-sm font-semibold">Agregar imagenes</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <Button type="button" variant="outline" className="gap-2" disabled={!sellerVerified} onClick={() => imageInputRef.current?.click()}><FileImage size={15} /> Buscar en PC</Button>
                  <Button type="button" variant="outline" disabled={!sellerVerified} onClick={() => { void pickFromClipboard("image"); }}>Desde clipboard</Button>
                </div>
                <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(event) => { void handleMediaFile(event, "image"); }} />
              </Card>
              <Card>
                <p className="text-sm font-semibold">Agregar videos</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <Button type="button" variant="outline" className="gap-2" disabled={!sellerVerified} onClick={() => videoInputRef.current?.click()}><FileVideo size={15} /> Buscar en PC</Button>
                  <Button type="button" variant="outline" disabled={!sellerVerified} onClick={() => { void pickFromClipboard("video"); }}>Desde clipboard</Button>
                </div>
                <input ref={videoInputRef} type="file" accept="video/*" multiple className="hidden" onChange={(event) => { void handleMediaFile(event, "video"); }} />
              </Card>
            </div>

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

            {formMessage && <p className="text-sm text-[var(--color-primary)]">{formMessage}</p>}
            <Button type="submit" className="w-full" disabled={!sellerVerified}>{sellerVerified ? "Publicar activo" : "Bloqueado por verificacion"}</Button>
          </form>
        </Card>

        <Card>
          <h2 className="flex items-center gap-2 text-xl font-bold"><Eye size={18} /> Previsualizacion comprador</h2>
          <p className="mt-2 text-sm text-[var(--color-muted)]">Carrusel ordenado como se mostrara en la ficha del activo.</p>

          <div className="mt-4 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-background)]">
            <div className="h-56 bg-[var(--color-surface-soft)]">
              {!previewMedia && <div className="grid h-full place-items-center text-sm text-[var(--color-muted)]">Sin multimedia</div>}
              {previewMedia?.kind === "image" && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewMedia.url} alt="Preview" className="h-full w-full object-cover" />
              )}
              {previewMedia?.kind === "video" && <video controls className="h-full w-full object-cover" src={previewMedia.url} />}
            </div>
            <div className="flex gap-2 overflow-x-auto border-t border-[var(--color-border)] p-2">
              {mediaItems.map((item, index) => (
                <button key={item.id} type="button" onClick={() => setPreviewIndex(index)} className={`h-14 w-20 shrink-0 overflow-hidden rounded-lg border ${index === previewIndex ? "border-[var(--color-primary)]" : "border-[var(--color-border)]"}`}>
                  {item.kind === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.url} alt={`thumb-${index}`} className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full w-full place-items-center bg-[var(--color-surface-soft)] text-xs">VIDEO</div>
                  )}
                </button>
              ))}
            </div>
            <div className="space-y-2 p-3 text-sm">
              <p className="text-xs uppercase tracking-[0.12em] text-[var(--color-muted)]">{category} · {location || "Ubicacion pendiente"}</p>
              <h3 className="text-lg font-bold">{title || "Titulo del activo"}</h3>
              <p className="text-[var(--color-muted)]">{description || "Descripcion del activo para compradores."}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <p className="rounded-lg bg-[var(--color-surface-soft)] px-3 py-2">Precio token: <strong>{formatUSDT(Number(tokenPriceSats) || 0)}</strong></p>
                <p className="rounded-lg bg-[var(--color-surface-soft)] px-3 py-2">Supply: <strong>{Number(totalTokens || 0).toLocaleString("es-AR")}</strong></p>
                <p className="rounded-lg bg-[var(--color-surface-soft)] px-3 py-2">Ciclo: <strong>{cycleDurationDays} dias</strong></p>
                <p className="rounded-lg bg-[var(--color-surface-soft)] px-3 py-2">ROI proyectado: <strong>{historicalRoiPct || "0.00"}%</strong></p>
              </div>
              <p className="text-xs text-[var(--color-muted)]">Meta de recaudacion aproximada: {formatUSDT(previewTotal)}</p>
            </div>
          </div>
        </Card>
      </section>
    </main>
  );
}
