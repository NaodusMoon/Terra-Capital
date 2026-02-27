"use client";

import { createContext, useContext, useMemo, useState, useSyncExternalStore } from "react";
import {
  getActiveMode,
  getCurrentUser,
  listAdminAccounts,
  loginUser,
  logoutUser,
  setActiveMode,
  submitSellerVerification,
  updateAdminAccount,
  updateProfile,
} from "@/lib/auth";
import { PLATFORM_OWNER_WALLET } from "@/lib/constants";
import type { WalletProviderId } from "@/lib/wallet";
import type { AppUser, UserMode } from "@/types/auth";

interface LoginInput {
  walletAddress: string;
  walletProvider: WalletProviderId;
  fullName?: string;
}

interface UpdateProfileInput {
  fullName: string;
  organization?: string;
  stellarPublicKey: string;
}

interface SellerEvidenceDigestInput {
  mimeType: string;
  bytes: number;
  sha256: string;
}

interface AuthContextValue {
  user: AppUser | null;
  activeMode: UserMode;
  loading: boolean;
  login: (input: LoginInput) => ReturnType<typeof loginUser>;
  logout: () => void;
  switchMode: (mode: UserMode) => void;
  updateAccount: (input: UpdateProfileInput) => ReturnType<typeof updateProfile>;
  submitSellerKyc: (input: {
    legalName: string;
    documentType: "national_id" | "passport" | "license";
    documentLast4: string;
    taxId: string;
    country: string;
    supportUrl?: string;
    documentFrontDigest: SellerEvidenceDigestInput;
    documentBackDigest?: SellerEvidenceDigestInput;
    livenessVideoDigest: SellerEvidenceDigestInput;
    livenessScore: number;
    livenessDetectedFrames: number;
    livenessMovementRatio: number;
    livenessChallenge: string;
  }) => ReturnType<typeof submitSellerVerification>;
  listAccountsForAdmin: () => ReturnType<typeof listAdminAccounts>;
  updateAccountByAdmin: (input: {
    targetUserId: string;
    appRole?: "user" | "dev" | "admin";
    buyerVerificationStatus?: "unverified" | "verified";
  }) => ReturnType<typeof updateAdminAccount>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [, setRevision] = useState(0);
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const loading = !hydrated;
  const user: AppUser | null = hydrated ? getCurrentUser() : null;
  const activeMode: UserMode = hydrated ? getActiveMode() : "buyer";

  const value = useMemo(
    () => ({
      user,
      activeMode,
      loading,
      login: async (input: LoginInput) => {
        const result = await loginUser(input);
        if (result.ok) {
          setRevision((prev) => prev + 1);
        }
        return result;
      },
      logout: () => {
        logoutUser();
        setRevision((prev) => prev + 1);
      },
      switchMode: (mode: UserMode) => {
        if (!user) return;
        setActiveMode(mode);
        setRevision((prev) => prev + 1);
      },
      updateAccount: async (input: UpdateProfileInput) => {
        if (!user) return { ok: false as const, message: "No hay sesion activa." };
        const result = await updateProfile(input);
        if (result.ok) setRevision((prev) => prev + 1);
        return result;
      },
      submitSellerKyc: async (input: {
        legalName: string;
        documentType: "national_id" | "passport" | "license";
        documentLast4: string;
        taxId: string;
        country: string;
        supportUrl?: string;
        documentFrontDigest: SellerEvidenceDigestInput;
        documentBackDigest?: SellerEvidenceDigestInput;
        livenessVideoDigest: SellerEvidenceDigestInput;
        livenessScore: number;
        livenessDetectedFrames: number;
        livenessMovementRatio: number;
        livenessChallenge: string;
      }) => {
        if (!user) return { ok: false as const, message: "No hay sesion activa." };
        const result = await submitSellerVerification(input);
        if (result.ok) setRevision((prev) => prev + 1);
        return result;
      },
      listAccountsForAdmin: async () => {
        const isAdmin = Boolean(
          user && (user.appRole === "admin" || (user.stellarPublicKey ?? "").trim().toUpperCase() === PLATFORM_OWNER_WALLET),
        );
        if (!isAdmin) {
          return { ok: false as const, message: "Solo admins pueden ver cuentas." };
        }
        return listAdminAccounts();
      },
      updateAccountByAdmin: async (input: {
        targetUserId: string;
        appRole?: "user" | "dev" | "admin";
        buyerVerificationStatus?: "unverified" | "verified";
      }) => {
        const currentUserId = user?.id;
        const isAdmin = Boolean(
          user && (user.appRole === "admin" || (user.stellarPublicKey ?? "").trim().toUpperCase() === PLATFORM_OWNER_WALLET),
        );
        if (!isAdmin) {
          return { ok: false as const, message: "Solo admins pueden actualizar cuentas." };
        }
        const result = await updateAdminAccount(input);
        if (result.ok && result.user.id === currentUserId) {
          setRevision((prev) => prev + 1);
        }
        return result;
      },
    }),
    [activeMode, loading, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
