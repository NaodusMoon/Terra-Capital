import { NextRequest, NextResponse } from "next/server";
import { getNetworkHealth } from "@/lib/stellar";

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
      // Fallback a Horizon directo
    }
  }

  try {
    const data = await getNetworkHealth(network);
    return NextResponse.json({ ok: true, data, source: "horizon" });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
