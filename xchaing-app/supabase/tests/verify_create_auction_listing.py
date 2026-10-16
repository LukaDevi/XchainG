"""Integration checks in a fresh, disposable, loopback-only PostgreSQL database.

The script refuses any database other than xchaing_auction_listing_test and
refuses a database that already has public tables. It never connects to Supabase.
Set AUCTION_LISTING_TEST_DATABASE_URL to a local PostgreSQL URL before running.
"""

import os
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from urllib.parse import unquote, urlparse
from uuid import uuid4

import psycopg


ROOT = Path(__file__).resolve().parents[1]
CORE = ROOT / "migrations" / "20261014000000_auction_core.sql"
LISTING = ROOT / "migrations" / "20261015000000_create_auction_listing.sql"
DB_NAME = "xchaing_auction_listing_test"


def check_test_url(url):
    parsed = urlparse(url)
    if (
        parsed.scheme not in ("postgres", "postgresql")
        or parsed.hostname not in ("localhost", "127.0.0.1", "::1")
        or parsed.port != 55432
        or unquote(parsed.path.lstrip("/")) != DB_NAME
        or parsed.query
        or parsed.fragment
    ):
        raise RuntimeError("Use only the disposable loopback auction listing test database")


def connect(url, role=None, user_id=None):
    connection = psycopg.connect(url, autocommit=True)
    if role is not None:
        assert role in ("anon", "authenticated")
        connection.execute(f"set role {role}")
    if user_id is not None:
        connection.execute(
            "select set_config('request.jwt.claim.sub', %s, false)",
            (str(user_id),),
        )
    return connection


def assert_absent(admin, item_id):
    assert admin.execute(
        "select count(*) from public.items where id = %s", (item_id,)
    ).fetchone()[0] == 0
    assert admin.execute(
        "select count(*) from public.auctions where item_id = %s", (item_id,)
    ).fetchone()[0] == 0


def create_listing(connection, item_id, starting_price="10.00"):
    return connection.execute(
        "select public.create_auction_listing(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
        (
            item_id, "Test item", "Test description", "Electronics", "used",
            None, "Tbilisi", "https://example.invalid/listings/test.jpg",
            starting_price, "1.00", datetime.now(timezone.utc) + timedelta(minutes=5),
        ),
    ).fetchone()[0]


def setup(admin, url):
    database, is_superuser = admin.execute(
        "select current_database(), rolsuper from pg_roles where rolname = current_user"
    ).fetchone()
    assert database == DB_NAME and is_superuser
    assert admin.execute(
        "select count(*) from pg_class where relnamespace = 'public'::regnamespace "
        "and relkind in ('r', 'p', 'v', 'm')"
    ).fetchone()[0] == 0, "Refusing a test database with existing public relations"
    assert admin.execute("select to_regclass('auth.users')").fetchone()[0] is None

    for role in ("anon", "authenticated"):
        if admin.execute(
            "select 1 from pg_roles where rolname = %s", (role,)
        ).fetchone() is None:
            admin.execute(f"create role {role} nologin")

    admin.execute("create schema auth")
    admin.execute("create table auth.users (id uuid primary key)")
    admin.execute(
        "create function auth.uid() returns uuid language sql stable as $$ "
        "select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$"
    )
    admin.execute("grant usage on schema public, auth to anon, authenticated")
    admin.execute("grant execute on function auth.uid() to anon, authenticated")
    admin.execute(
        "create table public.items ("
        "id uuid primary key default gen_random_uuid(), "
        "created_at timestamptz not null default timezone('utc', now()), "
        "title text not null, description text, category text, condition text, "
        "estimated_value_min numeric, estimated_value_max numeric, "
        "user_id uuid references auth.users(id), desired_trade text, image_url text, "
        "images text[], status text default 'active', views integer default 0, "
        "estimated_value text, city text check (city is null or length(trim(city)) > 0), "
        "listing_type text not null default 'offer' "
        "check (listing_type in ('offer', 'auction')))"
    )
    admin.execute("alter table public.items enable row level security")
    admin.execute("grant select on public.items to anon, authenticated")
    admin.execute("grant insert, update, delete on public.items to authenticated")
    admin.execute("create policy items_read on public.items for select to public using (true)")
    admin.execute(
        "create policy items_insert on public.items for insert to public "
        "with check (auth.uid() = user_id or user_id is null)"
    )
    admin.execute(
        "create policy items_delete on public.items for delete to public "
        "using (auth.uid() = user_id)"
    )
    seller, other = uuid4(), uuid4()
    admin.execute("insert into auth.users (id) values (%s), (%s)", (seller, other))
    admin.execute("create publication supabase_realtime")
    admin.execute(CORE.read_text(encoding="utf-8"))
    admin.execute(LISTING.read_text(encoding="utf-8"))
    assert admin.execute(
        "select has_function_privilege('authenticated', "
        "'public.create_auction_listing(uuid,text,text,text,text,text,text,text,numeric,numeric,timestamptz)', "
        "'EXECUTE')"
    ).fetchone()[0]
    assert not admin.execute(
        "select has_function_privilege('anon', "
        "'public.create_auction_listing(uuid,text,text,text,text,text,text,text,numeric,numeric,timestamptz)', "
        "'EXECUTE')"
    ).fetchone()[0]
    return seller, other


def main():
    url = os.environ.get("AUCTION_LISTING_TEST_DATABASE_URL", "")
    check_test_url(url)
    with connect(url) as admin:
        seller, other = setup(admin, url)

        successful_item = uuid4()
        with connect(url, "authenticated", seller) as caller:
            assert create_listing(caller, successful_item) == successful_item
        item = admin.execute(
            "select user_id, listing_type, status, city, title from public.items where id = %s",
            (successful_item,),
        ).fetchone()
        auction = admin.execute(
            "select starting_price, min_increment, current_price, bid_count "
            "from public.auctions where item_id = %s", (successful_item,)
        ).fetchone()
        assert item == (seller, "auction", "active", "Tbilisi", "Test item")
        assert auction == (Decimal("10.00"), Decimal("1.00"), Decimal("10.00"), 0)
        print("PASS: authenticated success creates the item and auction together")

        failed_item = uuid4()
        with connect(url, "authenticated", seller) as caller:
            try:
                create_listing(caller, failed_item, starting_price="0.00")
            except psycopg.Error as error:
                assert error.sqlstate == "P0001"
                assert "Auction prices must be finite" in str(error)
            else:
                raise AssertionError("Invalid auction price unexpectedly succeeded")
        assert_absent(admin, failed_item)
        print("PASS: create_auction failure rolls back both rows")

        anonymous_item = uuid4()
        with connect(url, "anon") as caller:
            try:
                create_listing(caller, anonymous_item)
            except psycopg.Error as error:
                assert error.sqlstate == "42501"
            else:
                raise AssertionError("Anonymous creation unexpectedly succeeded")
        assert_absent(admin, anonymous_item)

        no_claim_item = uuid4()
        with connect(url, "authenticated") as caller:
            try:
                create_listing(caller, no_claim_item)
            except psycopg.Error as error:
                assert error.sqlstate == "42501"
            else:
                raise AssertionError("Creation without auth.uid unexpectedly succeeded")
        assert_absent(admin, no_claim_item)
        print("PASS: anonymous and missing-auth.uid calls are blocked")

        other_item = uuid4()
        with connect(url, "authenticated", other) as caller:
            assert create_listing(caller, other_item) == other_item
        assert admin.execute(
            "select user_id from public.items where id = %s", (other_item,)
        ).fetchone()[0] == other
        assert admin.execute(
            "select count(*) from public.auctions where item_id = %s", (other_item,)
        ).fetchone()[0] == 1
        print("PASS: the owner comes from the caller's auth.uid()")

    print("All create_auction_listing checks passed in isolated local PostgreSQL.")


if __name__ == "__main__":
    main()
