"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { WalletRequiredCard } from "@/components/auth/wallet-required-card";
import { useAuth } from "@/components/providers/auth-provider";
import { useWallet } from "@/components/providers/wallet-provider";
import type { UserRole } from "@/types/auth";

export function RoleGuard({ role, children }: { role: UserRole; children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { walletAddress, walletReady } = useWallet();
  const router = useRouter();

  useEffect(() => {
    if (loading || !walletReady) return;

    if (!user) {
      router.replace("/auth/login");
      return;
    }

    if (user.role !== role) {
      router.replace(`/${user.role}`);
    }
  }, [loading, role, router, user, walletReady]);

  if (loading || !walletReady || !user || user.role !== role) {
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

  return <>{children}</>;
}
