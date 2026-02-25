import { NextResponse } from "next/server";
import { isValidStellarPublicKey, normalizeSafeText } from "@/lib/security";
import { getAuthUserFromRequest } from "@/lib/server/auth-session";
import { enforceRateLimit, isTrustedOrigin, parseJsonWithLimit } from "@/lib/server/request-security";
import { mapDbUser } from "@/lib/server/auth-users";
import { getPostgresPool } from "@/lib/server/postgres";

export const runtime = "nodejs";

interface RequestPayload {
  fullName?: string;
  organization?: string;
  stellarPublicKey?: string;
}

export async function PATCH(request: Request) {
  if (!isTrustedOrigin(request)) {
    return NextResponse.json({ ok: false, message: "Origen no permitido." }, { status: 403 });
  }
  const rate = enforceRateLimit({
    request,
    key: "api_auth_profile_patch",
    max: 30,
    windowMs: 60 * 1000,
  });
  if (!rate.ok) {
    return NextResponse.json({ ok: false, message: "Demasiadas solicitudes. Intenta nuevamente." }, { status: 429 });
  }
  const parsed = await parseJsonWithLimit<RequestPayload>(request, 12_288);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, message: parsed.message }, { status: parsed.status });
  }
  const payload = parsed.data;

  const fullName = normalizeSafeText(payload.fullName ?? "", 120);
  const organization = payload.organization ? normalizeSafeText(payload.organization, 120) : null;
  const stellarPublicKey = payload.stellarPublicKey?.trim() ?? "";

  const authUser = await getAuthUserFromRequest();
  if (!authUser) {
    return NextResponse.json({ ok: false, message: "No autenticado." }, { status: 401 });
  }

  if (!fullName) {
    return NextResponse.json({ ok: false, message: "Datos incompletos para actualizar perfil." }, { status: 400 });
  }
  if (!isValidStellarPublicKey(stellarPublicKey)) {
    return NextResponse.json({ ok: false, message: "Wallet publica invalida." }, { status: 400 });
  }

  try {
    const pool = getPostgresPool();
    const result = await pool.query(
      `UPDATE app_users
       SET full_name = $1, organization = $2, stellar_public_key = $3, updated_at = timezone('utc', now())
       WHERE id = $4
       RETURNING id, full_name, organization, stellar_public_key, seller_verification_status, seller_verification_data, created_at, updated_at`,
      [fullName, organization, stellarPublicKey, authUser.id],
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ ok: false, message: "Usuario no encontrado." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, user: mapDbUser(result.rows[0]) });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "23505") {
      return NextResponse.json({ ok: false, message: "Esa wallet ya esta asociada a otra cuenta." }, { status: 409 });
    }
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "No se pudo actualizar el perfil." },
      { status: 500 },
    );
  }
}
