"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, BriefcaseBusiness, CircleDollarSign, Compass, RefreshCw, TrendingUp } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { useWallet } from "@/components/providers/wallet-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MARKETPLACE_EVENT } from "@/lib/constants";
import { formatUSDT } from "@/lib/format";
import { getBuyerPortfolioSummaryByAsset, syncMarketplace } from "@/lib/marketplace";

export function PortfolioPage() {
  const { user, loading, activeMode } = useAuth();
  const { walletAddress, walletReady } = useWallet();
  const router = useRouter();
  const [portfolio, setPortfolio] = useState<ReturnType<typeof getBuyerPortfolioSummaryByAsset>>([]);
  const [syncError, setSyncError] = useState("");

  useEffect(() => {
    if (loading || !walletReady) return;
    if (!user) {
      router.replace("/auth/login");
      return;
    }
    if (!walletAddress) {
      router.replace("/");
    }
  }, [loading, router, user, walletAddress, walletReady]);

  useEffect(() => {
    if (!user) return;
    const runSync = async () => {
      try {
        await syncMarketplace(user.id);
        setSyncError("");
      } catch {
        setSyncError("Mostrando tu ultimo estado guardado. La sincronizacion no estuvo disponible.");
      }
      setPortfolio(getBuyerPortfolioSummaryByAsset(user.id));
    };
    void runSync();

    const marketListener = () => {
      setPortfolio(getBuyerPortfolioSummaryByAsset(user.id));
    };
    window.addEventListener(MARKETPLACE_EVENT, marketListener);
    return () => window.removeEventListener(MARKETPLACE_EVENT, marketListener);
  }, [user]);

  const totalInvested = portfolio.reduce((sum, row) => sum + row.investedUsdt, 0);
  const totalProjectedProfit = portfolio.reduce((sum, row) => sum + row.projectedUserProfit, 0);
  const avgTicket = portfolio.length > 0 ? totalInvested / portfolio.length : 0;
  const projectedYieldPct = totalInvested > 0 ? (totalProjectedProfit / totalInvested) * 100 : 0;

  const bestPosition = useMemo(() => {
    if (portfolio.length === 0) return null;
    return [...portfolio].sort((a, b) => b.projectedUserProfit - a.projectedUserProfit)[0];
  }, [portfolio]);

  const statusStyles = {
    FUNDING: "border-amber-500/45 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    OPERATING: "border-emerald-500/45 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    SETTLED: "border-sky-500/45 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  } as const;

  const statusLabels = {
    FUNDING: "Fondeo",
    OPERATING: "Operando",
    SETTLED: "Liquidado",
  } as const;

  if (loading || !walletReady || !user || !walletAddress) {
    return (
      <div className="mx-auto grid min-h-[60vh] max-w-6xl place-items-center px-4 text-center text-sm text-[var(--color-muted)]">
        Cargando portafolio...
      </div>
    );
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-5 sm:py-9">
      <section className="relative overflow-hidden rounded-3xl border border-[var(--color-border)] bg-[linear-gradient(132deg,color-mix(in_oklab,var(--color-secondary)_13%,var(--color-surface)),color-mix(in_oklab,var(--color-primary)_11%,var(--color-surface)_90%))] p-6 shadow-[0_24px_50px_rgba(0,0,0,0.11)] sm:p-7">
        <div className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-[color:color-mix(in_oklab,var(--color-secondary)_22%,transparent)] blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-12 h-48 w-48 rounded-full bg-[color:color-mix(in_oklab,var(--color-primary)_20%,transparent)] blur-3xl" />

        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="terra-badge">Inversion inteligente</p>
            <h1 className="tc-heading mt-3 text-3xl font-black sm:text-4xl">Tu portafolio tokenizado</h1>
            <p className="tc-subtitle mt-2 max-w-2xl text-sm">
              Sigue tus posiciones, diversificacion y rendimiento proyectado en una sola vista moderna.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={activeMode === "seller" ? "/seller" : "/dashboard"}>
              <Button variant="outline" className="gap-2"><ArrowLeft size={15} /> Volver</Button>
            </Link>
            <Link href="/chats">
              <Button className="gap-2">Mis chats</Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-4">
        <Card className="relative overflow-hidden">
          <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-primary/15 blur-2xl" />
          <p className="flex items-center gap-2 text-sm text-[var(--color-muted)]"><BriefcaseBusiness size={14} /> Activos en cartera</p>
          <p className="mt-2 text-3xl font-black">{portfolio.length}</p>
        </Card>
        <Card className="relative overflow-hidden">
          <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-secondary/20 blur-2xl" />
          <p className="flex items-center gap-2 text-sm text-[var(--color-muted)]"><CircleDollarSign size={14} /> Capital invertido</p>
          <p className="mt-2 text-3xl font-black">{formatUSDT(totalInvested)}</p>
        </Card>
        <Card className="relative overflow-hidden">
          <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-emerald-500/15 blur-2xl" />
          <p className="flex items-center gap-2 text-sm text-[var(--color-muted)]"><TrendingUp size={14} /> Ganancia proyectada</p>
          <p className="mt-2 text-3xl font-black">{formatUSDT(totalProjectedProfit)}</p>
        </Card>
        <Card className="relative overflow-hidden">
          <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-sky-500/15 blur-2xl" />
          <p className="flex items-center gap-2 text-sm text-[var(--color-muted)]"><Compass size={14} /> Rendimiento estimado</p>
          <p className="mt-2 text-3xl font-black">{projectedYieldPct.toFixed(1)}%</p>
        </Card>
      </section>

      {syncError && (
        <section className="mt-4">
          <Card className="border-amber-600/40 bg-amber-500/10">
            <p className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-300">
              <RefreshCw size={13} /> Sin conexion de sincronizacion
            </p>
            <p className="mt-1 text-sm text-[var(--color-muted)]">{syncError}</p>
          </Card>
        </section>
      )}

      {bestPosition && (
        <section className="mt-5">
          <Card className="flex flex-wrap items-center justify-between gap-3 border-primary/35 bg-[linear-gradient(120deg,color-mix(in_oklab,var(--color-primary)_16%,var(--color-surface)),var(--color-surface))]">
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-[var(--color-muted)]">Posicion destacada</p>
              <h2 className="tc-heading mt-1 text-lg font-black">{bestPosition.asset.title}</h2>
              <p className="text-sm text-[var(--color-muted)]">
                Proyeccion: {formatUSDT(bestPosition.projectedUserProfit)} | Ticket promedio: {formatUSDT(avgTicket)}
              </p>
            </div>
            <Button onClick={() => router.push(`/portfolio/${bestPosition.asset.id}`)}>
              Abrir detalle
            </Button>
          </Card>
        </section>
      )}

      <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {portfolio.map((row) => (
          <article
            key={row.asset.id}
            className="group rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[0_14px_32px_rgba(0,0,0,0.08)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_20px_38px_rgba(0,0,0,0.14)]"
          >
            <div className="flex items-start justify-between gap-2">
              <h3 className="tc-heading text-lg font-black">{row.asset.title}</h3>
              <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${statusStyles[row.asset.lifecycleStatus]}`}>
                {statusLabels[row.asset.lifecycleStatus]}
              </span>
            </div>
            <p className="mt-1 text-xs uppercase tracking-[0.12em] text-[var(--color-muted)]">{row.asset.location}</p>

            <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
              <p className="rounded-xl bg-[var(--color-surface-soft)] px-3 py-2">Tokens: <strong>{row.tokensOwned.toLocaleString("es-AR")}</strong></p>
              <p className="rounded-xl bg-[var(--color-surface-soft)] px-3 py-2">Inversion: <strong>{formatUSDT(row.investedUsdt)}</strong></p>
              <p className="rounded-xl bg-[var(--color-surface-soft)] px-3 py-2">Participacion: <strong>{row.participationPct.toFixed(2)}%</strong></p>
              <p className="rounded-xl bg-[var(--color-surface-soft)] px-3 py-2">ROI proyectado: <strong>{row.asset.investorMetrics?.projectedRoi ?? row.asset.expectedYield}</strong></p>
            </div>

            <div className="mt-4">
              <div className="mb-1 flex items-center justify-between text-xs text-[var(--color-muted)]">
                <span>Exposicion de cartera</span>
                <span>{Math.min(100, Math.max(0, row.participationPct)).toFixed(2)}%</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-[var(--color-surface-soft)]">
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,var(--color-secondary),var(--color-primary))] transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(0, row.participationPct))}%` }}
                />
              </div>
            </div>

            <Button className="mt-4 w-full group-hover:brightness-110" onClick={() => router.push(`/portfolio/${row.asset.id}`)}>
              Ver metricas del activo
            </Button>
          </article>
        ))}

        {portfolio.length === 0 && (
          <Card className="md:col-span-2 xl:col-span-3">
            <p className="text-sm text-[var(--color-muted)]">Aun no tienes activos en portafolio. Explora oportunidades para comenzar a invertir.</p>
          </Card>
        )}
      </section>
    </main>
  );
}
