# Terra Capital

Plataforma para tokenizacion de activos agro sobre Stellar con frontend en Next.js.

## Ejecutar local

```bash
npm install
npm run dev:all
```

Esto levanta:
- Web en `http://localhost:3000`
- Backend off-chain Rust en `http://127.0.0.1:8080`

Si solo quieres frontend:

```bash
npm run dev
```

## Variables de entorno (local)

Crear `.env.local` desde `.env.example`:

```env
OFFCHAIN_BACKEND_URL=http://127.0.0.1:8080
RESEND_API_KEY=
RECOVERY_EMAIL_FROM="Terra Capital <no-reply@tu-dominio.com>"
NETWORK_CACHE_TTL_SECONDS=15
DATABASE_URL=postgresql://postgres.<project-ref>:[YOUR-PASSWORD]@aws-0-us-west-2.pooler.supabase.com:6543/postgres?sslmode=require
```

Si tu password tiene caracteres especiales (por ejemplo espacio o `@`), usa URL encoding dentro de `DATABASE_URL`.

## Auth actual

- Inicio de sesion directo con wallet.
- Primer acceso: si la wallet no existe en DB, se solicita solo `fullName`.
- No hay registro por email ni recuperacion de contrasena.

## Base de datos Supabase

Aplicar esquema inicial:

```bash
npm run db:supabase:migrate
```

Esto ejecuta `supabase/migrations/0001_app_users.sql` usando `DATABASE_URL`.

## Deploy en Cloudflare (Pages/Workers runtime)

Se agrego soporte con OpenNext para correr Next.js en el runtime de Cloudflare y usar:
- `tera_d1` (D1) para cache y auditoria
- `terra_images` (Cloudflare Images) en tu entorno Pages

### 1. Crear recursos en Cloudflare

Ya tienes:
- D1 binding: `tera_d1`
- D1 database: `terra_capital_d1_db`
- Images binding: `terra_images`

### 2. Configurar `wrangler.toml`

Editar:
- `database_id` en `wrangler.toml`

Importante:
- No dejes `REPLACE_WITH_TERA_D1_DATABASE_ID`; el script `cf:check` bloquea el deploy si sigue asi.

### 3. Aplicar migraciones D1

Local:

```bash
npm run cf:d1:migrate
```

Remoto:

```bash
npm run cf:d1:migrate:remote
```

### 4. Variables secretas en Cloudflare

```bash
wrangler secret put RESEND_API_KEY
wrangler secret put RECOVERY_EMAIL_FROM
```

Opcional:
- `NETWORK_CACHE_TTL_SECONDS` en `[vars]` de `wrangler.toml` (default 15)

### 5. Build y deploy

Preview local Cloudflare runtime:

```bash
npm run cf:preview
```

Deploy:

```bash
npm run cf:deploy
```

## Configuracion exacta en Cloudflare Pages

En tu proyecto de Pages usa:
- Build command: `npm run cf:build`
- Deploy command: `npx wrangler deploy`
- Root directory: `/` (raiz del repo)

Importante:
- `npm run build` ya genera `.open-next/worker.js` (ejecuta `next build` + `opennextjs-cloudflare build --skipBuild`).
- Si prefieres validacion extra (`cf:check`), usa `npm run cf:build`.
- No uses `postbuild` con OpenNext porque puede generar loop de builds y terminar en error `status 137` (proceso terminado por memoria/tiempo).

## Deploy en Vercel

- Build command: `npm run build`
- `npm run build` ejecuta solo `next build` (sin OpenNext/Cloudflare).
- Node recomendado en Vercel: `22.x`.

Si usas variables/secretos, configuralos en Pages o con Wrangler:
- `RESEND_API_KEY`
- `RECOVERY_EMAIL_FROM`

## Scripts utiles

- `npm run lint`
- `npm run build`
- `npm run cf:build`
- `npm run cf:preview`
- `npm run cf:deploy`
