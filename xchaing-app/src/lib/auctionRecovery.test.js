import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { acknowledgeBidRecovery, forgetListing, readBidRecovery, readPendingListing, rememberListing, submitAuctionBidOnce } from "./auctionRecovery.js";

const ITEM_ID = "123e4567-e89b-42d3-a456-426614174000";
const USER_ID = "123e4567-e89b-42d3-a456-426614174001";
const bid = { itemId: ITEM_ID, userId: USER_ID, amount: "20.00" };
let saved;
beforeEach(() => {
  saved = new Map();
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: {
    getItem: (key) => saved.get(key) ?? null,
    setItem: (key, value) => saved.set(key, value),
    removeItem: (key) => saved.delete(key),
  } });
});

test("listing recovery survives a remount without persisting photo bytes", () => {
  const pending = { ...bid, imageUrl: "https://example.invalid/photo.jpg", photoBlob: new Blob(["image bytes"]) };
  assert.equal(rememberListing(pending), true);
  const restored = readPendingListing();
  assert.equal(restored.itemId, ITEM_ID);
  assert.equal(restored.userId, USER_ID);
  assert.equal(restored.photoBlob, null);
  assert.equal(restored.uploaded, true);
  assert.equal(restored.uncertain, true);
  assert.equal([...saved.values()][0].includes("photoBlob"), false);
  forgetListing(pending);
  assert.equal(readPendingListing(), null);
});

test("pending and uncertain bids remain blocked across component remounts", async () => {
  let resolve;
  let writes = 0;
  const client = { rpc: () => { writes++; return new Promise((done) => { resolve = done; }); } };
  const original = submitAuctionBidOnce(client, bid);
  assert.equal(readBidRecovery(ITEM_ID, USER_ID).status, "pending");
  assert.equal(acknowledgeBidRecovery(ITEM_ID, USER_ID), false);
  assert.equal((await submitAuctionBidOnce(client, bid)).status, "uncertain");
  resolve({ error: { code: "", message: "network response lost" } });
  assert.equal((await original).status, "uncertain");
  assert.equal(readBidRecovery(ITEM_ID, USER_ID).status, "uncertain");
  assert.equal((await submitAuctionBidOnce(client, bid)).status, "uncertain");
  assert.equal(writes, 1);
  assert.equal(acknowledgeBidRecovery(ITEM_ID, USER_ID), true);
  assert.equal(readBidRecovery(ITEM_ID, USER_ID), null);
});

test("accepted bids and definite server rejections release recovery protection", async () => {
  const accepted = { rpc: async () => ({ data: ITEM_ID, error: null }) };
  assert.equal((await submitAuctionBidOnce(accepted, bid)).status, "accepted");
  assert.equal(readBidRecovery(ITEM_ID, USER_ID), null);
  const rejected = { rpc: async () => ({ error: { code: "P0001", message: "Bid is below the current minimum" } }) };
  assert.equal((await submitAuctionBidOnce(rejected, bid)).status, "rejected");
  assert.equal(readBidRecovery(ITEM_ID, USER_ID), null);
});

test("blocked browser storage prevents an unprotected bid", async () => {
  globalThis.sessionStorage.setItem = () => { throw new Error("Storage unavailable"); };
  let writes = 0;
  const client = { rpc: async () => { writes++; } };
  assert.equal((await submitAuctionBidOnce(client, bid)).status, "storage_error");
  assert.equal(writes, 0);
});

test("a malformed success response keeps the bid blocked until explicitly reviewed", async () => {
  let writes = 0;
  const client = { rpc: async () => { writes++; return { data: "not-a-bid-id", error: null }; } };
  assert.equal((await submitAuctionBidOnce(client, bid)).status, "uncertain");
  assert.equal(readBidRecovery(ITEM_ID, USER_ID).status, "uncertain");
  assert.equal((await submitAuctionBidOnce(client, bid)).status, "uncertain");
  assert.equal(writes, 1);
});
