"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Briefcase, ChevronDown, Copy, House, LayoutDashboard, LogIn, LogOut, MessageCircle, PieChart, Settings, Wallet } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "@/components/providers/auth-provider";
import { useWallet } from "@/components/providers/wallet-provider";
import { LogoBadge } from "@/components/layout/logo-badge";
import { ModeToggle } from "@/components/layout/mode-toggle";
import { NotificationsBell } from "@/components/layout/notifications-bell";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { getWalletProviderLabel } from "@/lib/wallet";

export function Navbar() {
  const { user, loading, logout, activeMode, switchMode } = useAuth();
  const { walletAddress, walletProvider, network, setNetwork, disconnectWallet } = useWallet();
  const router = useRouter();
  const pathname = usePathname();
  const [walletOpen, setWalletOpen] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState(false);

  const isAuthView = pathname.startsWith("/auth");
  const inHome = pathname === "/";
  const panelPath = activeMode === "seller" ? "/seller" : "/dashboard";
  const portfolioPath = activeMode === "seller" ? "/seller/assets" : "/portfolio";
  const portfolioLabel = activeMode === "seller" ? "Mis publicaciones" : "Portafolio";
  const showQuickNav = !inHome;
  const shortWallet = useMemo(() => (
    walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : "Wallet no conectada"
  ), [walletAddress]);
  const isActiveRoute = (route: string) => pathname === route || pathname.startsWith(`${route}/`);
  const desktopActiveClass = "border-transparent bg-primary text-primary-contrast";
  const navOutlineClass = "border-[color:color-mix(in_oklab,var(--color-nav-foreground)_36%,var(--color-nav))] text-nav-foreground hover:bg-[color:color-mix(in_oklab,var(--color-nav-foreground)_12%,transparent)]";
  const mobileItemClass = "relative flex flex-col items-center justify-center gap-1 rounded-2xl border px-2 py-2 text-[11px] font-semibold transition-all duration-200";
  const mobileActiveClass = "border-transparent bg-primary text-primary-contrast shadow-[0_8px_20px_rgba(0,0,0,0.22)] -translate-y-0.5";
  const mobileIdleClass = "border-border bg-surface-soft text-foreground active:scale-[0.98]";

  return (
    <>
      {!loading && !!user && (
        <>
          <div className="chat-mobile-topbar fixed left-1/2 top-3 z-50 -translate-x-1/2 md:hidden">
            <div className="flex items-center gap-2 rounded-2xl border border-[color:color-mix(in_oklab,var(--color-nav)_45%,var(--color-border))] bg-[color:color-mix(in_oklab,var(--color-nav)_88%,transparent)] p-1 text-nav-foreground shadow-lg backdrop-blur">
              <ModeToggle
                mode={activeMode}
                compact
                layoutId="mobile-top-mode-pill"
                className="w-[250px]"
                onChange={(mode) => {
                  switchMode(mode);
                  router.push(mode === "seller" ? "/seller" : "/dashboard");
                }}
              />
              <NotificationsBell mobile />
            </div>
          </div>
          <div className="chat-mobile-spacer h-16 md:hidden" />
        </>
      )}

      <header className="sticky top-0 z-40 hidden border-b border-[color:color-mix(in_oklab,var(--color-nav)_42%,var(--color-border))] bg-[color:color-mix(in_oklab,var(--color-nav)_92%,transparent)] text-nav-foreground backdrop-blur-md md:block">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-3">
          <Link href="/">
            <LogoBadge />
          </Link>

          <div className="flex items-center gap-2">
            <ThemeToggle />

            {!loading && !user && !isAuthView && (
              <>
                <Link href="/auth/login"><Button variant="secondary">Iniciar con wallet</Button></Link>
              </>
            )}

            {!loading && !user && isAuthView && (
              <Link href="/"><Button variant="ghost" className="text-nav-foreground hover:bg-[color:color-mix(in_oklab,var(--color-nav-foreground)_12%,transparent)]">Volver al inicio</Button></Link>
            )}

            {!loading && !!user && (
              <>
                {inHome && (
                  <Link href={panelPath}>
                    <Button variant="outline" className={`${navOutlineClass} ${isActiveRoute(panelPath) ? desktopActiveClass : ""}`}>Volver al panel</Button>
                  </Link>
                )}

                <ModeToggle
                  mode={activeMode}
                  onChange={(mode) => {
                    switchMode(mode);
                    router.push(mode === "seller" ? "/seller" : "/dashboard");
                  }}
                  className="w-[222px]"
                  layoutId="desktop-mode-pill"
                />

                {showQuickNav && (
                  <div className="flex items-center gap-2">
                    <Link href={portfolioPath} title={portfolioLabel}>
                      <Button variant="outline" className={`group h-11 w-11 rounded-2xl px-0 ${navOutlineClass} ${isActiveRoute(portfolioPath) ? desktopActiveClass : ""}`}>
                        {activeMode === "seller" ? (
                          <Briefcase
                            size={24}
                            className={isActiveRoute(portfolioPath)
                              ? "text-primary-contrast"
                              : "text-nav-foreground transition-colors group-hover:text-secondary"}
                          />
                        ) : (
                          <PieChart
                            size={24}
                            className={isActiveRoute(portfolioPath)
                              ? "text-primary-contrast"
                              : "text-nav-foreground transition-colors group-hover:text-secondary"}
                          />
                        )}
                      </Button>
                    </Link>
                    <Link href="/chats" title="Mis chats">
                      <Button variant="outline" className={`group h-11 w-11 rounded-2xl px-0 ${navOutlineClass} ${isActiveRoute("/chats") ? desktopActiveClass : ""}`}>
                        <MessageCircle
                          size={24}
                          className={isActiveRoute("/chats")
                            ? "text-primary-contrast"
                            : "text-nav-foreground transition-colors group-hover:text-primary"}
                        />
                      </Button>
                    </Link>
                    <Link href="/account" title="Cuenta">
                      <Button variant="outline" className={`group h-11 w-11 rounded-2xl px-0 ${navOutlineClass} ${isActiveRoute("/account") ? desktopActiveClass : ""}`}>
                        <Settings
                          size={24}
                          className={isActiveRoute("/account")
                            ? "text-primary-contrast"
                            : "text-nav-foreground transition-colors group-hover:text-accent"}
                        />
                      </Button>
                    </Link>
                  </div>
                )}

                <div className="relative">
                  <Button variant="outline" className={`gap-2 ${navOutlineClass}`} onClick={() => setWalletOpen((prev) => !prev)}>
                    <Wallet size={14} />
                    <span className="hidden sm:inline">{walletProvider ? `${getWalletProviderLabel(walletProvider)} ${shortWallet}` : shortWallet}</span>
                    <ChevronDown size={14} />
                  </Button>
                  {walletOpen && (
                    <div className="absolute right-0 top-12 z-50 w-96 overflow-hidden rounded-xl border border-border bg-surface text-foreground shadow-lg">
                      <div className="flex items-center justify-between border-b border-border px-4 py-3">
                        <p className="text-2xl font-semibold">{walletProvider ? getWalletProviderLabel(walletProvider) : "Wallet"}</p>
                        <span className="rounded-lg bg-surface-soft px-3 py-1 text-xs font-medium text-muted">{network === "public" ? "Mainnet" : "Testnet"}</span>
                      </div>
                      <div className="p-4">
                        <div className="mb-3 grid grid-cols-2 gap-2 rounded-xl border border-border bg-surface-soft p-1">
                          <button
                            type="button"
                            className={`rounded-lg px-2 py-1.5 text-sm font-semibold transition ${network === "testnet" ? "bg-primary text-primary-contrast" : "text-muted hover:bg-surface"}`}
                            onClick={() => setNetwork("testnet")}
                          >
                            Testnet
                          </button>
                          <button
                            type="button"
                            className={`rounded-lg px-2 py-1.5 text-sm font-semibold transition ${network === "public" ? "bg-primary text-primary-contrast" : "text-muted hover:bg-surface"}`}
                            onClick={() => setNetwork("public")}
                          >
                            Mainnet
                          </button>
                        </div>
                        <div className="rounded-xl border border-border bg-surface-soft p-4">
                          <p className="text-sm text-muted">Address</p>
                          <p className="mt-2 break-all text-xl font-medium text-foreground">{walletAddress ?? "Sin direccion conectada"}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 border-t border-border p-4">
                        <Button
                          variant="ghost"
                          className="h-11 gap-2 rounded-xl border border-border bg-transparent text-base text-foreground hover:bg-surface-soft"
                          onClick={async () => {
                            if (!walletAddress) return;
                            try {
                              await navigator.clipboard.writeText(walletAddress);
                              setCopiedAddress(true);
                              window.setTimeout(() => setCopiedAddress(false), 1400);
                            } catch {}
                          }}
                        >
                          <Copy size={18} />
                          {copiedAddress ? "Copied" : "Copy"}
                        </Button>
                        <Button
                          variant="outline"
                          className="h-11 gap-2 rounded-xl border-red-500 text-base text-red-500 hover:bg-red-500/10"
                          onClick={() => {
                            disconnectWallet();
                            setWalletOpen(false);
                          }}
                        >
                          <LogOut size={18} />
                          Disconnect
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                <Button
                  variant="outline"
                  className={`gap-2 ${navOutlineClass}`}
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
        <div className="chat-mobile-bottombar fixed bottom-0 left-0 right-0 z-40 border-t border-[color:color-mix(in_oklab,var(--color-nav)_42%,var(--color-border))] bg-[color:color-mix(in_oklab,var(--color-nav)_90%,transparent)] px-2 pb-[max(env(safe-area-inset-bottom),8px)] pt-2 text-nav-foreground backdrop-blur md:hidden">
          <div className={`mx-auto grid w-full max-w-md gap-2 ${user ? (inHome ? "grid-cols-2" : "grid-cols-5") : "grid-cols-2"}`}>
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
                {showQuickNav && (
                  <>
                    <motion.div whileTap={{ scale: 0.97 }}>
                      <Link href="/chats" className={`${mobileItemClass} ${pathname === "/chats" ? mobileActiveClass : mobileIdleClass}`} aria-current={pathname === "/chats" ? "page" : undefined}>
                        <MessageCircle size={16} />
                        Chats
                      </Link>
                    </motion.div>
                    <motion.div whileTap={{ scale: 0.97 }}>
                      <Link href={portfolioPath} className={`${mobileItemClass} ${isActiveRoute(portfolioPath) ? mobileActiveClass : mobileIdleClass}`} aria-current={isActiveRoute(portfolioPath) ? "page" : undefined}>
                        {activeMode === "seller" ? <Briefcase size={16} /> : <PieChart size={16} />}
                        {activeMode === "seller" ? "Activos" : "Portafolio"}
                      </Link>
                    </motion.div>
                    <motion.div whileTap={{ scale: 0.97 }}>
                      <Link href="/account" className={`${mobileItemClass} ${pathname === "/account" ? mobileActiveClass : mobileIdleClass}`} aria-current={pathname === "/account" ? "page" : undefined}>
                        <Settings size={16} />
                        Cuenta
                      </Link>
                    </motion.div>
                  </>
                )}
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
