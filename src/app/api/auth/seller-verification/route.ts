import { NextResponse } from "next/server";
import { isSafeHttpUrl, normalizeSafeText } from "@/lib/security";
import { mapDbUser } from "@/lib/server/auth-users";
import { getPostgresPool } from "@/lib/server/postgres";

export const runtime = "nodejs";

interface RequestPayload {
  userId?: string;
  legalName?: string;
  documentLast4?: string;
  taxId?: string;
  country?: string;
  supportUrl?: string;
}

export async function POST(request: Request) {
  let payload: RequestPayload;
  try {
    payload = (await request.json()) as RequestPayload;
  } catch {
    return NextResponse.json({ ok: false, message: "Payload invalido." }, { status: 400 });
  }

  const userId = payload.userId?.trim() ?? "";
  const legalName = normalizeSafeText(payload.legalName ?? "", 120);
  const documentLast4 = normalizeSafeText(payload.documentLast4 ?? "", 4);
  const taxId = normalizeSafeText(payload.taxId ?? "", 40);
  const country = normalizeSafeText(payload.country ?? "", 60);
  const supportUrl = payload.supportUrl?.trim() || undefined;

  if (!userId || !legalName || documentLast4.length !== 4 || !taxId || !country) {
    return NextResponse.json({ ok: false, message: "Completa todos los datos de verificacion requeridos." }, { status: 400 });
  }
  if (supportUrl && !isSafeHttpUrl(supportUrl)) {
    return NextResponse.json({ ok: false, message: "URL de soporte invalida." }, { status: 400 });
  }

  const verificationPayload = {
    legalName,
    documentLast4,
    taxId,
    country,
    supportUrl,
    submittedAt: new Date().toISOString(),
  };

  try {
    const pool = getPostgresPool();
    const result = await pool.query(
      `UPDATE app_users
       SET seller_verification_data = $1::jsonb,
           seller_verification_status = 'verified',
           updated_at = timezone('utc', now())
       WHERE id = $2
       RETURNING id, full_name, organization, stellar_public_key, seller_verification_status, seller_verification_data, created_at, updated_at`,
      [JSON.stringify(verificationPayload), userId],
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ ok: false, message: "Usuario no encontrado." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, user: mapDbUser(result.rows[0]) });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "No se pudo enviar la verificacion." },
      { status: 500 },
    );
  }
}
