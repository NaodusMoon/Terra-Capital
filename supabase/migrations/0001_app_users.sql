create extension if not exists pgcrypto;

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  organization text,
  stellar_public_key text not null unique,
  seller_verification_status text not null default 'unverified' check (seller_verification_status in ('unverified', 'pending', 'verified')),
  seller_verification_data jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_app_users_stellar_public_key on public.app_users(stellar_public_key);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_set_updated_at_app_users on public.app_users;
create trigger trg_set_updated_at_app_users
before update on public.app_users
for each row
execute function public.set_updated_at();
