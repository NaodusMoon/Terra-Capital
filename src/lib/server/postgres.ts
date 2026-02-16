import "server-only";
import { Pool } from "pg";

declare global {
  var __terraPgPool: Pool | undefined;
}

function readDatabaseUrl() {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) {
    throw new Error("DATABASE_URL no esta configurada.");
  }
  return value;
}

function sanitizeConnectionString(value: string) {
  try {
    const parsed = new URL(value);
    parsed.searchParams.delete("sslmode");
    return parsed.toString();
  } catch {
    return value;
  }
}

export function getPostgresPool() {
  if (globalThis.__terraPgPool) {
    return globalThis.__terraPgPool;
  }

  const databaseUrl = readDatabaseUrl();
  const useSsl = /sslmode=require/i.test(databaseUrl);
  const pool = new Pool({
    connectionString: sanitizeConnectionString(databaseUrl),
    ssl: useSsl ? { rejectUnauthorized: false } : undefined,
    max: 5,
  });

  globalThis.__terraPgPool = pool;
  return pool;
}
