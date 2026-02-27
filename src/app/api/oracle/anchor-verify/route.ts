import { NextRequest, NextResponse } from "next/server";
import { verifyAnchorOnChain } from "@/lib/server/oracle";
import { getAuthUserFromRequest } from "@/lib/server/auth-session";

export const runtime = "nodejs";

const HEX_64 = /^[a-f0-9]{64}$/i;

export async function GET(request: NextRequest) {
  const authUser = await getAuthUserFromRequest();
  if (!authUser) {
    return NextResponse.json({ ok: false, message: "No autenticado." }, { status: 401 });
  }
  if (authUser.appRole !== "admin") {
    return NextResponse.json({ ok: false, message: "Solo admin puede usar Oracle." }, { status: 403 });
  }

  const txHash = request.nextUrl.searchParams.get("txHash")?.trim() ?? "";
  const digest = request.nextUrl.searchParams.get("digest")?.trim() ?? "";
  const network = request.nextUrl.searchParams.get("network") === "public" ? "public" : "testnet";

  if (!HEX_64.test(txHash)) {
    return NextResponse.json({ ok: false, message: "txHash invalido." }, { status: 400 });
  }
  if (!HEX_64.test(digest)) {
    return NextResponse.json({ ok: false, message: "digest invalido." }, { status: 400 });
  }

  try {
    const result = await verifyAnchorOnChain({ txHash, digest, network });
    if (!result.ok) {
      return NextResponse.json({ ok: false, message: result.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true, memoMatches: result.memoMatches, manageDataMatch: result.manageDataMatch });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "No se pudo verificar anclaje on-chain." },
      { status: 500 },
    );
  }
}
