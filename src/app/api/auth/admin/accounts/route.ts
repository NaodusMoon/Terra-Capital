import { NextResponse } from "next/server";
import { mapDbUser } from "@/lib/server/auth-users";
import { getAuthUserFromRequest } from "@/lib/server/auth-session";
import { PLATFORM_OWNER_WALLET, isPlatformOwnerWallet } from "@/lib/server/admin-config";
import { getPostgresPool } from "@/lib/server/postgres";
import { enforceRateLimit, isTrustedOrigin, parseJsonWithLimit } from "@/lib/server/request-security";
import type { AppRole, AppUser, BuyerVerificationStatus } from "@/types/auth";

export const runtime = "nodejs";

interface DbUserRow {
  id: string;
  full_name: string;
  organization: string | null;
  stellar_public_key: string;
  app_role: AppRole;
  buyer_verification_status: BuyerVerificationStatus;
  seller_verification_status: "unverified" | "pending" | "verified";
  seller_verification_data: AppUser["sellerVerificationData"] | null;
  created_at: string;
  updated_at: string;
}

interface UpdatePayload {
  targetUserId?: string;
  appRole?: AppRole;
  buyerVerificationStatus?: BuyerVerificationStatus;
}

async function requireAdmin(request: Request) {
  if (!isTrustedOrigin(request)) {
    return { ok: false as const, response: NextResponse.json({ ok: false, message: "Origen no permitido." }, { status: 403 }) };
  }
  const authUser = await getAuthUserFromRequest();
  if (!authUser) {
    return { ok: false as const, response: NextResponse.json({ ok: false, message: "No autenticado." }, { status: 401 }) };
  }
  if (authUser.appRole !== "admin") {
    return { ok: false as const, response: NextResponse.json({ ok: false, message: "Solo admins pueden acceder." }, { status: 403 }) };
  }
  return { ok: true as const, authUser };
}

export async function GET(request: Request) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  const rate = enforceRateLimit({
    request,
    key: "api_auth_admin_accounts_get",
    max: 60,
    windowMs: 60 * 1000,
  });
  if (!rate.ok) {
    return NextResponse.json({ ok: false, message: "Demasiadas solicitudes. Intenta nuevamente." }, { status: 429 });
  }

  const pool = getPostgresPool();
  const result = await pool.query<DbUserRow>(
    `SELECT id, full_name, organization, stellar_public_key, app_role, buyer_verification_status, seller_verification_status, seller_verification_data, created_at, updated_at
     FROM app_users
     ORDER BY created_at DESC`,
  );
  const users = result.rows.map(mapDbUser);
  return NextResponse.json({ ok: true, users, ownerWallet: PLATFORM_OWNER_WALLET });
}

export async function PATCH(request: Request) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  const rate = enforceRateLimit({
    request,
    key: "api_auth_admin_accounts_patch",
    max: 60,
    windowMs: 60 * 1000,
  });
  if (!rate.ok) {
    return NextResponse.json({ ok: false, message: "Demasiadas solicitudes. Intenta nuevamente." }, { status: 429 });
  }

  const parsed = await parseJsonWithLimit<UpdatePayload>(request, 8_192);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, message: parsed.message }, { status: parsed.status });
  }
  const payload = parsed.data;
  const targetUserId = (payload.targetUserId ?? "").trim();
  if (!targetUserId) {
    return NextResponse.json({ ok: false, message: "Falta targetUserId." }, { status: 400 });
  }

  if (payload.appRole !== undefined && payload.appRole !== "user" && payload.appRole !== "dev" && payload.appRole !== "admin") {
    return NextResponse.json({ ok: false, message: "Rol invalido." }, { status: 400 });
  }
  if (
    payload.buyerVerificationStatus !== undefined
    && payload.buyerVerificationStatus !== "unverified"
    && payload.buyerVerificationStatus !== "verified"
  ) {
    return NextResponse.json({ ok: false, message: "Estado de verificacion de comprador invalido." }, { status: 400 });
  }
  if (payload.appRole === undefined && payload.buyerVerificationStatus === undefined) {
    return NextResponse.json({ ok: false, message: "No hay cambios para aplicar." }, { status: 400 });
  }

  const pool = getPostgresPool();
  const targetResult = await pool.query<{ id: string; stellar_public_key: string; app_role: AppRole; buyer_verification_status: BuyerVerificationStatus }>(
    `SELECT id, stellar_public_key, app_role, buyer_verification_status
     FROM app_users
     WHERE id = $1
     LIMIT 1`,
    [targetUserId],
  );
  const target = targetResult.rows[0];
  if (!target) {
    return NextResponse.json({ ok: false, message: "Cuenta no encontrada." }, { status: 404 });
  }

  const targetIsOwner = isPlatformOwnerWallet(target.stellar_public_key);
  if (payload.appRole === "admin" && !targetIsOwner) {
    return NextResponse.json({ ok: false, message: "Solo la wallet del propietario puede ser admin." }, { status: 400 });
  }
  if (targetIsOwner && payload.appRole && payload.appRole !== "admin") {
    return NextResponse.json({ ok: false, message: "La cuenta del propietario debe permanecer como admin." }, { status: 400 });
  }
  if (targetIsOwner && payload.buyerVerificationStatus && payload.buyerVerificationStatus !== "verified") {
    return NextResponse.json({ ok: false, message: "La cuenta del propietario debe permanecer verificada como comprador." }, { status: 400 });
  }

  const nextRole: AppRole = payload.appRole ?? target.app_role;
  const nextBuyerVerification: BuyerVerificationStatus = targetIsOwner
    ? "verified"
    : (payload.buyerVerificationStatus ?? target.buyer_verification_status);
  const update = await pool.query<DbUserRow>(
    `UPDATE app_users
     SET app_role = $1,
         buyer_verification_status = $2,
         updated_at = timezone('utc', now())
     WHERE id = $3
     RETURNING id, full_name, organization, stellar_public_key, app_role, buyer_verification_status, seller_verification_status, seller_verification_data, created_at, updated_at`,
    [nextRole, nextBuyerVerification, targetUserId],
  );

  return NextResponse.json({ ok: true, user: mapDbUser(update.rows[0]) });
}
