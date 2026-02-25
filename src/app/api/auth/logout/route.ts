import { NextResponse } from "next/server";
import { clearAuthSessionCookie } from "@/lib/server/auth-session";
import { isTrustedOrigin } from "@/lib/server/request-security";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isTrustedOrigin(request)) {
    return NextResponse.json({ ok: false, message: "Origen no permitido." }, { status: 403 });
  }
  const response = NextResponse.json({ ok: true });
  clearAuthSessionCookie(response);
  return response;
}
