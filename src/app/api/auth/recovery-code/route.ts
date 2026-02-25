import { NextResponse } from "next/server";
import { enforceRateLimit, isTrustedOrigin, parseJsonWithLimit } from "@/lib/server/request-security";

interface RequestPayload {
  email?: string;
  code?: string;
}

async function writeDeliveryAudit() {
  // Auditoria opcional deshabilitada en este entorno.
}

export async function POST(request: Request) {
  if (!isTrustedOrigin(request)) {
    return NextResponse.json({ ok: false, message: "Origen no permitido." }, { status: 403 });
  }
  const rate = enforceRateLimit({
    request,
    key: "api_auth_recovery_code_post",
    max: 10,
    windowMs: 60 * 1000,
  });
  if (!rate.ok) {
    return NextResponse.json({ ok: false, message: "Demasiados intentos. Intenta nuevamente." }, { status: 429 });
  }

  const parsed = await parseJsonWithLimit<RequestPayload>(request, 8_192);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, message: parsed.message }, { status: parsed.status });
  }
  const payload = parsed.data;

  const email = payload.email?.trim().toLowerCase();
  const code = payload.code?.trim();
  if (!email || !code || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^[0-9]{4,12}$/.test(code)) {
    return NextResponse.json({ ok: false, message: "Faltan datos para envio de codigo." }, { status: 400 });
  }

  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RECOVERY_EMAIL_FROM?.trim();

  if (!resendApiKey || !from) {
    if (process.env.NODE_ENV !== "production") {
      await writeDeliveryAudit();
      return NextResponse.json({
        ok: true,
        message: "Codigo generado en modo desarrollo.",
        devCode: code,
      });
    }
    await writeDeliveryAudit();
    return NextResponse.json(
      { ok: false, message: "Email no configurado. Define RESEND_API_KEY y RECOVERY_EMAIL_FROM." },
      { status: 500 },
    );
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Codigo de recuperacion - Terra Capital",
      html: `<p>Tu codigo de verificacion es: <strong>${code}</strong></p><p>Vence en 10 minutos.</p>`,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    return NextResponse.json({ ok: false, message: "No pudimos enviar el codigo por correo." }, { status: 502 });
  }

  await writeDeliveryAudit();
  return NextResponse.json({ ok: true, message: "Codigo enviado al correo." });
}
