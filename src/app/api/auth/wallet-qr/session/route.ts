import { NextResponse } from "next/server";
import { createWalletQrSession, getWalletQrSession } from "@/lib/server/wallet-qr-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = createWalletQrSession();
  const origin = request.headers.get("origin") ?? "";
  const baseUrl = origin || process.env.NEXT_PUBLIC_APP_URL || "";

  if (!baseUrl) {
    return NextResponse.json(
      { ok: false, message: "No se pudo determinar la URL base de la app para generar QR." },
      { status: 500 },
    );
  }

  const link = `${baseUrl.replace(/\/$/, "")}/auth/qr-connect?session=${encodeURIComponent(session.id)}`;
  return NextResponse.json({
    ok: true,
    sessionId: session.id,
    link,
    expiresAt: session.expiresAt,
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("session")?.trim() ?? "";
  if (!sessionId) {
    return NextResponse.json({ ok: false, message: "Falta session." }, { status: 400 });
  }

  const session = getWalletQrSession(sessionId);
  if (!session) {
    return NextResponse.json({ ok: false, message: "Sesion QR invalida o expirada." }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    sessionId: session.id,
    expiresAt: session.expiresAt,
    connected: Boolean(session.walletAddress && session.walletProvider),
    walletAddress: session.walletAddress ?? null,
    walletProvider: session.walletProvider ?? null,
  });
}
