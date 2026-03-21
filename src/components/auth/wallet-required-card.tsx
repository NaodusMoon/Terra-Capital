"use client";

import { ShieldCheck, Wallet } from "lucide-react";
import { useLanguage } from "@/components/providers/language-provider";
import { useWallet } from "@/components/providers/wallet-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function WalletRequiredCard() {
  const { language } = useLanguage();
  const { connectWallet, connecting, error, walletOptions } = useWallet();
  const isSpanish = language === "es";
  const t = {
    title: isSpanish ? "Conecta tu wallet para continuar" : "Connect your wallet to continue",
    subtitle: isSpanish
      ? "Para operar en Terra Capital debes conectar una wallet Stellar compatible."
      : "To use Terra Capital, connect a compatible Stellar wallet.",
    required: isSpanish ? "Verificacion de wallet obligatoria" : "Wallet verification is required",
    body: isSpanish
      ? "La direccion publica queda asociada a tu sesion para compras, ventas y trazabilidad de activos tokenizados."
      : "The public address is linked to your session for purchases, sales and tokenized asset traceability.",
    connecting: isSpanish ? "Conectando..." : "Connecting...",
  };

  return (
    <Card className="w-full max-w-xl text-left">
      <div className="flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--color-surface-soft)]">
          <Wallet size={20} />
        </div>
        <div>
          <h2 className="tc-heading text-2xl font-bold">{t.title}</h2>
          <p className="tc-subtitle text-sm">{t.subtitle}</p>
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-4 text-sm text-[var(--color-muted)]">
        <p className="flex items-center gap-2 font-semibold text-[var(--color-foreground)]">
          <ShieldCheck size={16} /> {t.required}
        </p>
        <p className="mt-1">{t.body}</p>
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-3">
        {walletOptions.map((option) => (
          <Button key={option.id} className="h-11 w-full justify-center gap-2" onClick={() => connectWallet(option.id)} disabled={connecting}>
            <Wallet size={15} />
            {connecting ? t.connecting : option.label}
          </Button>
        ))}
      </div>

      {error && <p className="terra-alert mt-4">{error}</p>}
    </Card>
  );
}
