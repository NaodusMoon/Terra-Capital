"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Briefcase,
  ChevronDown,
  Copy,
  House,
  LayoutDashboard,
  LogIn,
  LogOut,
  MessageCircle,
  PieChart,
  Settings,
  Wallet,
} from "lucide-react";
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
  const walletMenuRef = useRef<HTMLDivElement | null>(null);

  const isAuthView = pathname.startsWith("/auth");
  const inHome = pathname === "/";
  const panelPath = activeMode === "seller" ? "/seller" : "/dashboard";
  const portfolioPath = activeMode === "seller" ? "/seller/assets" : "/portfolio";
  const showQuickNav = !inHome;
  const shortWallet = useMemo(
    () => (walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : "Wallet no conectada"),
    [walletAddress],
  );
  const isActiveRoute = (route: string) => pathname === route || pathname.startsWith(`${route}/`);

  const desktopActiveClass = "border-transparent bg-primary text-primary-contrast shadow-[0_10px_25px_rgba(0,0,0,0.2)]";
  const navOutlineClass =
    "border-[color:color-mix(in_oklab,var(--color-nav-foreground)_28%,var(--color-border))] bg-[color:color-mix(in_oklab,var(--color-nav)_65%,transparent)] text-nav-foreground hover:bg-[color:color-mix(in_oklab,var(--color-nav)_78%,var(--color-surface))]";
  const mobileItemClass =
    "relative flex min-h-[62px] flex-col items-center justify-center gap-1.5 rounded-[1.35rem] border px-2 py-2.5 text-[11px] font-semibold transition-all duration-200";
  const mobileActiveClass =
    "border-transparent bg-[linear-gradient(180deg,var(--color-primary),color-mix(in_oklab,var(--color-primary)_76%,black))] text-primary-contrast shadow-[0_14px_28px_rgba(25,44,16,0.34)] -translate-y-1";
  const mobileIdleClass =
    "border-[color:color-mix(in_oklab,var(--color-nav-foreground)_16%,var(--color-border))] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--color-nav)_82%,white_18%),color-mix(in_oklab,var(--color-surface)_92%,var(--color-background)))] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] active:scale-[0.98]";
  const quickActionBaseClass =
    "group relative inline-flex h-11 items-center gap-2.5 rounded-2xl border px-3 text-xs font-semibold tracking-[0.01em] transition-all duration-250";
  const quickActionIconClass =
    "grid h-7 w-7 shrink-0 place-items-center rounded-xl border border-[color:color-mix(in_oklab,var(--color-nav-foreground)_16%,var(--color-border))] bg-[color:color-mix(in_oklab,var(--color-surface)_80%,transparent)]";

  const quickActions = [
    {
      key: "portfolio",
      href: portfolioPath,
      label: activeMode === "seller" ? "Mis activos" : "Portafolio",
      isActive: isActiveRoute(portfolioPath),
      icon: activeMode === "seller" ? Briefcase : PieChart,
      iconTint: "group-hover:text-secondary",
    },
    {
      key: "chats",
      href: "/chats",
      label: "Chat",
      isActive: isActiveRoute("/chats"),
      icon: MessageCircle,
      iconTint: "group-hover:text-primary",
    },
    {
      key: "account",
      href: "/account",
      label: "Configuracion",
      isActive: isActiveRoute("/account"),
      icon: Settings,
      iconTint: "group-hover:text-accent",
    },
  ] as const;

  useEffect(() => {
    if (!walletOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!walletMenuRef.current) return;
      if (!walletMenuRef.current.contains(event.target as Node)) {
        setWalletOpen(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [walletOpen]);

  return (
    <>
      {!loading && !!user && (
        <>
          <div className="chat-mobile-topbar fixed left-1/2 top-3 z-50 -translate-x-1/2 md:hidden">
            <div className="flex items-center gap-2 rounded-[1.7rem] border border-[color:color-mix(in_oklab,var(--color-nav)_52%,var(--color-border))] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--color-nav)_92%,white_8%),color-mix(in_oklab,var(--color-surface)_85%,transparent))] px-2 py-2 text-nav-foreground shadow-[0_18px_36px_rgba(0,0,0,0.16)] backdrop-blur-xl">
              <div className="flex min-w-0 flex-1 items-center gap-2 rounded-[1.25rem] bg-[color:color-mix(in_oklab,var(--color-surface)_75%,white_25%)] px-2 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]">
                <Link href={panelPath} className="flex min-w-0 items-center gap-2 rounded-xl px-1">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[1rem] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--color-primary)_90%,white_10%),color-mix(in_oklab,var(--color-primary)_74%,black))] text-primary-contrast shadow-[0_10px_20px_rgba(25,44,16,0.28)]">
                    <LayoutDashboard size={17} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-muted)]">Terra Capital</span>
                    <span className="block truncate text-sm font-semibold text-[var(--color-foreground)]">
                      {activeMode === "seller" ? "Panel vendedor" : "Panel inversor"}
                    </span>
                  </span>
                </Link>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <ModeToggle
                  mode={activeMode}
                  compact
                  layoutId="mobile-top-mode-pill"
                  className="w-[160px]"
                  onChange={(mode) => {
                    switchMode(mode);
                    router.push(mode === "seller" ? "/seller" : "/dashboard");
                  }}
                />
                <NotificationsBell mobile />
              </div>
            </div>
          </div>
          <div className="chat-mobile-spacer h-20 md:hidden" />
        </>
      )}

      <header className="sticky top-2 z-40 hidden px-4 md:block">
        <div className="mx-auto w-full max-w-7xl">
          <div className="relative overflow-visible rounded-3xl border border-[color:color-mix(in_oklab,var(--color-nav)_45%,var(--color-border))] bg-[linear-gradient(125deg,color-mix(in_oklab,var(--color-nav)_90%,transparent),color-mix(in_oklab,var(--color-surface)_84%,transparent))] px-4 py-3 text-nav-foreground shadow-[0_14px_34px_rgba(0,0,0,0.14)] backdrop-blur-xl">
            <div className="pointer-events-none absolute -right-20 -top-16 h-36 w-36 rounded-full bg-[color:color-mix(in_oklab,var(--color-secondary)_18%,transparent)] blur-3xl" />
            <div className="pointer-events-none absolute -left-16 -bottom-20 h-40 w-40 rounded-full bg-[color:color-mix(in_oklab,var(--color-primary)_14%,transparent)] blur-3xl" />

            <div className="relative flex items-center justify-between gap-3">
              <Link href="/" className="rounded-2xl px-1 py-0.5 transition hover:opacity-90">
                <LogoBadge />
              </Link>

              <div className="flex items-center gap-2">
                <ThemeToggle />

                {!loading && !user && !isAuthView && (
                  <Link href="/auth/login">
                    <Button variant="secondary" className="rounded-2xl">Iniciar con wallet</Button>
                  </Link>
                )}

                {!loading && !user && isAuthView && (
                  <Link href="/">
                    <Button variant="ghost" className="rounded-2xl text-nav-foreground hover:bg-[color:color-mix(in_oklab,var(--color-nav-foreground)_12%,transparent)]">
                      Volver al inicio
                    </Button>
                  </Link>
                )}

                {!loading && !!user && (
                  <>
                    {inHome && (
                      <Link href={panelPath}>
                        <Button variant="outline" className={`rounded-2xl ${navOutlineClass} ${isActiveRoute(panelPath) ? desktopActiveClass : ""}`}>
                          Volver al panel
                        </Button>
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
                        {quickActions.map((action) => {
                          const Icon = action.icon;
                          return (
                            <Link key={action.key} href={action.href} title={action.label}>
                              <span
                                className={`${quickActionBaseClass} ${
                                  action.isActive
                                    ? "border-transparent bg-primary text-primary-contrast shadow-[0_10px_22px_rgba(0,0,0,0.24)]"
                                    : navOutlineClass
                                }`}
                              >
                                <span className={`${quickActionIconClass} ${action.isActive ? "border-primary-contrast/35 bg-primary-contrast/20 text-primary-contrast" : `text-nav-foreground ${action.iconTint}`}`}>
                                  <Icon size={15} />
                                </span>
                                <span className="pr-0.5">{action.label}</span>
                              </span>
                            </Link>
                          );
                        })}
                      </div>
                    )}

                    <div className="relative" ref={walletMenuRef}>
                      <Button
                        variant="outline"
                        className={`gap-2 rounded-2xl ${navOutlineClass}`}
                        onClick={() => setWalletOpen((prev) => !prev)}
                      >
                        <Wallet size={14} />
                        <span className="hidden sm:inline">
                          {walletProvider ? `${getWalletProviderLabel(walletProvider)} ${shortWallet}` : shortWallet}
                        </span>
                        <ChevronDown size={14} className={`transition-transform ${walletOpen ? "rotate-180" : ""}`} />
                      </Button>
                      {walletOpen && (
                        <div className="absolute right-0 top-12 z-50 w-96 overflow-hidden rounded-2xl border border-border bg-surface text-foreground shadow-[0_20px_40px_rgba(0,0,0,0.2)]">
                          <div className="flex items-center justify-between border-b border-border px-4 py-3">
                            <p className="text-2xl font-semibold">
                              {walletProvider ? getWalletProviderLabel(walletProvider) : "Wallet"}
                            </p>
                            <span className="rounded-lg bg-surface-soft px-3 py-1 text-xs font-medium text-muted">
                              {network === "public" ? "Mainnet" : "Testnet"}
                            </span>
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
                              <p className="mt-2 break-all text-xl font-medium text-foreground">
                                {walletAddress ?? "Sin direccion conectada"}
                              </p>
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
                      className={`gap-2 rounded-2xl ${navOutlineClass}`}
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
          </div>
        </div>
      </header>

      {!loading && (
        <div className="chat-mobile-bottombar fixed bottom-0 left-0 right-0 z-40 px-2 pb-[max(env(safe-area-inset-bottom),8px)] pt-2 md:hidden">
          <div className={`mx-auto w-full max-w-md rounded-[2rem] border border-[color:color-mix(in_oklab,var(--color-nav)_42%,var(--color-border))] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--color-nav)_93%,white_7%),color-mix(in_oklab,var(--color-surface)_86%,transparent))] p-2 text-nav-foreground shadow-[0_-16px_36px_rgba(0,0,0,0.16)] backdrop-blur-xl ${user ? (inHome ? "" : "") : ""}`}>
            <div className={`grid gap-2 ${user ? (inHome ? "grid-cols-2" : "grid-cols-5") : "grid-cols-2"}`}>
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
                        <span className={`grid h-6 w-6 place-items-center rounded-lg ${pathname === "/chats" ? "bg-primary-contrast/15" : "bg-[var(--color-surface)]/70"}`}>
                          <MessageCircle size={15} />
                        </span>
                        Chats
                      </Link>
                    </motion.div>
                    <motion.div whileTap={{ scale: 0.97 }}>
                      <Link href={portfolioPath} className={`${mobileItemClass} ${isActiveRoute(portfolioPath) ? mobileActiveClass : mobileIdleClass}`} aria-current={isActiveRoute(portfolioPath) ? "page" : undefined}>
                        <span className={`grid h-6 w-6 place-items-center rounded-lg ${isActiveRoute(portfolioPath) ? "bg-primary-contrast/15" : "bg-[var(--color-surface)]/70"}`}>
                          {activeMode === "seller" ? <Briefcase size={15} /> : <PieChart size={15} />}
                        </span>
                        {activeMode === "seller" ? "Activos" : "Portafolio"}
                      </Link>
                    </motion.div>
                    <motion.div whileTap={{ scale: 0.97 }}>
                      <Link href="/account" className={`${mobileItemClass} ${pathname === "/account" ? mobileActiveClass : mobileIdleClass}`} aria-current={pathname === "/account" ? "page" : undefined}>
                        <span className={`grid h-6 w-6 place-items-center rounded-lg ${pathname === "/account" ? "bg-primary-contrast/15" : "bg-[var(--color-surface)]/70"}`}>
                          <Settings size={15} />
                        </span>
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
            <div className="pointer-events-none mt-2 flex justify-center">
              <span className="h-1.5 w-24 rounded-full bg-[color:color-mix(in_oklab,var(--color-nav-foreground)_18%,transparent)]" />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
