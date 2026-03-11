"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, BadgeCheck, Clock3, MessageCircle, ShieldCheck, TrendingUp } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { useWallet } from "@/components/providers/wallet-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MARKETPLACE_EVENT } from "@/lib/constants";
import { formatUSDT } from "@/lib/format";
import { buyAsset, getAssets, syncMarketplace } from "@/lib/marketplace";
import { fetchOracleSnapshot, type OracleSnapshot } from "@/lib/oracle";
import { AssetMediaViewer } from "@/features/marketplace/components/asset-media-viewer";

function getLifecycleLabel(status: "FUNDING" | "OPERATING" | "SETTLED") {
  if (status === "FUNDING") return "Recaudacion";
  if (status === "OPERATING") return "Operando";
  return "Liquidado";
}

function getLifecycleClass(status: "FUNDING" | "OPERATING" | "SETTLED") {
  if (status === "FUNDING") return "border border-emerald-400/35 bg-emerald-500/15 text-emerald-300";
  if (status === "OPERATING") return "border border-sky-400/35 bg-sky-500/15 text-sky-300";
  return "border border-[var(--color-border)] bg-[var(--color-surface-soft)] text-[var(--color-muted)]";
}

export function BuyerAssetDetailPage({ assetId }: { assetId: string }) {
  const { user } = useAuth();
  const { walletAddress, walletProvider, network } = useWallet();
  const router = useRouter();

  const [quantity, setQuantity] = useState(1);
  const [tradeMessage, setTradeMessage] = useState("");
  const [asset, setAsset] = useState(() => getAssets().find((row) => row.id === assetId) ?? null);
  const [oracleSnapshot, setOracleSnapshot] = useState<OracleSnapshot | null>(null);

  const syncData = useCallback(async () => {
    if (!user) return;
    try {
      await syncMarketplace(user.id);
      setAsset(getAssets().find((row) => row.id === assetId) ?? null);
    } catch (error) {
      setTradeMessage(error instanceof Error ? error.message : "No se pudo sincronizar el activo.");
    }
  }, [assetId, user]);

  useEffect(() => {
    if (!user) return;
    const boot = window.setTimeout(() => {
      void syncData();
    }, 0);
    const marketListener = () => {
      void syncData();
    };
    window.addEventListener(MARKETPLACE_EVENT, marketListener);
    return () => {
      window.clearTimeout(boot);
      window.removeEventListener(MARKETPLACE_EVENT, marketListener);
    };
  }, [syncData, user]);

  useEffect(() => {
    if (!asset) return;
    let active = true;
    void fetchOracleSnapshot(asset.category, asset.location)
      .then((snapshot) => {
        if (!active) return;
        setOracleSnapshot(snapshot);
      })
      .catch(() => {
        if (!active) return;
        setOracleSnapshot(null);
      });
    return () => {
      active = false;
    };
  }, [asset]);

  const handleBuy = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!asset || !user) return;
    if (asset.lifecycleStatus !== "FUNDING") {
      setTradeMessage("La compra solo esta disponible en estado FUNDING.");
      return;
    }
    const normalizedQty = Math.max(1, Math.min(asset.availableTokens, Math.floor(quantity || 1)));
    const result = await buyAsset(asset, user, normalizedQty, {
      walletAddress,
      walletProvider,
      network,
    });
    if (!result.ok) {
      setTradeMessage(result.message);
      return;
    }
    setTradeMessage("Compra realizada correctamente.");
    setQuantity(1);
    await syncData();
  };

  if (!asset) {
    return (
      <main className="mx-auto grid min-h-[60vh] w-full max-w-6xl place-items-center px-4 text-center">
        <div>
          <p className="text-sm text-[var(--color-muted)]">No encontramos el activo solicitado.</p>
          <Button className="mt-3" onClick={() => router.push("/dashboard")}>Volver al marketplace</Button>
        </div>
      </main>
    );
  }

  const mediaGallery = asset.mediaGallery && asset.mediaGallery.length > 0
    ? asset.mediaGallery
    : [
      ...(asset.imageUrl ? [{ id: "legacy-image", kind: "image" as const, url: asset.imageUrl }] : []),
      ...((asset.imageUrls ?? []).map((url, idx) => ({ id: `legacy-gallery-${idx}`, kind: "image" as const, url }))),
      ...(asset.videoUrl ? [{ id: "legacy-video", kind: "video" as const, url: asset.videoUrl }] : []),
    ];

  const progressPct = Math.max(0, Math.min(100, asset.investorMetrics?.cycleProgressPct ?? 0));
  const maxQuantity = Math.max(1, asset.availableTokens);
  const safeQuantity = Math.max(1, Math.min(maxQuantity, Math.floor(quantity || 1)));
  const estimatedTotal = safeQuantity * asset.tokenPriceSats;
  const projectedRoi = asset.investorMetrics?.projectedRoi ?? asset.expectedYield;
  const oracleGapPct = oracleSnapshot
    ? ((asset.tokenPriceSats - oracleSnapshot.suggestedTokenPriceUsdt) / Math.max(0.01, oracleSnapshot.suggestedTokenPriceUsdt)) * 100
    : 0;

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-5 sm:py-9">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-[1.7rem] border border-[color:color-mix(in_oklab,var(--color-border)_80%,white_20%)] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--color-surface)_94%,white_6%),color-mix(in_oklab,var(--color-surface-soft)_55%,var(--color-surface)))] p-4 shadow-[0_16px_36px_-28px_rgba(16,24,40,0.35)] sm:p-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="tc-heading text-2xl font-black sm:text-3xl">{asset.title}</h1>
            <span className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${getLifecycleClass(asset.lifecycleStatus)}`}>
              {getLifecycleLabel(asset.lifecycleStatus)}
            </span>
          </div>
          <p className="tc-subtitle mt-1 text-sm">{asset.sellerName} - {asset.location}</p>
        </div>
        <Button variant="outline" onClick={() => router.push("/dashboard")}>Volver al marketplace</Button>
      </div>

      <section className="tc-mobile-section-gap mt-6 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <Card className="tc-mobile-panel space-y-4 p-4 sm:p-5">
          <AssetMediaViewer media={mediaGallery} title={asset.title} />

          <p className="text-sm leading-relaxed text-[var(--color-muted)]">{asset.description}</p>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="p-3">
              <p className="text-xs text-[var(--color-muted)]">Precio por token</p>
              <p className="mt-1 text-xl font-black">{formatUSDT(asset.tokenPriceSats)}</p>
            </Card>
            <Card className="p-3">
              <p className="text-xs text-[var(--color-muted)]">Tokens disponibles</p>
              <p className="mt-1 text-xl font-black">{asset.availableTokens.toLocaleString("es-AR")}</p>
            </Card>
            <Card className="p-3">
              <p className="text-xs text-[var(--color-muted)]">Duracion</p>
              <p className="mt-1 text-xl font-black">{asset.cycleDurationDays} dias</p>
            </Card>
            <Card className="p-3">
              <p className="text-xs text-[var(--color-muted)]">ROI proyectado</p>
              <p className="mt-1 text-xl font-black">{projectedRoi}</p>
            </Card>
          </div>

          <Card className="p-3 text-sm">
            <div className="mb-2 flex items-center justify-between text-[var(--color-muted)]">
              <p className="inline-flex items-center gap-1"><Clock3 size={14} /> Progreso del ciclo</p>
              <p>{progressPct.toFixed(0)}%</p>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[var(--color-surface-soft)]">
              <div className="h-full rounded-full bg-[var(--color-primary)]" style={{ width: `${progressPct}%` }} />
            </div>
            <div className="mt-3 grid gap-2 text-xs text-[var(--color-muted)] sm:grid-cols-3">
              <p className="inline-flex items-center gap-1"><TrendingUp size={13} /> APY estimado: {(asset.estimatedApyBps / 100).toFixed(2)}%</p>
              <p className="inline-flex items-center gap-1"><Activity size={13} /> Yield actual: {formatUSDT(asset.currentYieldAccruedSats)}</p>
              <p className="inline-flex items-center gap-1"><ShieldCheck size={13} /> Hash: {asset.proofOfAssetHash.slice(0, 24)}...</p>
            </div>
          </Card>

          {oracleSnapshot && (
            <Card className="p-3 text-sm">
              <p className="text-xs uppercase tracking-[0.12em] text-[var(--color-muted)]">Oraculo de referencia</p>
              <p className="mt-1 text-sm text-[var(--color-muted)]">
                Sugerido para {oracleSnapshot.categoryLabel}: <strong className="text-[var(--color-foreground)]">{formatUSDT(oracleSnapshot.suggestedTokenPriceUsdt)}</strong>
              </p>
              <p className="mt-1 text-xs text-[var(--color-muted)]">
                Diferencia vs precio publicado: {oracleGapPct >= 0 ? "+" : ""}{oracleGapPct.toFixed(1)}%
              </p>
              <p className="mt-1 text-xs text-[var(--color-muted)]">
                Base {formatUSDT(Number(oracleSnapshot.basePriceUsdt ?? 0))} x mercado {Number(oracleSnapshot.marketIndex ?? 1).toFixed(2)} x ubicacion {Number(oracleSnapshot.locationFactor ?? 1).toFixed(2)}
              </p>
              <p className="mt-1 break-all text-xs text-[var(--color-muted)]">
                Digest: {oracleSnapshot.attestation.digest}
              </p>
              <p className="mt-1 break-all text-xs text-[var(--color-muted)]">
                Tx anclaje: {oracleSnapshot.attestation.anchored.txHash ?? "No anclado"}
              </p>
            </Card>
          )}
        </Card>

        <Card className="tc-mobile-panel h-fit space-y-4 p-4 sm:p-5 lg:sticky lg:top-20">
          <div>
            <h2 className="tc-heading text-xl font-bold">Comprar tokens</h2>
            <p className="mt-1 text-sm text-[var(--color-muted)]">Configura cantidad y confirma la inversion del ciclo.</p>
          </div>

          <div className="grid gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-3 text-sm">
            <p className="inline-flex items-center gap-2 text-[var(--color-muted)]"><BadgeCheck size={14} /> Estado actual</p>
            <p className="font-semibold">{getLifecycleLabel(asset.lifecycleStatus)}</p>
            <p className="text-xs text-[var(--color-muted)]">Disponible para compra solo durante Recaudacion.</p>
          </div>

          <form className="space-y-3" onSubmit={handleBuy}>
            <label className="block text-sm">
              <span>Cantidad de tokens</span>
              <input
                type="number"
                min={1}
                max={maxQuantity}
                value={quantity}
                onChange={(event) => setQuantity(Number(event.target.value))}
                className="mt-1 h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3"
                required
              />
            </label>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[1, 5, 10, 25].map((step) => (
                <Button
                  key={step}
                  type="button"
                  variant="outline"
                  className="h-9 px-2 text-xs"
                  onClick={() => setQuantity((prev) => Math.min(maxQuantity, Math.max(1, (Number.isFinite(prev) ? prev : 1) + step)))}
                >
                  +{step}
                </Button>
              ))}
            </div>

            <div className="rounded-xl bg-[var(--color-surface-soft)] p-3 text-sm">
              <p className="text-[var(--color-muted)]">Total estimado</p>
              <p className="text-2xl font-black">{formatUSDT(estimatedTotal)}</p>
              <p className="mt-1 text-xs text-[var(--color-muted)]">{safeQuantity.toLocaleString("es-AR")} tokens x {formatUSDT(asset.tokenPriceSats)}</p>
            </div>

            <Button type="submit" className="w-full" disabled={asset.lifecycleStatus !== "FUNDING" || asset.availableTokens <= 0}>
              {asset.lifecycleStatus !== "FUNDING" ? "No disponible para compra" : "Confirmar compra"}
            </Button>
            <Button type="button" variant="outline" className="w-full gap-2" onClick={() => router.push(`/chats?assetId=${asset.id}`)}>
              <MessageCircle size={15} /> Hablar con el vendedor
            </Button>
            {tradeMessage && <p className="text-sm text-[var(--color-primary)]">{tradeMessage}</p>}
          </form>
        </Card>
      </section>
    </main>
  );
}
