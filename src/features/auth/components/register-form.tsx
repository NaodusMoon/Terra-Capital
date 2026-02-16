"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";

export function RegisterForm() {
  return (
    <Card className="w-full max-w-md">
      <h1 className="text-2xl font-bold">Registro deshabilitado</h1>
      <p className="mt-2 text-sm text-[var(--color-muted)]">
        Ya no necesitas registrarte. El acceso ahora es directo con wallet.
      </p>
      <Link href="/auth/login" className="mt-4 inline-block text-sm font-semibold text-[var(--color-primary)]">
        Ir a iniciar sesion
      </Link>
    </Card>
  );
}
