"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { useWallet } from "@/components/providers/wallet-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { isValidStellarPublicKey } from "@/lib/security";
import { getWalletProviderLabel, setPendingWallet, type WalletProviderId } from "@/lib/wallet";

interface QrSessionResponse {
  ok: boolean;
  sessionId?: string;
  link?: string;
  expiresAt?: number;
  message?: string;
}

interface QrStatusResponse {
  ok: boolean;
  connected?: boolean;
  walletAddress?: string | null;
  walletProvider?: WalletProviderId | null;
  expiresAt?: number;
  message?: string;
}

function isWalletProvider(value: unknown): value is WalletProviderId {
  return value === "freighter" || value === "xbull" || value === "albedo" || value === "manual";
}

export function LoginForm() {
  const router = useRouter();
  const { login, user, loading } = useAuth();
  const {
    walletAddress,
    walletProvider,
    walletOptions,
    connectWallet,
    connectWithWalletConnect,
    setConnectedWallet,
    disconnectWallet,
    connecting,
    error: walletError,
  } = useWallet();

  const [manualWalletAddress, setManualWalletAddress] = useState("");
  const [fullName, setFullName] = useState("");
  const [needName, setNeedName] = useState(false);
  const [walletConnectFailed, setWalletConnectFailed] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [creatingQr, setCreatingQr] = useState(false);
  const [qrSessionId, setQrSessionId] = useState<string | null>(null);
  const [qrLink, setQrLink] = useState<string | null>(null);
  const [qrExpiresAt, setQrExpiresAt] = useState<number | null>(null);

  const qrImageUrl = useMemo(() => {
    if (!qrLink) return null;
    return `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(qrLink)}`;
  }, [qrLink]);

  useEffect(() => {
    if (!loading && user) {
      router.replace("/buyer");
    }
  }, [loading, router, user]);

  useEffect(() => {
    if (!qrSessionId) return;

    let active = true;
    const timer = setInterval(async () => {
      if (!active) return;
      const response = await fetch(`/api/auth/wallet-qr/session?session=${encodeURIComponent(qrSessionId)}`);
      const payload = (await response.json().catch(() => null)) as QrStatusResponse | null;
      if (!payload?.ok) return;
      if (!payload.connected) return;

      const claimedAddress = (payload.walletAddress ?? "").trim().toUpperCase();
      const claimedProvider = payload.walletProvider;

      if (!isValidStellarPublicKey(claimedAddress) || !isWalletProvider(claimedProvider)) {
        return;
      }

      setConnectedWallet({
        address: claimedAddress,
        provider: claimedProvider,
      });
      setWalletConnectFailed(false);
      setError("");
      setQrSessionId(null);
      setQrLink(null);
      setQrExpiresAt(null);
    }, 2000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [qrSessionId, setConnectedWallet]);

  const finalizeLogin = async (selectedWalletAddress: string) => {
    if (needName && !fullName.trim()) {
      setError("Ingresa tu nombre para completar el primer acceso.");
      return;
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

  const handleWalletConnect = async () => {
    setError("");
    setWalletConnectFailed(false);
    const connectedAddress = await connectWithWalletConnect();
    if (!connectedAddress) {
      setWalletConnectFailed(true);
      setError("WalletConnect no pudo completar la conexion. Usa el inicio de sesion alterno.");
      return;
    }
  };

  const handlePrimaryLogin = async () => {
    setError("");
    const selectedWalletAddress = (walletAddress ?? "").trim().toUpperCase();
    if (!selectedWalletAddress) {
      setError("Primero conecta una wallet.");
      return;
    }
    if (!isValidStellarPublicKey(selectedWalletAddress)) {
      setError("La wallet conectada no es valida para Stellar.");
      return;
    }
    await finalizeLogin(selectedWalletAddress);
  };

  const handleFallbackSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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

    if (!walletAddress) {
      setPendingWallet({ address: selectedWalletAddress, provider: "manual" });
    }

    await finalizeLogin(selectedWalletAddress);
  };

  const handleCreateQrSession = async () => {
    setError("");
    setCreatingQr(true);
    const response = await fetch("/api/auth/wallet-qr/session", {
      method: "POST",
    });
    const payload = (await response.json().catch(() => null)) as QrSessionResponse | null;
    setCreatingQr(false);

    if (!payload?.ok || !payload.sessionId || !payload.link || !payload.expiresAt) {
      setError(payload?.message ?? "No se pudo generar el QR de conexion.");
      return;
    }

    setQrSessionId(payload.sessionId);
    setQrLink(payload.link);
    setQrExpiresAt(payload.expiresAt);
  };

  return (
    <Card className="w-full max-w-md">
      <h1 className="text-2xl font-bold">Iniciar sesion</h1>
      <p className="mt-2 text-sm text-muted">
        Conecta wallet primero. Luego presiona iniciar sesion. Si eres nuevo, te pedimos nombre una sola vez.
      </p>

      <div className="mt-4 rounded-xl border border-border bg-surface-soft p-3">
        <p className="text-xs uppercase tracking-[0.12em] text-muted">WalletConnect</p>
        <p className="mt-1 text-sm font-semibold">{walletAddress ? `${walletAddress.slice(0, 8)}...${walletAddress.slice(-6)}` : "No conectada"}</p>
        {walletAddress && walletProvider && (
          <p className="mt-1 text-xs text-muted">Proveedor conectado: {getWalletProviderLabel(walletProvider)}</p>
        )}

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Button className="h-11 w-full" type="button" onClick={handleWalletConnect} disabled={connecting || submitting || creatingQr}>
            {connecting ? "Conectando..." : "Conectar WalletConnect"}
          </Button>
          <Button className="h-11 w-full" type="button" variant="outline" onClick={handleCreateQrSession} disabled={connecting || submitting || creatingQr}>
            {creatingQr ? "Generando..." : "Conectar por QR"}
          </Button>
        </div>

        {qrImageUrl && qrLink && (
          <div className="mt-4 rounded-xl border border-border bg-background p-3 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrImageUrl} alt="QR para vincular wallet" className="mx-auto h-56 w-56 rounded-lg border border-border bg-white p-2" />
            <p className="mt-2 text-xs text-muted">Escanea este QR desde tu movil para vincular una wallet a esta sesion.</p>
            {qrExpiresAt && (
              <p className="mt-1 text-xs text-muted">
                Expira: {new Date(qrExpiresAt).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
              </p>
            )}
          </div>
        )}

        {walletAddress && (
          <>
            <Button className="mt-3 w-full" type="button" onClick={handlePrimaryLogin} disabled={submitting || connecting}>
              {submitting ? "Validando..." : needName ? "Guardar e iniciar sesion" : "Iniciar sesion"}
            </Button>
            <Button className="mt-2 w-full" type="button" variant="ghost" onClick={disconnectWallet} disabled={connecting || submitting}>
              Cambiar wallet
            </Button>
          </>
        )}

        {walletError && <p className="terra-alert mt-3">{walletError}</p>}

        {walletConnectFailed && (
          <>
            <p className="mt-3 text-xs uppercase tracking-[0.12em] text-muted">Inicio de sesion alterno</p>
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
          </>
        )}
      </div>

      {(needName || walletConnectFailed) && (
        <form className="mt-6 space-y-4" onSubmit={handleFallbackSubmit}>
          {needName && (
            <label className="block space-y-1 text-sm">
              <span>Nombre completo</span>
              <input
                className="h-11 w-full rounded-xl border border-border bg-background px-3"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                required
              />
            </label>
          )}

          {walletConnectFailed && (
            <Button className="h-11 w-full" type="submit" disabled={submitting || connecting || (!walletAddress && !manualWalletAddress.trim())}>
              {submitting ? "Validando..." : needName ? "Guardar e iniciar sesion" : "Iniciar sesion"}
            </Button>
          )}
        </form>
      )}

      {error && <p className="terra-alert mt-4">{error}</p>}
    </Card>
  );
}
