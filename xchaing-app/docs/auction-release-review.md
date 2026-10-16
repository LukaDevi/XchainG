# Auction release review — 2026-10-16

Local review completed. Nothing staged, committed, pushed, deployed, or executed
against production. Existing work outside the auction feature remains untouched.
Both SQL migrations were already applied by the user; do not run them again.

## Explicit release allowlist

Paths below are relative to `xchaing-app/`. This is a review list, not a staging
operation. Do not add the entire working tree.

| File | Scope |
| --- | --- |
| `src/App.jsx` | **Auction hunks only**, including creation recovery and details integration |
| `src/components/AuctionDetails.jsx` | Auction metrics, bidding, expiry, Realtime lifecycle, EN/GE |
| `src/lib/auctions.js` | Validated RPC calls and public summary subscription |
| `src/lib/auctions.test.js` | RPC and subscription tests |
| `src/lib/auctionView.js` | Monotonic state merging, amount comparison, expiry/refusal handling |
| `src/lib/auctionView.test.js` | Ordering, price precision, clock and refusal regressions |
| `src/lib/auctionRecovery.js` | Pending creation and bid recovery; duplicate submission protection |
| `src/lib/auctionRecovery.test.js` | Recovery storage, remount and malformed response regressions |
| `src/lib/listingCreation.js` | Atomic auction creation, stable item ID and conservative photo cleanup |
| `src/lib/listingCreation.test.js` | Creation, retry, lost response, photo and offer regressions |
| `scripts/verifyListingFormBrowser.mjs` | Local mocked form and reload recovery checks |
| `scripts/verifyAuctionDetailsBrowser.mjs` | Local mocked bid, ordering, expiry and cleanup checks |
| `supabase/migrations/20261014000000_auction_core.sql` | Already applied SQL; version-control history only |
| `supabase/migrations/20261015000000_create_auction_listing.sql` | Already applied SQL; version-control history only |
| `supabase/queries/auction_schema_preflight.sql` | Read-only inspection query |
| `supabase/queries/auction_schema_postflight.sql` | Read-only inspection query |
| `supabase/tests/verify_auction_core.py` | Existing isolated PostgreSQL test script; not rerun in this review |
| `supabase/tests/verify_create_auction_listing.py` | Existing isolated atomic creation test; not rerun in this review |
| `docs/auction-release-review.md` | This review and release boundary |

`App.jsx` also contains independent AI work. Exclude the `findMatchesWithAI`
import, four AI state variables, `generateAIMatches` and `sendAIMatchOffer`, and
the AI matches header/button/results panel. Do not stage the whole file.
A temporary candidate reconstructed from HEAD plus the 29 auction diff hunks
(excluding four AI hunks and the AI import) passed lint and build. The real
working file and Git index were not replaced.

Exclude root `src/`, `src/services/`, both root and app package/lockfile changes,
`schema.sql`, the migration ZIP, and Supabase CLI initialization/config files.
No new dependency is required by the auction feature. `.env`, `.env.local`,
`.vercel`, `node_modules`, and `dist` are ignored and not tracked.

A source scan found a possible embedded secret in `src/services/aiMatcher.js`.
That file and its App integration are excluded. No value is reproduced here;
no key was revoked or changed. Review/rotate that key separately before
publishing the independent AI feature. The allowlisted source files had no
matches for the scanned credential signatures; this is not a credential audit
of Git history or previously published bundles.

## Corrected behavior

- An uncertain creation keeps its item ID and image, including when a later
  retry is rejected while the original request might still commit. Creation
  is reconciled by ID and owner/type/image before a same-ID retry. Auction
  creation uses only `create_auction_listing`; ordinary offers keep their insert.
- The pending creation metadata is saved before the database request and
  restored after a same-tab reload. It contains no photo bytes or credentials.
  Failed recovery storage prevents an unprotected write. Restored fields stay
  locked and the saved photo does not require a new capture.
- A pending or uncertain bid stays blocked after closing/reopening details or
  reloading. Refresh does not unlock it; explicit acknowledgement is required
  before a new bid. Neither an ambiguous response nor a malformed success ID
  causes an automatic retry.
- RPC and Realtime counters/prices merge monotonically. Stale responses cannot
  reduce the price/count or reopen a server-closed auction. A server expiry
  decision still closes the form when its counters lag the newest event.
- Device time drives only an approximate countdown. The server is checked
  immediately before bidding, on reconnect/resume, on estimated expiry, and
  every ten seconds while open. Server refusals remain authoritative.
- Subscription, interval and browser event listeners are cleaned up on close;
  responses belonging to an old component lifecycle are ignored.

## Verification evidence

- Full `npm.cmd run lint`: passed.
- Full `npm.cmd run build`: passed. Main JS bundle 962.77 kB before gzip;
  Vite reports the existing >500 kB chunk advisory.
- `node --test src/lib/*.test.js`: **31 passed, 0 failed**, including the existing
  five listing filter tests.
- Chrome, local Vite and **mocked Supabase**: EN/GE and 390px layout, offer default,
  auction fields, validation, recovered creation after reload, owner/anonymous
  restrictions, duplicate submit, competing bid, uncertain bid persistence,
  reconnect refetch, reordered/stale responses, device-clock disagreement,
  expiry with stale counters, timer and subscription cleanup all passed.
- Changed browser test scripts passed ESLint after their final edits. The
  details runner now initializes its own mock account state and both runners
  remove their injected scripts on completion.
- Separate auction-only candidate: lint and build passed; main JS 593.99 kB
  before gzip, still above Vite's advisory threshold. No unrelated AI source or
  local environment files were included in this candidate.
- SQL was reviewed against the RPC calls and prior supplied live schema results.
  Neither SQL file changed. Previously completed isolated PostgreSQL tests were
  not repeated, and no SQL/database commands were executed during this review.

## Remaining real-service checks and limits

The browser tests use fake HTTP/RPC responses and fake channel callbacks. They
do not prove current production Auth/RLS/Storage policies or actual Realtime
delivery. A controlled staging check should still cover actual authenticated
creation and rollback, Storage upload/info/delete permissions, real concurrent
clients, anonymous summary delivery, reconnect and token refresh, and lost
network responses. Production contains no records created by these tests.

Session storage protects reloads within the same browser tab. Clearing storage,
closing the tab or switching devices is not durable recovery. An unresolved
creation can conservatively retain its photo and locked attempt until its
outcome is established. Bid RPCs have no server idempotency key; explicit user
acknowledgement allows a new bid, not an automatic retry of the old one.

Countdown accuracy depends on device time; server polling may take up to ten
seconds to display expiry, and every bid is still rejected/accepted by the
database deadline. Exact server-synchronized countdown is not implemented.

Auction settlement/winner/payment are deliberately absent. The current SQL
trigger blocks any item status change after bids, including through a
privileged function. No completion mechanism was added in this review.

## Release branch verification — 2026-10-16

The separately authorized release is prepared on `release/auction-20261016`
from remote main `7bb54aa6e5a009c2ce67a36587a3e6ee0462fcb6`, in an isolated Git
worktree. It includes exactly the 19 paths above. App contains only the auction
changes; the original working tree, including its independent AI work, is
preserved. The earlier "nothing staged/committed" statement records the review
phase before this separate release authorization.

The exact release source passed full lint, build, all 31 Node tests, and both
mocked Chrome browser scripts. Its build emits the >500 kB chunk advisory.
The final selected source scan found no credential-signature matches. No
additional dependency changes or local environment files are included.

The existing Vercel project is `dev-brothers2/xchain-g`, linked to
`LukaDevi/XchainG`, Root Directory `xchaing-app`, Production Branch `main`.
At release preparation time, `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` target only Production; Preview has neither variable.
No environment configuration was changed. A Preview built with this
configuration has no Supabase client, so real auction/authentication flows
cannot be verified there. Preview checks are limited to loading the page and
read-only interface inspection. No migration or production record is created
by this release procedure; already applied migrations remain historical files.
