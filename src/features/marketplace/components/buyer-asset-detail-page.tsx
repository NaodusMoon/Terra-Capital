"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, MessageCircle } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MARKETPLACE_EVENT } from "@/lib/constants";
import { formatUSDT } from "@/lib/format";
import { buyAsset, getAssets, syncMarketplace } from "@/lib/marketplace";

export function BuyerAssetDetailPage({ assetId }: { assetId: string }) {
  const { user } = useAuth();
  const router = useRouter();

  const [quantity, setQuantity] = useState(1);
  const [tradeMessage, setTradeMessage] = useState("");
  const [asset, setAsset] = useState(() => getAssets().find((row) => row.id === assetId) ?? null);
  const [mediaIndex, setMediaIndex] = useState(0);

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

  const handleBuy = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!asset || !user) return;
    if (asset.lifecycleStatus !== "FUNDING") {
      setTradeMessage("La compra solo esta disponible en estado FUNDING.");
      return;
    }
    const result = await buyAsset(asset.id, user, quantity);
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
          <Button className="mt-3" onClick={() => router.push("/buyer")}>Volver al marketplace</Button>
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

  const safeIndex = Math.min(mediaIndex, Math.max(0, mediaGallery.length - 1));
  const currentMedia = mediaGallery[safeIndex];

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-5 sm:py-9">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black">{asset.title}</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">{asset.sellerName} · {asset.location}</p>
        </div>
        <Button variant="outline" onClick={() => router.push("/buyer")}>Volver al marketplace</Button>
      </div>

      <section className="mt-6 grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <div className="h-72 overflow-hidden rounded-xl bg-[var(--color-surface-soft)]">
            {!currentMedia && <div className="grid h-full place-items-center text-sm text-[var(--color-muted)]">Sin multimedia</div>}
            {currentMedia?.kind === "image" && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={currentMedia.url} alt={asset.title} className="h-full w-full object-cover" />
            )}
            {currentMedia?.kind === "video" && <video controls className="h-full w-full object-cover" src={currentMedia.url} />}
          </div>

          {mediaGallery.length > 1 && (
            <div className="mt-2 flex items-center gap-2">
              <Button type="button" variant="outline" className="h-9 px-3" onClick={() => setMediaIndex((prev) => (prev - 1 + mediaGallery.length) % mediaGallery.length)}>
                <ChevronLeft size={15} />
              </Button>
              <div className="flex flex-1 gap-2 overflow-x-auto">
                {mediaGallery.map((item, idx) => (
                  <button key={item.id} type="button" onClick={() => setMediaIndex(idx)} className={`h-14 w-20 shrink-0 overflow-hidden rounded-lg border ${idx === safeIndex ? "border-[var(--color-primary)]" : "border-[var(--color-border)]"}`}>
                    {item.kind === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.url} alt={`${asset.title}-${idx + 1}`} className="h-full w-full object-cover" />
                    ) : (
                      <div className="grid h-full w-full place-items-center bg-[var(--color-surface-soft)] text-xs">VIDEO</div>
                    )}
                  </button>
                ))}
              </div>
              <Button type="button" variant="outline" className="h-9 px-3" onClick={() => setMediaIndex((prev) => (prev + 1) % mediaGallery.length)}>
                <ChevronRight size={15} />
              </Button>
            </div>
          )}

          <p className="mt-4 text-sm text-[var(--color-muted)]">{asset.description}</p>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Card>
              <p className="text-xs text-[var(--color-muted)]">Precio por token</p>
              <p className="font-bold">{formatUSDT(asset.tokenPriceSats)}</p>
            </Card>
            <Card>
              <p className="text-xs text-[var(--color-muted)]">Estado</p>
              <p className="font-bold">{asset.lifecycleStatus}</p>
            </Card>
            <Card>
              <p className="text-xs text-[var(--color-muted)]">Duracion ciclo</p>
              <p className="font-bold">{asset.cycleDurationDays} dias</p>
            </Card>
          </div>

          <Card className="mt-4 text-sm">
            <p className="font-semibold">Estado API del ciclo</p>
            {asset.apiState.status === "FUNDING" && (
              <p className="mt-2 text-[var(--color-muted)]">Funding: {asset.apiState.funding_progress}% · APY estimado: {asset.apiState.estimated_apy}</p>
            )}
            {asset.apiState.status === "OPERATING" && (
              <p className="mt-2 text-[var(--color-muted)]">Operando: {asset.apiState.days_remaining} dias restantes · Yield: {formatUSDT(asset.apiState.current_yield_accrued)}</p>
            )}
            {asset.apiState.status === "SETTLED" && (
              <p className="mt-2 text-[var(--color-muted)]">Liquidado: payout {formatUSDT(asset.apiState.final_payout_sats)} · audit {asset.apiState.audit_hash}</p>
            )}
            <p className="mt-2 text-xs text-[var(--color-muted)]">Proof of Asset: {asset.proofOfAssetHash}</p>
          </Card>
        </Card>

        <Card>
          <h2 className="text-xl font-bold">Invertir en este ciclo</h2>
          <p className="mt-2 text-sm text-[var(--color-muted)]">Participacion actual: {(asset.investorMetrics?.participationPct ?? 0).toFixed(2)}%</p>

          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--color-surface-soft)]">
            <div className="h-full rounded-full bg-[var(--color-primary)]" style={{ width: `${asset.investorMetrics?.cycleProgressPct ?? 0}%` }} />
          </div>

          <form className="mt-4 space-y-3" onSubmit={handleBuy}>
            <label className="block text-sm">
              <span>Cantidad de tokens</span>
              <input
                type="number"
                min={1}
                max={asset.availableTokens}
                value={quantity}
                onChange={(event) => setQuantity(Number(event.target.value))}
                className="mt-1 h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3"
                required
              />
            </label>

            <div className="rounded-xl bg-[var(--color-surface-soft)] p-3 text-sm">
              <p className="text-[var(--color-muted)]">Total estimado</p>
              <p className="text-xl font-bold">{formatUSDT(quantity * asset.tokenPriceSats)}</p>
            </div>

            <Button type="submit" className="w-full" disabled={asset.lifecycleStatus !== "FUNDING" || asset.availableTokens <= 0}>
              {asset.lifecycleStatus !== "FUNDING" ? "No disponible para compra" : "Comprar tokens"}
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
