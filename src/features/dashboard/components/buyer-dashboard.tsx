"use client";

import { useCallback, useEffect, useMemo, useState, type ComponentType } from "react";
import { useRouter } from "next/navigation";
import { Activity, Beef, CircleAlert, Filter, LandPlot, MessageCircle, RefreshCcw, Search, Sprout } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FadeIn } from "@/components/ui/fade-in";
import { MARKETPLACE_EVENT } from "@/lib/constants";
import { formatUSDT } from "@/lib/format";
import { getVideoThumbnailUrl } from "@/lib/media";
import { getAssets, syncMarketplace } from "@/lib/marketplace";
import type { AssetCategory, TokenizedAsset } from "@/types/market";

const categoryMeta: Record<AssetCategory, { label: string; icon: ComponentType<{ size?: number; className?: string }> }> = {
  cultivo: { label: "Cultivo", icon: Sprout },
  tierra: { label: "Tierra", icon: LandPlot },
  ganaderia: { label: "Ganaderia", icon: Beef },
};

function getStateLabel(status: TokenizedAsset["lifecycleStatus"]) {
  if (status === "FUNDING") return "Recaudacion";
  if (status === "OPERATING") return "Produccion";
  return "Liquidado";
}

function getStateBadgeClass(status: TokenizedAsset["lifecycleStatus"]) {
  if (status === "FUNDING") return "terra-market-chip--primary";
  if (status === "OPERATING") return "terra-market-chip";
  return "border border-[var(--color-border)] bg-[var(--color-surface-soft)] text-[var(--color-muted)]";
}

function getCategoryBadgeClass(category: AssetCategory) {
  if (category === "cultivo") return "terra-market-chip--primary";
  if (category === "ganaderia") return "terra-market-chip";
  return "border border-[color:color-mix(in_oklab,var(--color-foreground)_28%,var(--color-border))] bg-[color:color-mix(in_oklab,var(--color-foreground)_9%,var(--color-surface))] text-[color:color-mix(in_oklab,var(--color-foreground)_78%,white)]";
}

function formatTokenPriceUsdt(value: number) {
  const decimals = value > 0 && value < 1 ? 4 : 2;
  const formatted = new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
  return `USDT ${formatted}`;
}

function TokenPreview({ asset }: { asset: TokenizedAsset }) {
  const Icon = categoryMeta[asset.category].icon;
  const previewMedia = asset.mediaGallery && asset.mediaGallery.length > 0
    ? asset.mediaGallery[0]
    : asset.imageUrl
      ? { kind: "image" as const, url: asset.imageUrl }
      : asset.videoUrl
        ? { kind: "video" as const, url: asset.videoUrl }
        : null;

  if (previewMedia?.kind === "image") {
    return (
      <div className="h-[4.5rem] w-[4.5rem] overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] shadow-md shadow-black/20">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={previewMedia.url} alt={asset.title} className="h-full w-full object-cover" />
      </div>
    );
  }

  if (previewMedia?.kind === "video") {
    const thumbUrl = getVideoThumbnailUrl(previewMedia.url);
    return (
      <div className="h-[4.5rem] w-[4.5rem] overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] shadow-md shadow-black/20">
        {thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbUrl} alt={`${asset.title} video`} className="h-full w-full object-cover" />
        ) : (
          <video
            className="h-full w-full object-cover"
            src={previewMedia.url}
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
        )}
      </div>
    );
  }

  return (
    <div className="grid h-[4.5rem] w-[4.5rem] place-items-center rounded-2xl bg-gradient-to-br from-[var(--color-primary)] via-[var(--color-accent)] to-[var(--color-gold)] text-[var(--color-primary-contrast)] shadow-md shadow-black/20">
      <Icon size={24} />
    </div>
  );
}

export function BuyerDashboard() {
  const { user } = useAuth();
  const router = useRouter();

  const [assets, setAssets] = useState<TokenizedAsset[]>(() => getAssets());
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"all" | AssetCategory>("all");
  const [sortBy, setSortBy] = useState<"recent" | "priceAsc" | "priceDesc" | "stock">("recent");
  const [syncError, setSyncError] = useState("");
  const [hasBootstrapped, setHasBootstrapped] = useState(false);

  const syncData = useCallback(async () => {
    if (!user) return;
    try {
      await syncMarketplace(user.id);
      setAssets(getAssets());
      setSyncError("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo sincronizar el marketplace.";
      const hasCachedAssets = getAssets().length > 0;
      const isTransientNetworkError = message.toLowerCase().includes("failed to fetch");
      if (hasCachedAssets && isTransientNetworkError) {
        // Keep cached marketplace data visible without showing a blocking alert.
        setSyncError("");
      } else {
        setSyncError(message);
      }
    } finally {
      setHasBootstrapped(true);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const boot = window.setTimeout(() => {
      void syncData();
    }, 0);

    const marketListener = () => {
      setAssets(getAssets());
    };
    const storageListener = (event: StorageEvent) => {
      if (!event.key || event.key.startsWith("terra_capital_")) {
        setAssets(getAssets());
      }
    };

    window.addEventListener(MARKETPLACE_EVENT, marketListener);
    window.addEventListener("storage", storageListener);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void syncData();
      }
    }, 20000);

    return () => {
      window.clearTimeout(boot);
      window.removeEventListener(MARKETPLACE_EVENT, marketListener);
      window.removeEventListener("storage", storageListener);
      window.clearInterval(interval);
    };
  }, [syncData, user]);

  const filteredAssets = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    const base = assets.filter((asset) => {
      const matchCategory = categoryFilter === "all" || asset.category === categoryFilter;
      const matchSearch =
        normalizedSearch.length === 0 ||
        asset.title.toLowerCase().includes(normalizedSearch) ||
        asset.location.toLowerCase().includes(normalizedSearch) ||
        asset.sellerName.toLowerCase().includes(normalizedSearch);
      return matchCategory && matchSearch;
    });

    return [...base].sort((a, b) => {
      if (sortBy === "priceAsc") return a.tokenPriceSats - b.tokenPriceSats;
      if (sortBy === "priceDesc") return b.tokenPriceSats - a.tokenPriceSats;
      if (sortBy === "stock") return b.availableTokens - a.availableTokens;
      return +new Date(b.createdAt) - +new Date(a.createdAt);
    });
  }, [assets, categoryFilter, search, sortBy]);

  const marketSummary = useMemo(() => {
    const fundingAssets = assets.filter((asset) => asset.lifecycleStatus === "FUNDING").length;
    const operatingAssets = assets.filter((asset) => asset.lifecycleStatus === "OPERATING").length;
    const minTicket = assets.length > 0 ? Math.min(...assets.map((asset) => asset.tokenPriceSats)) : 0;
    const openFunding = assets.reduce((sum, asset) => sum + asset.availableTokens * asset.tokenPriceSats, 0);
    const avgApy = assets.length > 0 ? assets.reduce((sum, asset) => sum + asset.estimatedApyBps, 0) / assets.length / 100 : 0;
    return {
      fundingAssets,
      operatingAssets,
      minTicket,
      openFunding,
      avgApy,
    };
  }, [assets]);

  const hasAnyFilter = categoryFilter !== "all" || search.trim().length > 0;
  const isLoadingInitial = !hasBootstrapped && assets.length === 0;
  const isEmptyMarketplace = hasBootstrapped && assets.length === 0;
  const isEmptyByFilter = hasBootstrapped && assets.length > 0 && filteredAssets.length === 0;

  return (
    <main className="mx-auto w-full max-w-7xl overflow-x-clip px-4 py-6 md:px-6 md:py-8 lg:px-8">
      <FadeIn>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <h1 className="tc-heading text-2xl font-black leading-tight md:text-3xl">Marketplace de Activos Productivos</h1>
            <p className="tc-subtitle mt-2 max-w-[70ch]">Modelo por ciclos de produccion en USDT: funding, operacion y liquidacion.</p>
          </div>
          <Button type="button" variant="secondary" className="w-full md:w-auto" onClick={() => router.push("/portfolio")}>Mi portafolio</Button>
        </div>
      </FadeIn>

      {syncError && (
        <section className="mt-4">
          <Card>
            <p className="terra-alert">No se pudo actualizar el marketplace</p>
            <p className="mt-1 text-sm text-[var(--color-muted)]">{syncError}</p>
          </Card>
        </section>
      )}

      <section className="mt-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 md:p-5">
        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          <Card className="p-3">
            <p className="text-xs uppercase tracking-[0.13em] text-[var(--color-muted)]">Activos en funding</p>
            <p className="mt-2 text-2xl font-black">{marketSummary.fundingAssets}</p>
          </Card>
          <Card className="p-3">
            <p className="text-xs uppercase tracking-[0.13em] text-[var(--color-muted)]">Activos en operacion</p>
            <p className="mt-2 text-2xl font-black">{marketSummary.operatingAssets}</p>
          </Card>
          <Card className="p-3">
            <p className="text-xs uppercase tracking-[0.13em] text-[var(--color-muted)]">Ticket minimo</p>
            <p className="mt-2 text-2xl font-black">{formatUSDT(marketSummary.minTicket)}</p>
          </Card>
          <Card className="p-3">
            <p className="text-xs uppercase tracking-[0.13em] text-[var(--color-muted)]">Capital abierto</p>
            <p className="mt-2 text-2xl font-black">{formatUSDT(marketSummary.openFunding)}</p>
            <p className="mt-1 text-xs text-[var(--color-muted)]">APY medio: {marketSummary.avgApy.toFixed(2)}%</p>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <label className="relative block">
            <Search size={16} className="pointer-events-none absolute left-3 top-3.5 text-[var(--color-muted)]" />
            <input
              className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] pl-10 pr-3"
              placeholder="Buscar por nombre, zona o vendedor"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>

          <select
            className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3"
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value as "all" | AssetCategory)}
          >
            <option value="all">Todas las categorias</option>
            <option value="cultivo">Cultivo</option>
            <option value="tierra">Tierra</option>
            <option value="ganaderia">Ganaderia</option>
          </select>

          <select
            className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3"
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value as "recent" | "priceAsc" | "priceDesc" | "stock")}
          >
            <option value="recent">Mas recientes</option>
            <option value="priceAsc">Precio menor</option>
            <option value="priceDesc">Precio mayor</option>
            <option value="stock">Mayor disponibilidad</option>
          </select>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-surface-soft)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.15em] text-[var(--color-muted)]">
            <Filter size={14} /> {filteredAssets.length} de {assets.length} activos
          </div>
          <Button
            type="button"
            variant="outline"
            className="h-9 gap-2 px-3 text-xs"
            onClick={() => {
              setSearch("");
              setCategoryFilter("all");
              setSortBy("recent");
            }}
          >
            Limpiar filtros
          </Button>
          <Button type="button" variant="outline" className="h-9 gap-2 px-3 text-xs" onClick={() => { void syncData(); }}>
            <RefreshCcw size={13} /> Actualizar
          </Button>
        </div>
      </section>

      <section className="mt-7 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {isLoadingInitial && (
          <Card className="md:col-span-2 lg:col-span-3">
            <p className="inline-flex items-center gap-2 text-sm font-semibold">
              <RefreshCcw size={16} className="animate-spin text-[var(--color-primary)]" />
              Cargando activos del marketplace...
            </p>
          </Card>
        )}

        {isEmptyMarketplace && (
          <Card className="md:col-span-2 lg:col-span-3">
            <p className="inline-flex items-center gap-2 text-sm font-semibold">
              <CircleAlert size={16} className="text-[var(--color-gold)]" />
              Todavia no hay activos publicados.
            </p>
            <p className="mt-2 text-sm text-[var(--color-muted)]">
              Cuando un vendedor publique su primer activo, aparecera aqui automaticamente.
            </p>
            <Button type="button" variant="outline" className="mt-3 h-9 gap-2 px-3 text-xs" onClick={() => { void syncData(); }}>
              <RefreshCcw size={13} /> Reintentar sincronizacion
            </Button>
          </Card>
        )}

        {isEmptyByFilter && (
          <Card className="md:col-span-2 lg:col-span-3">
            <p className="inline-flex items-center gap-2 text-sm font-semibold">
              <CircleAlert size={16} className="text-[var(--color-gold)]" />
              {hasAnyFilter ? "No hay activos para este filtro." : "No hay activos visibles en este momento."}
            </p>
            <p className="mt-2 text-sm text-[var(--color-muted)]">
              {hasAnyFilter
                ? "Prueba quitar filtros o busca por otra ubicacion/categoria para descubrir oportunidades."
                : "Actualiza el marketplace para traer los ultimos activos disponibles."}
            </p>
          </Card>
        )}

        {filteredAssets.map((asset) => {
          const progress = asset.investorMetrics?.cycleProgressPct ?? 0;
          const normalizedProgress = Math.max(0, Math.min(100, progress));
          const estimatedDaysLeft = Math.max(0, Math.ceil(((100 - normalizedProgress) / 100) * asset.cycleDurationDays));
          const CategoryIcon = categoryMeta[asset.category].icon;
          return (
            <article
              key={asset.id}
              className="terra-market-card group flex h-full min-w-0 flex-col overflow-hidden rounded-2xl p-4 transition duration-200 hover:-translate-y-0.5 hover:border-[color:color-mix(in_oklab,var(--color-primary)_35%,var(--color-border))] hover:shadow-lg hover:shadow-black/10"
            >
              <div className="terra-market-card__panel rounded-2xl p-3">
                <div className="flex items-start justify-between gap-3">
                  <TokenPreview asset={asset} />
                  <div className="flex flex-col items-end gap-2">
                    <span className={`rounded-full px-3 py-1 text-[0.625rem] font-semibold uppercase tracking-[0.12em] ${getStateBadgeClass(asset.lifecycleStatus)}`}>
                      {getStateLabel(asset.lifecycleStatus)}
                    </span>
                    <span
                      aria-label={`Categoria: ${categoryMeta[asset.category].label}`}
                      className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[0.625rem] font-semibold uppercase tracking-[0.12em] shadow-sm ${getCategoryBadgeClass(asset.category)}`}
                    >
                      <CategoryIcon size={14} />
                      {categoryMeta[asset.category].label}
                    </span>
                  </div>
                </div>

                <div className="mt-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="tc-heading break-words text-lg font-bold leading-tight">{asset.title}</h3>
                    <p className="mt-1 text-xs uppercase tracking-[0.15em] text-[var(--color-muted)]">{asset.location}</p>
                  </div>
                </div>
              </div>

              <p className="mt-3 min-h-[2.75rem] break-words text-sm text-[var(--color-muted)] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
                {asset.description}
              </p>

              <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-xl border border-[var(--color-border)] bg-[color:color-mix(in_oklab,var(--color-surface-soft)_82%,var(--color-surface))] px-3 py-2.5">
                  <p className="text-[0.6875rem] font-medium uppercase tracking-[0.1em] text-[var(--color-muted)]">Precio por token</p>
                  <p className="mt-1 break-words text-[1.15rem] font-black leading-none">{formatTokenPriceUsdt(asset.tokenPriceSats)}</p>
                </div>
                <div className="rounded-xl border border-[var(--color-border)] bg-[color:color-mix(in_oklab,var(--color-surface-soft)_82%,var(--color-surface))] px-3 py-2.5">
                  <p className="text-[0.6875rem] font-medium uppercase tracking-[0.1em] text-[var(--color-muted)]">Disponibles</p>
                  <p className="mt-1 break-words text-[1.15rem] font-black leading-none">{asset.availableTokens.toLocaleString("es-AR")}</p>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-[color:color-mix(in_oklab,var(--color-surface-soft)_76%,var(--color-surface))] px-3 py-3">
                <div className="flex items-center justify-between gap-3 text-xs text-[var(--color-muted)]">
                  <p className="font-medium uppercase tracking-[0.1em]">Ciclo {normalizedProgress.toFixed(0)}% completado</p>
                  <p>{estimatedDaysLeft} dias restantes</p>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-[color:color-mix(in_oklab,var(--color-surface)_72%,var(--color-border))]">
                  <div className="h-full rounded-full bg-[linear-gradient(90deg,color-mix(in_oklab,var(--color-primary)_84%,white)_0%,var(--color-primary)_100%)]" style={{ width: `${normalizedProgress}%` }} />
                </div>
                <p className="mt-3 inline-flex items-center gap-1 text-xs text-[var(--color-muted)]">
                  <Activity size={13} /> ROI proyectado (estimado): {asset.investorMetrics?.projectedRoi ?? asset.expectedYield}
                </p>
              </div>

              <div className="mt-4">
                <Button
                  type="button"
                  className="w-full bg-[linear-gradient(180deg,color-mix(in_oklab,var(--color-primary)_96%,white)_0%,var(--color-primary)_100%)] text-[var(--color-primary-contrast)] shadow-sm shadow-[color:color-mix(in_oklab,var(--color-primary)_20%,black)] hover:brightness-110"
                  onClick={() => router.push(`/assets/${asset.id}`)}
                >
                  Ver activo
                </Button>
              </div>

              <div className="mt-2">
                <Button type="button" variant="outline" className="w-full gap-2 border-[color:color-mix(in_oklab,var(--color-secondary)_52%,var(--color-border))] bg-[color:color-mix(in_oklab,var(--color-secondary)_10%,var(--color-surface))] text-[color:color-mix(in_oklab,var(--color-secondary)_84%,var(--color-foreground))] hover:bg-[color:color-mix(in_oklab,var(--color-secondary)_16%,var(--color-surface))] hover:text-[color:color-mix(in_oklab,var(--color-secondary)_92%,var(--color-foreground))]" onClick={() => router.push(`/chats?assetId=${asset.id}`)}>
                  <MessageCircle size={15} /> Chat vendedor
                </Button>
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}
