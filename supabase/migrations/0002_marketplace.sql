create table if not exists public.marketplace_assets (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null check (category in ('cultivo', 'tierra', 'ganaderia')),
  description text not null,
  location text not null,
  price_per_token numeric(18,6) not null check (price_per_token > 0),
  total_tokens integer not null check (total_tokens > 0),
  available_tokens integer not null check (available_tokens >= 0 and available_tokens <= total_tokens),
  expected_yield text not null,
  seller_id uuid not null references public.app_users(id) on delete cascade,
  seller_name text not null,
  image_url text,
  image_urls jsonb,
  video_url text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.marketplace_purchases (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.marketplace_assets(id) on delete cascade,
  buyer_id uuid not null references public.app_users(id) on delete cascade,
  buyer_name text not null,
  seller_id uuid not null references public.app_users(id) on delete cascade,
  quantity integer not null check (quantity > 0),
  price_per_token numeric(18,6) not null check (price_per_token > 0),
  total_paid numeric(18,6) not null check (total_paid > 0),
  purchased_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.marketplace_threads (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.marketplace_assets(id) on delete cascade,
  buyer_id uuid not null references public.app_users(id) on delete cascade,
  buyer_name text not null,
  seller_id uuid not null references public.app_users(id) on delete cascade,
  seller_name text not null,
  updated_at timestamptz not null default timezone('utc', now()),
  unique (asset_id, buyer_id, seller_id)
);

create table if not exists public.marketplace_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.marketplace_threads(id) on delete cascade,
  sender_id uuid not null references public.app_users(id) on delete cascade,
  sender_name text not null,
  sender_role text not null check (sender_role in ('buyer', 'seller')),
  text text not null default '',
  status text not null default 'sent' check (status in ('sending', 'sent', 'read', 'failed')),
  kind text not null default 'text' check (kind in ('text', 'image', 'video', 'audio', 'document')),
  attachment jsonb,
  error_message text,
  read_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_marketplace_assets_created_at on public.marketplace_assets(created_at desc);
create index if not exists idx_marketplace_assets_seller_id on public.marketplace_assets(seller_id);
create index if not exists idx_marketplace_assets_category on public.marketplace_assets(category);

create index if not exists idx_marketplace_purchases_buyer_id on public.marketplace_purchases(buyer_id);
create index if not exists idx_marketplace_purchases_seller_id on public.marketplace_purchases(seller_id);
create index if not exists idx_marketplace_purchases_asset_id on public.marketplace_purchases(asset_id);
create index if not exists idx_marketplace_purchases_purchased_at on public.marketplace_purchases(purchased_at desc);

create index if not exists idx_marketplace_threads_buyer_id on public.marketplace_threads(buyer_id);
create index if not exists idx_marketplace_threads_seller_id on public.marketplace_threads(seller_id);
create index if not exists idx_marketplace_threads_updated_at on public.marketplace_threads(updated_at desc);

create index if not exists idx_marketplace_messages_thread_id on public.marketplace_messages(thread_id);
create index if not exists idx_marketplace_messages_created_at on public.marketplace_messages(created_at);

drop trigger if exists trg_set_updated_at_marketplace_assets on public.marketplace_assets;
create trigger trg_set_updated_at_marketplace_assets
before update on public.marketplace_assets
for each row
execute function public.set_updated_at();
