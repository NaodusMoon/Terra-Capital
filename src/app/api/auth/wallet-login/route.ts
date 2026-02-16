import { NextResponse } from "next/server";
import { normalizeSafeText, isValidStellarPublicKey } from "@/lib/security";
import { findUserByWallet, mapDbUser } from "@/lib/server/auth-users";
import { getPostgresPool } from "@/lib/server/postgres";

export const runtime = "nodejs";

interface RequestPayload {
  walletAddress?: string;
  fullName?: string;
}

export async function POST(request: Request) {
  let payload: RequestPayload;
  try {
    payload = (await request.json()) as RequestPayload;
  } catch {
    return NextResponse.json({ ok: false, message: "Payload invalido." }, { status: 400 });
  }

  const walletAddress = payload.walletAddress?.trim() ?? "";
  if (!isValidStellarPublicKey(walletAddress)) {
    return NextResponse.json({ ok: false, message: "Wallet Stellar invalida." }, { status: 400 });
  }

  try {
    const existing = await findUserByWallet(walletAddress);
    if (existing) {
      const normalizedName = normalizeSafeText(payload.fullName ?? "", 120);
      if (normalizedName && normalizedName !== existing.fullName) {
        const pool = getPostgresPool();
        const updated = await pool.query(
          `UPDATE app_users
           SET full_name = $1, updated_at = timezone('utc', now())
           WHERE id = $2
           RETURNING id, full_name, organization, stellar_public_key, seller_verification_status, seller_verification_data, created_at, updated_at`,
          [normalizedName, existing.id],
        );
        return NextResponse.json({ ok: true, user: mapDbUser(updated.rows[0]), isNewUser: false });
      }
      return NextResponse.json({ ok: true, user: existing, isNewUser: false });
    }

    const normalizedName = normalizeSafeText(payload.fullName ?? "", 120);
    if (!normalizedName) {
      return NextResponse.json(
        { ok: false, requiresName: true, message: "Primer acceso: indica tu nombre para crear el perfil." },
        { status: 400 },
      );
    }

    const pool = getPostgresPool();
    const created = await pool.query(
      `INSERT INTO app_users (id, full_name, stellar_public_key, seller_verification_status)
       VALUES ($1, $2, $3, 'unverified')
       RETURNING id, full_name, organization, stellar_public_key, seller_verification_status, seller_verification_data, created_at, updated_at`,
      [crypto.randomUUID(), normalizedName, walletAddress],
    );

    return NextResponse.json({ ok: true, user: mapDbUser(created.rows[0]), isNewUser: true });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "No se pudo iniciar sesion." },
      { status: 500 },
    );
  }
}
