import { NextResponse } from "next/server";

interface RequestPayload {
  email?: string;
  code?: string;
}

async function writeDeliveryAudit() {
  // Auditoria opcional deshabilitada en este entorno.
}

export async function POST(request: Request) {
  let payload: RequestPayload;
  try {
    payload = (await request.json()) as RequestPayload;
  } catch {
    return NextResponse.json({ ok: false, message: "Payload invalido." }, { status: 400 });
  }

  const email = payload.email?.trim().toLowerCase();
  const code = payload.code?.trim();
  if (!email || !code) {
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
