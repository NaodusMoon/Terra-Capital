alter table public.marketplace_assets
  add column if not exists media_gallery jsonb;

update public.marketplace_assets
set media_gallery = coalesce(
  media_gallery,
  (
    case
      when image_url is not null then jsonb_build_array(jsonb_build_object('id', encode(gen_random_bytes(8), 'hex'), 'kind', 'image', 'url', image_url))
      else '[]'::jsonb
    end
  )
  || coalesce(
    (
      select jsonb_agg(jsonb_build_object('id', encode(gen_random_bytes(8), 'hex'), 'kind', 'image', 'url', value))
      from jsonb_array_elements_text(coalesce(image_urls, '[]'::jsonb)) as value
    ),
    '[]'::jsonb
  )
  || (
    case
      when video_url is not null then jsonb_build_array(jsonb_build_object('id', encode(gen_random_bytes(8), 'hex'), 'kind', 'video', 'url', video_url))
      else '[]'::jsonb
    end
  )
)
where media_gallery is null;

alter table public.marketplace_assets
  alter column media_gallery set not null,
  alter column media_gallery set default '[]'::jsonb;
