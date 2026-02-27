alter table if exists public.app_users
  add column if not exists app_role text not null default 'user' check (app_role in ('user', 'dev', 'admin')),
  add column if not exists buyer_verification_status text not null default 'unverified' check (buyer_verification_status in ('unverified', 'verified'));

update public.app_users
set app_role = case
  when upper(stellar_public_key) = 'GDQM3R3UTY7M4QJGNANWZ4QXQYADQCMM65FZFAD3Y6Y7UOCKFYNFDI3J' then 'admin'
  when app_role = 'admin' then 'user'
  else app_role
end;

create unique index if not exists idx_app_users_single_admin_owner
  on public.app_users ((1))
  where app_role = 'admin';
