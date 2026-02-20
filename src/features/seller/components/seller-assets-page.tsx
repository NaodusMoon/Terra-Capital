"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-5 sm:py-9">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black">Mis activos publicados</h1>
          <p className="mt-2 text-[var(--color-muted)]">Vista exclusiva del vendedor con performance y retencion por activo.</p>
        </div>
        <Button variant="outline" onClick={() => router.push("/seller")}>Volver al panel vendedor</Button>
      </div>

      <section className="mt-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-sm text-[var(--color-muted)]">Activos publicados</p>
          <p className="mt-2 text-2xl font-bold">{rows.length}</p>
        </Card>
        <Card>
          <p className="text-sm text-[var(--color-muted)]">Tokens vendidos</p>
          <p className="mt-2 text-2xl font-bold">{totalSold.toLocaleString("es-AR")}</p>
        </Card>
        <Card>
          <p className="text-sm text-[var(--color-muted)]">Ingresos acumulados</p>
          <p className="mt-2 text-2xl font-bold">{formatUSDT(totalGross)}</p>
        </Card>
      </section>

      {syncError && (
        <section className="mt-4">
          <Card>
            <p className="text-sm font-semibold text-amber-600">No se pudo actualizar informacion</p>
            <p className="mt-1 text-sm text-[var(--color-muted)]">{syncError}</p>
          </Card>
        </section>
      )}

      <section className="mt-6 grid gap-4 md:grid-cols-2">
        {rows.map((row) => (
          <article key={row.asset.id} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <h3 className="text-lg font-bold">{row.asset.title}</h3>
            <p className="text-xs uppercase tracking-[0.12em] text-[var(--color-muted)]">{row.asset.lifecycleStatus} · {row.asset.location}</p>
            <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <p className="rounded-lg bg-[var(--color-surface-soft)] px-3 py-2">Vendidos: <strong>{row.soldTokens.toLocaleString("es-AR")}</strong></p>
              <p className="rounded-lg bg-[var(--color-surface-soft)] px-3 py-2">Ingresos: <strong>{formatUSDT(row.grossUsdt)}</strong></p>
              <p className="rounded-lg bg-[var(--color-surface-soft)] px-3 py-2">Compradores: <strong>{row.uniqueBuyers}</strong></p>
              <p className="rounded-lg bg-[var(--color-surface-soft)] px-3 py-2">Absorcion: <strong>{row.fillRatePct.toFixed(1)}%</strong></p>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--color-surface-soft)]">
              <div className="h-full rounded-full bg-[var(--color-primary)]" style={{ width: `${row.fillRatePct}%` }} />
            </div>
            <Button className="mt-3 w-full" onClick={() => router.push(`/seller/assets/${row.asset.id}`)}>Ver detalle del activo</Button>
          </article>
        ))}

        {rows.length === 0 && (
          <Card>
            <p className="text-sm text-[var(--color-muted)]">Aun no tienes publicaciones activas.</p>
          </Card>
        )}
      </section>
    </main>
  );
}
