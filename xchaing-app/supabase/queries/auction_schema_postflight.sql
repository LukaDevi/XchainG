-- Read-only postflight for the existing XchainG project.
-- Run once in the Supabase SQL Editor; it returns one JSON value.
-- items columns are included to review the next atomic listing RPC.
select jsonb_build_object(
  'tables', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'name', c.relname,
      'kind', c.relkind,
      'rls_enabled', c.relrowsecurity,
      'rls_forced', c.relforcerowsecurity
    ) order by c.relname), '[]'::jsonb)
    from pg_class as c
    where c.relnamespace = 'public'::regnamespace
      and c.relname in ('items', 'auctions', 'auction_bids')
      and c.relkind in ('r', 'p')
  ),
  'columns', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'table', table_name,
      'column', column_name,
      'type', udt_name,
      'nullable', is_nullable,
      'default', column_default
    ) order by table_name, ordinal_position), '[]'::jsonb)
    from information_schema.columns
    where table_schema = 'public'
      and table_name in ('items', 'auctions', 'auction_bids')
  ),
  'constraints', (
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
  'policies', (
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
  'functions', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'name', p.proname,
      'arguments', pg_get_function_identity_arguments(p.oid),
      'returns', pg_get_function_result(p.oid),
      'security_definer', p.prosecdef,
      'volatility', p.provolatile,
      'settings', p.proconfig,
      'anon_execute', has_function_privilege('anon', p.oid, 'EXECUTE'),
      'authenticated_execute', has_function_privilege('authenticated', p.oid, 'EXECUTE')
    ) order by p.proname, pg_get_function_identity_arguments(p.oid)), '[]'::jsonb)
    from pg_proc as p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in (
        'create_auction', 'place_auction_bid',
        'get_auction_state', 'protect_auction_item'
      )
  ),
  'triggers', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'table', c.relname,
      'name', t.tgname,
      'enabled', t.tgenabled,
      'definition', pg_get_triggerdef(t.oid),
      'function', t.tgfoid::regprocedure::text
    ) order by c.relname, t.tgname), '[]'::jsonb)
    from pg_trigger as t
    join pg_class as c on c.oid = t.tgrelid
    where c.relnamespace = 'public'::regnamespace
      and c.relname in ('items', 'auctions', 'auction_bids')
      and not t.tgisinternal
  ),
  'table_privileges', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'table', c.relname,
      'anon_select', has_table_privilege('anon', c.oid, 'SELECT'),
      'authenticated_select', has_table_privilege('authenticated', c.oid, 'SELECT'),
      'authenticated_insert', has_table_privilege('authenticated', c.oid, 'INSERT'),
      'authenticated_update', has_table_privilege('authenticated', c.oid, 'UPDATE'),
      'authenticated_delete', has_table_privilege('authenticated', c.oid, 'DELETE')
    ) order by c.relname), '[]'::jsonb)
    from pg_class as c
    where c.relnamespace = 'public'::regnamespace
      and c.relname in ('items', 'auctions', 'auction_bids')
      and c.relkind in ('r', 'p')
  ),
  'realtime', jsonb_build_object(
    'publication_exists', exists (
      select 1 from pg_publication where pubname = 'supabase_realtime'
    ),
    'publishes_updates', exists (
      select 1 from pg_publication
      where pubname = 'supabase_realtime' and pubupdate
    ),
    'auctions_published', exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public' and tablename = 'auctions'
    ),
    'auction_bids_published', exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public' and tablename = 'auction_bids'
    )
  )
) as auction_schema_postflight;
