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
    let cancelled = false;

    const loadStatus = async () => {
      setError(null);
      try {
        const res = await fetch("/api/stellar/network", {
          method: "GET",
          headers: { Accept: "application/json" },
          cache: "no-store",
        });

        const contentType = res.headers.get("content-type") ?? "";
        let payload: { ok: boolean; error?: string; data?: NetworkResponse } | null = null;

        if (contentType.includes("application/json")) {
          payload = (await res.json()) as { ok: boolean; error?: string; data?: NetworkResponse };
        } else {
          const text = await res.text();
          if (text.trim()) {
            try {
              payload = JSON.parse(text) as { ok: boolean; error?: string; data?: NetworkResponse };
            } catch {
              throw new Error("Respuesta invalida del servidor de Stellar.");
            }
          }
        }

        if (!payload) {
          throw new Error("No se recibio informacion del estado de Stellar.");
        }
        if (!res.ok || !payload.ok) {
          throw new Error(payload.error ?? "No se pudo consultar Horizon.");
        }
        if (!payload.data) {
          throw new Error("No se recibieron datos de red.");
        }

        if (!cancelled) {
          setData(payload.data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Error al consultar Stellar.");
        }
      }
    };

    void loadStatus();
    return () => {
      cancelled = true;
    };
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

