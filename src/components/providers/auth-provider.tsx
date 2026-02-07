"use client";

import { createContext, useContext, useMemo, useState, useSyncExternalStore } from "react";
import {
  changePassword,
  getActiveMode,
  getCurrentUser,
  loginUser,
  logoutUser,
  recoverPassword,
  requestPasswordRecoveryCode,
  registerUser,
  setActiveMode,
  submitSellerVerification,
  updateProfile,
} from "@/lib/auth";
import type { AppUser, UserMode } from "@/types/auth";

interface LoginInput {
  email: string;
  password: string;
  walletAddress: string;
}

interface RegisterInput {
  fullName: string;
  email: string;
  password: string;
  organization?: string;
  stellarPublicKey?: string;
}

interface UpdateProfileInput {
  fullName: string;
  organization?: string;
  stellarPublicKey?: string;
}

interface AuthContextValue {
  user: AppUser | null;
  activeMode: UserMode;
  loading: boolean;
  login: (input: LoginInput) => ReturnType<typeof loginUser>;
  register: (input: RegisterInput) => ReturnType<typeof registerUser>;
  logout: () => void;
  switchMode: (mode: UserMode) => void;
  updateAccount: (input: UpdateProfileInput) => ReturnType<typeof updateProfile>;
  updatePassword: (currentPassword: string, newPassword: string) => ReturnType<typeof changePassword>;
  requestRecoveryCode: (email: string) => ReturnType<typeof requestPasswordRecoveryCode>;
  recoverAccountPassword: (email: string, verificationCode: string, newPassword: string) => ReturnType<typeof recoverPassword>;
  submitSellerKyc: (input: {
    legalName: string;
    documentLast4: string;
    taxId: string;
    country: string;
    supportUrl?: string;
  }) => ReturnType<typeof submitSellerVerification>;
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
      register: async (input: RegisterInput) => {
        const result = await registerUser(input);
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
        const result = await updateProfile(user.id, input);
        if (result.ok) setRevision((prev) => prev + 1);
        return result;
      },
      updatePassword: async (currentPassword: string, newPassword: string) => {
        if (!user) return { ok: false as const, message: "No hay sesion activa." };
        return changePassword(user.id, { currentPassword, newPassword });
      },
      requestRecoveryCode: async (email: string) => {
        return requestPasswordRecoveryCode(email);
      },
      recoverAccountPassword: async (email: string, verificationCode: string, newPassword: string) => {
        return recoverPassword({ email, verificationCode, newPassword });
      },
      submitSellerKyc: (input: {
        legalName: string;
        documentLast4: string;
        taxId: string;
        country: string;
        supportUrl?: string;
      }) => {
        if (!user) return { ok: false as const, message: "No hay sesion activa." };
        const result = submitSellerVerification(user.id, input);
        if (result.ok) setRevision((prev) => prev + 1);
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
