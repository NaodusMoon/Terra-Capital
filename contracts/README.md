# Terra Capital Soroban Contract

Contrato base de tokenizacion para Stellar (Soroban).

## Tecnologias utilizadas

- Rust (`no_std`)
- Soroban SDK (`soroban-sdk`)
- Stellar CLI (deploy e invocacion)
- WASM target: `wasm32-unknown-unknown`
- Backend off-chain complementario: Rust + Axum + Tokio (para reducir carga directa sobre Horizon/RPC)

## Arquitectura relacionada

- On-chain: contrato Soroban en `contracts/terra_tokenization`
- Off-chain: API en `backend/` (Axum + Tokio) usada por el frontend para consultas cacheadas
- Settlement operativo (prototipo): ventas tokenizadas -> liquidez a Blend -> liquidaciones periodicas a holders (mensual/bimestral)

## Ejecutar proyecto completo (frontend + off-chain)

Desde la raiz del repo:

```bash
npm run dev:all
```

## Ubicacion

- `contracts/terra_tokenization/src/lib.rs`

## Funciones incluidas

- `init(admin)`
- `create_asset(seller, category, title, price_per_token, total_tokens)`
- `buy_tokens(buyer, asset_id, quantity)`
- `get_asset(asset_id)`
- `list_assets(from_id, limit)`
- `get_buyer_balance(asset_id, buyer)`
- `set_asset_active(seller, asset_id, active)`

## Requisitos locales

1. Instalar Rust (`cargo` y `rustup`).
2. Instalar target WASM:
   - `rustup target add wasm32-unknown-unknown`
3. Instalar Stellar CLI:
   - `cargo install --locked stellar-cli`

## Build

```bash
cd contracts
cargo build --release --target wasm32-unknown-unknown
```

WASM resultante:

- `contracts/target/wasm32-unknown-unknown/release/terra_tokenization.wasm`

## Deploy (testnet, ejemplo)

```bash
stellar contract deploy \
  --wasm contracts/target/wasm32-unknown-unknown/release/terra_tokenization.wasm \
  --source <TU_CUENTA> \
  --network testnet
```

Luego inicializar:

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source <TU_CUENTA> \
  --network testnet \
  -- init \
  --admin <TU_DIRECCION_PUBLICA>
```

## Nota

Este contrato maneja inventario y balances de tokens por activo. Para transferencias de valor reales, se integra con token contracts/USDC o pasarela de pago y lógica de settlement.
