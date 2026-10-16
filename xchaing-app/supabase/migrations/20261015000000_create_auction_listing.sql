-- REVIEW DRAFT ONLY. Do not run until the live postflight has been reviewed.
-- Creates an item and its auction in one database transaction.
-- Image upload is a separate Storage operation, performed before this RPC.
begin;

do $preflight$
begin
  if to_regclass('public.items') is null
     or to_regclass('public.auctions') is null
     or to_regprocedure('public.create_auction(uuid,numeric,numeric,timestamptz)') is null then
    raise exception 'Expected items and the auction_core migration to exist';
  end if;

  if exists (
    select 1
    from (values
      ('id', 'uuid'), ('user_id', 'uuid'),
      ('title', 'text'), ('description', 'text'),
      ('city', 'text'), ('category', 'text'), ('condition', 'text'),
      ('desired_trade', 'text'), ('image_url', 'text'),
      ('status', 'text'), ('listing_type', 'text')
    ) as required(column_name, udt_name)
    left join information_schema.columns as actual
      on actual.table_schema = 'public'
     and actual.table_name = 'items'
     and actual.column_name = required.column_name
     and actual.udt_name = required.udt_name
    where actual.column_name is null
  ) then
    raise exception 'public.items differs from the columns expected by create_auction_listing';
  end if;

  if to_regprocedure('public.create_auction_listing(uuid,text,text,text,text,text,text,text,numeric,numeric,timestamptz)') is not null then
    raise exception 'create_auction_listing already exists; review it before applying this migration';
  end if;
end;
$preflight$;

create function public.create_auction_listing(
  p_item_id uuid,
  p_title text,
  p_description text,
  p_category text,
  p_condition text,
  p_desired_trade text,
  p_city text,
  p_image_url text,
  p_starting_price numeric,
  p_min_increment numeric,
  p_ends_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_item_id uuid;
begin
  if v_user_id is null then
    raise exception 'Sign in to create an auction listing' using errcode = '42501';
  end if;
  if p_item_id is null
     or nullif(btrim(p_title), '') is null
     or nullif(btrim(p_city), '') is null
     or nullif(btrim(p_image_url), '') is null then
    raise exception 'Title, city, and image are required';
  end if;

  insert into public.items (
    id, user_id, title, description, category, condition,
    desired_trade, city, image_url, status, listing_type
  ) values (
    p_item_id, v_user_id, p_title, p_description, p_category, p_condition,
    p_desired_trade, p_city, p_image_url, 'active', 'auction'
  ) returning id into v_item_id;

  -- Any validation or insert error here rolls back the item insert as well.
  perform public.create_auction(
    v_item_id, p_starting_price, p_min_increment, p_ends_at
  );
  return v_item_id;
end;
$function$;

revoke execute on function public.create_auction_listing(
  uuid, text, text, text, text, text, text, text, numeric, numeric, timestamptz
) from public, anon, authenticated;
grant execute on function public.create_auction_listing(
  uuid, text, text, text, text, text, text, text, numeric, numeric, timestamptz
) to authenticated;

commit;
