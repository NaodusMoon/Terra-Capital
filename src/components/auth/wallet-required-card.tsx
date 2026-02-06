"use client";

import { FormEvent, useState } from "react";
import { ShieldCheck, Wallet } from "lucide-react";
import { useWallet } from "@/components/providers/wallet-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function WalletRequiredCard() {
  const { connectWallet, connecting, error } = useWallet();
  const [manualAddress, setManualAddress] = useState("");
  const [manualError, setManualError] = useState("");

  const handleManualConnect = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setManualError("");

    const ok = await connectWallet("manual", manualAddress);
    if (!ok) {
      setManualError("No se pudo conectar con la direccion manual.");
    }
  };

  return (
    <Card className="w-full max-w-xl text-left">
      <div className="flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--color-surface-soft)]">
          <Wallet size={20} />
        </div>
        <div>
          <h2 className="text-2xl font-bold">Conecta tu wallet para continuar</h2>
          <p className="text-sm text-[var(--color-muted)]">
            Para operar en Terra Capital debes vincular una wallet Stellar (manual o Freighter).
          </p>
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-4 text-sm text-[var(--color-muted)]">
        <p className="flex items-center gap-2 font-semibold text-[var(--color-foreground)]">
          <ShieldCheck size={16} /> Verificacion de wallet obligatoria
        </p>
        <p className="mt-1">La direccion publica queda asociada a tu sesion para compras, ventas y trazabilidad de activos tokenizados.</p>
      </div>

      <form className="mt-5 grid gap-2" onSubmit={handleManualConnect}>
        <input
          className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3"
          placeholder="Direccion publica Stellar (G...)"
          value={manualAddress}
          onChange={(event) => setManualAddress(event.target.value)}
          disabled={connecting}
        />
        <Button type="submit" variant="outline" className="h-11 w-full" disabled={connecting}>
          {connecting ? "Validando wallet..." : "Conectar wallet manual"}
        </Button>
      </form>

      <Button className="mt-3 h-11 w-full" onClick={() => connectWallet("freighter")} disabled={connecting}>
        {connecting ? "Conectando wallet..." : "Conectar Freighter"}
      </Button>

      {(error || manualError) && <p className="mt-4 text-sm text-red-500">{error || manualError}</p>}
    </Card>
  );
}
