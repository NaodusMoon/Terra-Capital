"use client";

import { FormEvent, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useWallet } from "@/components/providers/wallet-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { isValidStellarPublicKey } from "@/lib/security";
import { getWalletProviderLabel, setPendingWallet, type WalletProviderId } from "@/lib/wallet";

export default function QrConnectPage() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session")?.trim() ?? "";
  const { walletAddress, walletProvider, walletOptions, connectWallet, connectWithWalletConnect, connecting } = useWallet();
  const [manualWalletAddress, setManualWalletAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const selectedWalletAddress = useMemo(() => {
    if (walletAddress) return walletAddress.trim().toUpperCase();
    return manualWalletAddress.trim().toUpperCase();
  }, [manualWalletAddress, walletAddress]);

  const selectedProvider: WalletProviderId = walletProvider ?? "manual";

  const handleConnectWalletConnect = async () => {
    setError("");
    await connectWithWalletConnect();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!sessionId) {
      setError("QR invalido: falta session.");
      return;
    }
    if (!selectedWalletAddress || !isValidStellarPublicKey(selectedWalletAddress)) {
      setError("Conecta una wallet valida o pega una direccion Stellar valida.");
      return;
    }

    if (!walletAddress) {
      setPendingWallet({ address: selectedWalletAddress, provider: "manual" });
    }

    setSubmitting(true);
    const response = await fetch("/api/auth/wallet-qr/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session: sessionId,
        walletAddress: selectedWalletAddress,
        walletProvider: selectedProvider,
      }),
    });
    const payload = (await response.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
    setSubmitting(false);

    if (!payload?.ok) {
      setError(payload?.message ?? "No se pudo vincular la wallet por QR.");
      return;
    }

    setMessage("Wallet conectada. Ya puedes volver al navegador donde abriste el QR.");
  };

  return (
    <main className="mx-auto grid min-h-[calc(100vh-74px)] w-full max-w-6xl place-items-center px-5 py-12">
      <Card className="w-full max-w-md">
        <h1 className="text-2xl font-bold">Vincular wallet por QR</h1>
        <p className="mt-2 text-sm text-muted">
          Conecta tu wallet aqui y quedara vinculada en la sesion de escritorio.
        </p>
        <p className="mt-2 text-xs text-muted">Sesion: {sessionId ? `${sessionId.slice(0, 8)}...` : "No disponible"}</p>

        <div className="mt-4 rounded-xl border border-border bg-surface-soft p-3">
          <p className="text-xs uppercase tracking-[0.12em] text-muted">Wallet conectada</p>
          <p className="mt-1 text-sm font-semibold">{walletAddress ? `${walletAddress.slice(0, 8)}...${walletAddress.slice(-6)}` : "No conectada"}</p>
          {walletProvider && (
            <p className="mt-1 text-xs text-muted">Proveedor: {getWalletProviderLabel(walletProvider)}</p>
          )}

          <Button className="mt-3 h-11 w-full" type="button" onClick={handleConnectWalletConnect} disabled={connecting || submitting}>
            {connecting ? "Conectando..." : "Conectar con WalletConnect"}
          </Button>

          <p className="mt-3 text-xs uppercase tracking-[0.12em] text-muted">Opciones alternas</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {walletOptions.map((option) => (
              <Button key={option.id} type="button" variant="outline" onClick={() => connectWallet(option.id)} disabled={connecting || submitting}>
                {option.label}
              </Button>
            ))}
          </div>

          {!walletAddress && (
            <label className="mt-3 block space-y-1 text-sm">
              <span className="text-xs uppercase tracking-[0.12em] text-muted">O usar direccion publica</span>
              <input
                className="h-11 w-full rounded-xl border border-border bg-background px-3"
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

        <form className="mt-6 space-y-3" onSubmit={handleSubmit}>
          {error && <p className="terra-alert">{error}</p>}
          {message && <p className="text-sm text-primary">{message}</p>}
          <Button className="h-11 w-full" type="submit" disabled={submitting || connecting || !selectedWalletAddress}>
            {submitting ? "Vinculando..." : "Vincular esta wallet"}
          </Button>
        </form>
      </Card>
    </main>
  );
}
