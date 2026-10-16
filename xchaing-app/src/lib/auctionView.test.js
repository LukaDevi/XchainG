import assert from "node:assert/strict";
import test from "node:test";
import { auctionAcceptsBids, bidFailureKind, bidMeetsMinimum, remainingAuctionSeconds, mergeAuctionSnapshot, mergeAuctionUpdate, snapshotBehindUpdate } from "./auctionView.js";

const active = {
  next_minimum_bid: "10.01",
  accepting_bids: true,
  ends_at: "2099-01-01T00:00:00Z",
};

test("bid comparison uses cents and rejects amounts below the exact minimum", () => {
  assert.equal(bidMeetsMinimum("10.00", "10.01"), false);
  assert.equal(bidMeetsMinimum("10.01", "10.01"), true);
  assert.equal(bidMeetsMinimum("9999999999.99", "9999999999.99"), true);
  assert.throws(() => bidMeetsMinimum("10.001", "10.01"), TypeError);
});

test("the countdown is an estimate; server state controls bidding despite clock skew", () => {
  assert.equal(remainingAuctionSeconds("2026-12-01T12:00:00Z", Date.parse("2026-12-01T11:59:59Z")), 1);
  assert.equal(remainingAuctionSeconds("2026-12-01T12:00:00Z", Date.parse("2026-12-01T12:00:00Z")), 0);
  assert.equal(auctionAcceptsBids({ ...active, ends_at: "2020-12-01T12:00:00Z" }), true);
  assert.equal(auctionAcceptsBids({ ...active, accepting_bids: false }), false);
});

test("old snapshots and Realtime events cannot roll back counters or reopen a closed auction", () => {
  const previous = { ...active, current_price: "20.00", bid_count: 4, min_increment: "1.00" };
  const next = mergeAuctionUpdate(previous, { currentPrice: "22.00", bidCount: 5 });
  assert.equal(next.current_price, "22.00");
  assert.equal(next.next_minimum_bid, "23.00");
  assert.equal(mergeAuctionSnapshot(next, previous).current_price, "22.00");
  assert.equal(mergeAuctionUpdate(next, { currentPrice: "21.00", bidCount: 4 }).bid_count, 5);
  assert.equal(snapshotBehindUpdate(previous, { currentPrice: "22.00", bidCount: 5 }), true);
  const closed = mergeAuctionSnapshot(next, { ...previous, accepting_bids: false });
  assert.equal(closed.current_price, "22.00");
  assert.equal(closed.accepting_bids, false);
  assert.equal(mergeAuctionSnapshot(closed, next).accepting_bids, false);
});

test("a server expiry refusal wins even if the subsequent state read is stale", () => {
  assert.equal(bidFailureKind({ code: "P0001", message: "This auction is not accepting bids" }, active, { ...active, next_minimum_bid: "15.00" }), "closed");
  assert.equal(bidFailureKind({ code: "40003" }, active, active), "uncertain");
});

test("a known concurrent minimum change is distinct from an uncertain network result", () => {
  const newer = { ...active, next_minimum_bid: "11.01" };
  assert.equal(bidFailureKind({ code: "P0001", message: "Bid is below the current minimum" }, active, newer), "minimumChanged");
  assert.equal(bidFailureKind(new TypeError("network unavailable"), active, newer), "uncertain");
  assert.equal(bidFailureKind({ code: "P0001", message: "This auction is not accepting bids" }, active, { ...newer, accepting_bids: false }), "closed");
});
