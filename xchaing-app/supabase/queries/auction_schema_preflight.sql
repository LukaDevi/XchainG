-- Read-only inspection for the existing XchainG project.
-- Run this first in the Supabase SQL Editor and review the single JSON result.
select jsonb_build_object(
  'relevant_columns', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'table', table_name,
      'column', column_name,
      'type', data_type,
      'nullable', is_nullable,
      'default', column_default
    ) order by table_name, ordinal_position), '[]'::jsonb)
    from information_schema.columns
    where table_schema = 'public'
      and (
        (table_name = 'items' and column_name in ('id', 'user_id', 'listing_type', 'status'))
        or table_name in ('auctions', 'auction_bids')
      )
  ),
  'relevant_constraints', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'table', t.relname,
      'name', c.conname,
      'definition', pg_get_constraintdef(c.oid)
    ) order by t.relname, c.conname), '[]'::jsonb)
    from pg_constraint as c
    join pg_class as t on t.oid = c.conrelid
    where t.relnamespace = 'public'::regnamespace
      and t.relname in ('items', 'auctions', 'auction_bids')
  ),
  'relevant_rls', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'table', relname,
      'enabled', relrowsecurity,
      'forced', relforcerowsecurity
    ) order by relname), '[]'::jsonb)
    from pg_class
    where relnamespace = 'public'::regnamespace
      and relname in ('items', 'auctions', 'auction_bids')
      and relkind in ('r', 'p')
  ),
  'relevant_policies', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'table', tablename,
      'name', policyname,
      'command', cmd,
      'roles', roles,
      'using', qual,
      'check', with_check
    ) order by tablename, policyname), '[]'::jsonb)
    from pg_policies
    where schemaname = 'public'
      and tablename in ('items', 'auctions', 'auction_bids')
  ),
  'existing_auction_tables', (
    select coalesce(jsonb_agg(relname order by relname), '[]'::jsonb)
    from pg_class
    where relnamespace = 'public'::regnamespace
      and relname in ('auctions', 'auction_bids')
      and relkind in ('r', 'p')
  ),
  'existing_auction_functions', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'name', proname,
      'arguments', pg_get_function_identity_arguments(p.oid)
    ) order by proname), '[]'::jsonb)
    from pg_proc as p
    where pronamespace = 'public'::regnamespace
      and proname in ('create_auction', 'place_auction_bid', 'get_auction_state')
  )
) as auction_schema_preflight;
