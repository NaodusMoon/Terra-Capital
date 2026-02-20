alter table public.marketplace_assets
  add column if not exists token_price_sats bigint,
  add column if not exists cycle_duration_days integer,
  add column if not exists lifecycle_status text,
  add column if not exists cycle_start_at timestamptz,
  add column if not exists cycle_end_at timestamptz,
  add column if not exists estimated_apy_bps integer,
  add column if not exists historical_roi_bps integer,
  add column if not exists proof_of_asset_hash text,
  add column if not exists audit_hash text,
  add column if not exists health_score text,
  add column if not exists current_yield_accrued_sats bigint,
  add column if not exists net_profit_sats bigint,
  add column if not exists final_payout_sats bigint,
  add column if not exists snapshot_locked_at timestamptz;

update public.marketplace_assets
set
  token_price_sats = coalesce(token_price_sats, greatest(1, round(price_per_token)::bigint)),
  cycle_duration_days = coalesce(cycle_duration_days, 30),
  lifecycle_status = coalesce(lifecycle_status, 'FUNDING'),
  cycle_end_at = coalesce(cycle_end_at, created_at + interval '30 days'),
  estimated_apy_bps = coalesce(estimated_apy_bps, 1050),
  historical_roi_bps = coalesce(historical_roi_bps, 1050),
  proof_of_asset_hash = coalesce(proof_of_asset_hash, encode(gen_random_bytes(16), 'hex')),
  health_score = coalesce(health_score, 'Optimal'),
  current_yield_accrued_sats = coalesce(current_yield_accrued_sats, 0);

alter table public.marketplace_assets
  alter column token_price_sats set not null,
  alter column token_price_sats set default 10000,
  alter column cycle_duration_days set not null,
  alter column cycle_duration_days set default 30,
  alter column lifecycle_status set not null,
  alter column lifecycle_status set default 'FUNDING',
  alter column cycle_end_at set not null,
  alter column estimated_apy_bps set not null,
  alter column estimated_apy_bps set default 1050,
  alter column historical_roi_bps set not null,
  alter column historical_roi_bps set default 1050,
  alter column proof_of_asset_hash set not null,
  alter column health_score set not null,
  alter column health_score set default 'Optimal',
  alter column current_yield_accrued_sats set not null,
  alter column current_yield_accrued_sats set default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'marketplace_assets_token_price_sats_check') then
    alter table public.marketplace_assets add constraint marketplace_assets_token_price_sats_check check (token_price_sats > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'marketplace_assets_cycle_duration_days_check') then
    alter table public.marketplace_assets add constraint marketplace_assets_cycle_duration_days_check check (cycle_duration_days in (30, 60, 90));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'marketplace_assets_lifecycle_status_check') then
    alter table public.marketplace_assets add constraint marketplace_assets_lifecycle_status_check check (lifecycle_status in ('FUNDING', 'OPERATING', 'SETTLED'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'marketplace_assets_health_score_check') then
    alter table public.marketplace_assets add constraint marketplace_assets_health_score_check check (health_score in ('Optimal', 'Warning', 'Critical'));
  end if;
end $$;

create index if not exists idx_marketplace_assets_lifecycle_status on public.marketplace_assets(lifecycle_status);
create index if not exists idx_marketplace_assets_cycle_end_at on public.marketplace_assets(cycle_end_at);
