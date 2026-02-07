"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PasswordField } from "@/components/ui/password-field";

export function ForgotPasswordForm() {
  const { requestRecoveryCode, recoverAccountPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);

  const handleSendCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setSubmitting(true);
    const result = await requestRecoveryCode(email);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setStep(2);
    setMessage(result.devCode ? `Código enviado. En modo dev: ${result.devCode}` : "Código enviado al correo.");
  };

  const handleResetPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setSubmitting(true);
    const result = await recoverAccountPassword(email, verificationCode, newPassword);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setMessage("Contraseña actualizada. Ya puedes iniciar sesión.");
    setVerificationCode("");
    setNewPassword("");
  };

  return (
    <Card className="w-full max-w-md">
      <h1 className="text-2xl font-bold">Recuperar contraseña</h1>
      <p className="mt-2 text-sm text-[var(--color-muted)]">
        {step === 1 ? "Paso 1: te enviamos un código de verificación al correo." : "Paso 2: valida el código y crea una nueva contraseña."}
      </p>

      {step === 1 ? (
        <form className="mt-6 space-y-4" onSubmit={handleSendCode}>
          <label className="block space-y-1 text-sm">
            <span>Email</span>
            <input className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          {error && <p className="text-sm text-red-500">{error}</p>}
          {message && <p className="text-sm text-[var(--color-primary)]">{message}</p>}
          <Button className="w-full" type="submit" disabled={submitting}>{submitting ? "Enviando..." : "Enviar código"}</Button>
        </form>
      ) : (
        <form className="mt-6 space-y-4" onSubmit={handleResetPassword}>
          <label className="block space-y-1 text-sm">
            <span>Email</span>
            <input className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="block space-y-1 text-sm">
            <span>Código de verificación</span>
            <input className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3" value={verificationCode} onChange={(e) => setVerificationCode(e.target.value)} required />
          </label>
          <label className="block space-y-1 text-sm">
            <span>Nueva contraseña</span>
            <PasswordField minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
          </label>
          {error && <p className="text-sm text-red-500">{error}</p>}
          {message && <p className="text-sm text-[var(--color-primary)]">{message}</p>}
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" onClick={() => setStep(1)}>Reenviar código</Button>
            <Button type="submit" disabled={submitting}>{submitting ? "Actualizando..." : "Cambiar contraseña"}</Button>
          </div>
        </form>
      )}

      <p className="mt-4 text-sm text-[var(--color-muted)]">
        <Link href="/auth/login" className="font-semibold text-[var(--color-primary)]">Volver al login</Link>
      </p>
    </Card>
  );
}
