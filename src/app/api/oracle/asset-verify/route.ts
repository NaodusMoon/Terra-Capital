import { NextRequest, NextResponse } from "next/server";
import { verifyAssetEvidence } from "@/lib/server/oracle";
import { getAuthUserFromRequest } from "@/lib/server/auth-session";
import type { AssetCategory } from "@/types/market";

export const runtime = "nodejs";

function parseCategory(raw: unknown): AssetCategory | null {
  return raw === "cultivo" || raw === "tierra" || raw === "ganaderia" ? raw : null;
}

type VerifyPayload = {
  title?: unknown;
  category?: unknown;
  location?: unknown;
  description?: unknown;
  mediaUrls?: unknown;
  declaredProofHash?: unknown;
  externalRefs?: unknown;
};

export async function POST(request: NextRequest) {
  const authUser = await getAuthUserFromRequest();
  if (!authUser) {
    return NextResponse.json({ ok: false, message: "No autenticado." }, { status: 401 });
  }
  if (authUser.appRole !== "admin") {
    return NextResponse.json({ ok: false, message: "Solo admin puede usar Oracle." }, { status: 403 });
  }

  const payload = (await request.json().catch(() => null)) as VerifyPayload | null;
  if (!payload) {
    return NextResponse.json({ ok: false, message: "Payload invalido." }, { status: 400 });
  }

  const category = parseCategory(payload.category);
  if (!category) {
    return NextResponse.json({ ok: false, message: "Categoria invalida." }, { status: 400 });
  }

  const title = typeof payload.title === "string" ? payload.title : "";
  const location = typeof payload.location === "string" ? payload.location : "";
  const description = typeof payload.description === "string" ? payload.description : "";
  const declaredProofHash = typeof payload.declaredProofHash === "string" ? payload.declaredProofHash : "";
  const mediaUrls = Array.isArray(payload.mediaUrls) ? payload.mediaUrls.filter((row): row is string => typeof row === "string") : [];
  const externalRefs = Array.isArray(payload.externalRefs) ? payload.externalRefs.filter((row): row is string => typeof row === "string") : [];

  try {
    const report = await verifyAssetEvidence({
      title,
      category,
      location,
      description,
      mediaUrls,
      declaredProofHash,
      externalRefs,
    });
    return NextResponse.json({ ok: true, report });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "No se pudo verificar evidencia." },
      { status: 500 },
    );
  }
}
