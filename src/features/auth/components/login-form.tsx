"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { useWallet } from "@/components/providers/wallet-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function LoginForm() {
  const router = useRouter();
  const { login, user, loading } = useAuth();
  const { walletAddress, walletOptions, connectWallet, connecting } = useWallet();
  const [fullName, setFullName] = useState("");
  const [needName, setNeedName] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      router.replace("/buyer");
    }
  }, [loading, router, user]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    if (!walletAddress) {
      setError("Debes conectar una wallet antes de iniciar sesion.");
      return;
    }
    if (needName && !fullName.trim()) {
      setError("Ingresa tu nombre para completar el primer acceso.");
      return;
    }

    setSubmitting(true);
    const result = await login({
      walletAddress,
      fullName: needName ? fullName : undefined,
    });
    setSubmitting(false);

    if (!result.ok) {
      if (result.requiresName) {
        setNeedName(true);
      }
      setError(result.message);
      return;
    }

    router.push("/buyer");
  };

  return (
    <Card className="w-full max-w-md">
      <h1 className="text-2xl font-bold">Iniciar sesion</h1>
      <p className="mt-2 text-sm text-[var(--color-muted)]">
        Entra directo con tu wallet. Solo en el primer ingreso te pedimos tu nombre.
      </p>

      <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-3">
        <p className="text-xs uppercase tracking-[0.12em] text-[var(--color-muted)]">Wallet requerida</p>
        <p className="mt-1 text-sm font-semibold">{walletAddress ? `${walletAddress.slice(0, 8)}...${walletAddress.slice(-6)}` : "No conectada"}</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {walletOptions.map((option) => (
            <Button key={option.id} type="button" variant="outline" onClick={() => connectWallet(option.id)} disabled={connecting || submitting}>
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
        {needName && (
          <label className="block space-y-1 text-sm">
            <span>Nombre completo</span>
            <input
              className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              required
            />
          </label>
        )}

        {error && <p className="text-sm text-red-500">{error}</p>}

        <Button className="h-11 w-full" type="submit" disabled={submitting || !walletAddress}>
          {submitting ? "Validando..." : needName ? "Guardar y entrar" : "Entrar"}
        </Button>
      </form>
    </Card>
  );
}
