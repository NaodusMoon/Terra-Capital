"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/components/providers/auth-provider";
import { MARKETPLACE_EVENT } from "@/lib/constants";
import { formatShortDate, formatUSDT } from "@/lib/format";
import { getBuyerPortfolio, syncMarketplace } from "@/lib/marketplace";

export function PortfolioAssetDetailPage({ assetId }: { assetId: string }) {
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
    const rows = getBuyerPortfolio(user.id).filter((row) => row.purchase.assetId === assetId);
    if (rows.length === 0 || !rows[0].asset) return null;
    const asset = rows[0].asset;
    const totalTokens = rows.reduce((sum, row) => sum + row.purchase.quantity, 0);
    const totalInvested = rows.reduce((sum, row) => sum + row.purchase.totalPaid, 0);
    const participationPct = (totalTokens / Math.max(1, asset.totalTokens)) * 100;
    const netProfit = asset.netProfitSats ?? 0;
    const projectedGain = (totalTokens / Math.max(1, asset.totalTokens)) * netProfit;
    const projectedPayout = totalInvested + projectedGain;
    return { asset, rows, totalTokens, totalInvested, participationPct, projectedGain, projectedPayout };
  }, [assetId, revision, user]);

  if (!data) {
    return (
      <main className="mx-auto grid min-h-[60vh] w-full max-w-6xl place-items-center px-4 text-center">
        <div>
          <p className="text-sm text-[var(--color-muted)]">No se encontro este activo en tu portafolio.</p>
          <Button className="mt-3" onClick={() => router.push("/portfolio")}>Volver al portafolio</Button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-5 sm:py-9">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black sm:text-3xl">{data.asset.title}</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">Detalle de posicion y metricas de ciclo.</p>
        </div>
        <Button variant="outline" onClick={() => router.push("/portfolio")}>Volver</Button>
      </div>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <p className="text-sm text-[var(--color-muted)]">Tokens acumulados</p>
          <p className="mt-2 text-2xl font-bold">{data.totalTokens.toLocaleString("es-AR")}</p>
        </Card>
        <Card>
          <p className="text-sm text-[var(--color-muted)]">Inversion total</p>
          <p className="mt-2 text-2xl font-bold">{formatUSDT(data.totalInvested)}</p>
        </Card>
        <Card>
          <p className="text-sm text-[var(--color-muted)]">Participacion</p>
          <p className="mt-2 text-2xl font-bold">{data.participationPct.toFixed(2)}%</p>
        </Card>
        <Card>
          <p className="text-sm text-[var(--color-muted)]">Payout proyectado</p>
          <p className="mt-2 text-2xl font-bold">{formatUSDT(data.projectedPayout)}</p>
        </Card>
      </section>

      <section className="mt-6 grid gap-5 lg:grid-cols-[1fr_1fr]">
        <Card>
          <h2 className="text-lg font-bold">Modelo de ganancia del ciclo</h2>
          <p className="mt-2 text-sm text-[var(--color-muted)]">G = (Tu / Ttotal) x Pneta</p>
          <p className="mt-2 text-sm text-[var(--color-muted)]">Tu: {data.totalTokens.toLocaleString("es-AR")} · Ttotal: {data.asset.totalTokens.toLocaleString("es-AR")}</p>
          <p className="mt-2 text-sm text-[var(--color-muted)]">Pneta estimada: {formatUSDT(data.asset.netProfitSats ?? 0)}</p>
          <p className="mt-2 text-base font-semibold">Ganancia estimada de tu posicion: {formatUSDT(data.projectedGain)}</p>
          <p className="mt-2 text-xs text-[var(--color-muted)]">Hash de verificacion: {data.asset.proofOfAssetHash}</p>
        </Card>

        <Card>
          <h2 className="text-lg font-bold">Estado operativo</h2>
          <p className="mt-2 text-sm text-[var(--color-muted)]">Estado: {data.asset.lifecycleStatus}</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--color-surface-soft)]">
            <div className="h-full rounded-full bg-[var(--color-primary)]" style={{ width: `${data.asset.investorMetrics?.cycleProgressPct ?? 0}%` }} />
          </div>
          <p className="mt-2 text-sm text-[var(--color-muted)]">Progreso de ciclo: {(data.asset.investorMetrics?.cycleProgressPct ?? 0).toFixed(1)}%</p>
          <p className="mt-2 text-sm text-[var(--color-muted)]">APY estimado: {(data.asset.estimatedApyBps / 100).toFixed(2)}%</p>
          <p className="mt-2 text-sm text-[var(--color-muted)]">ROI historico: {(data.asset.historicalRoiBps / 100).toFixed(2)}%</p>
        </Card>
      </section>

      <section className="mt-6">
        <Card>
          <h2 className="text-lg font-bold">Historial de compras</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.14em] text-[var(--color-muted)]">
                <tr>
                  <th className="py-2 pr-4">Fecha</th>
                  <th className="py-2 pr-4">Tokens</th>
                  <th className="py-2 pr-4">Precio unitario</th>
                  <th className="py-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.purchase.id} className="border-t border-[var(--color-border)]">
                    <td className="py-3 pr-4">{formatShortDate(row.purchase.purchasedAt)}</td>
                    <td className="py-3 pr-4">{row.purchase.quantity.toLocaleString("es-AR")}</td>
                    <td className="py-3 pr-4">{formatUSDT(row.purchase.pricePerToken)}</td>
                    <td className="py-3">{formatUSDT(row.purchase.totalPaid)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </section>
    </main>
  );
}
