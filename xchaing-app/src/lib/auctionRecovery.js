import { placeAuctionBid } from "./auctions.js";

const LISTING_KEY = "xchaing.pending-listing.v1";
const BID_PREFIX = "xchaing.pending-bid.v1:";
const activeBids = new Set();

function read(key) {
  try { return JSON.parse(globalThis.sessionStorage.getItem(key)); } catch { return null; }
}

function write(key, value) {
  try {
    globalThis.sessionStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch { return false; }
}

function remove(key) {
  try { globalThis.sessionStorage.removeItem(key); } catch { /* Keep recovery conservative. */ }
}

// A connection/transaction outcome error (e.g. 08007 or 40003) is not proof
// of rollback. Only explicit validation, constraint, and permission rejections
// are treated as definitive.
export function isDefiniteWriteRejection(error) {
  return /^(22|23)[A-Z0-9]{3}$/.test(error?.code ?? "")
    || ["P0001", "42501"].includes(error?.code);
}

export function readPendingListing() {
  const value = read(LISTING_KEY);
  return value?.itemId && value?.userId && value?.imageUrl
    ? { ...value, uploaded: true, uncertain: true, photoBlob: null }
    : null;
}

export function rememberListing(attempt) {
  // Never persist image bytes, auth credentials, or tokens.
  const { photoBlob: _photoBlob, ...metadata } = attempt;
  void _photoBlob;
  return write(LISTING_KEY, { ...metadata, uploaded: true, uncertain: true });
}

export function forgetListing(attempt) {
  if (read(LISTING_KEY)?.itemId === attempt.itemId) remove(LISTING_KEY);
}

function bidKey(itemId, userId) { return `${BID_PREFIX}${userId}:${itemId}`; }

export function readBidRecovery(itemId, userId) {
  if (!userId) return null;
  const key = bidKey(itemId, userId);
  const saved = read(key);
  if (!saved) return null;
  return { ...saved, status: activeBids.has(key) ? "pending" : "uncertain" };
}

export function acknowledgeBidRecovery(itemId, userId) {
  const key = bidKey(itemId, userId);
  if (activeBids.has(key)) return false;
  remove(key);
  return !read(key);
}

export async function submitAuctionBidOnce(client, { itemId, userId, amount }) {
  const key = bidKey(itemId, userId);
  if (activeBids.has(key) || read(key)) return { status: "uncertain" };
  if (!write(key, { itemId, userId, amount })) return { status: "storage_error" };
  activeBids.add(key);
  try {
    const id = await placeAuctionBid(client, { itemId, amount });
    if (typeof id !== "string" || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)) return { status: "uncertain" };
    remove(key);
    return { status: "accepted" };
  } catch (error) {
    if (isDefiniteWriteRejection(error)) {
      remove(key);
      return { status: "rejected", error };
    }
    return { status: "uncertain" };
  } finally {
    activeBids.delete(key);
  }
}
