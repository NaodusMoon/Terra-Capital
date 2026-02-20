"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MARKETPLACE_EVENT } from "@/lib/constants";
import { formatShortDate, formatUSDT } from "@/lib/format";
import { getPurchases, getSellerAssets, syncMarketplace } from "@/lib/marketplace";

export function SellerAssetDetailPage({ assetId }: { assetId: string }) {
  const { user } = useAuth();
  const router = useRouter();
  const [revision, setRevision] = useState(0);

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
    const asset = getSellerAssets(user.id).find((row) => row.id === assetId);
    if (!asset) return null;
    const sales = getPurchases().filter((row) => row.assetId === assetId && row.sellerId === user.id);
    const soldTokens = sales.reduce((sum, row) => sum + row.quantity, 0);
    const grossAmount = sales.reduce((sum, row) => sum + row.totalPaid, 0);
    const uniqueBuyers = new Set(sales.map((row) => row.buyerId)).size;
    return { asset, sales, soldTokens, grossAmount, uniqueBuyers };
  }, [assetId, revision, user]);

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

  const fillPct = (data.soldTokens / Math.max(1, data.asset.totalTokens)) * 100;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-5 sm:py-9">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black sm:text-3xl">{data.asset.title}</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">Metricas completas de publicacion para vendedor.</p>
        </div>
        <Button variant="outline" onClick={() => router.push("/seller/assets")}>Volver</Button>
      </div>

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
          <p className="text-sm text-[var(--color-muted)]">Ingresos</p>
          <p className="mt-2 text-2xl font-bold">{formatUSDT(data.grossAmount)}</p>
        </Card>
        <Card>
          <p className="text-sm text-[var(--color-muted)]">Compradores recurrentes</p>
          <p className="mt-2 text-2xl font-bold">{data.asset.sellerMetrics?.recurringInvestors ?? 0}</p>
        </Card>
      </section>

      <section className="mt-6 grid gap-5 lg:grid-cols-[1fr_1fr]">
        <Card>
          <h2 className="text-lg font-bold">Salud del ciclo y capitalizacion</h2>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--color-surface-soft)]">
            <div className="h-full rounded-full bg-[var(--color-primary)]" style={{ width: `${fillPct}%` }} />
          </div>
          <p className="mt-2 text-sm text-[var(--color-muted)]">Absorcion: {fillPct.toFixed(2)}%</p>
          <p className="mt-2 text-sm text-[var(--color-muted)]">Meta: {formatUSDT(data.asset.sellerMetrics?.capitalizationGoalSats ?? 0)}</p>
          <p className="mt-2 text-sm text-[var(--color-muted)]">Actual: {formatUSDT(data.asset.sellerMetrics?.capitalizationCurrentSats ?? 0)}</p>
          <p className="mt-2 text-sm text-[var(--color-muted)]">Retencion de inversores: {(data.asset.sellerMetrics?.retentionPct ?? 0).toFixed(2)}%</p>
        </Card>

        <Card>
          <h2 className="text-lg font-bold">Trazabilidad</h2>
          <p className="mt-2 text-sm text-[var(--color-muted)]">Proof of Asset: {data.asset.proofOfAssetHash}</p>
          <p className="mt-2 text-sm text-[var(--color-muted)]">Audit hash: {data.asset.auditHash ?? "Pendiente"}</p>
          <p className="mt-2 text-sm text-[var(--color-muted)]">Duracion ciclo: {data.asset.cycleDurationDays} dias</p>
          <p className="mt-2 text-sm text-[var(--color-muted)]">APY estimado: {(data.asset.estimatedApyBps / 100).toFixed(2)}%</p>
          <p className="mt-2 text-sm text-[var(--color-muted)]">ROI historico: {(data.asset.historicalRoiBps / 100).toFixed(2)}%</p>
        </Card>
      </section>

      <section className="mt-6">
        <Card>
          <h2 className="text-lg font-bold">Operaciones de compra</h2>
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
    </main>
  );
}
