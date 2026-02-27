"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { useWallet } from "@/components/providers/wallet-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { isValidStellarPublicKey } from "@/lib/security";
import { getWalletProviderLabel } from "@/lib/wallet";

export function LoginForm() {
  const router = useRouter();
  const { login, user, loading } = useAuth();
  const {
    walletAddress,
    walletProvider,
    walletOptions,
    connectWallet,
    connectWithWalletConnect,
    disconnectWallet,
    connecting,
    error: walletError,
  } = useWallet();

  const [fullName, setFullName] = useState("");
  const [needName, setNeedName] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const walletConnectAvailable = useMemo(
    () => walletOptions.some((option) => option.id === "wallet_connect"),
    [walletOptions],
  );
  const freighterAvailable = useMemo(
    () => walletOptions.some((option) => option.id === "freighter"),
    [walletOptions],
  );

  useEffect(() => {
    if (!loading && user) {
      router.replace("/dashboard");
    }
  }, [loading, router, user]);

  const finalizeLogin = async (selectedWalletAddress: string, selectedProvider: "wallet_connect" | "freighter") => {
    if (needName && !fullName.trim()) {
      setError("Ingresa tu nombre para completar el primer acceso.");
      return;
    }

    setSubmitting(true);
    const result = await login({
      walletAddress: selectedWalletAddress,
      walletProvider: selectedProvider,
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

    router.push("/dashboard");
  };

  const handleConnectWallet = async () => {
    setError("");
    if (walletAddress && walletProvider && walletProvider !== "wallet_connect" && walletProvider !== "freighter") {
      disconnectWallet();
    }

    if (freighterAvailable) {
      const connectedFreighter = await connectWallet("freighter");
      if (connectedFreighter) {
        setNeedName(false);
        setFullName("");
        return;
      }
    }

    if (!walletConnectAvailable) {
      setError("No se detecto Freighter y WalletConnect no esta configurado.");
      return;
    }

    const connected = await connectWithWalletConnect();
    if (!connected) {
      setError("No se pudo conectar ni con Freighter ni con WalletConnect.");
      return;
    }

    setNeedName(false);
    setFullName("");
  };

  const handleConnectFreighter = async () => {
    setError("");
    const connected = await connectWallet("freighter");
    if (!connected) {
      setError("No se pudo conectar Freighter en este navegador.");
      return;
    }
    setNeedName(false);
    setFullName("");
  };

  const handleLogin = async () => {
    setError("");
    const selectedWalletAddress = (walletAddress ?? "").trim().toUpperCase();
    if (!selectedWalletAddress) {
      setError("Primero conecta tu wallet.");
      return;
    }
    if (!isValidStellarPublicKey(selectedWalletAddress)) {
      setError("La wallet conectada no es valida para Stellar.");
      return;
    }
    const acceptedProvider = walletProvider === "wallet_connect" || walletProvider === "freighter";
    if (!acceptedProvider) {
      setError("Conecta con WalletConnect o Freighter.");
      return;
    }

    await finalizeLogin(selectedWalletAddress, walletProvider);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await handleLogin();
  };

  const connectedWalletLabel = walletAddress
    ? `${walletAddress.slice(0, 8)}...${walletAddress.slice(-6)}`
    : "Sin wallet conectada";
  const canSubmit = Boolean(walletAddress) && (walletProvider === "wallet_connect" || walletProvider === "freighter");

  return (
    <Card className="relative w-full max-w-xl overflow-hidden border-white/40 bg-surface/95 p-0 backdrop-blur-sm">
      <div className="pointer-events-none absolute -left-20 -top-20 h-56 w-56 rounded-full bg-primary/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -right-14 h-52 w-52 rounded-full bg-secondary/20 blur-3xl" />

      <div className="relative p-6 sm:p-8">
        <p className="terra-badge">WalletConnect Login</p>
        <h1 className="tc-heading mt-4 text-3xl font-bold tracking-tight">Acceso rapido y seguro</h1>
        <p className="tc-subtitle mt-2 text-sm">
          Solo con wallet. Sin contrasena. Si es tu primera vez, te pedimos nombre una sola vez.
        </p>

        <div className="mt-6 rounded-2xl border border-border/80 bg-background/70 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.12em] text-muted">Estado</p>
              <p className="mt-1 text-sm font-semibold">{connectedWalletLabel}</p>
              {walletAddress && walletProvider && (
                <p className="mt-1 text-xs text-muted">Proveedor: {getWalletProviderLabel(walletProvider)}</p>
              )}
            </div>
            <span className="inline-flex items-center rounded-full border border-border bg-surface-soft px-3 py-1 text-xs font-semibold text-muted">
              {canSubmit ? "Conectada" : "Pendiente"}
            </span>
          </div>
        </div>

        <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
          {needName && (
            <label className="block space-y-1 text-sm">
              <span className="text-xs uppercase tracking-[0.12em] text-muted">Tu nombre</span>
              <input
                className="h-11 w-full rounded-xl border border-border bg-background px-3 outline-none transition focus:border-primary"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="Ej: Ana Perez"
                required
              />
            </label>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              className="h-11 w-full"
              type="button"
              onClick={handleConnectWallet}
              disabled={connecting || submitting}
            >
              {connecting ? "Conectando..." : canSubmit ? "Reconectar wallet" : "Conectar wallet"}
            </Button>
            <Button
              className="h-11 w-full"
              type="submit"
              variant="secondary"
              disabled={!canSubmit || submitting || connecting}
            >
              {submitting ? "Validando..." : needName ? "Guardar y entrar" : "Entrar"}
            </Button>
          </div>
          <Button
            className="h-11 w-full"
            type="button"
            variant="outline"
            onClick={handleConnectFreighter}
            disabled={connecting || submitting || !freighterAvailable}
          >
            Conectar Freighter sin QR
          </Button>

          {walletAddress && (
            <Button
              className="h-10 w-full"
              type="button"
              variant="ghost"
              onClick={disconnectWallet}
              disabled={connecting || submitting}
            >
              Cambiar wallet
            </Button>
          )}
        </form>

        {!walletConnectAvailable && (
          <p className="terra-alert mt-4">
            WalletConnect no esta habilitado en este entorno. Configura NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID.
          </p>
        )}
        {walletError && <p className="terra-alert mt-4">{walletError}</p>}
        {error && <p className="terra-alert mt-4">{error}</p>}
      </div>
    </Card>
  );
}
