"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BellRing,
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
import { useLanguage } from "@/components/providers/language-provider";
import { useWallet } from "@/components/providers/wallet-provider";
import { LogoBadge } from "@/components/layout/logo-badge";
import { ModeToggle } from "@/components/layout/mode-toggle";
import { NotificationsBell } from "@/components/layout/notifications-bell";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { getWalletProviderLabel } from "@/lib/wallet";

const copyByLanguage = {
  es: {
    panelSeller: "Panel vendedor",
    panelBuyer: "Panel inversor",
    start: "Inicio",
    login: "Login",
    backToPanel: "Volver al panel",
    signIn: "Iniciar con wallet",
    backHome: "Volver al inicio",
    portfolio: "Portafolio",
    assets: "Activos",
    chat: "Chat",
    settings: "Ajustes",
    account: "Cuenta",
    logout: "Salir",
    walletDisconnected: "Wallet no conectada",
    walletConnected: "Sin direccion conectada",
    copied: "Copiado",
    copy: "Copiar",
    disconnect: "Desconectar",
    walletLabel: "Wallet",
    address: "Direccion",
    mobileHint: "Moverse por la app",
  },
  en: {
    panelSeller: "Seller panel",
    panelBuyer: "Investor panel",
    start: "Home",
    login: "Login",
    backToPanel: "Back to panel",
    signIn: "Connect wallet",
    backHome: "Back home",
    portfolio: "Portfolio",
    assets: "Assets",
    chat: "Chat",
    settings: "Settings",
    account: "Account",
    logout: "Logout",
    walletDisconnected: "Wallet not connected",
    walletConnected: "No connected address",
    copied: "Copied",
    copy: "Copy",
    disconnect: "Disconnect",
    walletLabel: "Wallet",
    address: "Address",
    mobileHint: "Move through the app",
  },
  pt: {
    panelSeller: "Painel vendedor",
    panelBuyer: "Painel investidor",
    start: "Inicio",
    login: "Login",
    backToPanel: "Voltar ao painel",
    signIn: "Conectar carteira",
    backHome: "Voltar ao inicio",
    portfolio: "Portfolio",
    assets: "Ativos",
    chat: "Chat",
    settings: "Configuracoes",
    account: "Conta",
    logout: "Sair",
    walletDisconnected: "Carteira nao conectada",
    walletConnected: "Sem endereco conectado",
    copied: "Copiado",
    copy: "Copiar",
    disconnect: "Desconectar",
    walletLabel: "Carteira",
    address: "Endereco",
    mobileHint: "Mover-se pelo app",
  },
  fr: {
    panelSeller: "Espace vendeur",
    panelBuyer: "Espace investisseur",
    start: "Accueil",
    login: "Connexion",
    backToPanel: "Retour au tableau",
    signIn: "Connecter le wallet",
    backHome: "Retour a l'accueil",
    portfolio: "Portefeuille",
    assets: "Actifs",
    chat: "Chat",
    settings: "Parametres",
    account: "Compte",
    logout: "Quitter",
    walletDisconnected: "Wallet non connecte",
    walletConnected: "Aucune adresse connectee",
    copied: "Copie",
    copy: "Copier",
    disconnect: "Deconnecter",
    walletLabel: "Portefeuille",
    address: "Adresse",
    mobileHint: "Naviguer dans l app",
  },
} as const;

export function Navbar() {
  const { user, loading, logout, activeMode, switchMode } = useAuth();
  const { language } = useLanguage();
  const t = copyByLanguage[language];
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
    () => (walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : t.walletDisconnected),
    [t.walletDisconnected, walletAddress],
  );
  const isActiveRoute = (route: string) => pathname === route || pathname.startsWith(`${route}/`);

  const desktopActiveClass = "border-transparent bg-primary text-primary-contrast shadow-[0_10px_25px_rgba(0,0,0,0.2)]";
  const navOutlineClass =
    "border-[color:color-mix(in_oklab,var(--color-nav-foreground)_28%,var(--color-border))] bg-[color:color-mix(in_oklab,var(--color-nav)_68%,transparent)] text-nav-foreground hover:bg-[color:color-mix(in_oklab,var(--color-nav)_82%,var(--color-surface))]";
  const mobileNavClass =
    "group relative flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-[1.6rem] border px-2 pb-3 pt-2 text-center text-[10px] font-semibold leading-tight transition-all duration-200";
  const mobileActiveClass =
    "border-transparent bg-[linear-gradient(180deg,color-mix(in_oklab,var(--color-primary)_94%,white_6%),color-mix(in_oklab,var(--color-primary)_75%,black))] text-primary-contrast shadow-[0_16px_30px_rgba(25,44,16,0.3)] -translate-y-1";
  const mobileIdleClass =
    "border-[color:color-mix(in_oklab,var(--color-nav-foreground)_14%,var(--color-border))] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--color-surface)_94%,white_6%),color-mix(in_oklab,var(--color-nav)_86%,transparent))] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.48)] active:scale-[0.98]";

  const quickActions = [
    {
      key: "portfolio",
      href: portfolioPath,
      label: activeMode === "seller" ? t.assets : t.portfolio,
      isActive: isActiveRoute(portfolioPath),
      icon: activeMode === "seller" ? Briefcase : PieChart,
      iconTint: "group-hover:text-secondary",
    },
    {
      key: "chats",
      href: "/chats",
      label: t.chat,
      isActive: isActiveRoute("/chats"),
      icon: MessageCircle,
      iconTint: "group-hover:text-primary",
    },
    {
      key: "account",
      href: "/account",
      label: t.settings,
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
          <div className="fixed left-1/2 top-2 z-50 w-[calc(100vw-0.9rem)] max-w-md -translate-x-1/2 md:hidden">
            <div className="rounded-[2rem] border border-[color:color-mix(in_oklab,var(--color-nav)_56%,var(--color-border))] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--color-nav)_95%,white_5%),color-mix(in_oklab,var(--color-surface)_88%,transparent))] p-2.5 text-nav-foreground shadow-[0_18px_44px_rgba(0,0,0,0.16)] backdrop-blur-2xl">
              <div className="flex items-start gap-2 min-[390px]:items-center">
                <Link href={panelPath} className="flex min-w-0 flex-1 items-center gap-3 rounded-[1.45rem] bg-[color:color-mix(in_oklab,var(--color-surface)_78%,white_22%)] px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.52)]">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[1.15rem] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--color-primary)_92%,white_8%),color-mix(in_oklab,var(--color-primary)_76%,black))] text-primary-contrast shadow-[0_12px_22px_rgba(25,44,16,0.26)]">
                    <LayoutDashboard size={18} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-muted)]">Terra Capital</span>
                    <span className="block truncate text-sm font-semibold text-[var(--color-foreground)]">
                      {activeMode === "seller" ? t.panelSeller : t.panelBuyer}
                    </span>
                  </span>
                </Link>
                <div className="flex shrink-0 items-center gap-2">
                  <NotificationsBell mobile />
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 w-11 rounded-[1.15rem] border-[color:color-mix(in_oklab,var(--color-nav-foreground)_16%,var(--color-border))] bg-[color:color-mix(in_oklab,var(--color-surface)_84%,white_16%)] px-0"
                    onClick={() => {
                      logout();
                      disconnectWallet();
                      router.push("/");
                    }}
                    aria-label={t.logout}
                  >
                    <LogOut size={17} />
                  </Button>
                </div>
              </div>
              <div className="mt-2 grid gap-2 rounded-[1.4rem] bg-[color:color-mix(in_oklab,var(--color-surface)_72%,transparent)] px-2 py-2 min-[390px]:grid-cols-[minmax(0,1fr)_auto] min-[390px]:items-center">
                <ModeToggle
                  mode={activeMode}
                  compact
                  layoutId="mobile-top-mode-pill"
                  className="min-w-0 flex-1"
                  onChange={(mode) => {
                    switchMode(mode);
                    router.push(mode === "seller" ? "/seller" : "/dashboard");
                  }}
                />
                <div className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--color-background)]/65 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)] min-[390px]:justify-start">
                  <BellRing size={12} />
                  {t.mobileHint}
                </div>
              </div>
            </div>
          </div>
          <div className="h-24 md:hidden" />
        </>
      )}

      <header className={`${inHome ? "fixed left-0 right-0 top-2" : "sticky top-2"} z-40 hidden px-4 md:block`}>
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
                    <Button variant="secondary" className="rounded-2xl">{t.signIn}</Button>
                  </Link>
                )}

                {!loading && !user && isAuthView && (
                  <Link href="/">
                    <Button variant="ghost" className="rounded-2xl text-nav-foreground hover:bg-[color:color-mix(in_oklab,var(--color-nav-foreground)_12%,transparent)]">
                      {t.backHome}
                    </Button>
                  </Link>
                )}

                {!loading && !!user && (
                  <>
                    {inHome && (
                      <Link href={panelPath}>
                        <Button variant="outline" className={`rounded-2xl ${navOutlineClass} ${isActiveRoute(panelPath) ? desktopActiveClass : ""}`}>
                          {t.backToPanel}
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
                                className={`group relative inline-flex h-11 items-center gap-2.5 rounded-2xl border px-3 text-xs font-semibold tracking-[0.01em] transition-all duration-250 ${
                                  action.isActive
                                    ? "border-transparent bg-primary text-primary-contrast shadow-[0_10px_22px_rgba(0,0,0,0.24)]"
                                    : navOutlineClass
                                }`}
                              >
                                <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-xl border border-[color:color-mix(in_oklab,var(--color-nav-foreground)_16%,var(--color-border))] bg-[color:color-mix(in_oklab,var(--color-surface)_80%,transparent)] ${action.isActive ? "border-primary-contrast/35 bg-primary-contrast/20 text-primary-contrast" : `text-nav-foreground ${action.iconTint}`}`}>
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
                              {walletProvider ? getWalletProviderLabel(walletProvider) : t.walletLabel}
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
                              <p className="text-sm text-muted">{t.address}</p>
                              <p className="mt-2 break-all text-xl font-medium text-foreground">
                                {walletAddress ?? t.walletConnected}
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
                              {copiedAddress ? t.copied : t.copy}
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
                              {t.disconnect}
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
                      {t.logout}
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
        <div className="fixed bottom-0 left-0 right-0 z-40 px-2 pb-[max(env(safe-area-inset-bottom),10px)] pt-2 md:hidden">
          <div className="mx-auto w-full max-w-[28rem] rounded-[2.15rem] border border-[color:color-mix(in_oklab,var(--color-nav)_45%,var(--color-border))] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--color-nav)_95%,white_5%),color-mix(in_oklab,var(--color-surface)_88%,transparent))] p-2 text-nav-foreground shadow-[0_-18px_38px_rgba(0,0,0,0.16)] backdrop-blur-2xl">
            <div className={`grid gap-2 ${user ? "grid-cols-4" : "grid-cols-2"}`}>
              {!user && (
                <>
                  <motion.div whileTap={{ scale: 0.97 }}>
                    <Link href="/" className={`${mobileNavClass} ${pathname === "/" ? mobileActiveClass : mobileIdleClass}`} aria-current={pathname === "/" ? "page" : undefined}>
                      <span className={`grid h-9 w-9 place-items-center rounded-[1rem] ${pathname === "/" ? "bg-primary-contrast/16" : "bg-[var(--color-surface)]/90"}`}>
                        <House size={18} />
                      </span>
                      {t.start}
                    </Link>
                  </motion.div>
                  <motion.div whileTap={{ scale: 0.97 }}>
                    <Link href="/auth/login" className={`${mobileNavClass} ${pathname === "/auth/login" ? mobileActiveClass : mobileIdleClass}`} aria-current={pathname === "/auth/login" ? "page" : undefined}>
                      <span className={`grid h-9 w-9 place-items-center rounded-[1rem] ${pathname === "/auth/login" ? "bg-primary-contrast/16" : "bg-[var(--color-surface)]/90"}`}>
                        <LogIn size={18} />
                      </span>
                      {t.login}
                    </Link>
                  </motion.div>
                </>
              )}

              {!!user && (
                <>
                  <motion.div whileTap={{ scale: 0.97 }}>
                    <Link href={panelPath} className={`${mobileNavClass} ${pathname === panelPath ? mobileActiveClass : mobileIdleClass}`} aria-current={pathname === panelPath ? "page" : undefined}>
                      <span className={`grid h-9 w-9 place-items-center rounded-[1rem] ${pathname === panelPath ? "bg-primary-contrast/16" : "bg-[var(--color-surface)]/90"}`}>
                        <LayoutDashboard size={18} />
                      </span>
                      {activeMode === "seller" ? t.panelSeller : t.panelBuyer}
                    </Link>
                  </motion.div>
                  <motion.div whileTap={{ scale: 0.97 }}>
                    <Link href="/chats" className={`${mobileNavClass} ${pathname === "/chats" ? mobileActiveClass : mobileIdleClass}`} aria-current={pathname === "/chats" ? "page" : undefined}>
                      <span className={`grid h-9 w-9 place-items-center rounded-[1rem] ${pathname === "/chats" ? "bg-primary-contrast/16" : "bg-[var(--color-surface)]/90"}`}>
                        <MessageCircle size={18} />
                      </span>
                      {t.chat}
                    </Link>
                  </motion.div>
                  <motion.div whileTap={{ scale: 0.97 }}>
                    <Link href={portfolioPath} className={`${mobileNavClass} ${isActiveRoute(portfolioPath) ? mobileActiveClass : mobileIdleClass}`} aria-current={isActiveRoute(portfolioPath) ? "page" : undefined}>
                      <span className={`grid h-9 w-9 place-items-center rounded-[1rem] ${isActiveRoute(portfolioPath) ? "bg-primary-contrast/16" : "bg-[var(--color-surface)]/90"}`}>
                        {activeMode === "seller" ? <Briefcase size={18} /> : <PieChart size={18} />}
                      </span>
                      {activeMode === "seller" ? t.assets : t.portfolio}
                    </Link>
                  </motion.div>
                  <motion.div whileTap={{ scale: 0.97 }}>
                    <Link href="/account" className={`${mobileNavClass} ${pathname === "/account" ? mobileActiveClass : mobileIdleClass}`} aria-current={pathname === "/account" ? "page" : undefined}>
                      <span className={`grid h-9 w-9 place-items-center rounded-[1rem] ${pathname === "/account" ? "bg-primary-contrast/16" : "bg-[var(--color-surface)]/90"}`}>
                        <Settings size={18} />
                      </span>
                      {t.account}
                    </Link>
                  </motion.div>
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
