import { NextResponse } from "next/server";
import { toSafeHttpUrlOrUndefined } from "@/lib/security";
import { enforceRateLimit, isTrustedOrigin } from "@/lib/server/request-security";
import { createWalletQrSession, getWalletQrSession } from "@/lib/server/wallet-qr-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isTrustedOrigin(request)) {
    return NextResponse.json({ ok: false, message: "Origen no permitido." }, { status: 403 });
  }
  const rate = enforceRateLimit({
    request,
    key: "api_auth_wallet_qr_session_post",
    max: 15,
    windowMs: 60 * 1000,
  });
  if (!rate.ok) {
    return NextResponse.json({ ok: false, message: "Demasiadas solicitudes. Intenta nuevamente." }, { status: 429 });
  }

  const session = createWalletQrSession();
  const requestOrigin = (() => {
    try {
      return new URL(request.url).origin;
    } catch {
      return "";
    }
  })();
  const configuredBaseUrl = toSafeHttpUrlOrUndefined(process.env.NEXT_PUBLIC_APP_URL);
  const baseUrl = requestOrigin || configuredBaseUrl || "";

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
  const rate = enforceRateLimit({
    request,
    key: "api_auth_wallet_qr_session_get",
    max: 120,
    windowMs: 60 * 1000,
  });
  if (!rate.ok) {
    return NextResponse.json({ ok: false, message: "Demasiadas solicitudes. Intenta nuevamente." }, { status: 429 });
  }

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
