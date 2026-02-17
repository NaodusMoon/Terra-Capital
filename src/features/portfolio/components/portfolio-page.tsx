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
import { formatShortDate, formatUSD } from "@/lib/format";
import { getBuyerPortfolio, syncMarketplace } from "@/lib/marketplace";

export function PortfolioPage() {
  const { user, loading, activeMode } = useAuth();
  const { walletAddress, walletReady } = useWallet();
  const router = useRouter();
  const [portfolio, setPortfolio] = useState<ReturnType<typeof getBuyerPortfolio>>([]);

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
      setPortfolio(getBuyerPortfolio(user.id));
    };
    void runSync();

    const marketListener = () => {
      setPortfolio(getBuyerPortfolio(user.id));
    };
    window.addEventListener(MARKETPLACE_EVENT, marketListener);
    return () => window.removeEventListener(MARKETPLACE_EVENT, marketListener);
  }, [user]);

  const totalInvested = portfolio.reduce((sum, row) => sum + row.purchase.totalPaid, 0);

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
          <h1 className="text-2xl font-black sm:text-3xl">Mis tokens comprados</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">Historial de compras y posicion acumulada.</p>
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

      <section className="mt-6 grid gap-4 sm:grid-cols-2">
        <Card>
          <p className="text-sm text-[var(--color-muted)]">Operaciones</p>
          <p className="mt-2 text-2xl font-bold">{portfolio.length}</p>
        </Card>
        <Card>
          <p className="flex items-center gap-2 text-sm text-[var(--color-muted)]"><TrendingUp size={14} /> Capital invertido</p>
          <p className="mt-2 text-2xl font-bold">{formatUSD(totalInvested)}</p>
        </Card>
      </section>

      <section className="mt-6">
        <Card>
          <div className="overflow-x-auto">
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
      </section>
    </main>
  );
}
