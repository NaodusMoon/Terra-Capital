import { NextResponse } from "next/server";
import { isValidStellarPublicKey, normalizeSafeText } from "@/lib/security";
import { mapDbUser } from "@/lib/server/auth-users";
import { getPostgresPool } from "@/lib/server/postgres";

export const runtime = "nodejs";

interface RequestPayload {
  userId?: string;
  fullName?: string;
  organization?: string;
  stellarPublicKey?: string;
}

export async function PATCH(request: Request) {
  let payload: RequestPayload;
  try {
    payload = (await request.json()) as RequestPayload;
  } catch {
    return NextResponse.json({ ok: false, message: "Payload invalido." }, { status: 400 });
  }

  const userId = payload.userId?.trim() ?? "";
  const fullName = normalizeSafeText(payload.fullName ?? "", 120);
  const organization = payload.organization ? normalizeSafeText(payload.organization, 120) : null;
  const stellarPublicKey = payload.stellarPublicKey?.trim() ?? "";

  if (!userId || !fullName) {
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
      [fullName, organization, stellarPublicKey, userId],
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
