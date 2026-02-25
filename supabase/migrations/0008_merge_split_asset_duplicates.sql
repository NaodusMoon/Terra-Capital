begin;

create temp table _asset_merge_members on commit drop as
with assets_norm as (
  select
    a.*,
    (
      a.image_url is not null
      or exists (
        select 1
        from jsonb_array_elements_text(coalesce(a.image_urls, '[]'::jsonb)) as img(value)
        where nullif(trim(img.value), '') is not null
      )
      or exists (
        select 1
        from jsonb_array_elements(coalesce(a.media_gallery, '[]'::jsonb)) as mg(value)
        where mg.value->>'kind' = 'image'
          and nullif(trim(mg.value->>'url'), '') is not null
      )
    ) as has_image,
    (
      a.video_url is not null
      or exists (
        select 1
        from jsonb_array_elements(coalesce(a.media_gallery, '[]'::jsonb)) as mg(value)
        where mg.value->>'kind' = 'video'
          and nullif(trim(mg.value->>'url'), '') is not null
      )
    ) as has_video
  from public.marketplace_assets a
),
duplicate_groups as (
  select
    seller_id,
    title,
    category,
    description,
    location,
    price_per_token,
    total_tokens,
    expected_yield,
    token_price_sats,
    cycle_duration_days,
    estimated_apy_bps,
    historical_roi_bps,
    lifecycle_status
  from assets_norm
  group by
    seller_id,
    title,
    category,
    description,
    location,
    price_per_token,
    total_tokens,
    expected_yield,
    token_price_sats,
    cycle_duration_days,
    estimated_apy_bps,
    historical_roi_bps,
    lifecycle_status
  having
    count(*) > 1
    and max(created_at) - min(created_at) <= interval '24 hours'
    and bool_or(has_image)
    and bool_or(has_video)
),
scored as (
  select
    a.id as asset_id,
    a.seller_id,
    a.title,
    a.category,
    a.description,
    a.location,
    a.price_per_token,
    a.total_tokens,
    a.expected_yield,
    a.token_price_sats,
    a.cycle_duration_days,
    a.estimated_apy_bps,
    a.historical_roi_bps,
    a.lifecycle_status,
    a.created_at,
    a.has_image,
    a.has_video,
    row_number() over (
      partition by
        a.seller_id,
        a.title,
        a.category,
        a.description,
        a.location,
        a.price_per_token,
        a.total_tokens,
        a.expected_yield,
        a.token_price_sats,
        a.cycle_duration_days,
        a.estimated_apy_bps,
        a.historical_roi_bps,
        a.lifecycle_status
      order by
        (case when a.has_image then 1 else 0 end + case when a.has_video then 1 else 0 end) desc,
        a.created_at desc,
        a.id desc
    ) as rn
  from assets_norm a
  inner join duplicate_groups g
    on g.seller_id = a.seller_id
   and g.title = a.title
   and g.category = a.category
   and g.description = a.description
   and g.location = a.location
   and g.price_per_token = a.price_per_token
   and g.total_tokens = a.total_tokens
   and g.expected_yield = a.expected_yield
   and g.token_price_sats = a.token_price_sats
   and g.cycle_duration_days = a.cycle_duration_days
   and g.estimated_apy_bps = a.estimated_apy_bps
   and g.historical_roi_bps = a.historical_roi_bps
   and g.lifecycle_status = a.lifecycle_status
),
keepers as (
  select
    seller_id,
    title,
    category,
    description,
    location,
    price_per_token,
    total_tokens,
    expected_yield,
    token_price_sats,
    cycle_duration_days,
    estimated_apy_bps,
    historical_roi_bps,
    lifecycle_status,
    asset_id as keep_id
  from scored
  where rn = 1
)
select
  s.asset_id,
  k.keep_id
from scored s
inner join keepers k
  on k.seller_id = s.seller_id
 and k.title = s.title
 and k.category = s.category
 and k.description = s.description
 and k.location = s.location
 and k.price_per_token = s.price_per_token
 and k.total_tokens = s.total_tokens
 and k.expected_yield = s.expected_yield
 and k.token_price_sats = s.token_price_sats
 and k.cycle_duration_days = s.cycle_duration_days
 and k.estimated_apy_bps = s.estimated_apy_bps
 and k.historical_roi_bps = s.historical_roi_bps
 and k.lifecycle_status = s.lifecycle_status;

create temp table _asset_dedupe_map on commit drop as
select asset_id as old_id, keep_id
from _asset_merge_members
where asset_id <> keep_id;

with merged_media as (
  with media_rows as (
    select m.keep_id, 'image'::text as kind, nullif(trim(a.image_url), '') as url
    from _asset_merge_members m
    join public.marketplace_assets a on a.id = m.asset_id
    union all
    select m.keep_id, 'video'::text as kind, nullif(trim(a.video_url), '') as url
    from _asset_merge_members m
    join public.marketplace_assets a on a.id = m.asset_id
    union all
    select m.keep_id, 'image'::text as kind, nullif(trim(img.value), '') as url
    from _asset_merge_members m
    join public.marketplace_assets a on a.id = m.asset_id
    cross join lateral jsonb_array_elements_text(coalesce(a.image_urls, '[]'::jsonb)) as img(value)
    union all
    select
      m.keep_id,
      case when mg.value->>'kind' in ('image', 'video') then mg.value->>'kind' else null end as kind,
      nullif(trim(mg.value->>'url'), '') as url
    from _asset_merge_members m
    join public.marketplace_assets a on a.id = m.asset_id
    cross join lateral jsonb_array_elements(coalesce(a.media_gallery, '[]'::jsonb)) as mg(value)
  ),
  media_clean as (
    select distinct keep_id, kind, url
    from media_rows
    where kind in ('image', 'video') and url is not null
  )
  select
    keep_id,
    min(url) filter (where kind = 'image') as merged_image_url,
    min(url) filter (where kind = 'video') as merged_video_url,
    coalesce(jsonb_agg(url order by url) filter (where kind = 'image'), '[]'::jsonb) as merged_image_urls,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', substring(md5(keep_id::text || '|' || kind || '|' || url) from 1 for 16),
          'kind', kind,
          'url', url
        )
        order by case when kind = 'image' then 0 else 1 end, url
      ),
      '[]'::jsonb
    ) as merged_gallery
  from media_clean
  group by keep_id
)
update public.marketplace_assets a
set
  image_url = coalesce(mm.merged_image_url, a.image_url),
  video_url = coalesce(mm.merged_video_url, a.video_url),
  image_urls = mm.merged_image_urls,
  media_gallery = mm.merged_gallery,
  updated_at = timezone('utc', now())
from merged_media mm
where a.id = mm.keep_id;

update public.marketplace_purchases p
set asset_id = m.keep_id
from _asset_dedupe_map m
where p.asset_id = m.old_id;

insert into public.marketplace_threads (
  id, asset_id, buyer_id, buyer_name, seller_id, seller_name, updated_at
)
select
  gen_random_uuid(),
  m.keep_id,
  t.buyer_id,
  t.buyer_name,
  t.seller_id,
  t.seller_name,
  t.updated_at
from public.marketplace_threads t
join _asset_dedupe_map m on m.old_id = t.asset_id
on conflict (asset_id, buyer_id, seller_id)
do update
set
  buyer_name = excluded.buyer_name,
  seller_name = excluded.seller_name,
  updated_at = greatest(public.marketplace_threads.updated_at, excluded.updated_at);

create temp table _thread_rewrite_map on commit drop as
select
  t_old.id as old_thread_id,
  t_new.id as new_thread_id
from public.marketplace_threads t_old
join _asset_dedupe_map m on m.old_id = t_old.asset_id
join public.marketplace_threads t_new
  on t_new.asset_id = m.keep_id
 and t_new.buyer_id = t_old.buyer_id
 and t_new.seller_id = t_old.seller_id;

update public.marketplace_messages msg
set thread_id = rm.new_thread_id
from _thread_rewrite_map rm
where msg.thread_id = rm.old_thread_id
  and rm.old_thread_id <> rm.new_thread_id;

delete from public.marketplace_threads t
using _thread_rewrite_map rm
where t.id = rm.old_thread_id
  and rm.old_thread_id <> rm.new_thread_id;

delete from public.marketplace_assets a
using _asset_dedupe_map m
where a.id = m.old_id;

update public.marketplace_assets a
set
  available_tokens = greatest(
    0,
    least(
      a.total_tokens,
      a.total_tokens - coalesce(s.sold_tokens, 0)
    )
  ),
  updated_at = timezone('utc', now())
from (
  select asset_id, coalesce(sum(quantity), 0)::integer as sold_tokens
  from public.marketplace_purchases
  group by asset_id
) s
where a.id = s.asset_id
  and exists (
    select 1
    from _asset_merge_members mm
    where mm.keep_id = a.id
  );

update public.marketplace_assets a
set
  available_tokens = a.total_tokens,
  updated_at = timezone('utc', now())
where exists (
  select 1
  from _asset_merge_members mm
  where mm.keep_id = a.id
)
and not exists (
  select 1
  from public.marketplace_purchases p
  where p.asset_id = a.id
);

commit;
