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
  if (status === "FUNDING") return "border border-[color:color-mix(in_oklab,var(--color-primary)_65%,var(--color-border))] bg-[color:color-mix(in_oklab,var(--color-primary)_26%,transparent)] text-[color:color-mix(in_oklab,var(--color-primary)_72%,white)]";
  if (status === "OPERATING") return "border border-[color:color-mix(in_oklab,var(--color-secondary)_65%,var(--color-border))] bg-[color:color-mix(in_oklab,var(--color-secondary)_22%,transparent)] text-[color:color-mix(in_oklab,var(--color-secondary)_78%,white)]";
  return "border border-[var(--color-border)] bg-[var(--color-surface-soft)] text-[var(--color-muted)]";
}

function getCategoryBadgeClass(category: AssetCategory) {
  if (category === "cultivo") return "border border-[color:color-mix(in_oklab,var(--color-accent)_70%,var(--color-border))] bg-[color:color-mix(in_oklab,var(--color-accent)_20%,var(--color-surface))] text-[color:color-mix(in_oklab,var(--color-accent)_86%,var(--color-foreground))]";
  if (category === "ganaderia") return "border border-[color:color-mix(in_oklab,var(--color-warning)_70%,var(--color-border))] bg-[color:color-mix(in_oklab,var(--color-warning)_18%,var(--color-surface))] text-[color:color-mix(in_oklab,var(--color-warning)_92%,var(--color-warning-contrast))]";
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
      <div className="h-16 w-16 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] shadow-md shadow-black/20">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={previewMedia.url} alt={asset.title} className="h-full w-full object-cover" />
      </div>
    );
  }

  if (previewMedia?.kind === "video") {
    const thumbUrl = getVideoThumbnailUrl(previewMedia.url);
    return (
      <div className="h-16 w-16 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] shadow-md shadow-black/20">
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
    <div className="grid h-16 w-16 place-items-center rounded-xl bg-gradient-to-br from-[var(--color-primary)] via-[var(--color-accent)] to-[var(--color-gold)] text-[var(--color-primary-contrast)] shadow-md shadow-black/20">
      <Icon size={20} />
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
  const [categoryHintAssetId, setCategoryHintAssetId] = useState<string | null>(null);

  const syncData = useCallback(async () => {
    if (!user) return;
    try {
      await syncMarketplace(user.id);
      setAssets(getAssets());
      setSyncError("");
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "No se pudo sincronizar el marketplace.");
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
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-5 sm:py-9">
      <FadeIn>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="tc-heading text-3xl font-black">Marketplace de Activos Productivos</h1>
            <p className="tc-subtitle mt-2">Modelo por ciclos de produccion en USDT: funding, operacion y liquidacion.</p>
          </div>
          <Button type="button" className="bg-[#c4a037] text-[#1f2328] hover:brightness-110" onClick={() => router.push("/portfolio")}>Mi portafolio</Button>
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

      <section className="mt-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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

        <div className="grid gap-3 md:grid-cols-[1fr_220px_220px]">
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

      <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {isLoadingInitial && (
          <Card className="sm:col-span-2 xl:col-span-3">
            <p className="inline-flex items-center gap-2 text-sm font-semibold">
              <RefreshCcw size={16} className="animate-spin text-[var(--color-primary)]" />
              Cargando activos del marketplace...
            </p>
          </Card>
        )}

        {isEmptyMarketplace && (
          <Card className="sm:col-span-2 xl:col-span-3">
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
          <Card className="sm:col-span-2 xl:col-span-3">
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
          const showCategoryHint = categoryHintAssetId === asset.id;
          return (
            <article
              key={asset.id}
              className="flex h-full flex-col rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm shadow-black/5"
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <TokenPreview asset={asset} />
                <div className="flex flex-col items-end gap-1">
                  <div className="relative">
                    <button
                      type="button"
                      aria-label={`Categoria: ${categoryMeta[asset.category].label}`}
                      className={`grid h-9 w-9 place-items-center rounded-full ${getCategoryBadgeClass(asset.category)}`}
                      onClick={() => setCategoryHintAssetId((prev) => (prev === asset.id ? null : asset.id))}
                    >
                      <CategoryIcon size={16} />
                    </button>
                    {showCategoryHint && (
                      <span className="absolute right-0 top-11 whitespace-nowrap rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-foreground)] shadow-md shadow-black/15">
                        {categoryMeta[asset.category].label}
                      </span>
                    )}
                  </div>
                  <span className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${getStateBadgeClass(asset.lifecycleStatus)}`}>
                    {getStateLabel(asset.lifecycleStatus)}
                  </span>
                </div>
              </div>

              <h3 className="tc-heading text-lg font-bold leading-tight">{asset.title}</h3>
              <p className="mt-1 text-xs uppercase tracking-[0.15em] text-[var(--color-muted)]">{asset.location}</p>
              <p className="mt-3 min-h-[2.75rem] line-clamp-2 text-sm text-[var(--color-muted)]">{asset.description}</p>

              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg bg-[var(--color-surface-soft)] px-3 py-2">
                  <p className="text-xs text-[var(--color-muted)]">Precio por token</p>
                  <p className="text-xl font-black leading-none">{formatTokenPriceUsdt(asset.tokenPriceSats)}</p>
                </div>
                <div className="rounded-lg bg-[var(--color-surface-soft)] px-3 py-2">
                  <p className="text-xs text-[var(--color-muted)]">Disponibles</p>
                  <p className="text-xl font-black leading-none">{asset.availableTokens.toLocaleString("es-AR")}</p>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between text-xs text-[var(--color-muted)]">
                <p>Ciclo {normalizedProgress.toFixed(0)}% completado</p>
                <p>{estimatedDaysLeft} dias restantes</p>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--color-surface-soft)]">
                <div className="h-full rounded-full bg-[var(--color-primary)]" style={{ width: `${normalizedProgress}%` }} />
              </div>
              <p className="mt-4 inline-flex items-center gap-1 text-xs text-[var(--color-muted)]">
                <Activity size={13} /> ROI proyectado (estimado): {asset.investorMetrics?.projectedRoi ?? asset.expectedYield}
              </p>

              <div className="mt-7 grid gap-2 sm:mt-auto sm:grid-cols-2">
                <Button type="button" className="w-full" onClick={() => router.push(`/assets/${asset.id}`)}>
                  Ver activo
                </Button>
                <Button type="button" variant="outline" className="w-full gap-2 border-[#c9a746] bg-[#c9a746]/12 text-[#f0d68d] hover:bg-[#c9a746]/20 hover:text-[#ffe6a6]" onClick={() => router.push(`/chats?assetId=${asset.id}`)}>
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
