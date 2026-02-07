"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState, type ComponentType } from "react";
import { Beef, Filter, LandPlot, MessageCircle, Search, Sprout, TrendingUp } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FadeIn } from "@/components/ui/fade-in";
import { StellarStatusCard } from "@/features/stellar/components/stellar-status-card";
import { MARKETPLACE_EVENT } from "@/lib/constants";
import { formatShortDate, formatUSD } from "@/lib/format";
import {
  buyAsset,
  getAssets,
  getBlendLiquiditySnapshot,
  getBuyerPortfolio,
  getBuyerThreads,
  getThreadMessages,
  sendThreadMessage,
} from "@/lib/marketplace";
import type { AssetCategory, TokenizedAsset } from "@/types/market";

const categoryMeta: Record<AssetCategory, { label: string; icon: ComponentType<{ size?: number; className?: string }> }> = {
  cultivo: { label: "Cultivo", icon: Sprout },
  tierra: { label: "Tierra", icon: LandPlot },
  ganaderia: { label: "Ganaderia", icon: Beef },
};

const categoryGalleryFallback: Record<AssetCategory, string[]> = {
  cultivo: [
    "https://images.unsplash.com/photo-1464226184884-fa280b87c399?auto=format&fit=crop&w=1400&q=80",
    "https://images.unsplash.com/photo-1620147461831-a97b99ade1d3?auto=format&fit=crop&w=1400&q=80",
    "https://images.unsplash.com/photo-1472396961693-142e6e269027?auto=format&fit=crop&w=1400&q=80",
  ],
  tierra: [
    "https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1400&q=80",
    "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1400&q=80",
    "https://images.unsplash.com/photo-1499529112087-3cb3b73cec95?auto=format&fit=crop&w=1400&q=80",
  ],
  ganaderia: [
    "https://images.unsplash.com/photo-1527153857715-3908f2bae5e8?auto=format&fit=crop&w=1400&q=80",
    "https://images.unsplash.com/photo-1516467508483-a7212febe31a?auto=format&fit=crop&w=1400&q=80",
    "https://images.unsplash.com/photo-1519052537078-e6302a4968d4?auto=format&fit=crop&w=1400&q=80",
  ],
};

function TokenPreview({ category }: { category: AssetCategory }) {
  const Icon = categoryMeta[category].icon;

  return (
    <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-[var(--color-primary)] via-[var(--color-accent)] to-[var(--color-gold)] text-[var(--color-primary-contrast)] shadow-md shadow-black/20">
      <Icon size={20} />
    </div>
  );
}

function getAssetGallery(asset: TokenizedAsset) {
  const fromAsset = [...(asset.imageUrls ?? []), ...(asset.imageUrl ? [asset.imageUrl] : [])].filter(Boolean);
  const unique = Array.from(new Set([...fromAsset, ...categoryGalleryFallback[asset.category]]));
  return unique.slice(0, 6);
}

export function BuyerDashboard() {
  const { user } = useAuth();

  const [assets, setAssets] = useState<TokenizedAsset[]>([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"all" | AssetCategory>("all");
  const [sortBy, setSortBy] = useState<"recent" | "priceAsc" | "priceDesc" | "stock">("recent");
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [activeGalleryIndex, setActiveGalleryIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [tradeMessage, setTradeMessage] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [confirmAccepted, setConfirmAccepted] = useState(false);
  const [portfolio, setPortfolio] = useState<ReturnType<typeof getBuyerPortfolio>>([]);
  const [threads, setThreads] = useState<ReturnType<typeof getBuyerThreads>>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatError, setChatError] = useState("");

  const syncData = useCallback(() => {
    if (!user) return;

    const allAssets = getAssets();
    setAssets(allAssets);
    setPortfolio(getBuyerPortfolio(user.id));

    const nextThreads = getBuyerThreads(user.id);
    setThreads(nextThreads);
    if (!activeThreadId && nextThreads.length > 0) {
      setActiveThreadId(nextThreads[0].id);
    }
  }, [activeThreadId, user]);

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
      if (sortBy === "priceAsc") return a.pricePerToken - b.pricePerToken;
      if (sortBy === "priceDesc") return b.pricePerToken - a.pricePerToken;
      if (sortBy === "stock") return b.availableTokens - a.availableTokens;
      return +new Date(b.createdAt) - +new Date(a.createdAt);
    });
  }, [assets, categoryFilter, search, sortBy]);

  const searchSuggestions = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (normalized.length < 2) return [];
    return assets
      .filter((asset) => asset.title.toLowerCase().includes(normalized) || asset.location.toLowerCase().includes(normalized))
      .slice(0, 5);
  }, [assets, search]);

  const selectedAsset = filteredAssets.find((asset) => asset.id === selectedAssetId) || assets.find((asset) => asset.id === selectedAssetId) || null;
  const selectedGallery = selectedAsset ? getAssetGallery(selectedAsset) : [];
  const activeGalleryImage = selectedGallery[activeGalleryIndex] || selectedGallery[0] || "";
  const activeMessages = activeThreadId ? getThreadMessages(activeThreadId) : [];
  const marketAvailableTokens = assets.reduce((sum, asset) => sum + asset.availableTokens, 0);
  const blendSnapshot = getBlendLiquiditySnapshot();

  const openAssetDetail = (assetId: string) => {
    setSelectedAssetId(assetId);
    setActiveGalleryIndex(0);
    setQuantity(1);
    setTradeMessage("");
    setConfirmOpen(false);
    setConfirmText("");
    setConfirmAccepted(false);
  };

  const handleBuy = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedAsset) return;
    if (selectedAsset.availableTokens <= 0) {
      setTradeMessage("Sin disponibilidad para este activo.");
      return;
    }
    setConfirmOpen(true);
  };

  const confirmBuy = () => {
    if (!selectedAsset || !user) return;
    if (!confirmAccepted || confirmText.trim().toUpperCase() !== "CONFIRMAR") {
      setTradeMessage("Debes aceptar la compra y escribir CONFIRMAR para continuar.");
      return;
    }

    const result = buyAsset(selectedAsset.id, user, quantity);
    if (!result.ok) {
      setTradeMessage(result.message);
      return;
    }

    setTradeMessage("Compra confirmada. Tu registro quedo guardado en portafolio.");
    setQuantity(1);
    setConfirmOpen(false);
    setConfirmText("");
    setConfirmAccepted(false);
    syncData();
  };

  const handleSendChat = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setChatError("");

    if (!activeThreadId || !user) return;
    const result = sendThreadMessage(activeThreadId, user, "buyer", chatInput);

    if (!result.ok) {
      setChatError(result.message);
      return;
    }

    setChatInput("");
    syncData();
  };

  return (
    <main className="mx-auto w-full max-w-7xl px-5 py-9">
      <FadeIn>
        <h1 className="text-3xl font-black">Marketplace de Activos Tokenizados</h1>
        <p className="mt-2 text-[var(--color-muted)]">Explora oportunidades, filtra por categoria y compra tokens con stock actualizado.</p>
      </FadeIn>

      <section className="mt-7 grid gap-5 md:grid-cols-4">
        <Card>
          <p className="text-sm text-[var(--color-muted)]">Activos listados</p>
          <p className="mt-2 text-2xl font-bold">{assets.length}</p>
        </Card>
        <Card>
          <p className="text-sm text-[var(--color-muted)]">Tokens disponibles</p>
          <p className="mt-2 text-2xl font-bold">{marketAvailableTokens.toLocaleString("es-AR")}</p>
        </Card>
        <Card>
          <p className="text-sm text-[var(--color-muted)]">Inversion ejecutada</p>
          <p className="mt-2 text-2xl font-bold">{formatUSD(portfolio.reduce((sum, row) => sum + row.purchase.totalPaid, 0))}</p>
        </Card>
        <StellarStatusCard />
      </section>

      <section className="mt-5">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-[var(--color-muted)]">Flujo de liquidez</p>
              <h2 className="text-lg font-bold">Post-venta: Blend + liquidaciones a holders</h2>
            </div>
            <p className="rounded-full bg-[var(--color-surface-soft)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-muted)]">
              Ciclo {blendSnapshot.cycle}
            </p>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3 text-sm">
            <p className="rounded-xl bg-[var(--color-surface-soft)] px-3 py-2">Volumen total: <strong>{formatUSD(blendSnapshot.grossVolume)}</strong></p>
            <p className="rounded-xl bg-[var(--color-surface-soft)] px-3 py-2">Enviado a Blend: <strong>{formatUSD(blendSnapshot.sentToBlend)}</strong></p>
            <p className="rounded-xl bg-[var(--color-surface-soft)] px-3 py-2">Reserva para payouts: <strong>{formatUSD(blendSnapshot.reserveForPayouts)}</strong></p>
          </div>
        </Card>
      </section>

      <section className="mt-7 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_220px_220px]">
          <label className="relative block">
            <Search size={16} className="pointer-events-none absolute left-3 top-3.5 text-[var(--color-muted)]" />
            <input
              className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] pl-10 pr-3"
              placeholder="Buscar por nombre, zona o vendedor"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            {searchSuggestions.length > 0 && (
              <div className="absolute left-0 top-12 z-20 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2 shadow-lg">
                {searchSuggestions.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setSearch(item.title);
                      openAssetDetail(item.id);
                    }}
                    className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--color-surface-soft)]"
                  >
                    <p className="font-semibold">{item.title}</p>
                    <p className="text-xs text-[var(--color-muted)]">{item.location}</p>
                  </button>
                ))}
              </div>
            )}
          </label>

          <label className="block">
            <span className="sr-only">Categoria</span>
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
          </label>

          <label className="block">
            <span className="sr-only">Ordenar por</span>
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
          </label>
        </div>

        <div className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[var(--color-surface-soft)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.15em] text-[var(--color-muted)]">
          <Filter size={14} /> {filteredAssets.length} resultados
        </div>
      </section>

      <section className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filteredAssets.map((asset) => (
          <article
            key={asset.id}
            className="cursor-pointer rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm shadow-black/5 transition hover:-translate-y-0.5 hover:shadow-md"
            onClick={() => openAssetDetail(asset.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openAssetDetail(asset.id);
              }
            }}
            role="button"
            tabIndex={0}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <TokenPreview category={asset.category} />
              <span className="rounded-full bg-[var(--color-surface-soft)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.13em] text-[var(--color-muted)]">
                {categoryMeta[asset.category].label}
              </span>
            </div>

            <h3 className="text-lg font-bold leading-tight">{asset.title}</h3>
            <p className="mt-1 text-xs uppercase tracking-[0.15em] text-[var(--color-muted)]">{asset.location}</p>
            <p className="mt-3 line-clamp-2 text-sm text-[var(--color-muted)]">{asset.description}</p>

            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg bg-[var(--color-surface-soft)] px-3 py-2">
                <p className="text-xs text-[var(--color-muted)]">Precio</p>
                <p className="font-bold">{formatUSD(asset.pricePerToken)}</p>
              </div>
              <div className="rounded-lg bg-[var(--color-surface-soft)] px-3 py-2">
                <p className="text-xs text-[var(--color-muted)]">Disponible</p>
                <p className="font-bold">{asset.availableTokens.toLocaleString("es-AR")}</p>
              </div>
            </div>
          </article>
        ))}
      </section>

      {selectedAsset && (
        <section className="mt-8 grid gap-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <div className="flex items-start gap-3">
              <TokenPreview category={selectedAsset.category} />
              <div>
                <h2 className="text-2xl font-black">{selectedAsset.title}</h2>
                <p className="text-sm text-[var(--color-muted)]">{selectedAsset.sellerName} · {selectedAsset.location}</p>
              </div>
            </div>

            <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)]">
              <div className="h-72 w-full bg-[var(--color-surface-soft)]">
                {activeGalleryImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={activeGalleryImage} alt={selectedAsset.title} className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full place-items-center text-sm text-[var(--color-muted)]">Sin imagen</div>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2 border-t border-[var(--color-border)] p-2 md:grid-cols-5">
                {selectedGallery.map((image, index) => (
                  <button
                    key={`${selectedAsset.id}-${index}`}
                    type="button"
                    onClick={() => setActiveGalleryIndex(index)}
                    className={`h-16 overflow-hidden rounded-lg border ${
                      index === activeGalleryIndex ? "border-[var(--color-primary)]" : "border-[var(--color-border)]"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={image} alt={`${selectedAsset.title} ${index + 1}`} className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            </div>

            <p className="mt-4 text-sm text-[var(--color-muted)]">{selectedAsset.description}</p>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Card>
                <p className="text-xs text-[var(--color-muted)]">Precio token</p>
                <p className="font-bold">{formatUSD(selectedAsset.pricePerToken)}</p>
              </Card>
              <Card>
                <p className="text-xs text-[var(--color-muted)]">Stock actual</p>
                <p className="font-bold">{selectedAsset.availableTokens.toLocaleString("es-AR")}</p>
              </Card>
              <Card>
                <p className="text-xs text-[var(--color-muted)]">Rendimiento</p>
                <p className="font-bold">{selectedAsset.expectedYield}</p>
              </Card>
            </div>

            {selectedAsset.videoUrl && (
              <a className="mt-4 inline-flex text-sm font-semibold text-[var(--color-primary)] underline" href={selectedAsset.videoUrl} target="_blank" rel="noreferrer">
                Ver video del activo
              </a>
            )}
          </div>

          <Card>
            <h3 className="text-xl font-bold">Comprar tokens</h3>
            <p className="mt-2 text-sm text-[var(--color-muted)]">Selecciona cantidad y confirma la operacion.</p>

            <form className="mt-4 space-y-3" onSubmit={handleBuy}>
              <label className="block text-sm">
                <span>Cantidad de tokens</span>
                <input
                  type="number"
                  min={1}
                  max={selectedAsset.availableTokens}
                  value={quantity}
                  onChange={(event) => setQuantity(Number(event.target.value))}
                  className="mt-1 h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3"
                  required
                />
              </label>

              <div className="rounded-xl bg-[var(--color-surface-soft)] p-3 text-sm">
                <p className="text-[var(--color-muted)]">Total estimado</p>
                <p className="text-xl font-bold">{formatUSD(quantity * selectedAsset.pricePerToken)}</p>
              </div>

              {tradeMessage && <p className="text-sm text-[var(--color-primary)]">{tradeMessage}</p>}

              <Button type="submit" className="w-full" disabled={selectedAsset.availableTokens <= 0}>
                {selectedAsset.availableTokens <= 0 ? "Sin disponibilidad" : "Comprar ahora"}
              </Button>
            </form>

            {confirmOpen && (
              <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-3 text-sm">
                <p className="font-semibold">Confirmacion de compra</p>
                <p className="mt-1 text-[var(--color-muted)]">Vas a comprar <strong>{quantity.toLocaleString("es-AR")}</strong> tokens por <strong>{formatUSD(quantity * selectedAsset.pricePerToken)}</strong>.</p>
                <label className="mt-3 flex items-center gap-2">
                  <input type="checkbox" checked={confirmAccepted} onChange={(event) => setConfirmAccepted(event.target.checked)} />
                  <span>Confirmo que revise el monto y deseo continuar.</span>
                </label>
                <input
                  className="mt-3 h-10 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3"
                  placeholder="Escribe CONFIRMAR"
                  value={confirmText}
                  onChange={(event) => setConfirmText(event.target.value)}
                />
                <div className="mt-3 flex gap-2">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setConfirmOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="button" className="flex-1" onClick={confirmBuy}>
                    Confirmar compra
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </section>
      )}

      <section className="mt-8 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">Mis tokens comprados</h2>
            <span className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-[var(--color-muted)]">
              <TrendingUp size={14} /> {portfolio.length} operaciones
            </span>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.14em] text-[var(--color-muted)]">
                <tr>
                  <th className="py-2 pr-4">Activo</th>
                  <th className="py-2 pr-4">Cantidad</th>
                  <th className="py-2 pr-4">Precio unitario</th>
                  <th className="py-2 pr-4">Total pagado</th>
                  <th className="py-2">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {portfolio.map((row) => (
                  <tr key={row.purchase.id} className="border-t border-[var(--color-border)]">
                    <td className="py-3 pr-4 font-semibold">{row.asset?.title}</td>
                    <td className="py-3 pr-4">{row.purchase.quantity.toLocaleString("es-AR")}</td>
                    <td className="py-3 pr-4">{formatUSD(row.purchase.pricePerToken)}</td>
                    <td className="py-3 pr-4">{formatUSD(row.purchase.totalPaid)}</td>
                    <td className="py-3">{formatShortDate(row.purchase.purchasedAt)}</td>
                  </tr>
                ))}
                {portfolio.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-[var(--color-muted)]">
                      Aun no tienes compras registradas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <MessageCircle size={18} /> Chat con vendedores
          </h2>

          <div className="mt-4 grid gap-3">
            <select
              value={activeThreadId ?? ""}
              onChange={(event) => setActiveThreadId(event.target.value || null)}
              className="h-10 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm"
            >
              <option value="">Selecciona una conversacion</option>
              {threads.map((thread) => {
                const assetTitle = assets.find((asset) => asset.id === thread.assetId)?.title || "Activo";
                return (
                  <option key={thread.id} value={thread.id}>
                    {thread.sellerName} · {assetTitle}
                  </option>
                );
              })}
            </select>

            <div className="h-52 overflow-y-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-3">
              {activeThreadId && activeMessages.length > 0 ? (
                <div className="space-y-2">
                  {activeMessages.map((message) => (
                    <article
                      key={message.id}
                      className={`max-w-[88%] rounded-xl px-3 py-2 text-sm ${
                        message.senderRole === "buyer"
                          ? "ml-auto bg-[var(--color-primary)] text-[var(--color-primary-contrast)]"
                          : "bg-[var(--color-surface-soft)]"
                      }`}
                    >
                      <p className="font-semibold text-xs opacity-80">{message.senderName}</p>
                      <p>{message.text}</p>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-[var(--color-muted)]">No hay mensajes para mostrar.</p>
              )}
            </div>

            <form className="space-y-2" onSubmit={handleSendChat}>
              <textarea
                className="h-24 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-3 text-sm"
                placeholder="Escribe tu mensaje al vendedor"
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                disabled={!activeThreadId}
              />
              {chatError && <p className="text-sm text-red-500">{chatError}</p>}
              <Button type="submit" className="w-full" disabled={!activeThreadId}>
                Enviar mensaje
              </Button>
            </form>
          </div>
        </Card>
      </section>
    </main>
  );
}
