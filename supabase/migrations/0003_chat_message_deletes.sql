alter table if exists public.marketplace_messages
  add column if not exists deleted_for_everyone boolean not null default false,
  add column if not exists deleted_for_everyone_at timestamptz,
  add column if not exists deleted_for_everyone_by uuid references public.app_users(id) on delete set null,
  add column if not exists deleted_for_user_ids uuid[] not null default '{}';

create index if not exists idx_marketplace_messages_deleted_for_everyone
  on public.marketplace_messages(deleted_for_everyone);
