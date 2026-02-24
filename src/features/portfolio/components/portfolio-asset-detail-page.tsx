"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/components/providers/auth-provider";
import { MARKETPLACE_EVENT } from "@/lib/constants";
import { formatShortDate, formatUSDT } from "@/lib/format";
import { getBuyerPortfolio, syncMarketplace } from "@/lib/marketplace";

type ChartPoint = {
  label: string;
  value: number;
};

function LineChart({ data }: { data: ChartPoint[] }) {
  const maxValue = Math.max(1, ...data.map((point) => point.value));
  const points = data
    .map((point, index) => {
      const x = data.length <= 1 ? 6 : 6 + (index * 88) / Math.max(1, data.length - 1);
      const y = 94 - (point.value / maxValue) * 88;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox="0 0 100 100" className="h-44 w-full rounded-xl bg-[var(--color-surface-soft)] p-2">
      <line x1="6" y1="94" x2="96" y2="94" className="stroke-[var(--color-border)]" strokeWidth="1" />
      <polyline fill="none" points={points} stroke="var(--color-primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {data.map((point, index) => {
        const x = data.length <= 1 ? 6 : 6 + (index * 88) / Math.max(1, data.length - 1);
        const y = 94 - (point.value / maxValue) * 88;
        return <circle key={`${point.label}-${index}`} cx={x} cy={y} r="2.2" fill="var(--color-primary)" />;
      })}
    </svg>
  );
}

function BarChart({ data }: { data: ChartPoint[] }) {
  const maxValue = Math.max(1, ...data.map((point) => point.value));
  return (
    <div className="grid h-44 grid-cols-6 items-end gap-2 rounded-xl bg-[var(--color-surface-soft)] p-3">
      {data.map((point, index) => {
        const pct = (point.value / maxValue) * 100;
        return (
          <div key={`${point.label}-${index}`} className="flex h-full flex-col justify-end">
            <div className="rounded-md bg-[var(--color-primary)]/85" style={{ height: `${Math.max(6, pct)}%` }} title={`${point.label}: ${point.value.toLocaleString("es-AR")}`} />
            <p className="mt-1 truncate text-center text-[10px] text-[var(--color-muted)]">{point.label}</p>
          </div>
        );
      })}
    </div>
  );
}

export function PortfolioAssetDetailPage({ assetId }: { assetId: string }) {
  const { user } = useAuth();
  const router = useRouter();
  const [revision, setRevision] = useState(0);
  const [nowTs, setNowTs] = useState(() => Date.now());

  useEffect(() => {
    if (!user) return;
    const sync = async () => {
      try {
        await syncMarketplace(user.id);
      } catch {}
      setNowTs(Date.now());
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
    const rows = getBuyerPortfolio(user.id)
      .filter((row) => row.purchase.assetId === assetId)
      .sort((a, b) => +new Date(a.purchase.purchasedAt) - +new Date(b.purchase.purchasedAt));
    if (rows.length === 0 || !rows[0].asset) return null;
    const asset = rows[0].asset;
    const totalTokens = rows.reduce((sum, row) => sum + row.purchase.quantity, 0);
    const totalInvested = rows.reduce((sum, row) => sum + row.purchase.totalPaid, 0);
    const participationPct = (totalTokens / Math.max(1, asset.totalTokens)) * 100;
    const weightedAvgPrice = totalInvested / Math.max(1, totalTokens);
    const currentCycleYield = (totalTokens / Math.max(1, asset.totalTokens)) * Math.max(0, asset.currentYieldAccruedSats ?? 0);
    const expectedGainByApy = (totalInvested * (asset.estimatedApyBps / 10000) * asset.cycleDurationDays) / 365;
    const netProfit = asset.netProfitSats;
    const projectedGain = typeof netProfit === "number"
      ? (totalTokens / Math.max(1, asset.totalTokens)) * Math.max(0, netProfit)
      : expectedGainByApy;
    const projectedPayout = totalInvested + projectedGain;
    const currentPositionValue = totalInvested + currentCycleYield;
    const currentRoiPct = (currentCycleYield / Math.max(1, totalInvested)) * 100;
    const projectedRoiPct = (projectedGain / Math.max(1, totalInvested)) * 100;
    const daysToSettlement = Math.max(0, Math.ceil((+new Date(asset.cycleEndAt) - nowTs) / (1000 * 60 * 60 * 24)));
    let cumulative = 0;
    const investedTrend = rows.map((row, index) => {
      cumulative += row.purchase.totalPaid;
      return {
        label: `${index + 1}`,
        value: cumulative,
      };
    });
    const qtyDistribution = rows.slice(-6).map((row) => ({
      label: new Date(row.purchase.purchasedAt).toLocaleDateString("es-AR", { month: "short", day: "numeric" }),
      value: row.purchase.quantity,
    }));
    return {
      asset,
      rows,
      totalTokens,
      totalInvested,
      participationPct,
      weightedAvgPrice,
      currentCycleYield,
      projectedGain,
      projectedPayout,
      currentPositionValue,
      currentRoiPct,
      projectedRoiPct,
      daysToSettlement,
      investedTrend,
      qtyDistribution,
    };
  }, [assetId, nowTs, revision, user]);

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
          <h1 className="tc-heading text-2xl font-black sm:text-3xl">{data.asset.title}</h1>
          <p className="tc-subtitle mt-1 text-sm">Detalle de posicion y metricas de ciclo.</p>
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
          <h2 className="tc-heading text-lg font-bold">Resumen de rentabilidad de tu posicion</h2>
          <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <p className="rounded-lg bg-[var(--color-surface-soft)] px-3 py-2 text-[var(--color-muted)]">Costo total: <strong className="text-[var(--color-foreground)]">{formatUSDT(data.totalInvested)}</strong></p>
            <p className="rounded-lg bg-[var(--color-surface-soft)] px-3 py-2 text-[var(--color-muted)]">Valor actual estimado: <strong className="text-[var(--color-foreground)]">{formatUSDT(data.currentPositionValue)}</strong></p>
            <p className="rounded-lg bg-[var(--color-surface-soft)] px-3 py-2 text-[var(--color-muted)]">P/L actual: <strong className={data.currentCycleYield >= 0 ? "text-emerald-500" : "text-rose-500"}>{formatUSDT(data.currentCycleYield)}</strong></p>
            <p className="rounded-lg bg-[var(--color-surface-soft)] px-3 py-2 text-[var(--color-muted)]">ROI actual: <strong className={data.currentRoiPct >= 0 ? "text-emerald-500" : "text-rose-500"}>{data.currentRoiPct.toFixed(2)}%</strong></p>
            <p className="rounded-lg bg-[var(--color-surface-soft)] px-3 py-2 text-[var(--color-muted)]">Payout proyectado: <strong className="text-[var(--color-foreground)]">{formatUSDT(data.projectedPayout)}</strong></p>
            <p className="rounded-lg bg-[var(--color-surface-soft)] px-3 py-2 text-[var(--color-muted)]">ROI proyectado: <strong className={data.projectedRoiPct >= 0 ? "text-emerald-500" : "text-rose-500"}>{data.projectedRoiPct.toFixed(2)}%</strong></p>
          </div>
          <p className="mt-3 text-sm text-[var(--color-muted)]">Tokens: {data.totalTokens.toLocaleString("es-AR")} de {data.asset.totalTokens.toLocaleString("es-AR")} · Precio promedio: {formatUSDT(data.weightedAvgPrice)}</p>
          <p className="mt-2 text-sm text-[var(--color-muted)]">Dias restantes del ciclo: {data.daysToSettlement}</p>
          <p className="mt-2 text-xs text-[var(--color-muted)]">Hash de verificacion: {data.asset.proofOfAssetHash}</p>
        </Card>

        <Card>
          <h2 className="tc-heading text-lg font-bold">Estado operativo</h2>
          <p className="mt-2 text-sm text-[var(--color-muted)]">Estado: {data.asset.lifecycleStatus}</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--color-surface-soft)]">
            <div className="h-full rounded-full bg-[var(--color-primary)]" style={{ width: `${data.asset.investorMetrics?.cycleProgressPct ?? 0}%` }} />
          </div>
          <p className="mt-2 text-sm text-[var(--color-muted)]">Progreso de ciclo: {(data.asset.investorMetrics?.cycleProgressPct ?? 0).toFixed(1)}%</p>
          <p className="mt-2 text-sm text-[var(--color-muted)]">APY estimado: {(data.asset.estimatedApyBps / 100).toFixed(2)}%</p>
          <p className="mt-2 text-sm text-[var(--color-muted)]">ROI historico: {(data.asset.historicalRoiBps / 100).toFixed(2)}%</p>
        </Card>
      </section>

      <section className="mt-6 grid gap-5 lg:grid-cols-2">
        <Card>
          <h2 className="tc-heading text-lg font-bold">Evolucion de inversion (real)</h2>
          <p className="tc-subtitle mt-1 text-xs">Acumulado de USDT invertido en cada compra registrada.</p>
          <div className="mt-3">
            <LineChart data={data.investedTrend} />
          </div>
        </Card>
        <Card>
          <h2 className="tc-heading text-lg font-bold">Distribucion de compras</h2>
          <p className="tc-subtitle mt-1 text-xs">Cantidad de tokens comprados en tus ultimas operaciones.</p>
          <div className="mt-3">
            <BarChart data={data.qtyDistribution} />
          </div>
        </Card>
      </section>

      <section className="mt-6">
        <Card>
          <h2 className="tc-heading text-lg font-bold">Historial de compras</h2>
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
