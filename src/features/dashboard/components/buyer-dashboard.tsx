"use client";

import { useCallback, useEffect, useMemo, useState, type ComponentType } from "react";
import { useRouter } from "next/navigation";
import { Beef, Filter, LandPlot, MessageCircle, Search, Sprout } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FadeIn } from "@/components/ui/fade-in";
import { MARKETPLACE_EVENT } from "@/lib/constants";
import { formatUSDT } from "@/lib/format";
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

function TokenPreview({ category }: { category: AssetCategory }) {
  const Icon = categoryMeta[category].icon;
  return (
    <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-[var(--color-primary)] via-[var(--color-accent)] to-[var(--color-gold)] text-[var(--color-primary-contrast)] shadow-md shadow-black/20">
      <Icon size={20} />
    </div>
  );
}

export function BuyerDashboard() {
  const { user } = useAuth();
  const router = useRouter();

  const [assets, setAssets] = useState<TokenizedAsset[]>([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"all" | AssetCategory>("all");
  const [sortBy, setSortBy] = useState<"recent" | "priceAsc" | "priceDesc" | "stock">("recent");
  const [syncError, setSyncError] = useState("");

  const syncData = useCallback(async () => {
    if (!user) return;
    try {
      await syncMarketplace(user.id);
      setAssets(getAssets());
      setSyncError("");
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "No se pudo sincronizar el marketplace.");
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const boot = window.setTimeout(() => {
      void syncData();
    }, 0);

    const marketListener = () => {
      void syncData();
    };
    const storageListener = (event: StorageEvent) => {
      if (!event.key || event.key.startsWith("terra_capital_")) {
        void syncData();
      }
    };

    window.addEventListener(MARKETPLACE_EVENT, marketListener);
    window.addEventListener("storage", storageListener);
    const interval = window.setInterval(() => {
      void syncData();
    }, 4000);

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

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-5 sm:py-9">
      <FadeIn>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-black">Marketplace de Activos Productivos</h1>
            <p className="mt-2 text-[var(--color-muted)]">Modelo por ciclos de produccion en USDT: funding, operacion y liquidacion.</p>
          </div>
          <Button type="button" variant="outline" onClick={() => router.push("/portfolio")}>Mi portafolio</Button>
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

        <div className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[var(--color-surface-soft)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.15em] text-[var(--color-muted)]">
          <Filter size={14} /> {filteredAssets.length} activos
        </div>
      </section>

      <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {filteredAssets.map((asset) => {
          const progress = asset.investorMetrics?.cycleProgressPct ?? 0;
          return (
            <article
              key={asset.id}
              className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm shadow-black/5"
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <TokenPreview category={asset.category} />
                <div className="flex flex-col items-end gap-1">
                  <span className="rounded-full bg-[var(--color-surface-soft)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.13em] text-[var(--color-muted)]">
                    {categoryMeta[asset.category].label}
                  </span>
                  <span className="terra-badge px-3 py-1 text-[10px]">
                    {getStateLabel(asset.lifecycleStatus)}
                  </span>
                </div>
              </div>

              <h3 className="text-lg font-bold leading-tight">{asset.title}</h3>
              <p className="mt-1 text-xs uppercase tracking-[0.15em] text-[var(--color-muted)]">{asset.location}</p>
              <p className="mt-3 line-clamp-2 text-sm text-[var(--color-muted)]">{asset.description}</p>

              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg bg-[var(--color-surface-soft)] px-3 py-2">
                  <p className="text-xs text-[var(--color-muted)]">Precio por token</p>
                  <p className="font-bold">{formatUSDT(asset.tokenPriceSats)}</p>
                </div>
                <div className="rounded-lg bg-[var(--color-surface-soft)] px-3 py-2">
                  <p className="text-xs text-[var(--color-muted)]">Disponibles</p>
                  <p className="font-bold">{asset.availableTokens.toLocaleString("es-AR")}</p>
                </div>
              </div>

              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--color-surface-soft)]">
                <div className="h-full rounded-full bg-[var(--color-primary)]" style={{ width: `${progress}%` }} />
              </div>
              <p className="mt-2 text-xs text-[var(--color-muted)]">
                ROI proyectado: {asset.investorMetrics?.projectedRoi ?? asset.expectedYield} · Hash: {asset.proofOfAssetHash.slice(0, 16)}...
              </p>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <Button type="button" className="w-full" onClick={() => router.push(`/buyer/assets/${asset.id}`)}>
                  Ver activo
                </Button>
                <Button type="button" variant="outline" className="w-full gap-2" onClick={() => router.push(`/chats?assetId=${asset.id}`)}>
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
