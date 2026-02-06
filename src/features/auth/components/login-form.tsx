"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { UserRole } from "@/types/auth";

export function LoginForm() {
  const router = useRouter();
  const { login, user, loading } = useAuth();
  const [role, setRole] = useState<UserRole>("buyer");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && user) {
      router.replace(`/${user.role}`);
    }
  }, [loading, router, user]);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    const result = login({ email, password, role });
    if (!result.ok) {
      setError(result.message);
      return;
    }

    router.push(`/${result.user.role}`);
  };

  return (
    <Card className="w-full max-w-md">
      <h1 className="text-2xl font-bold">Iniciar sesion</h1>
      <p className="mt-2 text-sm text-[var(--color-muted)]">Accede a tu portal de comprador o vendedor.</p>

      <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
        <label className="block space-y-1 text-sm">
          <span>Rol</span>
          <select
            className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3"
            value={role}
            onChange={(event) => setRole(event.target.value as UserRole)}
          >
            <option value="buyer">Comprador</option>
            <option value="seller">Vendedor</option>
          </select>
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
          />
        </label>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <Button className="h-11 w-full" type="submit">
          Entrar
        </Button>
      </form>

      <p className="mt-4 text-sm text-[var(--color-muted)]">
        Aun no tienes cuenta?{" "}
        <Link href="/auth/register" className="font-semibold text-[var(--color-primary)]">
          Registrate
        </Link>
      </p>
    </Card>
  );
}

