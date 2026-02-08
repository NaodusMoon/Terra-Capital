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
```

## Deploy en Cloudflare (Pages/Workers runtime)

Se agrego soporte con OpenNext para correr Next.js en el runtime de Cloudflare y usar:
- `DB` (D1) para cache y auditoria
- `FILES` (R2) para snapshots de red Stellar y auditoria de emails

### 1. Crear recursos en Cloudflare

```bash
wrangler d1 create terra-capital-db
wrangler r2 bucket create terra-capital-files
wrangler r2 bucket create terra-capital-files-preview
```

### 2. Configurar `wrangler.toml`

Editar:
- `database_id` en `wrangler.toml`
- nombres de bucket si usas otros

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

## Scripts utiles

- `npm run lint`
- `npm run build`
- `npm run cf:build`
- `npm run cf:preview`
- `npm run cf:deploy`
