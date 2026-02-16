import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { Client } from "pg";

const cwd = process.cwd();
const envLocalPath = path.join(cwd, ".env.local");

function loadEnvLocal() {
  if (!existsSync(envLocalPath)) return;
  const raw = readFileSync(envLocalPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equalIndex = trimmed.indexOf("=");
    if (equalIndex <= 0) continue;
    const key = trimmed.slice(0, equalIndex).trim();
    const value = trimmed.slice(equalIndex + 1).trim().replace(/^"(.*)"$/, "$1");
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvLocal();

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error("DATABASE_URL no esta configurada.");
  process.exit(1);
}

function sanitizeConnectionString(value) {
  try {
    const parsed = new URL(value);
    parsed.searchParams.delete("sslmode");
    return parsed.toString();
  } catch {
    return value;
  }
}

const sqlFileArg = process.argv[2] || "supabase/migrations/0001_app_users.sql";
const sqlPath = path.resolve(cwd, sqlFileArg);
if (!existsSync(sqlPath)) {
  console.error(`No existe el archivo SQL: ${sqlPath}`);
  process.exit(1);
}

const sql = readFileSync(sqlPath, "utf8");
const sanitizedDatabaseUrl = sanitizeConnectionString(databaseUrl);
const useSsl = /sslmode=require/i.test(databaseUrl);

const client = new Client({
  connectionString: sanitizedDatabaseUrl,
  ssl: useSsl ? { rejectUnauthorized: false } : undefined,
});

try {
  await client.connect();
  await client.query("begin");
  await client.query(sql);
  await client.query("commit");
  console.log(`Migracion aplicada correctamente: ${sqlFileArg}`);
} catch (error) {
  await client.query("rollback").catch(() => {});
  console.error("Fallo al ejecutar migracion:", error);
  process.exitCode = 1;
} finally {
  await client.end();
}
