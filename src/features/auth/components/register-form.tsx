"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { useWallet } from "@/components/providers/wallet-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PasswordField } from "@/components/ui/password-field";

export function RegisterForm() {
  const router = useRouter();
  const { register, user, loading } = useAuth();
  const { walletAddress, walletOptions, connectWallet, connecting } = useWallet();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [organization, setOrganization] = useState("");
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
      setError("Debes conectar una wallet antes de registrarte.");
      return;
    }

    setSubmitting(true);
    const result = await register({
      fullName,
      email,
      password,
      organization,
      stellarPublicKey: walletAddress,
    });
    setSubmitting(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }

    router.push("/buyer");
  };

  return (
    <Card className="w-full max-w-lg">
      <h1 className="text-2xl font-bold">Crear cuenta</h1>
      <p className="mt-2 text-sm text-[var(--color-muted)]">Una sola cuenta para usar modo comprador o vendedor.</p>

      <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-3">
        <p className="text-xs uppercase tracking-[0.12em] text-[var(--color-muted)]">Wallet vinculada</p>
        <p className="mt-1 text-sm font-semibold">{walletAddress ? `${walletAddress.slice(0, 8)}...${walletAddress.slice(-6)}` : "No conectada"}</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {walletOptions.map((option) => (
            <Button key={option.id} type="button" variant="outline" onClick={() => connectWallet(option.id)} disabled={connecting || submitting}>
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      <form className="mt-6 grid gap-4" onSubmit={handleSubmit}>
        <label className="block space-y-1 text-sm">
          <span>Nombre completo</span>
          <input
            className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            required
          />
        </label>

        <label className="block space-y-1 text-sm">
          <span>Email</span>
          <input
            className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>

        <label className="block space-y-1 text-sm">
          <span>Contraseña</span>
          <PasswordField value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} />
        </label>

        <label className="block space-y-1 text-sm">
          <span>Organizacion / Campo (opcional)</span>
          <input
            className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3"
            value={organization}
            onChange={(event) => setOrganization(event.target.value)}
          />
        </label>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <Button className="h-11 w-full" type="submit" disabled={submitting || !walletAddress}>
          {submitting ? "Creando cuenta..." : "Crear cuenta"}
        </Button>
      </form>

      <p className="mt-4 text-sm text-[var(--color-muted)]">
        Ya tienes cuenta?{" "}
        <Link href="/auth/login" className="font-semibold text-[var(--color-primary)]">
          Inicia sesión
        </Link>
      </p>
    </Card>
  );
}
