import { requireGelAmount } from "./auctions.js";
import { isDefiniteWriteRejection } from "./auctionRecovery.js";

function cents(value) {
  const [whole, fraction = ""] = requireGelAmount(value, "Bid").split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}

export function bidMeetsMinimum(amount, minimum) {
  return cents(amount) >= cents(minimum);
}

export function remainingAuctionSeconds(endsAt, now = Date.now()) {
  const end = Date.parse(endsAt);
  return Number.isFinite(end) ? Math.max(0, Math.ceil((end - now) / 1000)) : 0;
}

export function auctionAcceptsBids(state) {
  // The device clock is only an estimate for display. The RPC decides expiry.
  return state?.accepting_bids === true;
}

export function snapshotBehindUpdate(state, update) {
  return Boolean(state && update && (
    Number(state.bid_count) < Number(update.bidCount)
    || cents(state.current_price) < cents(update.currentPrice)
  ));
}

export function mergeAuctionSnapshot(previous, next) {
  if (!previous || !next) return next;
  if (snapshotBehindUpdate(next, { bidCount: previous.bid_count, currentPrice: previous.current_price })) {
    return next.accepting_bids === false ? { ...previous, accepting_bids: false } : previous;
  }
  // There is no reopening operation in the current schema.
  return previous.accepting_bids === false ? { ...next, accepting_bids: false } : next;
}

export function mergeAuctionUpdate(previous, update) {
  if (!previous || !snapshotBehindUpdate(previous, update)) return previous;
  if (Number(update.bidCount) < Number(previous.bid_count) || cents(update.currentPrice) < cents(previous.current_price)) return previous;
  const minimum = cents(update.currentPrice) + cents(previous.min_increment);
  return {
    ...previous,
    current_price: update.currentPrice,
    bid_count: update.bidCount,
    next_minimum_bid: `${minimum / 100n}.${String(minimum % 100n).padStart(2, "0")}`,
    accepting_bids: previous.accepting_bids && minimum <= 999999999999n,
  };
}

export function bidFailureKind(error, previousState, latestState) {
  if (!isDefiniteWriteRejection(error)) return "uncertain";
  if (error.code === "42501") return "permission";
  if (/not accepting bids/i.test(error.message ?? "")) return "closed";
  if (latestState && !auctionAcceptsBids(latestState)) return "closed";
  if (latestState && previousState
      && cents(latestState.next_minimum_bid) > cents(previousState.next_minimum_bid)) {
    return "minimumChanged";
  }
  if (/minimum/i.test(error.message ?? "")) return "minimumChanged";
  return "rejected";
}
