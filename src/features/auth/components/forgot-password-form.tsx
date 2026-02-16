"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";

export function ForgotPasswordForm() {
  return (
    <Card className="w-full max-w-md">
      <h1 className="text-2xl font-bold">Sin contrasena</h1>
      <p className="mt-2 text-sm text-[var(--color-muted)]">
        Este flujo ya no se usa. El acceso se realiza solo con wallet.
      </p>
      <Link href="/auth/login" className="mt-4 inline-block text-sm font-semibold text-[var(--color-primary)]">
        Volver al login por wallet
      </Link>
    </Card>
  );
}
