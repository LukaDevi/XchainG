import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { auctionAmounts, publishListingAttempt as publish, toUtcAuctionDeadline } from "./listingCreation.js";

const publishListingAttempt = (client, attempt) => publish(client, attempt, { remember: () => true, forget: () => {} });

const ITEM_ID = "123e4567-e89b-42d3-a456-426614174000";
const USER_ID = "123e4567-e89b-42d3-a456-426614174001";

function attempt(listingType = "auction") {
  return {
    itemId: ITEM_ID,
    userId: USER_ID,
    listingType,
    title: "Test item",
    city: "tbilisi",
    category: "Electronics",
    condition: "used",
    desiredTrade: "A bicycle",
    description: "Good condition",
    startingPrice: "10.00",
    minIncrement: "1.00",
    endsAt: "2026-12-01T12:00:00.000Z",
    photoBlob: new Blob(["photo"]),
    filePath: `${USER_ID}/${ITEM_ID}.jpg`,
    uploaded: false,
    uncertain: false,
  };
}

function fakeClient({ write, item = null, auction = null } = {}) {
  const calls = { uploads: [], removes: [], writes: [], lookups: [] };
  const bucket = {
    async upload(path) { calls.uploads.push(path); return { error: null }; },
    async info() { return { data: null, error: { message: "missing" } }; },
    async remove(paths) { calls.removes.push(paths); return { error: null }; },
    getPublicUrl(path) { return { data: { publicUrl: `https://example.invalid/${path}` } }; },
  };
  const client = {
    storage: { from(name) { assert.equal(name, "listings"); return bucket; } },
    async rpc(name, args) {
      calls.writes.push({ name, args });
      return write?.(name, args) ?? { data: ITEM_ID, error: null };
    },
    from(table) {
      return {
        insert(payload) {
          calls.writes.push({ name: `insert:${table}`, args: payload });
          return write?.(`insert:${table}`, payload) ?? { error: null };
        },
        select() {
          return {
            eq(_column, id) {
              calls.lookups.push({ table, id });
              return {
                async maybeSingle() {
                  return { data: table === "items" ? item : auction, error: null };
                },
              };
            },
          };
        },
      };
    },
  };
  return { client, calls, bucket };
}

test("local auction time is converted to an absolute UTC timestamp", () => {
  const local = "2026-12-01T15:30";
  assert.equal(toUtcAuctionDeadline(local, new Date("2026-01-01T00:00:00Z")), new Date(local).toISOString());
  assert.throws(() => toUtcAuctionDeadline("2026-02-30T10:00"), TypeError);
  assert.throws(() => toUtcAuctionDeadline("2020-01-01T10:00"), TypeError);
  const moduleUrl = new URL("./listingCreation.js", import.meta.url).href;
  const child = spawnSync(process.execPath, ["--input-type=module", "-e",
    `import { toUtcAuctionDeadline } from ${JSON.stringify(moduleUrl)}; console.log(toUtcAuctionDeadline('2026-12-01T15:30', new Date('2026-01-01T00:00:00Z')));`,
  ], { encoding: "utf8", env: { ...process.env, TZ: "Asia/Tbilisi" } });
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout.trim(), "2026-12-01T11:30:00.000Z");
});

test("GEL amounts reject invalid precision and upper-bound overflow", () => {
  assert.deepEqual(auctionAmounts("10.25", "0.01"), { startingPrice: "10.25", minIncrement: "0.01" });
  for (const price of ["0", "1.001", "Infinity", "10000000000.00"]) {
    assert.throws(() => auctionAmounts(price, "1.00"), TypeError);
  }
});

test("auction creation uses only the atomic RPC with a stable item ID", async () => {
  const { client, calls } = fakeClient();
  const result = await publishListingAttempt(client, attempt());
  assert.deepEqual(result, { status: "created", itemId: ITEM_ID });
  assert.equal(calls.uploads.length, 1);
  assert.deepEqual(calls.writes.map(({ name }) => name), ["create_auction_listing"]);
  assert.equal(calls.writes[0].args.p_item_id, ITEM_ID);
  assert.equal(calls.writes[0].args.p_starting_price, "10.00");
  assert.equal(calls.writes[0].args.p_ends_at, "2026-12-01T12:00:00.000Z");
});

test("definite RPC rejection removes the photo only after confirming no item exists", async () => {
  const { client, calls } = fakeClient({
    write: () => ({ data: null, error: { code: "P0001" } }),
  });
  const result = await publishListingAttempt(client, attempt());
  assert.deepEqual(result, { status: "rejected", photoRemoved: true });
  assert.deepEqual(calls.removes, [[`${USER_ID}/${ITEM_ID}.jpg`]]);
  assert.deepEqual(calls.lookups, [{ table: "items", id: ITEM_ID }]);
});

test("an ambiguous network error keeps the photo and retries the same ID", async () => {
  let writes = 0;
  const { client, calls } = fakeClient({
    write: () => {
      writes += 1;
      if (writes === 1) throw new TypeError("network unavailable");
      return { data: ITEM_ID, error: null };
    },
  });
  const pending = attempt();
  assert.deepEqual(await publishListingAttempt(client, pending), { status: "uncertain" });
  assert.equal(pending.uncertain, true);
  assert.equal(calls.removes.length, 0);
  assert.deepEqual(await publishListingAttempt(client, pending), { status: "created", itemId: ITEM_ID });
  assert.equal(calls.uploads.length, 1);
  assert.deepEqual(calls.writes.map(({ args }) => args.p_item_id), [ITEM_ID, ITEM_ID]);
});

test("a committed auction found after a lost response is accepted without a second write", async () => {
  const pending = attempt();
  const imageUrl = `https://example.invalid/${pending.filePath}`;
  const { client, calls } = fakeClient({
    write: () => { throw new TypeError("response lost"); },
    item: { id: ITEM_ID, user_id: USER_ID, listing_type: "auction", image_url: imageUrl },
    auction: { item_id: ITEM_ID },
  });
  assert.deepEqual(await publishListingAttempt(client, pending), { status: "created", itemId: ITEM_ID });
  assert.equal(calls.writes.length, 1);
  assert.equal(calls.removes.length, 0);
});

test("ordinary offers still use items insert with listing_type offer", async () => {
  const { client, calls } = fakeClient();
  assert.deepEqual(await publishListingAttempt(client, attempt("offer")), { status: "created", itemId: ITEM_ID });
  assert.deepEqual(calls.writes.map(({ name }) => name), ["insert:items"]);
  assert.equal(calls.writes[0].args.id, ITEM_ID);
  assert.equal(calls.writes[0].args.listing_type, "offer");
  assert.equal(calls.writes[0].args.desired_trade, "A bicycle");
});

test("a rejected retry cannot delete a photo while the first request may still commit", async () => {
  let count = 0;
  const { client, calls } = fakeClient({ write: () => {
    if (++count === 1) throw new TypeError("response lost, original transaction still pending");
    return { error: { code: "42501" } };
  } });
  const pending = attempt();
  assert.equal((await publishListingAttempt(client, pending)).status, "uncertain");
  assert.equal((await publishListingAttempt(client, pending)).status, "uncertain");
  assert.equal(calls.removes.length, 0);
  assert.deepEqual(calls.writes.map(({ args }) => args.p_item_id), [ITEM_ID, ITEM_ID]);
});

test("unknown SQL transaction outcome preserves the image and item ID", async () => {
  const { client, calls } = fakeClient({ write: () => ({ error: { code: "40003" } }) });
  assert.equal((await publishListingAttempt(client, attempt())).status, "uncertain");
  assert.equal(calls.removes.length, 0);
});

test("double submission shares a single creation request", async () => {
  const { client, calls } = fakeClient();
  const pending = attempt();
  await Promise.all([publishListingAttempt(client, pending), publishListingAttempt(client, pending)]);
  assert.equal(calls.writes.length, 1);
  assert.equal(calls.uploads.length, 1);
});

test("unavailable recovery storage blocks the database write", async () => {
  const { client, calls } = fakeClient();
  assert.equal((await publish(client, attempt(), { remember: () => false, forget: () => {} })).status, "storage_error");
  assert.equal(calls.writes.length, 0);
  assert.equal(calls.removes.length, 0);
});
