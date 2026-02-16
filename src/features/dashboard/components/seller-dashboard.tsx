"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState, type ComponentType } from "react";
import { Beef, ChartNoAxesCombined, ImagePlus, LandPlot, Sprout, Upload } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FadeIn } from "@/components/ui/fade-in";
import { StellarStatusCard } from "@/features/stellar/components/stellar-status-card";
import { MARKETPLACE_EVENT } from "@/lib/constants";
import { formatShortDate, formatUSD } from "@/lib/format";
import {
  createAsset,
  getBlendLiquiditySnapshot,
  getPurchases,
  getSellerAssets,
  getSellerSalesSummary,
} from "@/lib/marketplace";
import type { AssetCategory } from "@/types/market";

const categoryIcon: Record<AssetCategory, ComponentType<{ size?: number }>> = {
  cultivo: Sprout,
  tierra: LandPlot,
  ganaderia: Beef,
};

export function SellerDashboard() {
  const { user } = useAuth();
  const sellerVerified = user?.sellerVerificationStatus === "verified";

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<AssetCategory>("cultivo");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [pricePerToken, setPricePerToken] = useState("");
  const [totalTokens, setTotalTokens] = useState("");
  const [expectedYield, setExpectedYield] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [formMessage, setFormMessage] = useState("");
  const [assets, setAssets] = useState<ReturnType<typeof getSellerAssets>>([]);
  const [summary, setSummary] = useState({ soldTokens: 0, grossAmount: 0, operations: 0 });

  const syncData = useCallback(() => {
    if (!user) return;

    setAssets(getSellerAssets(user.id));
    setSummary(getSellerSalesSummary(user.id));
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const boot = window.setTimeout(() => syncData(), 0);

    const marketListener = () => syncData();
    const storageListener = (event: StorageEvent) => {
      if (!event.key || event.key.startsWith("terra_capital_")) {
        syncData();
      }
    };

    window.addEventListener(MARKETPLACE_EVENT, marketListener);
    window.addEventListener("storage", storageListener);
    const interval = window.setInterval(syncData, 3000);

    return () => {
      window.clearTimeout(boot);
      window.removeEventListener(MARKETPLACE_EVENT, marketListener);
      window.removeEventListener("storage", storageListener);
      window.clearInterval(interval);
    };
  }, [syncData, user]);

  const salesByAsset = useMemo(() => {
    if (!user) return [];

    const purchases = getPurchases().filter((purchase) => purchase.sellerId === user.id);
    return assets.map((asset) => {
      const assetPurchases = purchases.filter((purchase) => purchase.assetId === asset.id);
      const sold = assetPurchases.reduce((sum, purchase) => sum + purchase.quantity, 0);
      const amount = assetPurchases.reduce((sum, purchase) => sum + purchase.totalPaid, 0);
      return {
        asset,
        sold,
        amount,
      };
    });
  }, [assets, user]);

  const blendSnapshot = getBlendLiquiditySnapshot();

  const handleCreateAsset = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormMessage("");

    if (!user) return;
    if (!sellerVerified) {
      setFormMessage("Tu modo vendedor esta bloqueado hasta completar verificacion.");
      return;
    }

    const parsedPrice = Number(pricePerToken);
    const parsedTokens = Number(totalTokens);

    if (Number.isNaN(parsedPrice) || Number.isNaN(parsedTokens) || parsedPrice <= 0 || parsedTokens <= 0) {
      setFormMessage("Precio y tokens deben ser mayores a cero.");
      return;
    }

    try {
      createAsset(user, {
        title,
        category,
        description,
        location,
        pricePerToken: parsedPrice,
        totalTokens: parsedTokens,
        expectedYield,
        imageUrl: imageUrl.trim() || undefined,
        videoUrl: videoUrl.trim() || undefined,
      });
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : "No se pudo publicar el activo.");
      return;
    }

    setTitle("");
    setCategory("cultivo");
    setDescription("");
    setLocation("");
    setPricePerToken("");
    setTotalTokens("");
    setExpectedYield("");
    setImageUrl("");
    setVideoUrl("");
    setFormMessage("Activo publicado en el marketplace.");
    syncData();
  };

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-5 sm:py-9">
      <FadeIn>
        <h1 className="text-3xl font-black">Centro de Publicacion del Vendedor</h1>
        <p className="mt-2 text-[var(--color-muted)]">Carga activos tokenizados, monitorea ventas y conversa con compradores.</p>
      </FadeIn>

      {!sellerVerified && (
        <section className="mt-5">
          <Card>
            <p className="text-sm font-semibold text-amber-600">Modo vendedor bloqueado</p>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              Completa tu verificacion desde <strong>Cuenta</strong> para habilitar publicaciones y ventas.
            </p>
          </Card>
        </section>
      )}

      <section className="mt-7 grid gap-5 md:grid-cols-4">
        <Card>
          <p className="text-sm text-[var(--color-muted)]">Activos publicados</p>
          <p className="mt-2 text-2xl font-bold">{assets.length}</p>
        </Card>
        <Card>
          <p className="text-sm text-[var(--color-muted)]">Tokens vendidos</p>
          <p className="mt-2 text-2xl font-bold">{summary.soldTokens.toLocaleString("es-AR")}</p>
        </Card>
        <Card>
          <p className="text-sm text-[var(--color-muted)]">Ingresos brutos</p>
          <p className="mt-2 text-2xl font-bold">{formatUSD(summary.grossAmount)}</p>
        </Card>
        <StellarStatusCard />
      </section>

      <section className="mt-5">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-[var(--color-muted)]">Settlement off-chain</p>
              <h2 className="text-lg font-bold">Ventas enviadas a Blend y pago de rendimientos</h2>
            </div>
            <p className="rounded-full bg-[var(--color-surface-soft)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-muted)]">
              Ciclo {blendSnapshot.cycle}
            </p>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3 text-sm">
            <p className="rounded-xl bg-[var(--color-surface-soft)] px-3 py-2">Volumen total: <strong>{formatUSD(blendSnapshot.grossVolume)}</strong></p>
            <p className="rounded-xl bg-[var(--color-surface-soft)] px-3 py-2">Liquidez en Blend: <strong>{formatUSD(blendSnapshot.sentToBlend)}</strong></p>
            <p className="rounded-xl bg-[var(--color-surface-soft)] px-3 py-2">Reserva payouts: <strong>{formatUSD(blendSnapshot.reserveForPayouts)}</strong></p>
          </div>
        </Card>
      </section>

      <section className="mt-7 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <Upload size={18} /> Publicar nuevo activo
          </h2>

          <form className="mt-4 grid gap-3" onSubmit={handleCreateAsset}>
            <input
              className="h-11 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3"
              placeholder="Titulo del activo"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
              disabled={!sellerVerified}
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <select
                className="h-11 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3"
                value={category}
                onChange={(event) => setCategory(event.target.value as AssetCategory)}
                disabled={!sellerVerified}
              >
                <option value="cultivo">Cultivo</option>
                <option value="tierra">Tierra</option>
                <option value="ganaderia">Ganaderia</option>
              </select>

              <input
                className="h-11 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3"
                placeholder="Ubicacion"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                required
                disabled={!sellerVerified}
              />
            </div>

            <textarea
              className="h-24 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-3"
              placeholder="Descripcion legal y productiva"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              required
              disabled={!sellerVerified}
            />

            <div className="grid gap-3 sm:grid-cols-3">
              <input
                type="number"
                className="h-11 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3"
                placeholder="Precio token (USD)"
                value={pricePerToken}
                onChange={(event) => setPricePerToken(event.target.value)}
                required
                disabled={!sellerVerified}
              />
              <input
                type="number"
                className="h-11 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3"
                placeholder="Total tokens"
                value={totalTokens}
                onChange={(event) => setTotalTokens(event.target.value)}
                required
                disabled={!sellerVerified}
              />
              <input
                className="h-11 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3"
                placeholder="Rendimiento esperado"
                value={expectedYield}
                onChange={(event) => setExpectedYield(event.target.value)}
                required
                disabled={!sellerVerified}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="relative block">
                <ImagePlus size={15} className="pointer-events-none absolute left-3 top-3 text-[var(--color-muted)]" />
                <input
                  className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] pl-9 pr-3"
                  placeholder="URL de imagen"
                  value={imageUrl}
                  onChange={(event) => setImageUrl(event.target.value)}
                  disabled={!sellerVerified}
                />
              </label>
              <input
                className="h-11 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3"
                placeholder="URL de video"
                value={videoUrl}
                onChange={(event) => setVideoUrl(event.target.value)}
                disabled={!sellerVerified}
              />
            </div>

            {formMessage && <p className="text-sm text-[var(--color-primary)]">{formMessage}</p>}

            <Button type="submit" className="w-full" disabled={!sellerVerified}>
              {sellerVerified ? "Publicar activo" : "Bloqueado por verificacion"}
            </Button>
          </form>
        </Card>

        <Card>
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <ChartNoAxesCombined size={18} /> Resumen de ventas
          </h2>
          <p className="mt-2 text-sm text-[var(--color-muted)]">Operaciones cerradas: {summary.operations}</p>

          <div className="mt-4 space-y-3">
            {salesByAsset.map((row) => {
              const Icon = categoryIcon[row.asset.category];
              return (
                <article key={row.asset.id} className="rounded-xl border border-[var(--color-border)] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Icon size={16} />
                      <p className="font-semibold">{row.asset.title}</p>
                    </div>
                    <span className="text-xs uppercase tracking-[0.12em] text-[var(--color-muted)]">{row.asset.category}</span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                    <p className="rounded-lg bg-[var(--color-surface-soft)] px-2 py-1">Vendidos: <strong>{row.sold.toLocaleString("es-AR")}</strong></p>
                    <p className="rounded-lg bg-[var(--color-surface-soft)] px-2 py-1">Ingresos: <strong>{formatUSD(row.amount)}</strong></p>
                  </div>
                </article>
              );
            })}
            {salesByAsset.length === 0 && <p className="text-sm text-[var(--color-muted)]">Aun no publicaste activos.</p>}
          </div>
        </Card>
      </section>

      <section className="mt-8">
        <Card>
          <h2 className="text-xl font-bold">Mis activos publicados</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {assets.map((asset) => {
              const soldTokens = asset.totalTokens - asset.availableTokens;
              return (
                <article key={asset.id} className="overflow-hidden rounded-xl border border-[var(--color-border)]">
                  <div className="h-36 bg-[var(--color-surface-soft)]">
                    {asset.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={asset.imageUrl} alt={asset.title} className="h-full w-full object-cover" />
                    ) : (
                      <div className="grid h-full place-items-center text-sm text-[var(--color-muted)]">Sin imagen</div>
                    )}
                  </div>
                  <div className="space-y-2 p-3 text-sm">
                    <h3 className="font-bold">{asset.title}</h3>
                    <p className="text-[var(--color-muted)]">{asset.location}</p>
                    <p>Precio token: <strong>{formatUSD(asset.pricePerToken)}</strong></p>
                    <p>Disponibles: <strong>{asset.availableTokens.toLocaleString("es-AR")}</strong> / {asset.totalTokens.toLocaleString("es-AR")}</p>
                    <p>Vendidos: <strong>{soldTokens.toLocaleString("es-AR")}</strong></p>
                    {asset.videoUrl && (
                      <a href={asset.videoUrl} target="_blank" rel="noreferrer" className="text-[var(--color-primary)] underline">
                        Ver video del activo
                      </a>
                    )}
                    <p className="text-xs text-[var(--color-muted)]">Creado: {formatShortDate(asset.createdAt)}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </Card>
      </section>
    </main>
  );
}
