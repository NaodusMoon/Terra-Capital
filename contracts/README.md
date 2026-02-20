# Terra Capital Soroban Contracts

Arquitectura on-chain con dos contratos anidados por `cross-contract`:

- `terra_tokenization`: inventario y balances de tokens por activo.
- `terra_marketplace`: compra, reparto de fondos, comision de plataforma y llamada cross-contract a tokenizacion.

## Objetivo de negocio cubierto

- Terra Capital actua como intermediario y cobra comision.
- Terra Capital no es duena de los tokens del activo.
- El comprador compra desde su wallet y el pago se distribuye en la misma transaccion:
  - monto neto al vendedor,
  - comision a tesoreria,
  - porcion opcional de comision a destino de liquidez (ej. estrategia Blend).

## Flujo de compra

1. Comprador invoca `terra_marketplace.buy_tokens(...)` con su wallet.
2. Marketplace calcula total + comision.
3. Marketplace transfiere token de pago desde comprador hacia vendedor/tesoreria.
4. Marketplace autoriza subinvocacion y ejecuta `terra_tokenization.execute_sale(...)`.
5. Tokenizacion descuenta inventario y acredita balance de tokens al comprador.

Todo es atomico: si falla una parte, revierte toda la operacion.

## Contratos

- `contracts/terra_tokenization/src/lib.rs`
- `contracts/terra_marketplace/src/lib.rs`

## Funciones principales

### Tokenizacion

- `init(admin)`
- `set_marketplace(marketplace)`
- `create_asset(seller, category, title, price_per_token, total_tokens)`
- `execute_sale(seller, buyer, asset_id, quantity)` (solo via marketplace autorizado)
- `get_asset(asset_id)`
- `list_assets(from_id, limit)`
- `get_buyer_balance(asset_id, buyer)`
- `set_asset_active(seller, asset_id, active)`

### Marketplace

- `init(admin, tokenization_contract, payment_token, treasury, fee_bps)`
- `set_fee_config(treasury, fee_bps)`
- `set_payment_token(payment_token)`
- `set_network_payment_token(network, payment_token)` con `network = testnet | mainnet`
- `set_active_network(network)`
- `get_active_network()`
- `get_network_payment_token(network)`
- `set_liquidity_config(destination, share_bps)`
- `preview_purchase(asset_id, quantity)`
- `buy_tokens(buyer, asset_id, quantity)`

## Build

```bash
cd contracts
cargo build --release --target wasm32-unknown-unknown
```

WASM:

- `contracts/target/wasm32-unknown-unknown/release/terra_tokenization.wasm`
- `contracts/target/wasm32-unknown-unknown/release/terra_marketplace.wasm`

## Deploy sugerido (testnet y mainnet con USDT)

1. Deploy tokenizacion.
2. Inicializar tokenizacion.
3. Deploy marketplace.
4. Inicializar marketplace con:
   - contrato tokenizacion,
   - token de pago USDT (asset contract),
   - direccion tesoreria de comisiones,
   - `fee_bps` (ej. 300 = 3%).
5. Configurar mapping de red:
   - `set_network_payment_token("testnet", <USDT_TESTNET>)`
   - `set_network_payment_token("mainnet", <USDT_MAINNET>)`
   - `set_active_network("<red_objetivo>")`
6. En tokenizacion, setear `set_marketplace(<marketplace_contract_id>)`.
7. Opcional: configurar destino de liquidez con `set_liquidity_config`.

Usa `contracts/deploy-config.example.json` como plantilla para separar direcciones por red.

## Nota Blend

Blend no se invoca directamente en este contrato para evitar acoplamiento fuerte.
Se deja un destino de liquidez configurable para enrutar una parte de la comision
hacia una wallet/contrato de estrategia de liquidez (incluyendo una implementacion
off-chain/on-chain conectada a Blend).
