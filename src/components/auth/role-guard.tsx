"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { WalletRequiredCard } from "@/components/auth/wallet-required-card";
import { useAuth } from "@/components/providers/auth-provider";
import { useLanguage } from "@/components/providers/language-provider";
import { useWallet } from "@/components/providers/wallet-provider";
import type { UserMode } from "@/types/auth";

function getModePath(mode: UserMode) {
  return mode === "seller" ? "/seller" : "/dashboard";
}

export function RoleGuard({ mode, children }: { mode: UserMode; children: React.ReactNode }) {
  const { user, loading, activeMode } = useAuth();
  const { language } = useLanguage();
  const { walletAddress, walletReady } = useWallet();
  const router = useRouter();
  const isSpanish = language === "es";
  const t = {
    validating: isSpanish ? "Validando sesion..." : "Validating session...",
    redirecting: isSpanish ? "Redirigiendo al login..." : "Redirecting to login...",
    preparingWallet: isSpanish ? "Preparando wallet..." : "Preparing wallet...",
    switchingPanel: isSpanish ? "Cambiando de panel..." : "Switching panel...",
  };

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.replace("/auth/login");
      return;
    }

    if (!walletReady) return;

    if (!walletAddress) {
      router.replace("/");
      return;
    }

    if (activeMode !== mode) {
      router.replace(getModePath(activeMode));
    }
  }, [activeMode, loading, mode, router, user, walletAddress, walletReady]);

  if (loading) {
    return (
      <div className="mx-auto grid min-h-[60vh] max-w-6xl place-items-center px-4 text-center text-sm text-[var(--color-muted)]">
        {t.validating}
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto grid min-h-[60vh] max-w-6xl place-items-center px-4 text-center text-sm text-[var(--color-muted)]">
        {t.redirecting}
      </div>
    );
  }

  if (!walletReady) {
    return (
      <div className="mx-auto grid min-h-[60vh] max-w-6xl place-items-center px-4 text-center text-sm text-[var(--color-muted)]">
        {t.preparingWallet}
      </div>
    );
  }

  if (!walletAddress) {
    return (
      <main className="mx-auto grid min-h-[calc(100vh-74px)] w-full max-w-6xl place-items-center px-5 py-10">
        <WalletRequiredCard />
      </main>
    );
  }

  if (activeMode !== mode) {
    return (
      <div className="mx-auto grid min-h-[60vh] max-w-6xl place-items-center px-4 text-center text-sm text-[var(--color-muted)]">
        {t.switchingPanel}
      </div>
    );
  }

  return <>{children}</>;
}
