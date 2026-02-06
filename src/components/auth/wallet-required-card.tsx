"use client";

import { ShieldCheck, Wallet } from "lucide-react";
import { useWallet } from "@/components/providers/wallet-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function WalletRequiredCard() {
  const { connectWallet, connecting, error } = useWallet();

  return (
    <Card className="w-full max-w-xl text-left">
      <div className="flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--color-surface-soft)]">
          <Wallet size={20} />
        </div>
        <div>
          <h2 className="text-2xl font-bold">Conecta tu wallet para continuar</h2>
          <p className="text-sm text-[var(--color-muted)]">Para operar en Terra Capital debes conectar Freighter.</p>
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-4 text-sm text-[var(--color-muted)]">
        <p className="flex items-center gap-2 font-semibold text-[var(--color-foreground)]">
          <ShieldCheck size={16} /> Verificacion de wallet obligatoria
        </p>
        <p className="mt-1">La direccion publica queda asociada a tu sesion para compras, ventas y trazabilidad de activos tokenizados.</p>
      </div>

      <Button className="mt-5 h-11 w-full justify-center gap-2" onClick={() => connectWallet()} disabled={connecting}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/freighter-logo.svg" alt="Freighter" className="h-5 w-5" />
        {connecting ? "Conectando Freighter..." : "Conectar con Freighter"}
      </Button>

      {error && <p className="mt-4 text-sm text-red-500">{error}</p>}
    </Card>
  );
}
