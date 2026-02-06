# Terra Capital

Terra Capital es una plataforma legal-tecnologica para tokenizacion de activos agro (tierra, cultivos y ganaderia) sobre Stellar, con una experiencia web para compradores e inversores, y un panel operativo para vendedores y productores.

## Comando rapido para correr todo

```bash
npm run dev:all
```

Esto levanta frontend + backend off-chain en paralelo.

## Tecnologias del proyecto

### Frontend web
- Next.js 16 (App Router)
- React 19 + TypeScript
- Tailwind CSS v4
- Framer Motion (animaciones)
- Lucide React (iconografia)
- Freighter API (conexion de wallet Stellar)
- Wallet Stellar manual (ingreso de direccion publica G...)

### Backend off-chain (recomendado)
- Rust
- Axum (framework HTTP)
- Tokio (runtime async)
- Reqwest (cliente HTTP)
- Cache en memoria para reducir llamadas a Horizon/RPC

### Smart contract
- Soroban (Stellar)
- Rust `no_std`

## Arquitectura

- `src/`: frontend Next.js
- `backend/`: API off-chain en Rust para consultas Stellar con cache
- `contracts/`: smart contract Soroban de tokenizacion

## Requisitos previos

### Obligatorios
- Node.js 20+
- npm 10+

### Para ejecutar todo (frontend + backend) en un comando
- Rustup + Cargo
- Visual Studio Build Tools 2022 con workload C++ (en Windows)

### Para contrato Soroban (opcional)
- target WASM de Rust: `wasm32-unknown-unknown`
- Stellar CLI

## Instalacion de dependencias

En la raiz del proyecto:

```bash
npm install
```

## Variables de entorno

Copia `.env.example` a `.env.local` y ajusta valores:

```env
OFFCHAIN_BACKEND_URL=http://127.0.0.1:8080
```

Si no defines `OFFCHAIN_BACKEND_URL`, el frontend hace fallback a consulta directa de Horizon.

## Como correr el proyecto

### Opcion 1 (recomendada): todo con un comando

```bash
npm run dev:all
```

Esto levanta:
- Frontend web (Next.js) en `http://localhost:3000`
- Backend off-chain (Axum) en `http://127.0.0.1:8080`

### Opcion 2: solo frontend

```bash
npm run dev
```

### Opcion 3: por separado

Terminal 1:
```bash
npm run dev:web
```

Terminal 2:
```bash
npm run dev:offchain
```

## Build de produccion

```bash
npm run build
npm run start
```

## Lint

```bash
npm run lint
```

## Smart contract (Soroban)

Documentacion del contrato:
- `contracts/README.md`

Comandos base:

```bash
cd contracts
cargo build --release --target wasm32-unknown-unknown
```

## Funcionalidades principales

- Landing informativa del proyecto
- Registro e inicio de sesion por rol (buyer/seller)
- Conexion obligatoria de wallet Stellar para operar
- Opciones de wallet: manual Stellar o Freighter
- Marketplace comprador con filtros, detalle expandido, compra y stock
- Portafolio de compras y registros de operaciones
- Panel vendedor para publicar activos, controlar ventas y chat
- Integracion Stellar con capa off-chain para menor carga en RPC/Horizon
- Flujo post-venta modelado: envio de liquidez a Blend y reserva para payouts a holders en ciclo mensual/bimestral

## Notas operativas

- La autenticacion actual usa almacenamiento local para prototipo (`localStorage`).
- El backend off-chain ya incorpora cache de red para evitar saturar nodos.
- Si `dev:all` falla en Windows por herramientas de compilacion, verifica instalacion de Build Tools C++.
