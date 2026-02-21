"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { ArrowLeft, MonitorSmartphone, Moon, Sun, X } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { useTheme } from "@/components/providers/theme-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useWallet } from "@/components/providers/wallet-provider";
import { getWalletProviderLabel } from "@/lib/wallet";

export function AccountSettings() {
  const { user, updateAccount, submitSellerKyc, activeMode } = useAuth();
  const { walletAddress, walletProvider } = useWallet();
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [fullName, setFullName] = useState(user?.fullName ?? "");
  const [organization, setOrganization] = useState(user?.organization ?? "");
  const [kyc, setKyc] = useState({
    legalName: user?.sellerVerificationData?.legalName ?? "",
    documentLast4: user?.sellerVerificationData?.documentLast4 ?? "",
    taxId: user?.sellerVerificationData?.taxId ?? "",
    country: user?.sellerVerificationData?.country ?? "",
    supportUrl: user?.sellerVerificationData?.supportUrl ?? "",
  });
  const [profileMessage, setProfileMessage] = useState("");
  const [kycMessage, setKycMessage] = useState("");

  if (!user) {
    return (
      <main className="mx-auto grid min-h-[60vh] max-w-6xl place-items-center px-5 py-12 text-sm text-[var(--color-muted)]">
        Debes iniciar sesion para editar tu cuenta.
      </main>
    );
  }

  const handleProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = await updateAccount({
      fullName,
      organization,
      stellarPublicKey: user.stellarPublicKey ?? "",
    });
    setProfileMessage(result.ok ? "Perfil actualizado." : result.message);
  };

  const handleKyc = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = await submitSellerKyc(kyc);
    setKycMessage(result.ok ? "Verificacion enviada/aprobada para modo vendedor." : result.message);
  };

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-8">
      <div className="mb-3 flex items-center justify-between">
        <Link href={activeMode === "seller" ? "/seller" : "/buyer"} className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm font-semibold hover:bg-[var(--color-surface-soft)]">
          <ArrowLeft size={15} /> Volver al panel
        </Link>
        <Link href={activeMode === "seller" ? "/seller" : "/buyer"} className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-border)] hover:bg-[var(--color-surface-soft)]" aria-label="Cerrar">
          <X size={15} />
        </Link>
      </div>

      <h1 className="text-3xl font-black">Configuracion de la cuenta</h1>
      <p className="mt-2 text-sm text-[var(--color-muted)]">Administra perfil y verificacion de vendedor.</p>

      <section className="mt-5 md:hidden">
        <Card>
          <h2 className="text-xl font-bold">Tema</h2>
          <p className="mt-1 text-sm text-[var(--color-muted)]">Disponible solo en telefono.</p>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <Button
              type="button"
              variant="outline"
              className={`h-11 gap-2 px-2 text-xs ${theme === "light" ? "border-transparent bg-[var(--color-primary)] text-[var(--color-primary-contrast)]" : ""}`}
              onClick={() => setTheme("light")}
            >
              <Sun size={15} />
              Claro
            </Button>
            <Button
              type="button"
              variant="outline"
              className={`h-11 gap-2 px-2 text-xs ${theme === "dark" ? "border-transparent bg-[var(--color-primary)] text-[var(--color-primary-contrast)]" : ""}`}
              onClick={() => setTheme("dark")}
            >
              <Moon size={15} />
              Oscuro
            </Button>
            <Button
              type="button"
              variant="outline"
              className={`h-11 gap-2 px-2 text-xs ${theme === "system" ? "border-transparent bg-[var(--color-primary)] text-[var(--color-primary-contrast)]" : ""}`}
              onClick={() => setTheme("system")}
            >
              <MonitorSmartphone size={15} />
              Sistema
            </Button>
          </div>
          <p className="mt-3 text-xs text-[var(--color-muted)]">
            Activo: {theme === "system" ? `Sistema (${resolvedTheme === "dark" ? "oscuro" : "claro"})` : theme === "dark" ? "Oscuro" : "Claro"}
          </p>
        </Card>
      </section>

      <section className="mt-6 grid gap-5 lg:grid-cols-2">
        <Card>
          <h2 className="text-xl font-bold">Wallet conectada</h2>
          <p className="mt-3 text-sm text-[var(--color-muted)]">
            Proveedor: <strong>{walletProvider ? getWalletProviderLabel(walletProvider) : "No conectado"}</strong>
          </p>
          <p className="mt-2 break-all rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 py-2 text-sm">
            {walletAddress ?? "Sin direccion conectada"}
          </p>
        </Card>

        <Card>
          <h2 className="text-xl font-bold">Perfil</h2>
          <form className="mt-4 grid gap-3" onSubmit={handleProfile}>
            <input className="h-11 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3" placeholder="Nombre completo" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            <input className="h-11 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3" placeholder="Organizacion" value={organization} onChange={(e) => setOrganization(e.target.value)} />
            <input
              className="h-11 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 text-[var(--color-muted)]"
              value={user.stellarPublicKey ?? ""}
              disabled
              readOnly
            />
            {profileMessage && <p className="text-sm text-[var(--color-primary)]">{profileMessage}</p>}
            <Button type="submit">Guardar perfil</Button>
          </form>
        </Card>
      </section>

      <section className="mt-5">
        <Card>
          <h2 className="text-xl font-bold">Verificacion para modo vendedor</h2>
          <p className="mt-1 text-sm text-[var(--color-muted)]">Estado actual: <strong>{user.sellerVerificationStatus}</strong></p>
          <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={handleKyc}>
            <input className="h-11 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3" placeholder="Nombre legal" value={kyc.legalName} onChange={(e) => setKyc((prev) => ({ ...prev, legalName: e.target.value }))} required />
            <input className="h-11 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3" placeholder="Documento ultimos 4" maxLength={4} value={kyc.documentLast4} onChange={(e) => setKyc((prev) => ({ ...prev, documentLast4: e.target.value }))} required />
            <input className="h-11 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3" placeholder="Tax ID / CUIT" value={kyc.taxId} onChange={(e) => setKyc((prev) => ({ ...prev, taxId: e.target.value }))} required />
            <input className="h-11 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3" placeholder="Pais" value={kyc.country} onChange={(e) => setKyc((prev) => ({ ...prev, country: e.target.value }))} required />
            <input className="h-11 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 md:col-span-2" placeholder="URL soporte documental (opcional)" value={kyc.supportUrl} onChange={(e) => setKyc((prev) => ({ ...prev, supportUrl: e.target.value }))} />
            {kycMessage && <p className="text-sm text-[var(--color-primary)] md:col-span-2">{kycMessage}</p>}
            <Button type="submit" className="md:col-span-2">Enviar verificacion</Button>
          </form>
        </Card>
      </section>
    </main>
  );
}
