"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { UserRole } from "@/types/auth";

export function RegisterForm() {
  const router = useRouter();
  const { register, user, loading } = useAuth();

  const [role, setRole] = useState<UserRole>("buyer");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [organization, setOrganization] = useState("");
  const [stellarPublicKey, setStellarPublicKey] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && user) {
      router.replace(`/${user.role}`);
    }
  }, [loading, router, user]);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    const result = register({
      fullName,
      email,
      password,
      role,
      organization,
      stellarPublicKey,
    });

    if (!result.ok) {
      setError(result.message);
      return;
    }

    router.push(`/${result.user.role}`);
  };

  return (
    <Card className="w-full max-w-lg">
      <h1 className="text-2xl font-bold">Crear cuenta</h1>
      <p className="mt-2 text-sm text-[var(--color-muted)]">Registra tu perfil dentro del ecosistema tokenizado de Terra Capital.</p>

      <form className="mt-6 grid gap-4" onSubmit={handleSubmit}>
        <label className="block space-y-1 text-sm">
          <span>Rol</span>
          <select
            className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3"
            value={role}
            onChange={(event) => setRole(event.target.value as UserRole)}
          >
            <option value="buyer">Comprador / Inversor</option>
            <option value="seller">Vendedor / Productor</option>
          </select>
        </label>

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
          <span>Contrasena</span>
          <input
            className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={6}
          />
        </label>

        <label className="block space-y-1 text-sm">
          <span>Organizacion / Campo (opcional)</span>
          <input
            className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3"
            value={organization}
            onChange={(event) => setOrganization(event.target.value)}
          />
        </label>

        <label className="block space-y-1 text-sm">
          <span>Wallet publica Stellar (opcional)</span>
          <input
            className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3"
            value={stellarPublicKey}
            onChange={(event) => setStellarPublicKey(event.target.value)}
            placeholder="G..."
          />
        </label>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <Button className="h-11 w-full" type="submit">
          Crear cuenta
        </Button>
      </form>

      <p className="mt-4 text-sm text-[var(--color-muted)]">
        Ya tienes cuenta?{" "}
        <Link href="/auth/login" className="font-semibold text-[var(--color-primary)]">
          Inicia sesion
        </Link>
      </p>
    </Card>
  );
}

