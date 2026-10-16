// Local browser check with an in-page fake Supabase. No production endpoint is used.
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ITEM_ID = "123e4567-e89b-42d3-a456-426614174000";
const APP_URL = "http://127.0.0.1:5174/";
const targets = await (await fetch("http://127.0.0.1:9224/json/list")).json();
const target = targets.find((entry) => entry.type === "page") ?? null;
assert(target, "A local Chrome CDP page is required");

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});
let nextId = 1;
const pending = new Map();
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (!message.id) return;
  const callbacks = pending.get(message.id);
  if (!callbacks) return;
  pending.delete(message.id);
  if (message.error) callbacks.reject(new Error(message.error.message));
  else callbacks.resolve(message.result);
});
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}
async function waitFor(expression, timeout = 12000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Browser condition not reached: ${expression}`);
}

const injection = String.raw`
(() => {
  const itemId = "123e4567-e89b-42d3-a456-426614174000";
  const buyerId = "123e4567-e89b-42d3-a456-426614174001";
  const sellerId = "123e4567-e89b-42d3-a456-426614174002";
  const mode = localStorage.getItem("auction-browser-mode") || "buyer";
  const userId = mode === "owner" ? sellerId : buyerId;
  const user = {
    id: userId, aud: "authenticated", role: "authenticated",
    email: "browser@example.invalid", user_metadata: { full_name: "Browser Check" },
    app_metadata: { provider: "email" }, created_at: "2026-01-01T00:00:00Z",
  };
  const encode = (value) => btoa(JSON.stringify(value))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const token = encode({ alg: "HS256", typ: "JWT" }) + "." +
    encode({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600, role: "authenticated" }) + ".local";
  if (mode === "anon") localStorage.removeItem("sb-mock-supabase-auth-token");
  else localStorage.setItem("sb-mock-supabase-auth-token", JSON.stringify({
    access_token: token, refresh_token: "local-only", token_type: "bearer",
    expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, user,
  }));
  const item = {
    id: itemId, user_id: sellerId, listing_type: "auction", status: "active",
    title: "Browser auction", description: "Local test item", category: "Electronics",
    city: "tbilisi", image_url: null, created_at: "2026-10-15T00:00:00Z",
  };
  window.__auctionMock = {
    mode, writes: 0, reads: 0, removed: false, bidScenario: "race",
    state: {
      item_id: itemId, starting_price: "10.00", min_increment: "1.00",
      current_price: "10.00", next_minimum_bid: "10.00", bid_count: 0,
      ends_at: "2099-01-01T00:00:00Z", accepting_bids: true,
    },
  };
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = String(typeof input === "string" ? input : input.url);
    if (url.startsWith("https://mock-supabase.invalid/")) {
      const method = (init.method || input?.method || "GET").toUpperCase();
      const response = (body, status = 200) => new Response(method === "HEAD" ? null : JSON.stringify(body), {
        status, headers: { "Content-Type": "application/json", "Content-Range": "0-0/1" },
      });
      if (url.includes("/auth/v1/user")) return response({ user });
      if (url.includes("/rest/v1/items") && method === "GET") return response([item]);
      if (url.includes("/rest/v1/profiles") && method === "GET") {
        return response({ id: userId, full_name: "Browser Check", phone: "", bio: "", avatar_url: "" });
      }
      if (url.includes("/rest/v1/subscriptions") && method === "GET") {
        return response({ plan_type: "free", status: "inactive" });
      }
      if (url.includes("/rest/v1/rpc/get_auction_state") && method === "POST") {
        window.__auctionMock.reads += 1;
        return response([window.__auctionMock.state]);
      }
      if (url.includes("/rest/v1/rpc/place_auction_bid") && method === "POST") {
        window.__auctionMock.writes += 1;
        if (window.__auctionMock.bidScenario === "race") {
          window.__auctionMock.state = {
            ...window.__auctionMock.state, current_price: "11.00",
            next_minimum_bid: "12.00", bid_count: 1,
          };
          return response({ code: "P0001", message: "Bid is below the current minimum", details: "", hint: "" }, 400);
        }
        if (window.__auctionMock.bidScenario === "uncertain") throw new TypeError("Simulated lost response");
        return response("123e4567-e89b-42d3-a456-426614174003");
      }
      if (method !== "GET" && method !== "HEAD") throw new Error("Browser check blocked a write");
      return response([]);
    }
    if (!url.startsWith("http://127.0.0.1:5174/")) throw new Error("Browser check blocked an external request");
    return originalFetch(input, init);
  };
})();`;

async function navigateAs(mode, resetRecovery = false) {
  if (!await evaluate("location.origin === 'http://127.0.0.1:5174'")) {
    await send("Page.navigate", { url: APP_URL });
    await waitFor("location.origin === 'http://127.0.0.1:5174' && document.readyState === 'complete'");
  }
  await evaluate(`localStorage.setItem("auction-browser-mode", ${JSON.stringify(mode)})`);
  if (resetRecovery) await evaluate("Object.keys(sessionStorage).filter((key) => key.startsWith('xchaing.pending-')).forEach((key) => sessionStorage.removeItem(key))");
  await send("Page.navigate", { url: APP_URL });
  await waitFor("document.body?.textContent?.includes('Browser auction')");
  await evaluate(`(async () => {
    const { supabase } = await import('/src/lib/supabase.js');
    const rpc = supabase.rpc.bind(supabase);
    window.__auctionMock.pendingReads = [];
    supabase.rpc = (name, args) => {
      if (name === 'get_auction_state' && window.__auctionMock.holdReads) {
        const snapshot = { ...window.__auctionMock.state };
        return new Promise((resolve) => window.__auctionMock.pendingReads.push(() => resolve({ data: [snapshot], error: null })));
      }
      return rpc(name, args);
    };
    const setInterval = window.setInterval.bind(window);
    const clearInterval = window.clearInterval.bind(window);
    window.__auctionMock.timerIds = new Set();
    window.setInterval = (callback, delay, ...args) => {
      const id = setInterval(callback, delay, ...args);
      if (delay === 1000) window.__auctionMock.timerIds.add(id);
      return id;
    };
    window.clearInterval = (id) => { window.__auctionMock.timerIds.delete(id); clearInterval(id); };
    supabase.channel = () => ({
      on(_event, _filter, handler) { window.__auctionMock.changeHandler = handler; return this; },
      subscribe(handler) {
        window.__auctionMock.statusHandler = handler;
        queueMicrotask(() => handler('SUBSCRIBED'));
        return this;
      },
    });
    supabase.removeChannel = async () => { window.__auctionMock.removed = true; };
    return true;
  })()`);
  await evaluate(`(() => {
    const card = [...document.querySelectorAll("article")].find((entry) => entry.textContent.includes("Browser auction"));
    card.querySelector("button").click();
  })()`);
  await waitFor("Boolean(document.querySelector('[role=dialog] section[aria-label]'))");
  await waitFor("document.querySelector('[role=dialog] section[aria-label]')?.textContent?.includes('10.00')");
  await waitFor("Boolean(window.__auctionMock.statusHandler)");
}

async function setBid(amount) {
  await evaluate(`(() => {
    const input = document.querySelector('[role=dialog] input[inputmode=decimal]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, ${JSON.stringify(amount)});
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  })()`);
}

let injectionId;
try {
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  injectionId = (await send("Page.addScriptToEvaluateOnNewDocument", { source: injection })).identifier;

  await navigateAs("buyer", true);
  assert(await evaluate(`(() => {
    const button = [...document.querySelectorAll("button")].find((entry) => entry.textContent.includes("ენა"));
    button.click();
    return true;
  })()`));
  await waitFor("document.querySelector('[role=dialog] section[aria-label=\"Auction details\"]') !== null");
  assert.equal(await evaluate("document.querySelector('[role=dialog] input[inputmode=decimal]') !== null"), true);
  const width = JSON.parse(await evaluate(`JSON.stringify({ viewport: innerWidth, dialog: document.querySelector('[role=dialog]').getBoundingClientRect().width, scroll: document.querySelector('[role=dialog]').scrollWidth })`));
  assert(width.dialog <= width.viewport && width.scroll <= width.dialog + 1);
  const screenshot = await send("Page.captureScreenshot", { format: "png" });
  const screenshotPath = join(tmpdir(), "xchaing-auction-details-mobile.png");
  await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));

  await evaluate("window.__auctionMock.beforeReconnect = window.__auctionMock.reads; window.__auctionMock.statusHandler('TIMED_OUT'); window.__auctionMock.statusHandler('SUBSCRIBED')");
  await waitFor("window.__auctionMock.reads > window.__auctionMock.beforeReconnect");

  await setBid("9.00");
  await evaluate("document.querySelector('[role=dialog] form').requestSubmit()");
  await waitFor("document.querySelector('[role=dialog] [role=alert]')?.textContent?.includes('below the next minimum')");
  assert.equal(await evaluate("window.__auctionMock.writes"), 0);

  await setBid("10.00");
  await evaluate("document.querySelector('[role=dialog] form').requestSubmit(); document.querySelector('[role=dialog] form').requestSubmit()");
  await waitFor("document.querySelector('[role=dialog] [role=alert]')?.textContent?.includes('Another bid changed the minimum')");
  assert.equal(await evaluate("window.__auctionMock.writes"), 1);
  assert.equal(await evaluate("document.querySelector('[role=dialog]').textContent.includes('12.00')"), true);

  await evaluate("window.__auctionMock.bidScenario = 'uncertain'");
  await setBid("12.00");
  await evaluate("document.querySelector('[role=dialog] form').requestSubmit()");
  await waitFor("document.querySelector('[role=dialog] [role=alert]')?.textContent?.includes('network response is unclear')");
  assert.equal(await evaluate("window.__auctionMock.writes"), 2);
  assert.equal(await evaluate("document.querySelector('[role=dialog] form button').disabled"), true);
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.equal(await evaluate("window.__auctionMock.writes"), 2);

  await evaluate("document.querySelector('[role=dialog] button[aria-label=Close]').click()");
  await waitFor("window.__auctionMock.removed === true && window.__auctionMock.timerIds.size === 0");
  await evaluate("[...document.querySelectorAll('article')].find((card) => card.textContent.includes('Browser auction')).querySelector('button').click()");
  await waitFor("document.querySelector('[role=dialog] form button')?.disabled === true");
  assert.equal(await evaluate("window.__auctionMock.writes"), 2);
  await evaluate("[...document.querySelectorAll('[role=dialog] button')].find((button) => button.textContent.trim() === 'Refresh').click()");
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(await evaluate("document.querySelector('[role=dialog] form button').disabled"), true);

  // Resolve the new request first, then the old one. Neither the old response
  // nor a later stale RPC may replace the Realtime high-water mark.
  await evaluate("window.__auctionMock.holdReads = true; window.__auctionMock.statusHandler('SUBSCRIBED')");
  await waitFor("window.__auctionMock.pendingReads.length === 1");
  await evaluate(`window.__auctionMock.state = { ...window.__auctionMock.state, current_price: '20.00', next_minimum_bid: '21.00', bid_count: 2 }; window.__auctionMock.changeHandler({new: { item_id: '${ITEM_ID}', current_price: '20.00', bid_count: 2 }})`);
  await waitFor("window.__auctionMock.pendingReads.length === 2");
  await evaluate("window.__auctionMock.pendingReads[1](); window.__auctionMock.pendingReads[0](); window.__auctionMock.holdReads = false");
  await waitFor("document.querySelector('[role=dialog]')?.textContent?.includes('21.00')");
  await evaluate("window.__auctionMock.state = { ...window.__auctionMock.state, current_price: '11.00', next_minimum_bid: '12.00', bid_count: 1 }; window.__auctionMock.statusHandler('SUBSCRIBED')");
  await waitFor("document.querySelector('[role=dialog]')?.textContent?.includes('Could not load auction details')");
  assert.equal(await evaluate("document.querySelector('[role=dialog]').textContent.includes('21.00')"), true);

  await evaluate("window.__auctionMock.state = { ...window.__auctionMock.state, current_price: '20.00', next_minimum_bid: '21.00', bid_count: 2, ends_at: '2020-01-01T00:00:00Z', accepting_bids: true }; window.__auctionMock.statusHandler('SUBSCRIBED')");
  await waitFor("document.querySelector('[role=dialog]')?.textContent?.includes('server is still accepting bids')");
  assert.equal(await evaluate("Boolean(document.querySelector('[role=dialog] form'))"), true);

  // A server expiry decision is still authoritative when its counters lag the
  // last Realtime event. Keep the newer price while closing the form.
  await evaluate("window.__auctionMock.state = { ...window.__auctionMock.state, current_price: '11.00', next_minimum_bid: '12.00', bid_count: 1, ends_at: '2020-01-01T00:00:00Z', accepting_bids: false }; window.__auctionMock.statusHandler('SUBSCRIBED')");
  await waitFor("document.querySelector('[role=dialog]')?.textContent?.includes('no longer accepting bids')");
  assert.equal(await evaluate("document.querySelector('[role=dialog] form')"), null);
  assert.equal(await evaluate("document.querySelector('[role=dialog]').textContent.includes('21.00')"), true);

  await evaluate("document.querySelector('[role=dialog] button[aria-label=Close]').click()");
  await waitFor("window.__auctionMock.removed === true");

  await navigateAs("buyer");
  assert.equal(await evaluate("document.querySelector('[role=dialog] form button').disabled"), true);
  assert.equal(await evaluate("window.__auctionMock.writes"), 0);

  await navigateAs("owner");
  assert.equal(await evaluate("document.querySelector('[role=dialog] input[inputmode=decimal]')"), null);
  assert.equal(await evaluate("document.querySelector('[role=dialog]').textContent.includes('საკუთარ აუქციონზე')"), true);

  await navigateAs("anon");
  assert.equal(await evaluate("document.querySelector('[role=dialog] input[inputmode=decimal]')"), null);
  assert.equal(await evaluate("document.querySelector('[role=dialog]').textContent.includes('ბიდის დასადებად შედი')"), true);
  await evaluate(`(() => {
    const button = [...document.querySelectorAll('[role=dialog] button')].find((entry) => entry.textContent.includes('ბიდის დასადებად შედი'));
    button.click();
  })()`);
  await waitFor("[...document.querySelectorAll('button')].some((entry) => entry.textContent.trim() === 'რეგისტრაცია')");

  console.log(JSON.stringify({
    auctionDetailsVisible: true, enGeText: true, mobileNoOverflow: true,
    belowMinimumBlocked: true, competingBidRefreshed: true,
    uncertainBidNotRetried: true, endedAuctionLocked: true,
    duplicateClickBlocked: true, uncertainBidSurvivesReopenAndReload: true,
    staleRpcCannotRegressPrice: true, serverOverridesDeviceClock: true, timersCleanedUp: true,
    reconnectRefetched: true, subscriptionCleanedUp: true,
    ownerBlocked: true, anonymousSignInPrompt: true,
    screenshotPath,
  }));
} finally {
  if (injectionId) await send("Page.removeScriptToEvaluateOnNewDocument", { identifier: injectionId });
  socket.close();
}
