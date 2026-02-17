"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ChevronDown, House, LayoutDashboard, LogIn, LogOut, MessageCircle, PieChart, Settings, Wallet } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "@/components/providers/auth-provider";
import { useWallet } from "@/components/providers/wallet-provider";
import { LogoBadge } from "@/components/layout/logo-badge";
import { ModeToggle } from "@/components/layout/mode-toggle";
import { NotificationsBell } from "@/components/layout/notifications-bell";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { getWalletProviderLabel } from "@/lib/wallet";

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
  const isActiveRoute = (route: string) => pathname === route || pathname.startsWith(`${route}/`);
  const desktopActiveClass = "border-transparent bg-[var(--color-primary)] text-[var(--color-primary-contrast)]";
  const mobileItemClass = "relative flex flex-col items-center justify-center gap-1 rounded-2xl border px-2 py-2 text-[11px] font-semibold transition-all duration-200";
  const mobileActiveClass = "border-transparent bg-[var(--color-primary)] text-[var(--color-primary-contrast)] shadow-[0_8px_20px_rgba(0,0,0,0.22)] -translate-y-0.5";
  const mobileIdleClass = "border-[var(--color-border)] bg-[var(--color-surface-soft)] text-[var(--color-foreground)] active:scale-[0.98]";

  return (
    <>
      {!loading && !!user && (
        <>
          <div className="fixed left-1/2 top-3 z-50 -translate-x-1/2 md:hidden">
            <div className="flex items-center gap-2 rounded-2xl border border-[var(--color-border)] bg-[color:color-mix(in_oklab,var(--color-surface)_95%,transparent)] p-1 shadow-lg backdrop-blur">
              <ModeToggle
                mode={activeMode}
                compact
                layoutId="mobile-top-mode-pill"
                className="w-[250px]"
                onChange={(mode) => {
                  switchMode(mode);
                  router.push(mode === "seller" ? "/seller" : "/buyer");
                }}
              />
              <NotificationsBell mobile />
            </div>
          </div>
          <div className="h-16 md:hidden" />
        </>
      )}

      <header className="sticky top-0 z-40 hidden border-b border-[var(--color-border)] bg-[color:color-mix(in_oklab,var(--color-background)_92%,transparent)] backdrop-blur-md md:block">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-3">
          <Link href="/">
            <LogoBadge />
          </Link>

          <div className="flex items-center gap-2">
            <ThemeToggle />

            {!loading && !user && !isAuthView && (
              <>
                <Link href="/auth/login"><Button>Iniciar con wallet</Button></Link>
              </>
            )}

            {!loading && !user && isAuthView && (
              <Link href="/"><Button variant="ghost">Volver al inicio</Button></Link>
            )}

            {!loading && !!user && (
              <>
                {inHome && (
                  <Link href={panelPath}>
                    <Button variant="outline" className={isActiveRoute(panelPath) ? desktopActiveClass : ""}>Volver al panel</Button>
                  </Link>
                )}

                <ModeToggle mode={activeMode} onChange={(mode) => switchMode(mode)} className="w-[222px]" layoutId="desktop-mode-pill" />

                <div className="flex items-center gap-2">
                  <Link href="/portfolio" title="Portafolio">
                    <Button variant="outline" className={`h-11 w-11 rounded-2xl px-0 ${isActiveRoute("/portfolio") ? desktopActiveClass : ""}`}>
                      <PieChart size={22} />
                    </Button>
                  </Link>
                  <Link href="/chats" title="Mis chats">
                    <Button variant="outline" className={`h-11 w-11 rounded-2xl px-0 ${isActiveRoute("/chats") ? desktopActiveClass : ""}`}>
                      <MessageCircle size={22} />
                    </Button>
                  </Link>
                  <Link href="/account" title="Cuenta">
                    <Button variant="outline" className={`h-11 w-11 rounded-2xl px-0 ${isActiveRoute("/account") ? desktopActiveClass : ""}`}>
                      <Settings size={22} />
                    </Button>
                  </Link>
                </div>

                <div className="relative">
                  <Button variant="outline" className="gap-2" onClick={() => setWalletOpen((prev) => !prev)}>
                    <Wallet size={14} />
                    <span className="hidden sm:inline">{walletProvider ? `${getWalletProviderLabel(walletProvider)} ${shortWallet}` : shortWallet}</span>
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
                <NotificationsBell />
              </>
            )}
          </div>
        </div>
      </header>

      {!loading && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--color-border)] bg-[color:color-mix(in_oklab,var(--color-surface)_94%,transparent)] px-2 pb-[max(env(safe-area-inset-bottom),8px)] pt-2 backdrop-blur md:hidden">
          <div className={`mx-auto grid w-full max-w-md gap-2 ${user ? "grid-cols-5" : "grid-cols-2"}`}>
            {!user && (
              <>
                <motion.div whileTap={{ scale: 0.97 }}>
                  <Link href="/" className={`${mobileItemClass} ${pathname === "/" ? mobileActiveClass : mobileIdleClass}`} aria-current={pathname === "/" ? "page" : undefined}>
                    <House size={16} />
                    Inicio
                  </Link>
                </motion.div>
                <motion.div whileTap={{ scale: 0.97 }}>
                  <Link href="/auth/login" className={`${mobileItemClass} ${pathname === "/auth/login" ? mobileActiveClass : mobileIdleClass}`} aria-current={pathname === "/auth/login" ? "page" : undefined}>
                    <LogIn size={16} />
                    Login
                  </Link>
                </motion.div>
              </>
            )}

            {!!user && (
              <>
                <motion.div whileTap={{ scale: 0.97 }}>
                  <Link href={panelPath} className={`${mobileItemClass} ${pathname === panelPath ? mobileActiveClass : mobileIdleClass}`} aria-current={pathname === panelPath ? "page" : undefined}>
                    <LayoutDashboard size={16} />
                    Panel
                  </Link>
                </motion.div>
                <motion.div whileTap={{ scale: 0.97 }}>
                  <Link href="/chats" className={`${mobileItemClass} ${pathname === "/chats" ? mobileActiveClass : mobileIdleClass}`} aria-current={pathname === "/chats" ? "page" : undefined}>
                    <MessageCircle size={16} />
                    Chats
                  </Link>
                </motion.div>
                <motion.div whileTap={{ scale: 0.97 }}>
                  <Link href="/portfolio" className={`${mobileItemClass} ${pathname === "/portfolio" ? mobileActiveClass : mobileIdleClass}`} aria-current={pathname === "/portfolio" ? "page" : undefined}>
                    <PieChart size={16} />
                    Portafolio
                  </Link>
                </motion.div>
                <motion.div whileTap={{ scale: 0.97 }}>
                  <Link href="/account" className={`${mobileItemClass} ${pathname === "/account" ? mobileActiveClass : mobileIdleClass}`} aria-current={pathname === "/account" ? "page" : undefined}>
                    <Settings size={16} />
                    Cuenta
                  </Link>
                </motion.div>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  className={`${mobileItemClass} ${mobileIdleClass}`}
                  onClick={() => {
                    logout();
                    disconnectWallet();
                    router.push("/");
                  }}
                >
                  <LogOut size={16} />
                  Salir
                </motion.button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
