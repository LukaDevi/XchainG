import assert from "node:assert/strict";
import test from "node:test";
import { createAuction, getAuctionState, placeAuctionBid, subscribeToAuctionUpdates } from "./auctions.js";

const ITEM_ID = "123e4567-e89b-42d3-a456-426614174000";

test("invalid bid amounts never reach the database", async () => {
  let calls = 0;
  const client = { rpc: async () => { calls += 1; return { data: null, error: null }; } };

  for (const amount of ["0", "0.00", "1.001", "-1", "10000000000.00", "Infinity", Infinity, -Infinity, NaN]) {
    await assert.rejects(placeAuctionBid(client, { itemId: ITEM_ID, amount }), TypeError);
  }
  assert.equal(calls, 0);
});

test("numeric(12,2) maximum is accepted and larger auction prices are rejected", async () => {
  const calls = [];
  const client = { rpc: async (name, args) => { calls.push({ name, args }); return { data: ITEM_ID, error: null }; } };
  const params = { itemId: ITEM_ID, startingPrice: "9999999999.99", minIncrement: "0.01", endsAt: "2026-12-01T12:00:00Z" };
  await createAuction(client, params);
  assert.equal(calls[0].args.p_starting_price, "9999999999.99");
  await assert.rejects(createAuction(client, { ...params, startingPrice: "10000000000" }), TypeError);
  await assert.rejects(createAuction(client, { ...params, minIncrement: Infinity }), TypeError);
  await assert.rejects(createAuction(client, { ...params, endsAt: "Infinity" }), TypeError);
  assert.equal(calls.length, 1);
});

test("auction writes use the atomic database functions", async () => {
  const calls = [];
  const client = {
    rpc: async (name, args) => {
      calls.push({ name, args });
      return { data: "result-id", error: null };
    },
  };

  assert.equal(await createAuction(client, {
    itemId: ITEM_ID,
    startingPrice: "12.50",
    endsAt: "2026-12-01T12:00:00Z",
  }), "result-id");
  assert.equal(await placeAuctionBid(client, { itemId: ITEM_ID, amount: "13.50" }), "result-id");
  assert.deepEqual(calls.map(({ name }) => name), ["create_auction", "place_auction_bid"]);
  assert.equal(calls[0].args.p_min_increment, "1.00");
  assert.equal(calls[1].args.p_amount, "13.50");
});

test("missing public auction state returns null", async () => {
  const client = { rpc: async () => ({ data: [], error: null }) };
  assert.equal(await getAuctionState(client, ITEM_ID), null);
});

test("Realtime updates expose only public price and count and unsubscribe cleanly", () => {
  let eventHandler;
  let statusHandler;
  let removedChannel;
  const channel = {
    on(event, filter, handler) {
      assert.equal(event, "postgres_changes");
      assert.deepEqual(filter, {
        event: "UPDATE", schema: "public", table: "auctions", filter: `item_id=eq.${ITEM_ID}`,
      });
      eventHandler = handler;
      return this;
    },
    subscribe(handler) { statusHandler = handler; return this; },
  };
  const client = {
    rpc() {},
    channel(name) { assert.equal(name, `auction:${ITEM_ID}`); return channel; },
    removeChannel(value) { removedChannel = value; },
  };
  const updates = [];
  const statuses = [];
  const unsubscribe = subscribeToAuctionUpdates(client, ITEM_ID, (update) => updates.push(update), (status) => statuses.push(status));
  statusHandler("SUBSCRIBED");
  statusHandler("TIMED_OUT");
  statusHandler("SUBSCRIBED");
  assert.deepEqual(statuses, ["SUBSCRIBED", "TIMED_OUT", "SUBSCRIBED"]);
  eventHandler({ new: { item_id: ITEM_ID, current_price: "15.00", bid_count: 2, bidder_id: "private" } });
  assert.deepEqual(updates, [{ itemId: ITEM_ID, currentPrice: "15.00", bidCount: 2 }]);
  unsubscribe();
  assert.equal(removedChannel, channel);
  eventHandler({ new: { item_id: ITEM_ID, current_price: "16.00", bid_count: 3 } });
  assert.equal(updates.length, 1);
  statusHandler("SUBSCRIBED");
  assert.equal(statuses.length, 3);
});
