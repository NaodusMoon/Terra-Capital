"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { WalletRequiredCard } from "@/components/auth/wallet-required-card";
import { useAuth } from "@/components/providers/auth-provider";
import { useWallet } from "@/components/providers/wallet-provider";
import type { UserMode } from "@/types/auth";

export function RoleGuard({ mode, children }: { mode: UserMode; children: React.ReactNode }) {
  const { user, loading, activeMode } = useAuth();
  const { walletAddress, walletReady } = useWallet();
  const router = useRouter();

  useEffect(() => {
    if (loading || !walletReady) return;

    if (!user) {
      router.replace("/auth/login");
      return;
    }

    if (!walletAddress) {
      router.replace("/");
      return;
    }

    if (activeMode !== mode) {
      router.replace(`/${activeMode}`);
    }
  }, [activeMode, loading, mode, router, user, walletAddress, walletReady]);

  if (loading || !walletReady || !user) {
    return (
      <div className="mx-auto grid min-h-[60vh] max-w-6xl place-items-center px-4 text-center text-sm text-[var(--color-muted)]">
        Validando sesion...
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
        Cambiando de panel...
      </div>
    );
  }

  return <>{children}</>;
}
