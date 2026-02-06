"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { LogOut, Wallet } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { useWallet } from "@/components/providers/wallet-provider";
import { LogoBadge } from "@/components/layout/logo-badge";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export function Navbar() {
  const { user, loading } = useAuth();
  const { walletAddress, disconnectWallet } = useWallet();
  const router = useRouter();
  const pathname = usePathname();
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const isAuthView = pathname.startsWith("/auth");

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[color:color-mix(in_oklab,var(--color-background)_92%,transparent)] backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-3">
        <Link href="/">
          <LogoBadge />
        </Link>

        <div className="flex items-center gap-2">
          <ThemeToggle />

          {hydrated && !loading && !user && !isAuthView && (
            <>
              <Link href="/auth/login">
                <Button variant="outline">Iniciar sesion</Button>
              </Link>
              <Link href="/auth/register">
                <Button>Registrarse</Button>
              </Link>
            </>
          )}

          {hydrated && !loading && !user && isAuthView && (
            <Link href="/">
              <Button variant="ghost">Volver al inicio</Button>
            </Link>
          )}

          {hydrated && !loading && user && (
            <>
              <span className="hidden rounded-lg bg-[var(--color-surface-soft)] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] lg:inline-block">
                {user.role === "buyer" ? "Comprador" : "Vendedor"}
              </span>
              <span className="hidden items-center gap-2 rounded-lg bg-[var(--color-surface-soft)] px-3 py-2 text-xs font-semibold md:inline-flex">
                <Wallet size={14} />
                {walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : "Wallet no conectada"}
              </span>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => {
                  disconnectWallet();
                  router.push("/");
                }}
              >
                <LogOut size={15} />
                Cerrar wallet
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
