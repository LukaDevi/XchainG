import { requireGelAmount } from "./auctions.js";
import { forgetListing, isDefiniteWriteRejection, rememberListing } from "./auctionRecovery.js";

const inFlight = new WeakMap();

export function toUtcAuctionDeadline(localValue, now = new Date()) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(localValue);
  if (!match) throw new TypeError("Choose a valid auction end date and time.");
  const end = new Date(localValue);
  if (!Number.isFinite(end.getTime())
      || end.getFullYear() !== Number(match[1])
      || end.getMonth() + 1 !== Number(match[2])
      || end.getDate() !== Number(match[3])
      || end.getHours() !== Number(match[4])
      || end.getMinutes() !== Number(match[5])
      || end <= now) {
    throw new TypeError("Auction end date and time must be in the future.");
  }
  return end.toISOString();
}

export function auctionAmounts(startingPrice, minIncrement) {
  return {
    startingPrice: requireGelAmount(startingPrice, "Starting price"),
    minIncrement: requireGelAmount(minIncrement, "Minimum bid increment"),
  };
}

async function findCreatedListing(client, attempt) {
  try {
    const { data: item, error: itemError } = await client.from("items")
      .select("id,user_id,listing_type,image_url")
      .eq("id", attempt.itemId)
      .maybeSingle();
    if (itemError) return "unknown";
    if (!item) return "absent";
    if (item.user_id !== attempt.userId
        || item.listing_type !== attempt.listingType
        || item.image_url !== attempt.imageUrl) return "unknown";
    if (attempt.listingType === "offer") return "created";

    const { data: auction, error: auctionError } = await client.from("auctions")
      .select("item_id")
      .eq("item_id", attempt.itemId)
      .maybeSingle();
    if (auctionError || !auction) return "unknown";
    return "created";
  } catch {
    return "unknown";
  }
}

async function removeRejectedPhoto(client, attempt) {
  try {
    const { error } = await client.storage.from("listings").remove([attempt.filePath]);
    return !error;
  } catch {
    return false;
  }
}

async function ensurePhotoUploaded(client, attempt) {
  if (attempt.uploaded) return true;
  const bucket = client.storage.from("listings");
  try {
    const { error } = await bucket.upload(
      attempt.filePath, attempt.photoBlob,
      { contentType: "image/jpeg", upsert: false },
    );
    if (!error) {
      attempt.uploaded = true;
      return true;
    }
  } catch {
    // An interrupted upload may still have finished on the server.
  }
  try {
    const { data, error } = await bucket.info(attempt.filePath);
    if (!error && data) {
      attempt.uploaded = true;
      return true;
    }
  } catch {
    // Keep the same path for the next retry.
  }
  return false;
}

// Keep the same attempt (and item ID) for every retry after an uncertain response.
export function publishListingAttempt(client, attempt, recovery = { remember: rememberListing, forget: forgetListing }) {
  if (inFlight.has(attempt)) return inFlight.get(attempt);
  const operation = performListingAttempt(client, attempt, recovery).then((result) => {
    if (result.status === "created" || result.status === "rejected") recovery.forget(attempt);
    return result;
  }).finally(() => inFlight.delete(attempt));
  inFlight.set(attempt, operation);
  return operation;
}

async function performListingAttempt(client, attempt, recovery) {
  if (attempt.uncertain) {
    const previous = await findCreatedListing(client, attempt);
    if (previous === "created") return { status: "created", itemId: attempt.itemId };
    if (previous === "unknown") return { status: "uncertain" };
  }

  if (!await ensurePhotoUploaded(client, attempt)) return { status: "upload_error" };

  attempt.imageUrl ||= client.storage.from("listings").getPublicUrl(attempt.filePath).data.publicUrl;
  // Preserve the ID before sending a write so a reload can reconcile it.
  if (!recovery.remember(attempt)) return { status: "storage_error" };
  let error;
  try {
    if (attempt.listingType === "auction") {
      const result = await client.rpc("create_auction_listing", {
        p_item_id: attempt.itemId,
        p_title: attempt.title,
        p_description: attempt.description,
        p_category: attempt.category,
        p_condition: attempt.condition,
        p_desired_trade: null,
        p_city: attempt.city,
        p_image_url: attempt.imageUrl,
        p_starting_price: attempt.startingPrice,
        p_min_increment: attempt.minIncrement,
        p_ends_at: attempt.endsAt,
      });
      error = result.error;
      if (!error && result.data === attempt.itemId) {
        return { status: "created", itemId: attempt.itemId };
      }
    } else {
      const result = await client.from("items").insert({
        id: attempt.itemId,
        user_id: attempt.userId,
        title: attempt.title,
        city: attempt.city,
        category: attempt.category,
        condition: attempt.condition,
        desired_trade: attempt.desiredTrade,
        description: attempt.description,
        image_url: attempt.imageUrl,
        status: "active",
        listing_type: "offer",
      });
      error = result.error;
      if (!error) return { status: "created", itemId: attempt.itemId };
    }
  } catch (caught) {
    error = caught;
  }

  const found = await findCreatedListing(client, attempt);
  if (found === "created") return { status: "created", itemId: attempt.itemId };
  // A retry's rejection says nothing about an earlier request still running.
  // Once any result is uncertain, retain the ID and photo until creation is found.
  if (!attempt.uncertain && found === "absent" && isDefiniteWriteRejection(error)) {
    const photoRemoved = await removeRejectedPhoto(client, attempt);
    return { status: "rejected", photoRemoved };
  }
  attempt.uncertain = true;
  return { status: "uncertain" };
}
