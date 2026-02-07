"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ChevronDown, LogOut, Settings, Wallet } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { useWallet } from "@/components/providers/wallet-provider";
import { LogoBadge } from "@/components/layout/logo-badge";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";

function formatBalance(amount: string) {
  const parsed = Number(amount);
  if (!Number.isFinite(parsed)) return amount;
  return parsed.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

export function Navbar() {
  const { user, loading, logout, activeMode, switchMode } = useAuth();
  const { walletAddress, walletProvider, disconnectWallet, walletOptions, connectWallet, connecting, balances, loadingBalances } = useWallet();
  const router = useRouter();
  const pathname = usePathname();
  const [walletOpen, setWalletOpen] = useState(false);

  const isAuthView = pathname.startsWith("/auth");
  const inHome = pathname === "/";
  const panelPath = activeMode === "seller" ? "/seller" : "/buyer";
  const shortWallet = useMemo(() => (
    walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : "Wallet no conectada"
  ), [walletAddress]);

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[color:color-mix(in_oklab,var(--color-background)_92%,transparent)] backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-3">
        <Link href="/">
          <LogoBadge />
        </Link>

        <div className="flex items-center gap-2">
          <ThemeToggle />

          {!loading && !user && !isAuthView && (
            <>
              <Link href="/auth/login"><Button variant="outline">Iniciar sesion</Button></Link>
              <Link href="/auth/register"><Button>Registrarse</Button></Link>
            </>
          )}

          {!loading && !user && isAuthView && (
            <Link href="/"><Button variant="ghost">Volver al inicio</Button></Link>
          )}

          {!loading && !!user && (
            <>
              {inHome && (
                <Link href={panelPath}>
                  <Button variant="outline">Volver al panel</Button>
                </Link>
              )}

              <div className="hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-1 md:flex">
                <button type="button" className={`rounded-lg px-3 py-1 text-xs font-semibold ${activeMode === "buyer" ? "bg-[var(--color-primary)] text-[var(--color-primary-contrast)]" : ""}`} onClick={() => switchMode("buyer")}>
                  Modo comprador
                </button>
                <button type="button" className={`rounded-lg px-3 py-1 text-xs font-semibold ${activeMode === "seller" ? "bg-[var(--color-primary)] text-[var(--color-primary-contrast)]" : ""}`} onClick={() => switchMode("seller")}>
                  Modo vendedor
                </button>
              </div>

              <div className="relative">
                <Button variant="outline" className="gap-2" onClick={() => setWalletOpen((prev) => !prev)}>
                  <Wallet size={14} />
                  <span className="hidden sm:inline">{walletProvider ? `${walletProvider.toUpperCase()} ${shortWallet}` : shortWallet}</span>
                  <ChevronDown size={14} />
                </Button>
                {walletOpen && (
                  <div className="absolute right-0 top-12 z-50 w-80 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-lg">
                    <p className="text-xs uppercase tracking-[0.12em] text-[var(--color-muted)]">Balance</p>
                    <div className="mt-2 rounded-lg bg-[var(--color-surface-soft)] p-2 text-sm">
                      {loadingBalances && <p>Cargando balances...</p>}
                      {!loadingBalances && balances.length === 0 && <p>Sin balances para mostrar.</p>}
                      {!loadingBalances && balances.map((row) => (
                        <p key={`${row.asset}-${row.amount}`} className="flex items-center justify-between">
                          <span>{row.asset}</span>
                          <strong>{formatBalance(row.amount)}</strong>
                        </p>
                      ))}
                    </div>

                    <p className="mt-3 text-xs uppercase tracking-[0.12em] text-[var(--color-muted)]">Cambiar wallet</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                      {walletOptions.map((option) => (
                        <Button key={option.id} variant="outline" onClick={() => connectWallet(option.id)} disabled={connecting}>
                          {option.label}
                        </Button>
                      ))}
                    </div>

                    <Button className="mt-3 w-full" variant="ghost" onClick={() => { disconnectWallet(); setWalletOpen(false); }}>
                      Desconectar wallet
                    </Button>
                  </div>
                )}
              </div>

              <Link href="/account"><Button variant="outline" className="gap-2"><Settings size={14} /> Cuenta</Button></Link>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => {
                  logout();
                  disconnectWallet();
                  router.push("/");
                }}
              >
                <LogOut size={15} />
                Salir
              </Button>
            </>
          )}
        </div>
      </div>

      {!loading && !!user && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--color-border)] bg-[color:color-mix(in_oklab,var(--color-surface)_94%,transparent)] p-2 backdrop-blur md:hidden">
          <div className="mx-auto grid w-full max-w-md grid-cols-3 gap-2">
            <button
              type="button"
              className={`rounded-xl px-3 py-2 text-xs font-semibold ${activeMode === "buyer" ? "bg-[var(--color-primary)] text-[var(--color-primary-contrast)]" : "bg-[var(--color-surface-soft)]"}`}
              onClick={() => {
                switchMode("buyer");
                router.push("/buyer");
              }}
            >
              Comprador
            </button>
            <button
              type="button"
              className={`rounded-xl px-3 py-2 text-xs font-semibold ${activeMode === "seller" ? "bg-[var(--color-primary)] text-[var(--color-primary-contrast)]" : "bg-[var(--color-surface-soft)]"}`}
              onClick={() => {
                switchMode("seller");
                router.push("/seller");
              }}
            >
              Vendedor
            </button>
            <Link href="/account" className="grid place-items-center rounded-xl bg-[var(--color-surface-soft)] text-xs font-semibold">
              Cuenta
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
