import { NextRequest, NextResponse } from "next/server";
import { getNetworkHealth } from "@/lib/stellar";
import { getD1Binding, getNetworkCacheTtlSeconds } from "@/lib/server/cloudflare";

const backendUrl = process.env.OFFCHAIN_BACKEND_URL?.trim();

export async function GET(request: NextRequest) {
  const network = request.nextUrl.searchParams.get("network") === "public" ? "public" : "testnet";

  if (backendUrl) {
    try {
      const response = await fetch(`${backendUrl}/api/stellar/network?network=${network}`, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        cache: "no-store",
      });

      if (response.ok) {
        const payload = (await response.json()) as {
          ok: boolean;
          data: {
            network: string;
            horizon_version: string;
            core_version: string;
            current_protocol_version: number;
            history_latest_ledger: number;
          };
        };

        if (payload.ok) {
          return NextResponse.json({
            ok: true,
            data: {
              network: payload.data.network,
              horizonVersion: payload.data.horizon_version,
              coreVersion: payload.data.core_version,
              currentProtocolVersion: payload.data.current_protocol_version,
              historyLatestLedger: payload.data.history_latest_ledger,
            },
            source: "offchain",
          });
        }
      }
    } catch {
      // Fallback a D1/Horizon
    }
  }

  const d1 = getD1Binding();
  const ttlSeconds = getNetworkCacheTtlSeconds(15);
  const cached = d1
    ? await d1
      .prepare("SELECT payload_json, fetched_at FROM stellar_network_cache WHERE network = ?")
      .bind(network)
      .first<{ payload_json: string; fetched_at: string }>()
    : null;

  if (cached?.payload_json && cached.fetched_at) {
    const fetchedAt = Date.parse(cached.fetched_at);
    if (Number.isFinite(fetchedAt) && Date.now() - fetchedAt <= ttlSeconds * 1000) {
      try {
        const payload = JSON.parse(cached.payload_json) as {
          network: string;
          horizonVersion: string;
          coreVersion: string;
          currentProtocolVersion: number;
          historyLatestLedger: number;
        };
        return NextResponse.json({ ok: true, data: payload, source: "d1-cache" });
      } catch {
        // Si el cache está corrupto, seguimos al fetch directo.
      }
    }
  }

  try {
    const data = await getNetworkHealth(network);

    if (d1) {
      await d1
        .prepare(`
          INSERT INTO stellar_network_cache (network, payload_json, fetched_at)
          VALUES (?, ?, ?)
          ON CONFLICT(network) DO UPDATE SET payload_json = excluded.payload_json, fetched_at = excluded.fetched_at
        `)
        .bind(network, JSON.stringify(data), new Date().toISOString())
        .run();
    }

    return NextResponse.json({ ok: true, data, source: d1 ? "horizon+d1" : "horizon" });
  } catch (error) {
    if (cached?.payload_json) {
      try {
        const stale = JSON.parse(cached.payload_json) as {
          network: string;
          horizonVersion: string;
          coreVersion: string;
          currentProtocolVersion: number;
          historyLatestLedger: number;
        };
        return NextResponse.json({ ok: true, data: stale, source: "d1-stale-cache" });
      } catch {
        // devolvemos error normal
      }
    }

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
