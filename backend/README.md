# Terra Capital Off-Chain Backend (Axum + Tokio)

Backend para desacoplar consultas a Stellar/Horizon y evitar saturacion de nodos RPC/Horizon desde el frontend.

## Por que Axum + Tokio

- `Tokio` = runtime async.
- `Axum` = framework HTTP moderno sobre Tokio.

Esta combinacion es la opcion correcta para un backend off-chain escalable en Rust.

## Endpoints

- `GET /health`
- `GET /api/stellar/network?network=testnet|public`

`/api/stellar/network` usa cache en memoria con TTL para reducir hits al nodo.

## Variables de entorno

- `BACKEND_PORT` (default: `8080`)
- `NETWORK_CACHE_TTL_SECONDS` (default: `15`)
- `RUST_LOG` (opcional)

## Ejecutar local

```bash
cd backend
cargo run
```

Servidor: `http://127.0.0.1:8080`

## Integracion con frontend Next.js

En la raiz del proyecto agrega `.env.local`:

```env
OFFCHAIN_BACKEND_URL=http://127.0.0.1:8080
```

Con eso, el endpoint de Next `/api/stellar/network` usa este backend off-chain.
Si no esta configurado, hace fallback directo a Horizon.
