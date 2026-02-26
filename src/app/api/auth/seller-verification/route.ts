import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { isSafeHttpUrl, normalizeSafeText } from "@/lib/security";
import { getAuthUserFromRequest } from "@/lib/server/auth-session";
import { enforceRateLimit, isTrustedOrigin, parseJsonWithLimit } from "@/lib/server/request-security";
import { mapDbUser } from "@/lib/server/auth-users";
import { getPostgresPool } from "@/lib/server/postgres";

export const runtime = "nodejs";

interface EvidenceDigestPayload {
  mimeType?: string;
  bytes?: number;
  sha256?: string;
}

interface RequestPayload {
  legalName?: string;
  documentType?: "national_id" | "passport" | "license";
  documentLast4?: string;
  taxId?: string;
  country?: string;
  supportUrl?: string;
  documentFrontDigest?: EvidenceDigestPayload;
  documentBackDigest?: EvidenceDigestPayload;
  livenessVideoDigest?: EvidenceDigestPayload;
  livenessScore?: number;
  livenessDetectedFrames?: number;
  livenessMovementRatio?: number;
  livenessChallenge?: string;
}

const SHA256_HEX_REGEX = /^[a-f0-9]{64}$/;

function parseEvidenceDigest(raw?: EvidenceDigestPayload) {
  if (!raw) return null;
  const mimeType = normalizeSafeText(raw.mimeType ?? "", 80).toLowerCase();
  const bytes = Number(raw.bytes ?? Number.NaN);
  const sha256 = normalizeSafeText(raw.sha256 ?? "", 64).toLowerCase();
  if (!mimeType || !Number.isFinite(bytes) || bytes <= 0 || !SHA256_HEX_REGEX.test(sha256)) {
    return null;
  }
  return { mimeType, bytes, sha256 };
}

function maskTaxId(value: string) {
  if (value.length <= 4) return `${"*".repeat(Math.max(0, value.length - 1))}${value.slice(-1)}`;
  return `${value.slice(0, 2)}${"*".repeat(Math.max(0, value.length - 4))}${value.slice(-2)}`;
}

export async function POST(request: Request) {
  if (!isTrustedOrigin(request)) {
    return NextResponse.json({ ok: false, message: "Origen no permitido." }, { status: 403 });
  }
  const rate = enforceRateLimit({
    request,
    key: "api_auth_seller_verification_post",
    max: 20,
    windowMs: 60 * 1000,
  });
  if (!rate.ok) {
    return NextResponse.json({ ok: false, message: "Demasiadas solicitudes. Intenta nuevamente." }, { status: 429 });
  }

  const parsed = await parseJsonWithLimit<RequestPayload>(request, 35_000_000);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, message: parsed.message }, { status: parsed.status });
  }
  const payload = parsed.data;

  const legalName = normalizeSafeText(payload.legalName ?? "", 120);
  const documentType = payload.documentType;
  const documentLast4 = normalizeSafeText(payload.documentLast4 ?? "", 4);
  const taxId = normalizeSafeText(payload.taxId ?? "", 40);
  const country = normalizeSafeText(payload.country ?? "", 60);
  const supportUrl = payload.supportUrl?.trim() || undefined;
  const livenessChallenge = normalizeSafeText(payload.livenessChallenge ?? "", 120);
  const livenessScore = Number(payload.livenessScore ?? Number.NaN);
  const livenessDetectedFrames = Math.floor(Number(payload.livenessDetectedFrames ?? Number.NaN));
  const livenessMovementRatio = Number(payload.livenessMovementRatio ?? Number.NaN);

  const frontDoc = parseEvidenceDigest(payload.documentFrontDigest);
  const backDoc = parseEvidenceDigest(payload.documentBackDigest);
  const livenessVideo = parseEvidenceDigest(payload.livenessVideoDigest);

  const authUser = await getAuthUserFromRequest();
  if (!authUser) {
    return NextResponse.json({ ok: false, message: "No autenticado." }, { status: 401 });
  }

  if (
    !legalName ||
    (documentType !== "national_id" && documentType !== "passport" && documentType !== "license") ||
    documentLast4.length !== 4 ||
    !taxId ||
    !country
  ) {
    return NextResponse.json({ ok: false, message: "Completa todos los datos de verificacion requeridos." }, { status: 400 });
  }
  if (supportUrl && !isSafeHttpUrl(supportUrl)) {
    return NextResponse.json({ ok: false, message: "URL de soporte invalida." }, { status: 400 });
  }
  if (!frontDoc || !frontDoc.mimeType.startsWith("image/") || frontDoc.bytes > 8 * 1024 * 1024) {
    return NextResponse.json({ ok: false, message: "Debes subir una foto valida del frente del documento (max 8MB)." }, { status: 400 });
  }
  if (backDoc && (!backDoc.mimeType.startsWith("image/") || backDoc.bytes > 8 * 1024 * 1024)) {
    return NextResponse.json({ ok: false, message: "La foto del reverso del documento es invalida o supera 8MB." }, { status: 400 });
  }
  if (!livenessVideo || !livenessVideo.mimeType.startsWith("video/") || livenessVideo.bytes > 25 * 1024 * 1024) {
    return NextResponse.json({ ok: false, message: "Debes adjuntar una prueba en video de movimiento facial (max 25MB)." }, { status: 400 });
  }
  if (!Number.isFinite(livenessScore) || !Number.isFinite(livenessMovementRatio) || !Number.isFinite(livenessDetectedFrames)) {
    return NextResponse.json({ ok: false, message: "La prueba de liveness es invalida. Repite el proceso." }, { status: 400 });
  }
  if (livenessDetectedFrames < 8 || livenessMovementRatio < 0.09 || livenessScore < 0.55 || !livenessChallenge) {
    return NextResponse.json(
      { ok: false, message: "No pudimos validar movimiento facial suficiente. Repite la selfie en movimiento con mejor luz." },
      { status: 400 },
    );
  }

  const verificationPayload = {
    legalName,
    documentType,
    documentLast4,
    taxIdMasked: maskTaxId(taxId),
    taxIdHash: createHash("sha256").update(taxId).digest("hex"),
    country,
    supportUrl,
    documentEvidence: {
      frontMimeType: frontDoc.mimeType,
      frontBytes: frontDoc.bytes,
      frontSha256: frontDoc.sha256,
      backMimeType: backDoc?.mimeType,
      backBytes: backDoc?.bytes,
      backSha256: backDoc?.sha256,
    },
    livenessEvidence: {
      videoMimeType: livenessVideo.mimeType,
      videoBytes: livenessVideo.bytes,
      videoSha256: livenessVideo.sha256,
      score: Number(livenessScore.toFixed(4)),
      detectedFrames: livenessDetectedFrames,
      movementRatio: Number(livenessMovementRatio.toFixed(4)),
      challenge: livenessChallenge,
    },
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
      [JSON.stringify(verificationPayload), authUser.id],
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
