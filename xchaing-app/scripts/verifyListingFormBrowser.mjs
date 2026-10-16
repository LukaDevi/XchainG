// Local-only browser check. Start Vite with VITE_SUPABASE_URL=https://mock-supabase.invalid
// and a dummy VITE_SUPABASE_ANON_KEY, then connect to a headless Chrome CDP page.
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CDP_PORT = 9224;
const APP_URL = "http://127.0.0.1:5174/";
const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
const target = targets.find((entry) => entry.type === "page" && entry.url === "about:blank")
  ?? targets.find((entry) => entry.type === "page");
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
  const result = await send("Runtime.evaluate", {
    expression, returnByValue: true, awaitPromise: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}
async function waitFor(expression, timeout = 10000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Browser condition not reached: ${expression}`);
}

const injection = String.raw`
(() => {
  const user = {
    id: "123e4567-e89b-42d3-a456-426614174001",
    aud: "authenticated", role: "authenticated", email: "browser@example.invalid",
    app_metadata: { provider: "email" }, user_metadata: { full_name: "Browser Check" },
    created_at: "2026-01-01T00:00:00.000Z",
  };
  const encode = (value) => btoa(JSON.stringify(value))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const token = encode({ alg: "HS256", typ: "JWT" }) + "." +
    encode({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600, role: "authenticated" }) + ".local";
  localStorage.setItem("sb-mock-supabase-auth-token", JSON.stringify({
    access_token: token, refresh_token: "local-only", token_type: "bearer",
    expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, user,
  }));
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input.url;
    if (url.startsWith("https://mock-supabase.invalid/")) {
      const method = (init.method || input?.method || "GET").toUpperCase();
      if (method !== "GET" && method !== "HEAD") {
        throw new Error("Browser check refuses database or Storage writes");
      }
      const body = url.includes("/auth/v1/user")
        ? JSON.stringify({ user })
        : url.includes("/rest/v1/profiles")
          ? JSON.stringify({ id: user.id, full_name: "Browser Check", phone: "", bio: "", avatar_url: "" })
          : "[]";
      return new Response(method === "HEAD" ? null : body, {
        status: 200,
        headers: { "Content-Type": "application/json", "Content-Range": "0-0/0" },
      });
    }
    if (!url.startsWith("http://127.0.0.1:5174/")) {
      throw new Error("Browser check blocked an external request");
    }
    return originalFetch(input, init);
  };
})();`;

let injectionId;
try {
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 390, height: 844, deviceScaleFactor: 1, mobile: true,
  });
  injectionId = (await send("Page.addScriptToEvaluateOnNewDocument", { source: injection })).identifier;
  await send("Page.navigate", { url: APP_URL });
  await waitFor("document.querySelector('#root')?.textContent?.length > 100");
  await new Promise((resolve) => setTimeout(resolve, 1000));
  assert(await evaluate(`(() => {
    const button = [...document.querySelectorAll("button")]
      .find((entry) => (entry.textContent || "").includes("დაამატე განცხადება"));
    if (!button) return false;
    button.click();
    return true;
  })()`), "The authenticated add-listing button is available");
  await waitFor("Boolean(document.querySelector('#listing-type'))");
  assert.equal(await evaluate("document.querySelector('#listing-type').value"), "offer");
  assert.equal(await evaluate("Boolean(document.querySelector('#auction-starting-price'))"), false);
  assert.equal(await evaluate("Boolean(document.querySelector('input[required][placeholder*=" + JSON.stringify("Gaming") + "]'))"), true);

  await evaluate(`(() => {
    const select = document.querySelector("#listing-type");
    select.value = "auction";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  })()`);
  await waitFor("Boolean(document.querySelector('#auction-starting-price'))");
  assert.equal(await evaluate("Boolean(document.querySelector('#auction-min-increment'))"), true);
  assert.equal(await evaluate("document.querySelector('#auction-ends-at').type"), "datetime-local");
  assert.equal(await evaluate("Boolean(document.querySelector('input[required][placeholder*=" + JSON.stringify("Gaming") + "]'))"), false);
  const mobileSize = JSON.parse(await evaluate(`JSON.stringify({
    viewport: innerWidth,
    formWidth: document.querySelector("#listing-type").closest("form").getBoundingClientRect().width,
    formScrollWidth: document.querySelector("#listing-type").closest("form").scrollWidth,
  })`));
  assert(mobileSize.formWidth <= mobileSize.viewport && mobileSize.formScrollWidth <= mobileSize.formWidth + 1);

  await evaluate("document.querySelector('#auction-starting-price').scrollIntoView({block:'center'})");
  const screenshot = await send("Page.captureScreenshot", { format: "png" });
  const screenshotPath = join(tmpdir(), "xchaing-auction-form-mobile.png");
  await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));

  assert(await evaluate(`(() => {
    const button = [...document.querySelectorAll("button")]
      .find((entry) => (entry.textContent || "").includes("ენა"));
    if (!button) return false;
    button.click();
    return true;
  })()`), "The EN/GE switch is available");
  await waitFor("document.querySelector('label[for=listing-type]')?.textContent?.includes('Listing type')");
  assert.equal(await evaluate("document.querySelector('#auction-starting-price').required"), true);
  assert.equal(await evaluate("document.querySelector('#auction-min-increment').required"), true);
  assert.equal(await evaluate("document.querySelector('#auction-ends-at').required"), true);
  await evaluate(`(() => {
    const setValue = (element, value) => {
      const prototype = element.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, "value").set.call(element, value);
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    };
    setValue(document.querySelector("#listing-title"), "Browser test");
    setValue(document.querySelector("#listing-city"), "tbilisi");
    setValue(document.querySelector("#auction-starting-price"), "10.00");
    setValue(document.querySelector("#auction-min-increment"), "1.00");
    setValue(document.querySelector("#auction-ends-at"), "2026-12-01T15:30");
  })()`);
  assert(await evaluate("document.querySelector('#listing-type').closest('form').checkValidity()"));
  await evaluate("document.querySelector('#listing-type').closest('form').requestSubmit()");
  await waitFor("document.querySelector('[role=alert]')?.textContent?.includes('Take a photo')");

  // A reload after a lost creation response must restore the same immutable
  // attempt, including its photo URL, without requiring a new camera capture.
  await evaluate(`sessionStorage.setItem('xchaing.pending-listing.v1', JSON.stringify({
    itemId: '123e4567-e89b-42d3-a456-426614174000',
    userId: '123e4567-e89b-42d3-a456-426614174001',
    listingType: 'auction', title: 'Recovered auction', city: 'tbilisi',
    category: 'Electronics', condition: 'used', description: 'Recovered description',
    startingPrice: '10.00', minIncrement: '1.00',
    endsAt: '2099-01-01T12:00:00.000Z', localEndsAt: '2099-01-01T16:00',
    imageUrl: 'https://example.invalid/recovered-photo.jpg',
    filePath: '123e4567-e89b-42d3-a456-426614174001/123e4567-e89b-42d3-a456-426614174000.jpg',
    uploaded: true, uncertain: true
  }))`);
  await send("Page.navigate", { url: APP_URL });
  await waitFor("[...document.querySelectorAll('button')].some((button) => button.textContent.includes('დაამატე განცხადება'))");
  await evaluate("[...document.querySelectorAll('button')].find((button) => button.textContent.includes('დაამატე განცხადება')).click()");
  await waitFor("document.querySelector('#listing-title')?.value === 'Recovered auction'");
  assert.equal(await evaluate("document.querySelector('#listing-type').value"), "auction");
  assert.equal(await evaluate("document.querySelector('#listing-type').matches(':disabled')"), true);
  assert.equal(await evaluate("document.querySelector('#auction-starting-price').value"), "10.00");
  assert.equal(await evaluate("Boolean(document.querySelector('img[src=\"https://example.invalid/recovered-photo.jpg\"]'))"), true);
  assert.equal(await evaluate("JSON.parse(sessionStorage.getItem('xchaing.pending-listing.v1')).itemId"), "123e4567-e89b-42d3-a456-426614174000");
  await evaluate("sessionStorage.removeItem('xchaing.pending-listing.v1')");

  console.log(JSON.stringify({
    offerDefault: true,
    auctionFieldsVisible: true,
    exchangeFieldHiddenForAuction: true,
    enGeLabels: true,
    englishValidationMessage: true,
    mobileNoFormOverflow: true,
    pendingCreationRestoredAfterReload: true,
    screenshotPath,
  }));
} finally {
  if (injectionId) await send("Page.removeScriptToEvaluateOnNewDocument", { identifier: injectionId });
  socket.close();
}
