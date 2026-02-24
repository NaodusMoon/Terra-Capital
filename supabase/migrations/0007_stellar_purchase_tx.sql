alter table if exists public.marketplace_purchases
  add column if not exists stellar_network text check (stellar_network in ('testnet', 'public')),
  add column if not exists stellar_tx_hash text,
  add column if not exists stellar_source text,
  add column if not exists stellar_destination text;

create unique index if not exists idx_marketplace_purchases_stellar_tx_hash
  on public.marketplace_purchases(stellar_tx_hash)
  where stellar_tx_hash is not null;
