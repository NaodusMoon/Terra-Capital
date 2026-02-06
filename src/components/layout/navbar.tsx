"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { LogOut } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { LogoBadge } from "@/components/layout/logo-badge";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export function Navbar() {
  const { user, logout, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const isAuthView = pathname.startsWith("/auth");

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[color:color-mix(in_oklab,var(--color-background)_85%,transparent)] backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-3">
        <Link href={user ? `/${user.role}` : "/"}>
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
              <span className="hidden rounded-lg bg-[var(--color-surface-soft)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] md:inline-block">
                {user.role === "buyer" ? "Comprador" : "Vendedor"}
              </span>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => {
                  logout();
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
    </header>
  );
}
