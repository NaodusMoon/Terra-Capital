"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, BarChart3, Coins, DollarSign, Users } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { useLanguage } from "@/components/providers/language-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MARKETPLACE_EVENT } from "@/lib/constants";
import { formatUSDT } from "@/lib/format";
import { getSellerAssetPerformance, syncMarketplace } from "@/lib/marketplace";

const copyByLanguage = {
  es: {
    syncError: "No se pudo sincronizar tus activos.",
    performancePanel: "Panel de rendimiento",
    title: "Mis activos publicados",
    subtitle: "Monitorea absorcion, compradores e ingresos en una vista enfocada en decisiones comerciales.",
    back: "Volver al panel vendedor",
    assetsPublished: "Activos publicados",
    soldTokens: "Tokens vendidos",
    income: "Ingresos acumulados",
    avgAbsorption: "Absorcion promedio",
    updateFailed: "No se pudo actualizar informacion",
    bestTraction: "Mejor traccion",
    buyers: "compradores unicos",
    viewFeatured: "Ver activo destacado",
    sold: "Vendidos",
    buyersLabel: "Compradores",
    absorption: "Absorcion",
    salesProgress: "Progreso de ventas",
    viewDetail: "Ver detalle del activo",
    noPublications: "Aun no tienes publicaciones activas. Cuando publiques tu primer activo lo veras aqui con todas sus metricas.",
    status: {
      FUNDING: "Fondeo",
      OPERATING: "Operando",
      SETTLED: "Liquidado",
    },
  },
  en: {
    syncError: "Could not sync your assets.",
    performancePanel: "Performance panel",
    title: "My published assets",
    subtitle: "Track absorption, buyers and income in one commercial decision view.",
    back: "Back to seller panel",
    assetsPublished: "Published assets",
    soldTokens: "Sold tokens",
    income: "Accumulated income",
    avgAbsorption: "Average absorption",
    updateFailed: "Could not refresh information",
    bestTraction: "Best traction",
    buyers: "unique buyers",
    viewFeatured: "View highlighted asset",
    sold: "Sold",
    buyersLabel: "Buyers",
    absorption: "Absorption",
    salesProgress: "Sales progress",
    viewDetail: "View asset detail",
    noPublications: "You do not have active listings yet. Once you publish your first asset it will appear here with full metrics.",
    status: {
      FUNDING: "Funding",
      OPERATING: "Operating",
      SETTLED: "Settled",
    },
  },
} as const;

export function SellerAssetsPage() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const router = useRouter();
  const t = language === "es" ? copyByLanguage.es : copyByLanguage.en;
  const numberLocale = language === "es" ? "es-AR" : "en-US";
  const [revision, setRevision] = useState(0);
  const [syncError, setSyncError] = useState("");

  const syncData = useCallback(async () => {
    if (!user) return;
    try {
      await syncMarketplace(user.id);
      setRevision((prev) => prev + 1);
      setSyncError("");
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : t.syncError);
    }
  }, [t.syncError, user]);

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

  const statusLabels = t.status;

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-5 sm:py-9">
      <section className="terra-seller-shell relative overflow-hidden rounded-3xl p-6 sm:p-7">
        <div className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-[color:color-mix(in_oklab,var(--color-secondary)_26%,transparent)] blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-10 h-48 w-48 rounded-full bg-[color:color-mix(in_oklab,var(--color-primary)_24%,transparent)] blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="terra-badge">{t.performancePanel}</p>
            <h1 className="tc-heading mt-3 text-3xl font-black sm:text-4xl">{t.title}</h1>
            <p className="tc-subtitle mt-2 max-w-2xl">
              {t.subtitle}
            </p>
          </div>
          <Button variant="secondary" className="gap-2" onClick={() => router.push("/seller")}>
            <ArrowLeft size={15} /> {t.back}
          </Button>
        </div>
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-4">
        <Card className="terra-seller-kpi relative overflow-hidden p-4">
          <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-primary/15 blur-2xl" />
          <p className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
            <BarChart3 size={14} /> {t.assetsPublished}
          </p>
          <p className="mt-2 text-3xl font-black">{rows.length}</p>
        </Card>
        <Card className="terra-seller-kpi relative overflow-hidden p-4">
          <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-secondary/20 blur-2xl" />
          <p className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
            <Coins size={14} /> {t.soldTokens}
          </p>
          <p className="mt-2 text-3xl font-black">{totalSold.toLocaleString(numberLocale)}</p>
        </Card>
        <Card className="terra-seller-kpi relative overflow-hidden p-4">
          <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-emerald-500/15 blur-2xl" />
          <p className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
            <DollarSign size={14} /> {t.income}
          </p>
          <p className="mt-2 text-3xl font-black">{formatUSDT(totalGross)}</p>
        </Card>
        <Card className="terra-seller-kpi relative overflow-hidden p-4">
          <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-sky-500/15 blur-2xl" />
          <p className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
            <Users size={14} /> {t.avgAbsorption}
          </p>
          <p className="mt-2 text-3xl font-black">{avgFillRate.toFixed(1)}%</p>
        </Card>
      </section>

      {syncError && (
        <section className="mt-4">
          <Card className="terra-seller-panel border-amber-600/40 bg-amber-500/10">
            <p className="text-sm font-semibold text-amber-600">{t.updateFailed}</p>
            <p className="mt-1 text-sm text-[var(--color-muted)]">{syncError}</p>
          </Card>
        </section>
      )}

      {topAsset && (
        <section className="mt-5">
          <Card className="terra-seller-panel flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-[var(--color-muted)]">{t.bestTraction}</p>
              <h2 className="tc-heading mt-1 text-lg font-black">{topAsset.asset.title}</h2>
              <p className="text-sm text-[var(--color-muted)]">
                {topAsset.fillRatePct.toFixed(1)}% {t.absorption.toLowerCase()} {topAsset.uniqueBuyers} {t.buyers}.
              </p>
            </div>
            <Button variant="secondary" onClick={() => router.push(`/seller/assets/${topAsset.asset.id}`)}>
              {t.viewFeatured}
            </Button>
          </Card>
        </section>
      )}

      <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => (
          <article
            key={row.asset.id}
            className="terra-seller-panel group flex h-full flex-col rounded-3xl p-5 transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_20px_38px_rgba(0,0,0,0.14)]"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="tc-heading break-words text-lg font-black leading-tight">{row.asset.title}</h3>
                <p className="mt-1 text-xs uppercase tracking-[0.12em] text-[var(--color-muted)]">{row.asset.location}</p>
              </div>
              <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${statusStyles[row.asset.lifecycleStatus]}`}>
                {statusLabels[row.asset.lifecycleStatus]}
              </span>
            </div>

            <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
              <p className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-2">
                {t.sold}: <strong>{row.soldTokens.toLocaleString(numberLocale)}</strong>
              </p>
              <p className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-2">
                {t.income}: <strong>{formatUSDT(row.grossUsdt)}</strong>
              </p>
              <p className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-2">
                {t.buyersLabel}: <strong>{row.uniqueBuyers}</strong>
              </p>
              <p className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-2">
                {t.absorption}: <strong>{row.fillRatePct.toFixed(1)}%</strong>
              </p>
            </div>

            <div className="mt-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-3">
              <div className="mb-1 flex items-center justify-between text-xs text-[var(--color-muted)]">
                <span>{t.salesProgress}</span>
                <span>{Math.min(100, Math.max(0, row.fillRatePct)).toFixed(1)}%</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-[color:color-mix(in_oklab,var(--color-surface)_72%,var(--color-border))]">
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,color-mix(in_oklab,var(--color-primary)_84%,white)_0%,color-mix(in_oklab,var(--color-secondary)_82%,white)_100%)] transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(0, row.fillRatePct))}%` }}
                />
              </div>
            </div>

            <Button
              variant="secondary"
              className="mt-4 w-full group-hover:brightness-110"
              onClick={() => router.push(`/seller/assets/${row.asset.id}`)}
            >
              {t.viewDetail}
            </Button>
          </article>
        ))}

        {rows.length === 0 && (
          <Card className="terra-seller-panel md:col-span-2 xl:col-span-3">
            <p className="text-sm text-[var(--color-muted)]">
              {t.noPublications}
            </p>
          </Card>
        )}
      </section>
    </main>
  );
}
