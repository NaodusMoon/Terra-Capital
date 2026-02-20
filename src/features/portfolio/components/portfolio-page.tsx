"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, TrendingUp } from "lucide-react";
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
      } catch {
        // keep last known state
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

  if (loading || !walletReady || !user || !walletAddress) {
    return (
      <div className="mx-auto grid min-h-[60vh] max-w-6xl place-items-center px-4 text-center text-sm text-[var(--color-muted)]">
        Cargando portafolio...
      </div>
    );
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-5 sm:py-9">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black sm:text-3xl">Portafolio de activos tokenizados</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">Tus posiciones en ciclos de produccion y su rendimiento esperado.</p>
        </div>
        <div className="flex gap-2">
          <Link href={activeMode === "seller" ? "/seller" : "/buyer"}>
            <Button variant="outline" className="gap-2"><ArrowLeft size={15} /> Volver</Button>
          </Link>
          <Link href="/chats">
            <Button className="gap-2">Mis chats</Button>
          </Link>
        </div>
      </div>

      <section className="mt-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-sm text-[var(--color-muted)]">Activos en cartera</p>
          <p className="mt-2 text-2xl font-bold">{portfolio.length}</p>
        </Card>
        <Card>
          <p className="flex items-center gap-2 text-sm text-[var(--color-muted)]"><TrendingUp size={14} /> Capital invertido</p>
          <p className="mt-2 text-2xl font-bold">{formatUSDT(totalInvested)}</p>
        </Card>
        <Card>
          <p className="text-sm text-[var(--color-muted)]">Ganancia proyectada</p>
          <p className="mt-2 text-2xl font-bold">{formatUSDT(totalProjectedProfit)}</p>
        </Card>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-2">
        {portfolio.map((row) => (
          <article key={row.asset.id} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <h3 className="text-lg font-bold">{row.asset.title}</h3>
            <p className="text-xs uppercase tracking-[0.12em] text-[var(--color-muted)]">{row.asset.lifecycleStatus} · {row.asset.location}</p>
            <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <p className="rounded-lg bg-[var(--color-surface-soft)] px-3 py-2">Tokens: <strong>{row.tokensOwned.toLocaleString("es-AR")}</strong></p>
              <p className="rounded-lg bg-[var(--color-surface-soft)] px-3 py-2">Inversion: <strong>{formatUSDT(row.investedUsdt)}</strong></p>
              <p className="rounded-lg bg-[var(--color-surface-soft)] px-3 py-2">Participacion: <strong>{row.participationPct.toFixed(2)}%</strong></p>
              <p className="rounded-lg bg-[var(--color-surface-soft)] px-3 py-2">ROI proyectado: <strong>{row.asset.investorMetrics?.projectedRoi ?? row.asset.expectedYield}</strong></p>
            </div>
            <Button className="mt-3 w-full" onClick={() => router.push(`/portfolio/${row.asset.id}`)}>Ver metricas del activo</Button>
          </article>
        ))}

        {portfolio.length === 0 && (
          <Card>
            <p className="text-sm text-[var(--color-muted)]">Aun no tienes activos en portafolio.</p>
          </Card>
        )}
      </section>
    </main>
  );
}
