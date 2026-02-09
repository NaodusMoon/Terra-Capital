import { NextResponse } from "next/server";
import { getD1Binding } from "@/lib/server/cloudflare";

interface RequestPayload {
  email?: string;
  code?: string;
}

async function writeDeliveryAudit(email: string, status: "sent" | "failed" | "dev", detail?: string) {
  const eventId = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const d1 = getD1Binding();
  if (d1) {
    await d1
      .prepare(
        "INSERT INTO email_delivery_audit (id, email, kind, status, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .bind(eventId, email, "recovery_code", status, detail ?? null, nowIso)
      .run();
  }
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
      await writeDeliveryAudit(email, "dev", "email provider not configured");
      return NextResponse.json({
        ok: true,
        message: "Codigo generado en modo desarrollo.",
        devCode: code,
      });
    }
    await writeDeliveryAudit(email, "failed", "email provider missing in production");
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
    const errorText = await response.text();
    await writeDeliveryAudit(email, "failed", `resend status=${response.status}; body=${errorText.slice(0, 200)}`);
    return NextResponse.json({ ok: false, message: "No pudimos enviar el codigo por correo." }, { status: 502 });
  }

  await writeDeliveryAudit(email, "sent");
  return NextResponse.json({ ok: true, message: "Codigo enviado al correo." });
}
