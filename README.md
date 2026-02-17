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

Marketplace, compras y chats ahora se guardan en PostgreSQL (no en localStorage).
Ese flujo depende tambien de:
- `supabase/migrations/0002_marketplace.sql`

## Deploy en Vercel

- Build command: `npm run build`
- `npm run build` ejecuta `next build`.
- Node recomendado en Vercel: `22.x`.

Si usas variables/secretos, configuralos en Vercel:
- `DATABASE_URL`
- `RESEND_API_KEY`
- `RECOVERY_EMAIL_FROM`

## Scripts utiles

- `npm run lint`
- `npm run build`
- `npm run db:supabase:migrate`
