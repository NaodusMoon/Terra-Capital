"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, BadgeCheck, Clock3, MessageCircle, ShieldCheck, TrendingUp } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { useLanguage } from "@/components/providers/language-provider";
import { useWallet } from "@/components/providers/wallet-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MARKETPLACE_EVENT } from "@/lib/constants";
import { formatUSDT } from "@/lib/format";
import { buyAsset, getAssets, syncMarketplace } from "@/lib/marketplace";
import { fetchOracleSnapshot, type OracleSnapshot } from "@/lib/oracle";
import { AssetMediaViewer } from "@/features/marketplace/components/asset-media-viewer";

function getLifecycleLabel(status: "FUNDING" | "OPERATING" | "SETTLED", language: "es" | "en" | "pt" | "fr") {
  if (language === "pt") {
    if (status === "FUNDING") return "Captacao";
    if (status === "OPERATING") return "Operando";
    return "Liquidado";
  }
  if (language === "fr") {
    if (status === "FUNDING") return "Collecte";
    if (status === "OPERATING") return "En operation";
    return "Regle";
  }
  if (language === "en") {
    if (status === "FUNDING") return "Funding";
    if (status === "OPERATING") return "Operating";
    return "Settled";
  }
  if (status === "FUNDING") return "Recaudacion";
  if (status === "OPERATING") return "Operando";
  return "Liquidado";
}

const copyByLanguage = {
  es: {
    buyOnlyFunding: "La compra solo esta disponible en estado FUNDING.",
    purchaseOk: "Compra realizada correctamente.",
    syncError: "No se pudo sincronizar el activo.",
    assetNotFound: "No encontramos el activo solicitado.",
    backMarketplace: "Volver al marketplace",
    tokenPrice: "Precio por token",
    tokensAvailable: "Tokens disponibles",
    duration: "Duracion",
    projectedRoi: "ROI proyectado",
    days: "dias",
    cycleProgress: "Progreso del ciclo",
    estimatedApy: "APY estimado",
    currentYield: "Yield actual",
    hash: "Hash",
    oracleRef: "Oraculo de referencia",
    suggestedFor: "Sugerido para",
    diffVsPublished: "Diferencia vs precio publicado",
    base: "Base",
    market: "mercado",
    location: "ubicacion",
    digest: "Digest",
    anchorTx: "Tx anclaje",
    notAnchored: "No anclado",
    buyTokens: "Comprar tokens",
    buyHelp: "Configura cantidad y confirma la inversion del ciclo.",
    currentStatus: "Estado actual",
    onlyFundingHint: "Disponible para compra solo durante Recaudacion.",
    tokenQty: "Cantidad de tokens",
    estimatedTotal: "Total estimado",
    notAvailable: "No disponible para compra",
    confirmBuy: "Confirmar compra",
    talkSeller: "Hablar con el vendedor",
  },
  en: {
    buyOnlyFunding: "Purchases are only available while status is FUNDING.",
    purchaseOk: "Purchase completed successfully.",
    syncError: "Could not sync asset data.",
    assetNotFound: "We could not find the requested asset.",
    backMarketplace: "Back to marketplace",
    tokenPrice: "Token price",
    tokensAvailable: "Available tokens",
    duration: "Duration",
    projectedRoi: "Projected ROI",
    days: "days",
    cycleProgress: "Cycle progress",
    estimatedApy: "Estimated APY",
    currentYield: "Current yield",
    hash: "Hash",
    oracleRef: "Reference oracle",
    suggestedFor: "Suggested for",
    diffVsPublished: "Difference vs listed price",
    base: "Base",
    market: "market",
    location: "location",
    digest: "Digest",
    anchorTx: "Anchor tx",
    notAnchored: "Not anchored",
    buyTokens: "Buy tokens",
    buyHelp: "Set quantity and confirm this cycle investment.",
    currentStatus: "Current status",
    onlyFundingHint: "Available for purchase only during Funding.",
    tokenQty: "Token quantity",
    estimatedTotal: "Estimated total",
    notAvailable: "Not available for purchase",
    confirmBuy: "Confirm purchase",
    talkSeller: "Talk to seller",
  },
} as const;

function resolveDisplayLanguage(language: string): keyof typeof copyByLanguage {
  if (language === "es") return "es";
  return "en";
}

function getLifecycleClass(status: "FUNDING" | "OPERATING" | "SETTLED") {
  if (status === "FUNDING") return "terra-market-chip--primary";
  if (status === "OPERATING") return "terra-market-chip";
  return "border border-[var(--color-border)] bg-[var(--color-surface-soft)] text-[var(--color-muted)]";
}

export function BuyerAssetDetailPage({ assetId }: { assetId: string }) {
  const { user } = useAuth();
  const { language } = useLanguage();
  const { walletAddress, walletProvider, network } = useWallet();
  const router = useRouter();
  const displayLanguage = resolveDisplayLanguage(language);
  const t = copyByLanguage[displayLanguage];
  const numberLocale = language === "es" ? "es-AR" : language === "pt" ? "pt-PT" : language === "fr" ? "fr-FR" : "en-US";

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
      setTradeMessage(error instanceof Error ? error.message : t.syncError);
    }
  }, [assetId, t.syncError, user]);

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
      setTradeMessage(t.buyOnlyFunding);
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
    setTradeMessage(t.purchaseOk);
    setQuantity(1);
    await syncData();
  };

  if (!asset) {
    return (
      <main className="mx-auto grid min-h-[60vh] w-full max-w-6xl place-items-center px-4 text-center">
        <div>
          <p className="text-sm text-[var(--color-muted)]">{t.assetNotFound}</p>
          <Button className="mt-3" onClick={() => router.push("/dashboard")}>{t.backMarketplace}</Button>
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
    <main className="mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
      <div className="terra-market-card flex flex-wrap items-start justify-between gap-3 rounded-[1.7rem] p-4 sm:p-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="tc-heading text-2xl font-black sm:text-3xl">{asset.title}</h1>
            <span className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${getLifecycleClass(asset.lifecycleStatus)}`}>
              {getLifecycleLabel(asset.lifecycleStatus, language)}
            </span>
          </div>
          <p className="tc-subtitle mt-1 text-sm">{asset.sellerName} - {asset.location}</p>
        </div>
        <Button variant="secondary" onClick={() => router.push("/dashboard")}>{t.backMarketplace}</Button>
      </div>

      <section className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.72fr)] xl:items-start">
        <Card className="terra-market-card space-y-5 p-4 sm:p-5">
          <AssetMediaViewer media={mediaGallery} title={asset.title} />

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <div className="space-y-3">
              <p className="text-sm leading-relaxed text-[var(--color-muted)]">{asset.description}</p>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Card className="p-3">
                  <p className="text-xs text-[var(--color-muted)]">{t.tokenPrice}</p>
                  <p className="mt-1 text-xl font-black">{formatUSDT(asset.tokenPriceSats)}</p>
                </Card>
                <Card className="p-3">
                  <p className="text-xs text-[var(--color-muted)]">{t.tokensAvailable}</p>
                  <p className="mt-1 text-xl font-black">{asset.availableTokens.toLocaleString(numberLocale)}</p>
                </Card>
                <Card className="p-3">
                  <p className="text-xs text-[var(--color-muted)]">{t.duration}</p>
                  <p className="mt-1 text-xl font-black">{asset.cycleDurationDays} {t.days}</p>
                </Card>
                <Card className="p-3">
                  <p className="text-xs text-[var(--color-muted)]">{t.projectedRoi}</p>
                  <p className="mt-1 text-xl font-black">{projectedRoi}</p>
                </Card>
              </div>
            </div>

            <div className="grid gap-4">
              <Card className="p-3 text-sm">
                <div className="mb-2 flex items-center justify-between text-[var(--color-muted)]">
                  <p className="inline-flex items-center gap-1"><Clock3 size={14} /> {t.cycleProgress}</p>
                  <p>{progressPct.toFixed(0)}%</p>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[var(--color-surface-soft)]">
                  <div className="h-full rounded-full bg-[linear-gradient(90deg,color-mix(in_oklab,var(--color-primary)_84%,white)_0%,var(--color-primary)_100%)]" style={{ width: `${progressPct}%` }} />
                </div>
                <div className="mt-3 grid gap-2 text-xs text-[var(--color-muted)] sm:grid-cols-3">
                  <p className="inline-flex items-center gap-1"><TrendingUp size={13} /> {t.estimatedApy}: {(asset.estimatedApyBps / 100).toFixed(2)}%</p>
                  <p className="inline-flex items-center gap-1"><Activity size={13} /> {t.currentYield}: {formatUSDT(asset.currentYieldAccruedSats)}</p>
                  <p className="inline-flex items-center gap-1"><ShieldCheck size={13} /> {t.hash}: {asset.proofOfAssetHash.slice(0, 24)}...</p>
                </div>
              </Card>

              {oracleSnapshot && (
                <Card className="p-3 text-sm">
                  <p className="text-xs uppercase tracking-[0.12em] text-[var(--color-muted)]">{t.oracleRef}</p>
                  <p className="mt-1 text-sm text-[var(--color-muted)]">
                    {t.suggestedFor} {oracleSnapshot.categoryLabel}: <strong className="text-[var(--color-foreground)]">{formatUSDT(oracleSnapshot.suggestedTokenPriceUsdt)}</strong>
                  </p>
                  <p className="mt-1 text-xs text-[var(--color-muted)]">
                    {t.diffVsPublished}: {oracleGapPct >= 0 ? "+" : ""}{oracleGapPct.toFixed(1)}%
                  </p>
                  <p className="mt-1 text-xs text-[var(--color-muted)]">
                    {t.base} {formatUSDT(Number(oracleSnapshot.basePriceUsdt ?? 0))} x {t.market} {Number(oracleSnapshot.marketIndex ?? 1).toFixed(2)} x {t.location} {Number(oracleSnapshot.locationFactor ?? 1).toFixed(2)}
                  </p>
                  <p className="mt-1 break-all text-xs text-[var(--color-muted)]">
                    {t.digest}: {oracleSnapshot.attestation.digest}
                  </p>
                  <p className="mt-1 break-all text-xs text-[var(--color-muted)]">
                    {t.anchorTx}: {oracleSnapshot.attestation.anchored.txHash ?? t.notAnchored}
                  </p>
                </Card>
              )}
            </div>
          </div>
        </Card>

        <Card className="terra-market-card h-fit space-y-4 p-4 sm:p-5 xl:sticky xl:top-20">
          <div>
            <h2 className="tc-heading text-xl font-bold">{t.buyTokens}</h2>
            <p className="mt-1 text-sm text-[var(--color-muted)]">{t.buyHelp}</p>
          </div>

          <div className="grid gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-3 text-sm">
            <p className="inline-flex items-center gap-2 text-[var(--color-muted)]"><BadgeCheck size={14} /> {t.currentStatus}</p>
            <p className="font-semibold">{getLifecycleLabel(asset.lifecycleStatus, language)}</p>
            <p className="text-xs text-[var(--color-muted)]">{t.onlyFundingHint}</p>
          </div>

          <form className="space-y-3" onSubmit={handleBuy}>
            <label className="block text-sm">
              <span>{t.tokenQty}</span>
            <input
              type="number"
              min={1}
              max={maxQuantity}
              value={quantity}
              onChange={(event) => setQuantity(Number(event.target.value))}
              className="terra-seller-field mt-1 h-11"
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
              <p className="text-[var(--color-muted)]">{t.estimatedTotal}</p>
              <p className="text-2xl font-black">{formatUSDT(estimatedTotal)}</p>
              <p className="mt-1 text-xs text-[var(--color-muted)]">{safeQuantity.toLocaleString(numberLocale)} tokens x {formatUSDT(asset.tokenPriceSats)}</p>
            </div>

            <Button type="submit" className="w-full" disabled={asset.lifecycleStatus !== "FUNDING" || asset.availableTokens <= 0}>
              {asset.lifecycleStatus !== "FUNDING" ? t.notAvailable : t.confirmBuy}
            </Button>
            <Button type="button" variant="outline" className="w-full gap-2" onClick={() => router.push(`/chats?assetId=${asset.id}`)}>
              <MessageCircle size={15} /> {t.talkSeller}
            </Button>
            {tradeMessage && <p className="text-sm text-[var(--color-primary)]">{tradeMessage}</p>}
          </form>
        </Card>
      </section>
    </main>
  );
}
