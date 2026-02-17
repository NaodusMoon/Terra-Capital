"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { useWallet } from "@/components/providers/wallet-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { isValidStellarPublicKey } from "@/lib/security";
import { setPendingWallet } from "@/lib/wallet";

export function LoginForm() {
  const router = useRouter();
  const { login, user, loading } = useAuth();
  const { walletAddress, walletOptions, connectWallet, connecting, error: walletError } = useWallet();
  const [manualWalletAddress, setManualWalletAddress] = useState("");
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
    const fallbackAddress = manualWalletAddress.trim().toUpperCase();
    const selectedWalletAddress = walletAddress ?? fallbackAddress;

    if (!selectedWalletAddress) {
      setError("Conecta una wallet o pega tu direccion publica Stellar.");
      return;
    }
    if (!isValidStellarPublicKey(selectedWalletAddress)) {
      setError("La direccion publica no es valida (debe empezar con G...).");
      return;
    }
    if (needName && !fullName.trim()) {
      setError("Ingresa tu nombre para completar el primer acceso.");
      return;
    }

    if (!walletAddress) {
      setPendingWallet({ address: selectedWalletAddress, provider: "manual" });
    }

    setSubmitting(true);
    const result = await login({
      walletAddress: selectedWalletAddress,
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
        {walletError && <p className="mt-3 text-sm text-red-500">{walletError}</p>}
        {!walletAddress && (
          <p className="mt-2 text-xs text-[var(--color-muted)]">
            En movil, Freighter y xBull intentan abrir flujo compatible sin extension. Si no conecta, usa direccion publica.
          </p>
        )}
        {!walletAddress && (
          <label className="mt-3 block space-y-1 text-sm">
            <span className="text-xs uppercase tracking-[0.12em] text-[var(--color-muted)]">O usar direccion publica</span>
            <input
              className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3"
              value={manualWalletAddress}
              onChange={(event) => setManualWalletAddress(event.target.value)}
              placeholder="G..."
              inputMode="text"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </label>
        )}
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

        <Button className="h-11 w-full" type="submit" disabled={submitting || (!walletAddress && !manualWalletAddress.trim())}>
          {submitting ? "Validando..." : needName ? "Guardar y entrar" : "Entrar"}
        </Button>
      </form>
    </Card>
  );
}
