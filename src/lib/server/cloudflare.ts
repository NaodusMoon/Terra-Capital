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

type AppCloudflareEnv = {
  DB?: D1DatabaseLike;
  tera_d1?: D1DatabaseLike;
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
  const env = readEnv();
  return env.DB ?? env.tera_d1;
}

export function getNetworkCacheTtlSeconds(defaultValue = 15) {
  const rawValue = readEnv().NETWORK_CACHE_TTL_SECONDS?.trim();
  const parsed = rawValue ? Number.parseInt(rawValue, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}
