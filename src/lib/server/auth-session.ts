import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { findUserByWallet } from "@/lib/server/auth-users";
import type { AppUser } from "@/types/auth";

const SESSION_COOKIE_NAME = "terra_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const DEV_SECRET_KEY = "__terra_auth_dev_secret__";

interface SessionPayload {
  uid: string;
  wallet: string;
  exp: number;
}

type GlobalWithDevSecret = typeof globalThis & {
  [DEV_SECRET_KEY]?: string;
};

function base64UrlEncode(input: string) {
  return Buffer.from(input, "utf8").toString("base64url");
}

function base64UrlDecode(input: string) {
  return Buffer.from(input, "base64url").toString("utf8");
}

function getSessionSecret() {
  const configured = process.env.AUTH_SESSION_SECRET?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SESSION_SECRET no esta configurado.");
  }
  const ref = globalThis as GlobalWithDevSecret;
  if (!ref[DEV_SECRET_KEY]) {
    ref[DEV_SECRET_KEY] = randomBytes(32).toString("hex");
  }
  return ref[DEV_SECRET_KEY]!;
}

function sign(value: string) {
  return createHmac("sha256", getSessionSecret()).update(value).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function encodeSession(payload: SessionPayload) {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

function decodeSession(rawToken: string) {
  const parts = rawToken.split(".");
  if (parts.length !== 2) return null;
  const [encodedPayload, receivedSignature] = parts;
  const expectedSignature = sign(encodedPayload);
  if (!safeEqual(receivedSignature, expectedSignature)) return null;
  try {
    const parsed = JSON.parse(base64UrlDecode(encodedPayload)) as SessionPayload;
    if (!parsed.uid || !parsed.wallet || !Number.isFinite(parsed.exp)) return null;
    if (parsed.exp <= Math.floor(Date.now() / 1000)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setAuthSessionCookie(response: NextResponse, user: AppUser) {
  const payload: SessionPayload = {
    uid: user.id,
    wallet: user.stellarPublicKey ?? "",
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };

  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: encodeSession(payload),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearAuthSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export async function getAuthUserFromRequest() {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? "";
  if (!rawToken) return null;
  const payload = decodeSession(rawToken);
  if (!payload) return null;
  const user = await findUserByWallet(payload.wallet);
  if (!user) return null;
  return user.id === payload.uid ? user : null;
}
