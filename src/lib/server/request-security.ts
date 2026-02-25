import "server-only";

const RATE_LIMIT_STORE_KEY = "__terra_rate_limit_store__";

type Bucket = {
  count: number;
  resetAt: number;
};

type RateLimitStore = Map<string, Bucket>;

type GlobalWithStore = typeof globalThis & {
  [RATE_LIMIT_STORE_KEY]?: RateLimitStore;
};

function getRateLimitStore() {
  const ref = globalThis as GlobalWithStore;
  if (!ref[RATE_LIMIT_STORE_KEY]) {
    ref[RATE_LIMIT_STORE_KEY] = new Map<string, Bucket>();
  }
  return ref[RATE_LIMIT_STORE_KEY]!;
}

function cleanupRateLimitStore(now: number) {
  const store = getRateLimitStore();
  for (const [key, bucket] of store.entries()) {
    if (bucket.resetAt <= now) {
      store.delete(key);
    }
  }
}

export function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for") ?? "";
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return "unknown";
}

export function isTrustedOrigin(request: Request) {
  const origin = request.headers.get("origin")?.trim();
  if (!origin) return true;
  try {
    return new URL(request.url).origin === new URL(origin).origin;
  } catch {
    return false;
  }
}

export function enforceRateLimit(input: {
  request: Request;
  key: string;
  max: number;
  windowMs: number;
}) {
  const now = Date.now();
  cleanupRateLimitStore(now);
  const ip = getClientIp(input.request);
  const bucketKey = `${input.key}:${ip}`;
  const store = getRateLimitStore();
  const current = store.get(bucketKey);
  if (!current || current.resetAt <= now) {
    store.set(bucketKey, { count: 1, resetAt: now + input.windowMs });
    return { ok: true as const, remaining: input.max - 1 };
  }
  if (current.count >= input.max) {
    return { ok: false as const, retryAfterSec: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
  }
  current.count += 1;
  store.set(bucketKey, current);
  return { ok: true as const, remaining: Math.max(0, input.max - current.count) };
}

export async function parseJsonWithLimit<T>(request: Request, maxBytes: number) {
  const raw = await request.text();
  const bytes = Buffer.byteLength(raw, "utf8");
  if (bytes > maxBytes) {
    return {
      ok: false as const,
      status: 413,
      message: `Payload demasiado grande (max ${maxBytes} bytes).`,
    };
  }
  if (!raw.trim()) {
    return {
      ok: false as const,
      status: 400,
      message: "Payload vacio.",
    };
  }
  try {
    return { ok: true as const, data: JSON.parse(raw) as T };
  } catch {
    return {
      ok: false as const,
      status: 400,
      message: "Payload invalido.",
    };
  }
}
