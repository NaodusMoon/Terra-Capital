"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, BarChart3, Coins, DollarSign, Users } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MARKETPLACE_EVENT } from "@/lib/constants";
import { formatUSDT } from "@/lib/format";
import { getSellerAssetPerformance, syncMarketplace } from "@/lib/marketplace";

export function SellerAssetsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [revision, setRevision] = useState(0);
  const [syncError, setSyncError] = useState("");

  const syncData = useCallback(async () => {
    if (!user) return;
    try {
      await syncMarketplace(user.id);
      setRevision((prev) => prev + 1);
      setSyncError("");
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "No se pudo sincronizar tus activos.");
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const boot = window.setTimeout(() => {
      void syncData();
    }, 0);
    const listener = () => {
      void syncData();
    };
    window.addEventListener(MARKETPLACE_EVENT, listener);
    return () => {
      window.clearTimeout(boot);
      window.removeEventListener(MARKETPLACE_EVENT, listener);
    };
  }, [syncData, user]);

  const rows = useMemo(() => {
    if (revision < 0) return [];
    return user ? getSellerAssetPerformance(user.id) : [];
  }, [revision, user]);

  const totalGross = rows.reduce((sum, row) => sum + row.grossUsdt, 0);
  const totalSold = rows.reduce((sum, row) => sum + row.soldTokens, 0);
  const avgFillRate = rows.length > 0
    ? rows.reduce((sum, row) => sum + row.fillRatePct, 0) / rows.length
    : 0;
  const topAsset = rows.length > 0
    ? [...rows].sort((a, b) => b.fillRatePct - a.fillRatePct)[0]
    : null;

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

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-5 sm:py-9">
      <section className="relative overflow-hidden rounded-3xl border border-[var(--color-border)] bg-[linear-gradient(130deg,color-mix(in_oklab,var(--color-primary)_14%,var(--color-surface)),color-mix(in_oklab,var(--color-secondary)_9%,var(--color-surface)_90%))] p-6 shadow-[0_24px_50px_rgba(0,0,0,0.11)] sm:p-7">
        <div className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-[color:color-mix(in_oklab,var(--color-secondary)_26%,transparent)] blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-10 h-48 w-48 rounded-full bg-[color:color-mix(in_oklab,var(--color-primary)_24%,transparent)] blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="terra-badge">Panel de rendimiento</p>
            <h1 className="tc-heading mt-3 text-3xl font-black sm:text-4xl">Mis activos publicados</h1>
            <p className="tc-subtitle mt-2 max-w-2xl">
              Monitorea absorcion, compradores e ingresos en una vista enfocada en decisiones comerciales.
            </p>
          </div>
          <Button variant="outline" className="gap-2" onClick={() => router.push("/seller")}>
            <ArrowLeft size={15} /> Volver al panel vendedor
          </Button>
        </div>
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-4">
        <Card className="relative overflow-hidden">
          <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-primary/15 blur-2xl" />
          <p className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
            <BarChart3 size={14} /> Activos publicados
          </p>
          <p className="mt-2 text-3xl font-black">{rows.length}</p>
        </Card>
        <Card className="relative overflow-hidden">
          <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-secondary/20 blur-2xl" />
          <p className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
            <Coins size={14} /> Tokens vendidos
          </p>
          <p className="mt-2 text-3xl font-black">{totalSold.toLocaleString("es-AR")}</p>
        </Card>
        <Card className="relative overflow-hidden">
          <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-emerald-500/15 blur-2xl" />
          <p className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
            <DollarSign size={14} /> Ingresos acumulados
          </p>
          <p className="mt-2 text-3xl font-black">{formatUSDT(totalGross)}</p>
        </Card>
        <Card className="relative overflow-hidden">
          <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-sky-500/15 blur-2xl" />
          <p className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
            <Users size={14} /> Absorcion promedio
          </p>
          <p className="mt-2 text-3xl font-black">{avgFillRate.toFixed(1)}%</p>
        </Card>
      </section>

      {syncError && (
        <section className="mt-4">
          <Card className="border-amber-600/40 bg-amber-500/10">
            <p className="text-sm font-semibold text-amber-600">No se pudo actualizar informacion</p>
            <p className="mt-1 text-sm text-[var(--color-muted)]">{syncError}</p>
          </Card>
        </section>
      )}

      {topAsset && (
        <section className="mt-5">
          <Card className="flex flex-wrap items-center justify-between gap-3 border-primary/35 bg-[linear-gradient(120deg,color-mix(in_oklab,var(--color-primary)_16%,var(--color-surface)),var(--color-surface))]">
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-[var(--color-muted)]">Mejor traccion</p>
              <h2 className="tc-heading mt-1 text-lg font-black">{topAsset.asset.title}</h2>
              <p className="text-sm text-[var(--color-muted)]">
                {topAsset.fillRatePct.toFixed(1)}% de absorcion y {topAsset.uniqueBuyers} compradores unicos.
              </p>
            </div>
            <Button onClick={() => router.push(`/seller/assets/${topAsset.asset.id}`)}>
              Ver activo destacado
            </Button>
          </Card>
        </section>
      )}

      <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => (
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
              <p className="rounded-xl bg-[var(--color-surface-soft)] px-3 py-2">
                Vendidos: <strong>{row.soldTokens.toLocaleString("es-AR")}</strong>
              </p>
              <p className="rounded-xl bg-[var(--color-surface-soft)] px-3 py-2">
                Ingresos: <strong>{formatUSDT(row.grossUsdt)}</strong>
              </p>
              <p className="rounded-xl bg-[var(--color-surface-soft)] px-3 py-2">
                Compradores: <strong>{row.uniqueBuyers}</strong>
              </p>
              <p className="rounded-xl bg-[var(--color-surface-soft)] px-3 py-2">
                Absorcion: <strong>{row.fillRatePct.toFixed(1)}%</strong>
              </p>
            </div>

            <div className="mt-4">
              <div className="mb-1 flex items-center justify-between text-xs text-[var(--color-muted)]">
                <span>Progreso de ventas</span>
                <span>{Math.min(100, Math.max(0, row.fillRatePct)).toFixed(1)}%</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-[var(--color-surface-soft)]">
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,var(--color-primary),var(--color-secondary))] transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(0, row.fillRatePct))}%` }}
                />
              </div>
            </div>

            <Button
              className="mt-4 w-full group-hover:brightness-110"
              onClick={() => router.push(`/seller/assets/${row.asset.id}`)}
            >
              Ver detalle del activo
            </Button>
          </article>
        ))}

        {rows.length === 0 && (
          <Card className="md:col-span-2 xl:col-span-3">
            <p className="text-sm text-[var(--color-muted)]">
              Aun no tienes publicaciones activas. Cuando publiques tu primer activo lo veras aqui con todas sus metricas.
            </p>
          </Card>
        )}
      </section>
    </main>
  );
}
