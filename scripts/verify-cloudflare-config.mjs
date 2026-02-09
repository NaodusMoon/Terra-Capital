import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const wranglerPath = path.join(root, "wrangler.toml");
const openNextConfigPath = path.join(root, "open-next.config.ts");

function fail(message) {
  console.error(`\n[cf:check] ${message}\n`);
  process.exit(1);
}

if (!fs.existsSync(wranglerPath)) {
  fail("No existe wrangler.toml en la raiz del proyecto.");
}

if (!fs.existsSync(openNextConfigPath)) {
  fail("No existe open-next.config.ts; OpenNext no esta configurado.");
}

const wrangler = fs.readFileSync(wranglerPath, "utf8");

if (!/main\s*=\s*["']\.open-next\/worker\.js["']/.test(wrangler)) {
  fail('wrangler.toml debe tener: main = ".open-next/worker.js"');
}

const databaseIdMatch = wrangler.match(/database_id\s*=\s*"([^"]+)"/);
if (!databaseIdMatch) {
  fail('No se encontro "database_id" en wrangler.toml.');
}

const databaseId = databaseIdMatch[1].trim();
if (!databaseId || databaseId.includes("REPLACE_WITH_")) {
  fail("Debes configurar un database_id real de D1 en wrangler.toml antes de desplegar.");
}

const d1Bindings = ["binding = \"DB\"", "binding = \"tera_d1\""];
if (!d1Bindings.some((binding) => wrangler.includes(binding))) {
  fail('Falta binding D1 en wrangler.toml (usa "DB" o "tera_d1").');
}

console.log("[cf:check] Configuracion Cloudflare validada.");
