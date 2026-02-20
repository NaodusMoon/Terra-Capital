alter table public.marketplace_assets
  alter column token_price_sats type numeric(18,6) using token_price_sats::numeric;

alter table public.marketplace_assets
  alter column current_yield_accrued_sats type numeric(18,6) using current_yield_accrued_sats::numeric,
  alter column net_profit_sats type numeric(18,6) using net_profit_sats::numeric,
  alter column final_payout_sats type numeric(18,6) using final_payout_sats::numeric;
