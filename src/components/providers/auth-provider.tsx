"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { getCurrentUser, loginUser, logoutUser, registerUser } from "@/lib/auth";
import type { AppUser, UserRole } from "@/types/auth";

interface LoginInput {
  email: string;
  password: string;
  role: UserRole;
}

interface RegisterInput {
  fullName: string;
  email: string;
  password: string;
  role: UserRole;
  organization?: string;
  stellarPublicKey?: string;
}

interface AuthContextValue {
  user: AppUser | null;
  loading: boolean;
  login: (input: LoginInput) => ReturnType<typeof loginUser>;
  register: (input: RegisterInput) => ReturnType<typeof registerUser>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(() => getCurrentUser());

  const value = useMemo(
    () => ({
      user,
      loading: false,
      login: (input: LoginInput) => {
        const result = loginUser(input);
        if (result.ok) setUser(result.user);
        return result;
      },
      register: (input: RegisterInput) => {
        const result = registerUser(input);
        if (result.ok) setUser(result.user);
        return result;
      },
      logout: () => {
        logoutUser();
        setUser(null);
      },
    }),
    [user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

