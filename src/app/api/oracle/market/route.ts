import { NextRequest, NextResponse } from "next/server";
import { getOracleSnapshot } from "@/lib/server/oracle";
import { getAuthUserFromRequest } from "@/lib/server/auth-session";
import type { AssetCategory } from "@/types/market";

export const runtime = "nodejs";

function parseCategory(raw: string | null): AssetCategory {
  if (raw === "cultivo" || raw === "tierra" || raw === "ganaderia") return raw;
  return "cultivo";
}

export async function GET(request: NextRequest) {
  const authUser = await getAuthUserFromRequest();
  if (!authUser) {
    return NextResponse.json({ ok: false, message: "No autenticado." }, { status: 401 });
  }
  if (authUser.appRole !== "admin") {
    return NextResponse.json({ ok: false, message: "Solo admin puede usar Oracle." }, { status: 403 });
  }

  const category = parseCategory(request.nextUrl.searchParams.get("category"));
  const location = request.nextUrl.searchParams.get("location")?.trim() ?? "";
  try {
    const snapshot = await getOracleSnapshot(category, location);
    return NextResponse.json({ ok: true, snapshot });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "No se pudo consultar el oraculo.",
      },
      { status: 500 },
    );
  }
}
