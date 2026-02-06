"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";

interface NetworkResponse {
  network: string;
  horizonVersion: string;
  coreVersion: string;
  currentProtocolVersion: number;
  historyLatestLedger: number;
}

export function StellarStatusCard() {
  const [data, setData] = useState<NetworkResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/stellar/network")
      .then((res) => res.json())
      .then((payload) => {
        if (!payload.ok) {
          throw new Error(payload.error ?? "No se pudo consultar Horizon");
        }
        setData(payload.data);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <Card>
      <h3 className="text-lg font-bold">Estado de Stellar</h3>
      {!data && !error && <p className="mt-2 text-sm text-[var(--color-muted)]">Consultando red...</p>}
      {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
      {data && (
        <dl className="mt-3 grid gap-2 text-sm text-[var(--color-muted)]">
          <div className="grid grid-cols-[110px_1fr] items-start gap-3">
            <dt>Red</dt>
            <dd className="min-w-0 break-all text-right font-semibold text-[var(--color-foreground)]">{data.network}</dd>
          </div>
          <div className="grid grid-cols-[110px_1fr] items-start gap-3">
            <dt>Horizon</dt>
            <dd className="min-w-0 break-all text-right font-semibold text-[var(--color-foreground)]">{data.horizonVersion}</dd>
          </div>
          <div className="grid grid-cols-[110px_1fr] items-start gap-3">
            <dt>Core</dt>
            <dd className="min-w-0 break-all text-right font-semibold text-[var(--color-foreground)]">{data.coreVersion}</dd>
          </div>
          <div className="grid grid-cols-[110px_1fr] items-start gap-3">
            <dt>Ultimo ledger</dt>
            <dd className="min-w-0 break-all text-right font-semibold text-[var(--color-foreground)]">{data.historyLatestLedger}</dd>
          </div>
        </dl>
      )}
    </Card>
  );
}

