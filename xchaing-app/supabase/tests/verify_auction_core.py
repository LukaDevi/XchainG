"""Destructive integration checks for auction_core.sql in a fresh LOCAL PostgreSQL DB.

Requires psycopg 3 and AUCTION_TEST_DATABASE_URL. The URL must point to a
loopback PostgreSQL server and the database must be named xchaing_auction_test.
The script refuses a database with existing public tables. It creates test roles,
Supabase auth stubs, fixtures, and runs the migration only in that disposable DB.
Do not point this at Supabase or production.
"""

import os
import threading
import time
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from urllib.parse import unquote, urlparse
from uuid import uuid4

import psycopg


MIGRATION = Path(__file__).resolve().parents[1] / "migrations" / "20261014000000_auction_core.sql"
DB_NAME = "xchaing_auction_test"
SELLER, BIDDER_ONE, BIDDER_TWO = (uuid4() for _ in range(3))
ITEMS = {name: uuid4() for name in ("concurrent", "create_expiry", "bid_expiry", "inactive", "limits")}


def assert_local_test_url(url):
    parsed = urlparse(url)
    if (parsed.scheme not in ("postgres", "postgresql")
            or parsed.hostname not in ("localhost", "127.0.0.1", "::1")
            or unquote(parsed.path.lstrip("/")) != DB_NAME
            or parsed.query or parsed.fragment):
        raise RuntimeError("Use a loopback PostgreSQL URL for the disposable xchaing_auction_test database")


def connect(url, role=None, user=None):
    conn = psycopg.connect(url, autocommit=True)
    if role:
        # Role names are constants in this script, never supplied by users.
        conn.execute(f"set role {role}")
    if user:
        conn.execute("select set_config('request.jwt.claim.sub', %s, false)", (str(user),))
    return conn


def expect_sqlstate(action, state, label):
    try:
        action()
    except psycopg.Error as exc:
        assert exc.sqlstate == state, f"{label}: expected SQLSTATE {state}, got {exc.sqlstate}"
    else:
        raise AssertionError(f"{label}: statement unexpectedly succeeded")


def assert_blocked(admin, pid, label):
    limit = time.monotonic() + 5
    while time.monotonic() < limit:
        blocked = admin.execute(
            "select wait_event_type = 'Lock' and cardinality(pg_blocking_pids(pid)) > 0 "
            "from pg_stat_activity where pid = %s", (pid,)
        ).fetchone()
        if blocked and blocked[0]:
            return
        time.sleep(0.05)
    raise AssertionError(f"{label}: worker did not wait on a PostgreSQL lock")


def start_worker(url, role, user, sql, params):
    ready = threading.Event()
    done = threading.Event()
    result = {}

    def run():
        try:
            with connect(url, role, user) as conn:
                result["pid"] = conn.execute("select pg_backend_pid()").fetchone()[0]
                ready.set()
                result["value"] = conn.execute(sql, params).fetchone()[0]
        except psycopg.Error as exc:
            result["sqlstate"] = exc.sqlstate
        except Exception as exc:
            result["exception"] = exc
        finally:
            done.set()

    worker = threading.Thread(target=run, daemon=True)
    worker.start()
    assert ready.wait(5), "Worker could not connect"
    return worker, done, result


def finish_worker(worker, done, result, label):
    assert done.wait(10), f"{label}: worker did not finish"
    worker.join(timeout=1)
    if "exception" in result:
        raise result["exception"]
    return result


def setup(admin):
    db, superuser = admin.execute(
        "select current_database(), rolsuper from pg_roles where rolname = current_user"
    ).fetchone()
    assert db == DB_NAME and superuser, "A disposable local test database and superuser are required"
    existing = admin.execute(
        "select relname from pg_class where relnamespace = 'public'::regnamespace "
        "and relkind in ('r', 'p', 'v', 'm') limit 1"
    ).fetchone()
    assert existing is None, "Refusing a database with existing public relations"
    assert admin.execute("select to_regclass('auth.users')").fetchone()[0] is None

    for role in ("anon", "authenticated"):
        if not admin.execute("select 1 from pg_roles where rolname = %s", (role,)).fetchone():
            admin.execute(f"create role {role} nologin")
    admin.execute("create schema if not exists auth")
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
        "user_id uuid references auth.users(id), "
        "status text default 'active', "
        "listing_type text not null default 'offer' "
        "check (listing_type in ('offer', 'auction')))"
    )
    admin.execute("alter table public.items enable row level security")
    admin.execute("grant select on public.items to anon, authenticated")
    admin.execute("grant insert, delete on public.items to authenticated")
    admin.execute("create policy items_read on public.items for select to public using (true)")
    admin.execute(
        "create policy items_insert on public.items for insert to public "
        "with check (auth.uid() = user_id or user_id is null)"
    )
    admin.execute(
        "create policy items_delete on public.items for delete to public "
        "using (auth.uid() = user_id)"
    )
    for user in (SELLER, BIDDER_ONE, BIDDER_TWO):
        admin.execute("insert into auth.users (id) values (%s)", (user,))
    for item in ITEMS.values():
        admin.execute(
            "insert into public.items (id, user_id, status, listing_type) "
            "values (%s, %s, 'active', 'auction')", (item, SELLER)
        )
    if not admin.execute(
        "select 1 from pg_publication where pubname = 'supabase_realtime'"
    ).fetchone():
        admin.execute("create publication supabase_realtime")
    admin.execute(MIGRATION.read_text(encoding="utf-8"))


def create_auction(url, item, ends_at, starting="10.00", increment="1.00"):
    with connect(url, "authenticated", SELLER) as seller:
        return seller.execute(
            "select public.create_auction(%s, %s, %s, %s)",
            (item, starting, increment, ends_at),
        ).fetchone()[0]


def assert_counters(admin, item):
    row = admin.execute(
        "select a.starting_price, a.current_price, a.bid_count, "
        "count(b.id), max(b.amount) from public.auctions a "
        "left join public.auction_bids b on b.item_id = a.item_id "
        "where a.item_id = %s group by a.item_id", (item,)
    ).fetchone()
    assert row is not None
    starting, current, count, actual_count, highest = row
    assert count == actual_count, "Public bid count differs from private bids"
    assert current == (highest if highest is not None else starting), "Current price differs from highest bid"
    state = admin.execute("select * from public.get_auction_state(%s)", (item,)).fetchone()
    if state is not None:
        assert state[3] == current and state[5] == count


def verify_permissions_and_rls(url, admin):
    for table, role, privilege, expected in (
        ("public.auctions", "anon", "SELECT", True),
        ("public.auctions", "authenticated", "UPDATE", False),
        ("public.auction_bids", "anon", "SELECT", False),
        ("public.auction_bids", "authenticated", "INSERT", False),
        ("public.items", "authenticated", "UPDATE", False),
    ):
        assert admin.execute(
            "select has_table_privilege(%s, %s, %s)", (role, table, privilege)
        ).fetchone()[0] is expected
    for table in ("auctions", "auction_bids"):
        assert admin.execute(
            "select relrowsecurity from pg_class where oid = %s::regclass",
            (f"public.{table}",),
        ).fetchone()[0]
    assert admin.execute(
        "select 1 from pg_publication_tables where pubname = 'supabase_realtime' "
        "and schemaname = 'public' and tablename = 'auctions'"
    ).fetchone()
    assert not admin.execute(
        "select 1 from pg_publication_tables where pubname = 'supabase_realtime' "
        "and schemaname = 'public' and tablename = 'auction_bids'"
    ).fetchone()
    with connect(url, "anon") as anon:
        assert anon.execute(
            "select count(*) from public.auctions where item_id = %s", (ITEMS["concurrent"],)
        ).fetchone()[0] == 1
        expect_sqlstate(
            lambda: anon.execute("select count(*) from public.auction_bids"),
            "42501", "anonymous private bid read",
        )
    with connect(url, "authenticated", BIDDER_TWO) as other:
        assert other.execute(
            "select count(*) from public.auction_bids where item_id = %s", (ITEMS["concurrent"],)
        ).fetchone()[0] == 0
    with connect(url, "authenticated", SELLER) as seller:
        assert seller.execute(
            "select count(*) from public.auction_bids where item_id = %s", (ITEMS["concurrent"],)
        ).fetchone()[0] == 1
        expect_sqlstate(
            lambda: seller.execute(
                "insert into public.auction_bids (item_id, bidder_id, amount) "
                "values (%s, %s, 99)", (ITEMS["concurrent"], SELLER)
            ), "42501", "direct bid insert",
        )
        expect_sqlstate(
            lambda: seller.execute(
                "update public.auctions set current_price = 99 where item_id = %s",
                (ITEMS["concurrent"],)
            ), "42501", "direct auction update",
        )
        expect_sqlstate(
            lambda: seller.execute(
                "update public.items set status = 'inactive' where id = %s",
                (ITEMS["concurrent"],)
            ), "42501", "items UPDATE without policy or grant",
        )


def verify_concurrent_bids(url, admin):
    item = ITEMS["concurrent"]
    create_auction(url, item, datetime.now(timezone.utc) + timedelta(minutes=5))
    first = connect(url, "authenticated", BIDDER_ONE)
    worker = None
    try:
        first.execute("begin")
        first.execute("select public.place_auction_bid(%s, %s)", (item, "11.00"))
        worker, done, result = start_worker(
            url, "authenticated", BIDDER_TWO,
            "select public.place_auction_bid(%s, %s)", (item, "11.00"),
        )
        assert_blocked(admin, result["pid"], "second concurrent bid")
        first.execute("commit")
        assert finish_worker(worker, done, result, "second concurrent bid").get("sqlstate") == "P0001"
    finally:
        first.execute("rollback")
        first.close()
    assert_counters(admin, item)
    assert admin.execute(
        "select bid_count, current_price from public.auctions where item_id = %s", (item,)
    ).fetchone() == (1, Decimal("11.00"))
    with connect(url, "authenticated", SELLER) as seller:
        expect_sqlstate(
            lambda: seller.execute("select public.place_auction_bid(%s, %s)", (item, "12.00")),
            "42501", "seller bidding on own auction",
        )
    assert_counters(admin, item)


def verify_expiry_while_waiting(url, admin, item, creating):
    deadline = datetime.now(timezone.utc) + timedelta(seconds=8)
    if not creating:
        create_auction(url, item, deadline)
    holder = connect(url)
    try:
        holder.execute("begin")
        holder.execute("select id from public.items where id = %s for update", (item,))
        if creating:
            sql = "select public.create_auction(%s, %s, %s, %s)"
            params = (item, "10.00", "1.00", deadline)
            user = SELLER
        else:
            sql = "select public.place_auction_bid(%s, %s)"
            params = (item, "10.00")
            user = BIDDER_ONE
        worker, done, result = start_worker(url, "authenticated", user, sql, params)
        assert_blocked(admin, result["pid"], "expiry while waiting")
        remaining = (deadline - datetime.now(timezone.utc)).total_seconds()
        assert remaining > 0, "Worker reached the item lock only after deadline"
        time.sleep(remaining + 0.15)
        holder.execute("commit")
        assert finish_worker(worker, done, result, "expiry while waiting").get("sqlstate") == "P0001"
    finally:
        holder.execute("rollback")
        holder.close()
    if creating:
        assert admin.execute(
            "select count(*) from public.auctions where item_id = %s", (item,)
        ).fetchone()[0] == 0
    else:
        assert_counters(admin, item)
        assert admin.execute(
            "select bid_count from public.auctions where item_id = %s", (item,)
        ).fetchone()[0] == 0


def verify_item_changes_and_deletion(url, admin):
    item = ITEMS["concurrent"]
    for column, value in (("user_id", BIDDER_TWO), ("listing_type", "offer"), ("status", "inactive")):
        expect_sqlstate(
            lambda column=column, value=value: admin.execute(
                f"update public.items set {column} = %s where id = %s", (value, item)
            ), "P0001", f"change {column} after a bid",
        )
    with connect(url, "authenticated", SELLER) as seller:
        expect_sqlstate(
            lambda: seller.execute("delete from public.items where id = %s", (item,)),
            "23503", "delete item with bids",
        )
    assert admin.execute("select count(*) from public.items where id = %s", (item,)).fetchone()[0] == 1

    no_bid = ITEMS["inactive"]
    create_auction(url, no_bid, datetime.now(timezone.utc) + timedelta(minutes=5))
    for column, value in (("user_id", BIDDER_TWO), ("listing_type", "offer")):
        expect_sqlstate(
            lambda column=column, value=value: admin.execute(
                f"update public.items set {column} = %s where id = %s", (value, no_bid)
            ), "P0001", f"change {column} before first bid",
        )
    admin.execute("update public.items set status = 'inactive' where id = %s", (no_bid,))
    with connect(url, "anon") as anon:
        assert anon.execute(
            "select count(*) from public.auctions where item_id = %s", (no_bid,)
        ).fetchone()[0] == 0


def verify_numeric_and_deadline_limits(url, admin):
    item = ITEMS["limits"]
    deadline = datetime.now(timezone.utc) + timedelta(minutes=5)
    with connect(url, "authenticated", SELLER) as seller:
        for starting, increment, end in (
            ("10000000000.00", "0.01", deadline),
            ("Infinity", "0.01", deadline),
            ("NaN", "0.01", deadline),
            ("10.00", "10000000000.00", deadline),
            ("10.00", "Infinity", deadline),
            ("10.00", "0.01", "infinity"),
            ("10.00", "0.01", "-infinity"),
        ):
            expect_sqlstate(
                lambda: seller.execute(
                    "select public.create_auction(%s, %s, %s, %s)",
                    (item, starting, increment, end),
                ), "P0001", "auction amount or deadline limit",
            )
    assert admin.execute(
        "select count(*) from public.auctions where item_id = %s", (item,)
    ).fetchone()[0] == 0

    create_auction(url, item, deadline, starting="9999999999.99", increment="0.01")
    with connect(url, "authenticated", BIDDER_ONE) as bidder:
        for amount in ("10000000000.00", "Infinity", "NaN"):
            expect_sqlstate(
                lambda: bidder.execute(
                    "select public.place_auction_bid(%s, %s)", (item, amount)
                ), "P0001", "bid amount limit",
            )
        bidder.execute("select public.place_auction_bid(%s, %s)", (item, "9999999999.99"))
    assert_counters(admin, item)
    state = admin.execute("select * from public.get_auction_state(%s)", (item,)).fetchone()
    assert state[3] == Decimal("9999999999.99") and state[5] == 1
    assert state[7] is False, "An auction at the numeric ceiling cannot accept more bids"


def main():
    url = os.environ.get("AUCTION_TEST_DATABASE_URL", "")
    assert_local_test_url(url)
    with connect(url) as admin:
        setup(admin)
        verify_concurrent_bids(url, admin)
        verify_permissions_and_rls(url, admin)
        verify_expiry_while_waiting(url, admin, ITEMS["create_expiry"], creating=True)
        verify_expiry_while_waiting(url, admin, ITEMS["bid_expiry"], creating=False)
        verify_item_changes_and_deletion(url, admin)
        verify_numeric_and_deadline_limits(url, admin)
    print("Auction migration checks passed in the isolated local PostgreSQL database.")


if __name__ == "__main__":
    main()
