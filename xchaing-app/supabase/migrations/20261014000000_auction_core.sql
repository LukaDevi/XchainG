-- Review against the live schema before running in the Supabase SQL Editor.
-- This migration does not change existing items or create auction listings.
-- Prices are in GEL. Bids are written only through place_auction_bid().
begin;

do $preflight$
begin
  if to_regclass('public.items') is null then
    raise exception 'Expected public.items to exist';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'items'
      and column_name = 'id' and udt_name = 'uuid'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'items'
      and column_name = 'user_id' and udt_name = 'uuid'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'items'
      and column_name = 'listing_type' and udt_name = 'text'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'items'
      and column_name = 'status' and udt_name = 'text'
  ) then
    raise exception 'public.items differs from the columns expected by the auction migration';
  end if;

  if to_regclass('public.auctions') is not null
     or to_regclass('public.auction_bids') is not null then
    raise exception 'Auction tables already exist; review the live schema before running this migration';
  end if;
end;
$preflight$;

create table public.auctions (
  item_id uuid primary key references public.items(id) on delete cascade,
  starting_price numeric(12, 2) not null
    check (starting_price between 0.01 and 9999999999.99),
  min_increment numeric(12, 2) not null
    check (min_increment between 0.01 and 9999999999.99),
  -- These public counters are the only bid data sent to all auction viewers.
  current_price numeric(12, 2) not null
    check (current_price between 0.01 and 9999999999.99),
  bid_count bigint not null default 0 check (bid_count >= 0),
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint auctions_finite_end check (isfinite(ends_at)),
  constraint auctions_end_after_creation check (ends_at > created_at)
);

create table public.auction_bids (
  id uuid primary key default gen_random_uuid(),
  -- Existing bids prevent item deletion; deleted bidder accounts are anonymized.
  item_id uuid not null references public.auctions(item_id) on delete restrict,
  bidder_id uuid references auth.users(id) on delete set null,
  amount numeric(12, 2) not null check (amount between 0.01 and 9999999999.99),
  created_at timestamptz not null default now()
);

create index auction_bids_item_amount_idx
  on public.auction_bids (item_id, amount desc, created_at desc);
create index auction_bids_bidder_created_idx
  on public.auction_bids (bidder_id, created_at desc);

alter table public.auctions enable row level security;
alter table public.auction_bids enable row level security;

revoke all on public.auctions, public.auction_bids from public, anon, authenticated;
grant select on public.auctions to anon, authenticated;
grant select on public.auction_bids to authenticated;

create policy "Visible auctions can be read"
on public.auctions for select to anon, authenticated
using (
  exists (
    select 1 from public.items as item
    where item.id = auctions.item_id
      and (item.status = 'active' or item.user_id = (select auth.uid()))
  )
);

create policy "Bidders and sellers can read their bids"
on public.auction_bids for select to authenticated
using (
  bidder_id = (select auth.uid())
  or exists (
    select 1 from public.items as item
    where item.id = auction_bids.item_id
      and item.user_id = (select auth.uid())
  )
);

-- Do not add an items UPDATE policy or grant. The live preflight has none.
-- This trigger also protects the invariants if a privileged writer or a future
-- policy updates items. AFTER UPDATE observes the final NEW row after other
-- BEFORE triggers have run. Bid placement locks the item first, so the status
-- check is serialized with bids.
create function public.protect_auction_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if exists (select 1 from public.auctions where item_id = old.id) then
    if new.user_id is distinct from old.user_id
       or new.listing_type is distinct from old.listing_type then
      raise exception 'Auction owner and listing type cannot be changed';
    end if;
    if new.status is distinct from old.status
       and exists (select 1 from public.auction_bids where item_id = old.id) then
      raise exception 'An auction with bids cannot change listing status';
    end if;
  end if;
  return new;
end;
$function$;

revoke execute on function public.protect_auction_item() from public, anon, authenticated;
create trigger protect_auction_item_update
after update on public.items
for each row execute function public.protect_auction_item();

create function public.create_auction(
  p_item_id uuid,
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
  v_owner_id uuid;
  v_listing_type text;
  v_item_status text;
begin
  if v_user_id is null then
    raise exception 'Sign in to create an auction' using errcode = '42501';
  end if;
  if p_item_id is null or p_starting_price is null or p_min_increment is null
     or p_starting_price <= 0 or p_min_increment <= 0
     or p_starting_price > 9999999999.99 or p_min_increment > 9999999999.99
     or p_starting_price::text in ('NaN', 'Infinity', '-Infinity')
     or p_min_increment::text in ('NaN', 'Infinity', '-Infinity')
     or p_starting_price <> round(p_starting_price, 2)
     or p_min_increment <> round(p_min_increment, 2) then
    raise exception 'Auction prices must be finite GEL amounts from 0.01 to 9999999999.99';
  end if;
  if p_ends_at is null or not isfinite(p_ends_at) or p_ends_at <= clock_timestamp() then
    raise exception 'Auction end time must be finite and in the future';
  end if;

  select item.user_id, item.listing_type, item.status
    into v_owner_id, v_listing_type, v_item_status
    from public.items as item
   where item.id = p_item_id
   for update;

  if not found or v_owner_id is distinct from v_user_id then
    raise exception 'Only the listing owner can create its auction' using errcode = '42501';
  end if;
  if v_listing_type is distinct from 'auction' or v_item_status is distinct from 'active' then
    raise exception 'The item must be an active auction listing';
  end if;

  -- The first check may have run before waiting for the item lock.
  if p_ends_at <= clock_timestamp() then
    raise exception 'Auction end time must still be in the future';
  end if;

  insert into public.auctions (item_id, starting_price, min_increment, current_price, ends_at)
  values (p_item_id, p_starting_price, p_min_increment, p_starting_price, p_ends_at);
  return p_item_id;
end;
$function$;

create function public.place_auction_bid(p_item_id uuid, p_amount numeric)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_owner_id uuid;
  v_listing_type text;
  v_item_status text;
  v_auction public.auctions%rowtype;
  v_minimum_bid numeric;
  v_bid_id uuid;
begin
  if v_user_id is null then
    raise exception 'Sign in to bid' using errcode = '42501';
  end if;
  if p_item_id is null or p_amount is null or p_amount <= 0
     or p_amount > 9999999999.99
     or p_amount::text in ('NaN', 'Infinity', '-Infinity')
     or p_amount <> round(p_amount, 2) then
    raise exception 'Bid must be a finite GEL amount from 0.01 to 9999999999.99';
  end if;

  -- Lock the item and auction in the same order as create_auction().
  select item.user_id, item.listing_type, item.status
    into v_owner_id, v_listing_type, v_item_status
    from public.items as item
   where item.id = p_item_id
   for update;
  if not found then
    raise exception 'Auction item not found';
  end if;

  select * into v_auction
    from public.auctions
   where item_id = p_item_id
   for update;
  if not found then
    raise exception 'Auction not found';
  end if;
  if v_owner_id = v_user_id then
    raise exception 'Sellers cannot bid on their own auction' using errcode = '42501';
  end if;
  if v_listing_type is distinct from 'auction'
     or v_item_status is distinct from 'active'
     or v_auction.ends_at <= clock_timestamp() then
    raise exception 'This auction is not accepting bids';
  end if;

  v_minimum_bid := case when v_auction.bid_count = 0 then v_auction.starting_price
                        else v_auction.current_price + v_auction.min_increment end;
  if p_amount < v_minimum_bid then
    raise exception 'Bid is below the current minimum';
  end if;
  if v_auction.ends_at <= clock_timestamp() then
    raise exception 'This auction is not accepting bids';
  end if;

  insert into public.auction_bids (item_id, bidder_id, amount)
  values (p_item_id, v_user_id, p_amount)
  returning id into v_bid_id;

  -- The auction row is locked; both public counters advance atomically with the bid.
  update public.auctions
     set current_price = p_amount,
         bid_count = bid_count + 1
   where item_id = p_item_id;
  return v_bid_id;
end;
$function$;

create function public.get_auction_state(p_item_id uuid)
returns table (
  item_id uuid,
  starting_price numeric,
  min_increment numeric,
  current_price numeric,
  next_minimum_bid numeric,
  bid_count bigint,
  ends_at timestamptz,
  accepting_bids boolean
)
language sql
volatile
security definer
set search_path = ''
as $function$
  select auction.item_id,
         auction.starting_price,
         auction.min_increment,
         auction.current_price,
         case when auction.bid_count = 0 then auction.starting_price
              else auction.current_price + auction.min_increment end,
         auction.bid_count,
         auction.ends_at,
         auction.ends_at > clock_timestamp()
           and (auction.bid_count = 0
                or auction.current_price + auction.min_increment <= 9999999999.99)
    from public.auctions as auction
    join public.items as item on item.id = auction.item_id
   where auction.item_id = p_item_id
     and item.listing_type = 'auction'
     and item.status = 'active';
$function$;

-- Realtime watches the public summary row, never the private auction_bids table.
-- The table SELECT grant and RLS policy above let anonymous viewers receive it.
do $realtime$
begin
  if not exists (
    select 1 from pg_publication
    where pubname = 'supabase_realtime' and pubupdate
  ) then
    raise exception 'Expected supabase_realtime to publish UPDATE events';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'auctions'
  ) then
    alter publication supabase_realtime add table public.auctions;
  end if;
end;
$realtime$;

revoke execute on function public.create_auction(uuid, numeric, numeric, timestamptz) from public, anon, authenticated;
revoke execute on function public.place_auction_bid(uuid, numeric) from public, anon, authenticated;
revoke execute on function public.get_auction_state(uuid) from public, anon, authenticated;
grant execute on function public.create_auction(uuid, numeric, numeric, timestamptz) to authenticated;
grant execute on function public.place_auction_bid(uuid, numeric) to authenticated;
grant execute on function public.get_auction_state(uuid) to anon, authenticated;

commit;
