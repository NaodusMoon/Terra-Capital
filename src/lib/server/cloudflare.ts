import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(): Promise<T | null>;
  run(): Promise<unknown>;
}

interface D1DatabaseLike {
  prepare(query: string): D1PreparedStatement;
}

interface R2PutOptions {
  httpMetadata?: {
    contentType?: string;
  };
}

interface R2BucketLike {
  put(key: string, value: string, options?: R2PutOptions): Promise<unknown>;
}

type AppCloudflareEnv = {
  DB?: D1DatabaseLike;
  FILES?: R2BucketLike;
  NETWORK_CACHE_TTL_SECONDS?: string;
};

function readEnv(): AppCloudflareEnv {
  try {
    const context = getCloudflareContext();
    if (context?.env) {
      return context.env as unknown as AppCloudflareEnv;
    }
  } catch {
    // Local fallback: no Cloudflare bindings available.
  }

  return {};
}

export function getD1Binding() {
  return readEnv().DB;
}

export function getR2Binding() {
  return readEnv().FILES;
}

export function getNetworkCacheTtlSeconds(defaultValue = 15) {
  const rawValue = readEnv().NETWORK_CACHE_TTL_SECONDS?.trim();
  const parsed = rawValue ? Number.parseInt(rawValue, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}
