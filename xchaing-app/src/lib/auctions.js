// Auction prices are GEL decimal strings. The database remains the authority for
// ownership, deadlines, minimum bids, and concurrent bid ordering.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GEL_AMOUNT_PATTERN = /^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/;
const MAX_GEL_CENTS = 999999999999n; // numeric(12,2): 9,999,999,999.99 GEL

function requireClient(client) {
  if (!client?.rpc) throw new TypeError("A Supabase client is required.");
  return client;
}

function requireItemId(itemId) {
  if (typeof itemId !== "string" || !UUID_PATTERN.test(itemId)) {
    throw new TypeError("A valid auction item ID is required.");
  }
  return itemId;
}

export function requireGelAmount(value, label) {
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite GEL amount.`);
  }
  const amount = typeof value === "number" || typeof value === "string" ? String(value).trim() : "";
  if (!GEL_AMOUNT_PATTERN.test(amount)) {
    throw new TypeError(`${label} must be a GEL amount from 0.01 to 9999999999.99 with at most two decimals.`);
  }
  const [whole, fraction = ""] = amount.split(".");
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (cents < 1n || cents > MAX_GEL_CENTS) {
    throw new TypeError(`${label} must be a GEL amount from 0.01 to 9999999999.99 with at most two decimals.`);
  }
  return amount;
}

export async function createAuction(client, { itemId, startingPrice, minIncrement = "1.00", endsAt }) {
  const db = requireClient(client);
  const endDate = new Date(endsAt);
  if (!Number.isFinite(endDate.getTime())) throw new TypeError("A finite auction end time is required.");

  const { data, error } = await db.rpc("create_auction", {
    p_item_id: requireItemId(itemId),
    p_starting_price: requireGelAmount(startingPrice, "Starting price"),
    p_min_increment: requireGelAmount(minIncrement, "Minimum increment"),
    p_ends_at: endDate.toISOString(),
  });
  if (error) throw error;
  return data;
}

export async function getAuctionState(client, itemId) {
  const { data, error } = await requireClient(client).rpc("get_auction_state", {
    p_item_id: requireItemId(itemId),
  });
  if (error) throw error;
  return Array.isArray(data) ? data[0] ?? null : data ?? null;
}

// Call getAuctionState() for the initial snapshot. Subsequent bid commits
// update the public auctions row; no bidder identity is sent to viewers.
export function subscribeToAuctionUpdates(client, itemId, onUpdate, onStatus = () => {}) {
  const db = requireClient(client);
  const id = requireItemId(itemId);
  if (typeof db.channel !== "function" || typeof db.removeChannel !== "function") {
    throw new TypeError("A Realtime-enabled Supabase client is required.");
  }
  if (typeof onUpdate !== "function") throw new TypeError("An update callback is required.");
  if (typeof onStatus !== "function") throw new TypeError("A status callback is required.");

  let active = true;
  const channel = db.channel(`auction:${id}`)
    .on("postgres_changes", {
      event: "UPDATE", schema: "public", table: "auctions", filter: `item_id=eq.${id}`,
    }, ({ new: row }) => {
      if (active && row?.item_id === id) {
        onUpdate({ itemId: id, currentPrice: row.current_price, bidCount: row.bid_count });
      }
    })
    .subscribe((status) => {
      if (active) onStatus(status);
    });

  return () => {
    active = false;
    return db.removeChannel(channel);
  };
}

export async function placeAuctionBid(client, { itemId, amount }) {
  const { data, error } = await requireClient(client).rpc("place_auction_bid", {
    p_item_id: requireItemId(itemId),
    p_amount: requireGelAmount(amount, "Bid"),
  });
  if (error) throw error;
  return data;
}

// RLS returns only the caller's own bids, or all bids when the caller owns the item.
export async function listVisibleAuctionBids(client, itemId) {
  const { data, error } = await requireClient(client)
    .from("auction_bids")
    .select("id, item_id, bidder_id, amount, created_at")
    .eq("item_id", requireItemId(itemId))
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
