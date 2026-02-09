import { execSync } from "node:child_process";

const isVercel = process.env.VERCEL === "1" || process.env.VERCEL === "true";
const isCloudflarePages = process.env.CF_PAGES === "1" || process.env.CF_PAGES === "true";

function run(command) {
  execSync(command, { stdio: "inherit" });
}

if (isVercel) {
  console.log("[build] Vercel detectado: ejecutando Next.js build con Webpack.");
  run("next build --webpack");
  process.exit(0);
}

if (isCloudflarePages) {
  console.log("[build] Cloudflare Pages detectado: generando bundle OpenNext.");
  run("next build");
  run("opennextjs-cloudflare build --skipBuild");
  process.exit(0);
}

console.log("[build] Entorno local/otro detectado: ejecutando Next.js build.");
run("next build");
