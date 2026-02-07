import { NextResponse } from "next/server";

interface RequestPayload {
  email?: string;
  code?: string;
}

export async function POST(request: Request) {
  let payload: RequestPayload;
  try {
    payload = (await request.json()) as RequestPayload;
  } catch {
    return NextResponse.json({ ok: false, message: "Payload inválido." }, { status: 400 });
  }

  const email = payload.email?.trim();
  const code = payload.code?.trim();
  if (!email || !code) {
    return NextResponse.json({ ok: false, message: "Faltan datos para envío de código." }, { status: 400 });
  }

  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RECOVERY_EMAIL_FROM?.trim();

  if (!resendApiKey || !from) {
    if (process.env.NODE_ENV !== "production") {
      return NextResponse.json({
        ok: true,
        message: "Código generado en modo desarrollo.",
        devCode: code,
      });
    }
    return NextResponse.json({ ok: false, message: "Email no configurado. Define RESEND_API_KEY y RECOVERY_EMAIL_FROM." }, { status: 500 });
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
      subject: "Código de recuperación - Terra Capital",
      html: `<p>Tu código de verificación es: <strong>${code}</strong></p><p>Vence en 10 minutos.</p>`,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    return NextResponse.json({ ok: false, message: "No pudimos enviar el código por correo." }, { status: 502 });
  }

  return NextResponse.json({ ok: true, message: "Código enviado al correo." });
}
