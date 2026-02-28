import { Keypair } from "@stellar/stellar-sdk";
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { normalizeSafeText, isValidStellarPublicKey } from "@/lib/security";
import { setAuthSessionCookie } from "@/lib/server/auth-session";
import { findUserByWallet, mapDbUser } from "@/lib/server/auth-users";
import { createWalletLoginChallenge, consumeWalletLoginChallenge } from "@/lib/server/wallet-login-challenge-store";
import { getPostgresPool } from "@/lib/server/postgres";
import { enforceRateLimit, getClientIp, isTrustedOrigin, parseJsonWithLimit } from "@/lib/server/request-security";
import { PLATFORM_OWNER_NAME, isPlatformOwnerWallet } from "@/lib/server/admin-config";

export const runtime = "nodejs";

type LoginProvider = string;

interface ChallengePayload {
  action?: "challenge";
  walletAddress?: string;
  walletProvider?: string;
}

interface VerifyPayload {
  action?: "verify";
  walletAddress?: string;
  walletProvider?: string;
  challengeId?: string;
  fullName?: string;
  signature?: {
    signerAddress?: string;
    signedMessage?: string;
    originalMessage?: string;
    messageSignature?: string;
  };
}

type RequestPayload = ChallengePayload | VerifyPayload;

function parseProvider(value: unknown): LoginProvider | null {
  if (typeof value !== "string") return null;
  const provider = value.trim().toLowerCase();
  if (!provider || provider === "manual") return null;
  return provider;
}

function decodeMaybeBinary(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return [] as Buffer[];
  const out: Buffer[] = [];

  if (/^[0-9a-f]+$/i.test(trimmed) && trimmed.length % 2 === 0) {
    out.push(Buffer.from(trimmed, "hex"));
  }

  try {
    const asBase64 = Buffer.from(trimmed, "base64");
    if (asBase64.length > 0) out.push(asBase64);
  } catch {}

  try {
    const asBase64Url = Buffer.from(trimmed, "base64url");
    if (asBase64Url.length > 0) out.push(asBase64Url);
  } catch {}

  const unique = new Map<string, Buffer>();
  for (const row of out) {
    unique.set(row.toString("hex"), row);
  }
  return Array.from(unique.values());
}

function verifyEd25519Signature(input: {
  walletAddress: string;
  payloadCandidates: Buffer[];
  signatureCandidates: Buffer[];
}) {
  try {
    const keypair = Keypair.fromPublicKey(input.walletAddress);
    for (const payload of input.payloadCandidates) {
      for (const signature of input.signatureCandidates) {
        if (keypair.verify(payload, signature)) {
          return true;
        }
      }
    }
  } catch {
    return false;
  }
  return false;
}

function verifyWalletSignature(input: {
  walletAddress: string;
  challengeMessage: string;
  signature: VerifyPayload["signature"];
}) {
  const signerAddress = input.signature?.signerAddress?.trim() ?? "";
  if (signerAddress && signerAddress !== input.walletAddress) {
    return false;
  }

  const originalMessage = input.signature?.originalMessage?.trim() ?? "";
  const signedMessageRaw = input.signature?.signedMessage?.trim() ?? "";
  const messageSignatureRaw = input.signature?.messageSignature?.trim() ?? "";
  if (!signedMessageRaw && !messageSignatureRaw) return false;

  const messageUtf8 = Buffer.from(input.challengeMessage, "utf8");
  const prefixedHash = createHash("sha256")
    .update(`Stellar Signed Message:\n${input.challengeMessage}`, "utf8")
    .digest();
  const payloadCandidates: Buffer[] = [prefixedHash, messageUtf8];
  const signatureCandidates: Buffer[] = [];

  if (signedMessageRaw) {
    signatureCandidates.push(...decodeMaybeBinary(signedMessageRaw));
  }

  if (messageSignatureRaw) {
    signatureCandidates.push(...decodeMaybeBinary(messageSignatureRaw));
  }

  if (originalMessage && originalMessage === input.challengeMessage) {
    payloadCandidates.push(Buffer.from(originalMessage, "utf8"));
    if (signedMessageRaw) {
      payloadCandidates.push(...decodeMaybeBinary(signedMessageRaw));
    }
  }

  if (signatureCandidates.length === 0) {
    return false;
  }

  return verifyEd25519Signature({
    walletAddress: input.walletAddress,
    payloadCandidates,
    signatureCandidates,
  });
}

async function upsertWalletUserAndCreateSession(input: {
  walletAddress: string;
  fullName?: string;
}) {
  const ownerWallet = isPlatformOwnerWallet(input.walletAddress);
  const existing = await findUserByWallet(input.walletAddress);
  if (existing) {
    const normalizedName = normalizeSafeText(input.fullName ?? "", 120);
    const desiredName = ownerWallet ? PLATFORM_OWNER_NAME : normalizedName || existing.fullName;
    const needsNameUpdate = desiredName !== existing.fullName;
    const needsRoleUpdate = ownerWallet && existing.appRole !== "admin";
    if (needsNameUpdate || needsRoleUpdate) {
      const pool = getPostgresPool();
      if (ownerWallet) {
        await pool.query(
          `UPDATE app_users
           SET app_role = 'user', updated_at = timezone('utc', now())
           WHERE app_role = 'admin' AND id <> $1`,
          [existing.id],
        );
      }
      const updated = await pool.query(
        `UPDATE app_users
         SET full_name = $1,
             app_role = CASE WHEN $3 THEN 'admin' ELSE app_role END,
             buyer_verification_status = CASE WHEN $3 THEN 'verified' ELSE buyer_verification_status END,
             updated_at = timezone('utc', now())
         WHERE id = $2
         RETURNING id, full_name, organization, stellar_public_key, app_role, buyer_verification_status, seller_verification_status, seller_verification_data, created_at, updated_at`,
        [desiredName, existing.id, ownerWallet],
      );
      const mapped = mapDbUser(updated.rows[0]);
      const response = NextResponse.json({ ok: true, user: mapped, isNewUser: false });
      setAuthSessionCookie(response, mapped);
      return response;
    }
    const response = NextResponse.json({ ok: true, user: existing, isNewUser: false });
    setAuthSessionCookie(response, existing);
    return response;
  }

  const normalizedName = normalizeSafeText(input.fullName ?? "", 120);
  if (!normalizedName && !ownerWallet) {
    return NextResponse.json(
      { ok: false, requiresName: true, message: "Primer acceso: indica tu nombre para crear el perfil." },
      { status: 400 },
    );
  }

  const pool = getPostgresPool();
  if (ownerWallet) {
    await pool.query(
      `UPDATE app_users
       SET app_role = 'user', updated_at = timezone('utc', now())
       WHERE app_role = 'admin'`,
    );
  }
  const created = await pool.query(
    `INSERT INTO app_users (id, full_name, stellar_public_key, app_role, buyer_verification_status, seller_verification_status)
     VALUES ($1, $2, $3, $4, $5, 'unverified')
     RETURNING id, full_name, organization, stellar_public_key, app_role, buyer_verification_status, seller_verification_status, seller_verification_data, created_at, updated_at`,
    [
      crypto.randomUUID(),
      ownerWallet ? PLATFORM_OWNER_NAME : normalizedName,
      input.walletAddress,
      ownerWallet ? "admin" : "user",
      ownerWallet ? "verified" : "unverified",
    ],
  );

  const mapped = mapDbUser(created.rows[0]);
  const response = NextResponse.json({ ok: true, user: mapped, isNewUser: true });
  setAuthSessionCookie(response, mapped);
  return response;
}

export async function POST(request: Request) {
  if (!isTrustedOrigin(request)) {
    return NextResponse.json({ ok: false, message: "Origen no permitido." }, { status: 403 });
  }

  const parsed = await parseJsonWithLimit<RequestPayload>(request, 16_384);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, message: parsed.message }, { status: parsed.status });
  }
  const payload = parsed.data;
  const action = payload.action ?? "challenge";

  const walletAddress = (payload.walletAddress ?? "").trim().toUpperCase();
  if (!isValidStellarPublicKey(walletAddress)) {
    return NextResponse.json({ ok: false, message: "Wallet Stellar invalida." }, { status: 400 });
  }

  const walletProvider = parseProvider(payload.walletProvider);
  if (!walletProvider) {
    return NextResponse.json(
      { ok: false, message: "Proveedor no soportado para login seguro." },
      { status: 400 },
    );
  }

  if (action === "challenge") {
    const rate = enforceRateLimit({
      request,
      key: "api_auth_wallet_login_challenge",
      max: 20,
      windowMs: 60 * 1000,
    });
    if (!rate.ok) {
      return NextResponse.json({ ok: false, message: "Demasiados intentos. Intenta nuevamente." }, { status: 429 });
    }

    const clientIp = getClientIp(request);
    const requestOrigin = (() => {
      try {
        return new URL(request.url).origin;
      } catch {
        return "";
      }
    })();

    const challenge = createWalletLoginChallenge({
      walletAddress,
      walletProvider,
      clientIp,
      requestOrigin,
    });

    return NextResponse.json({
      ok: true,
      challengeId: challenge.id,
      message: challenge.message,
      expiresAt: challenge.expiresAt,
    });
  }

  if (action !== "verify") {
    return NextResponse.json({ ok: false, message: "Accion no soportada." }, { status: 400 });
  }
  const verifyPayload = payload as VerifyPayload;

  const rate = enforceRateLimit({
    request,
    key: "api_auth_wallet_login_verify",
    max: 20,
    windowMs: 60 * 1000,
  });
  if (!rate.ok) {
    return NextResponse.json({ ok: false, message: "Demasiados intentos. Intenta nuevamente." }, { status: 429 });
  }

  const challengeId = (verifyPayload.challengeId ?? "").trim();
  if (!challengeId) {
    return NextResponse.json({ ok: false, message: "Falta challengeId." }, { status: 400 });
  }

  const challenge = consumeWalletLoginChallenge({
    id: challengeId,
    walletAddress,
    walletProvider,
    clientIp: getClientIp(request),
  });
  if (!challenge) {
    return NextResponse.json({ ok: false, message: "Challenge invalido, expirado o ya usado." }, { status: 401 });
  }

  const verified = verifyWalletSignature({
    walletAddress,
    challengeMessage: challenge.message,
    signature: verifyPayload.signature,
  });

  if (!verified) {
    return NextResponse.json({ ok: false, message: "Firma invalida para el challenge de login." }, { status: 401 });
  }

  try {
    return await upsertWalletUserAndCreateSession({
      walletAddress,
      fullName: verifyPayload.fullName,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo iniciar sesion.";
    const isDbConfigIssue = message.toLowerCase().includes("database_url");
    return NextResponse.json(
      {
        ok: false,
        message: isDbConfigIssue
          ? "DATABASE_URL no esta configurada. El login backend no esta disponible."
          : message,
      },
      { status: isDbConfigIssue ? 503 : 500 },
    );
  }
}
