import { NextResponse } from "next/server";
import { isValidStellarPublicKey } from "@/lib/security";
import { claimWalletQrSession } from "@/lib/server/wallet-qr-store";

export const runtime = "nodejs";

interface RequestPayload {
  session?: string;
  walletAddress?: string;
  walletProvider?: "freighter" | "xbull" | "albedo" | "manual";
}

function isValidProvider(value: unknown): value is "freighter" | "xbull" | "albedo" | "manual" {
  return value === "freighter" || value === "xbull" || value === "albedo" || value === "manual";
}

export async function POST(request: Request) {
  let payload: RequestPayload;
  try {
    payload = (await request.json()) as RequestPayload;
  } catch {
    return NextResponse.json({ ok: false, message: "Payload invalido." }, { status: 400 });
  }

  const session = payload.session?.trim() ?? "";
  const walletAddress = payload.walletAddress?.trim() ?? "";
  const walletProvider = payload.walletProvider;

  if (!session) {
    return NextResponse.json({ ok: false, message: "Falta session." }, { status: 400 });
  }
  if (!isValidStellarPublicKey(walletAddress)) {
    return NextResponse.json({ ok: false, message: "Wallet Stellar invalida." }, { status: 400 });
  }
  if (!isValidProvider(walletProvider)) {
    return NextResponse.json({ ok: false, message: "Proveedor de wallet invalido." }, { status: 400 });
  }

  const claimed = claimWalletQrSession({
    id: session,
    walletAddress,
    walletProvider,
  });

  if (!claimed) {
    return NextResponse.json({ ok: false, message: "Sesion QR invalida o expirada." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
