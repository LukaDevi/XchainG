import { useCallback, useEffect, useRef, useState } from "react";
import { getAuctionState, requireGelAmount, subscribeToAuctionUpdates } from "../lib/auctions";
import { auctionAcceptsBids, bidFailureKind, bidMeetsMinimum, remainingAuctionSeconds, mergeAuctionSnapshot, mergeAuctionUpdate, snapshotBehindUpdate } from "../lib/auctionView";
import { acknowledgeBidRecovery, readBidRecovery, submitAuctionBidOnce } from "../lib/auctionRecovery";

const TEXT = {
  GE: {
    timeEstimate: "დრო მიახლოებითია და მოწყობილობის საათს ეფუძნება. ბიდის მიღებას სერვერი ამოწმებს.",
    serverOpen: "სერვერი ჯერ კიდევ იღებს ბიდებს",
    reviewBid: "შედეგი გადავამოწმე — ახალი ბიდის დაშვება",
    storageError: "ბრაუზერში აღდგენის მონაცემები ვერ შეინახა. ბიდი არ გაგზავნილა.",
    heading: "აუქციონის დეტალები",
    starting: "საწყისი ფასი",
    current: "მიმდინარე ფასი",
    count: "ბიდების რაოდენობა",
    minimum: "შემდეგი მინიმალური ბიდი",
    remaining: "დარჩენილი დრო",
    ended: "აუქციონი დასრულდა",
    closed: "ბიდების მიღება დასრულებულია.",
    loading: "აუქციონის მდგომარეობა იტვირთება...",
    unavailable: "აუქციონის მდგომარეობა ვერ მოიძებნა.",
    loadError: "აუქციონის მონაცემები ვერ ჩაიტვირთა. სცადე განახლება.",
    refresh: "განახლება",
    connecting: "ცოცხალ განახლებებთან დაკავშირება...",
    live: "ცოცხალი განახლებები ჩართულია",
    reconnecting: "კავშირი აღდგება; საჭიროებისას განაახლე მონაცემები.",
    signIn: "ბიდის დასადებად შედი ანგარიშში",
    owner: "საკუთარ აუქციონზე ბიდს ვერ დადებ.",
    bidLabel: "შენი ბიდი (₾)",
    bidPlaceholder: "მაგ.: 25.00",
    bidButton: "ბიდის დადება",
    submitting: "ბიდი იგზავნება...",
    invalidAmount: "შეიყვანე დადებითი თანხა GEL-ში, მაქსიმუმ ორი ათწილადით.",
    belowMinimum: "ბიდი შემდეგ მინიმალურ თანხაზე ნაკლებია.",
    minimumChanged: "სხვა ბიდმა მინიმალური თანხა შეცვალა. გადაამოწმე ახალი მინიმუმი და სცადე ხელახლა.",
    success: "ბიდი მიღებულია.",
    permission: "ბიდის დადების უფლება არ გაქვს. გადაამოწმე, რომ სწორ ანგარიშში ხარ შესული.",
    rejected: "სერვერმა ბიდი უარყო. გადაამოწმე თანხა და აუქციონის მდგომარეობა.",
    uncertain: "ქსელის შეცდომის გამო ბიდის შედეგი გაურკვეველია. ავტომატურად არ გავიმეორებთ; განაახლე მდგომარეობა და ხელახლა დადებამდე გადაამოწმე.",
  },
  EN: {
    timeEstimate: "Time is an estimate from your device clock. The server checks whether bids are still accepted.",
    serverOpen: "The server is still accepting bids",
    reviewBid: "I checked the result — allow a new bid",
    storageError: "Could not save recovery data in this browser. No bid was sent.",
    heading: "Auction details",
    starting: "Starting price",
    current: "Current price",
    count: "Number of bids",
    minimum: "Next minimum bid",
    remaining: "Time remaining",
    ended: "Auction ended",
    closed: "This auction is no longer accepting bids.",
    loading: "Loading auction state...",
    unavailable: "Auction state is unavailable.",
    loadError: "Could not load auction details. Please refresh.",
    refresh: "Refresh",
    connecting: "Connecting live updates...",
    live: "Live updates connected",
    reconnecting: "Reconnecting; refresh the state if needed.",
    signIn: "Sign in to place a bid",
    owner: "You cannot bid on your own auction.",
    bidLabel: "Your bid (GEL)",
    bidPlaceholder: "e.g. 25.00",
    bidButton: "Place bid",
    submitting: "Submitting bid...",
    invalidAmount: "Enter a positive GEL amount with at most two decimals.",
    belowMinimum: "Your bid is below the next minimum.",
    minimumChanged: "Another bid changed the minimum. Check the new amount and try again.",
    success: "Your bid was accepted.",
    permission: "You cannot place this bid. Check that you are signed in to the right account.",
    rejected: "The server rejected this bid. Check the amount and auction state.",
    uncertain: "The network response is unclear. We will not repeat the bid automatically. Refresh and check the state before bidding again.",
  },
};

function formatGel(value, lang) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  return `${new Intl.NumberFormat(lang === "GE" ? "ka-GE" : "en-US", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(amount)} ₾`;
}

function formatRemaining(seconds, lang) {
  if (seconds <= 0) return TEXT[lang].ended;
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return `${days ? `${days} ${lang === "GE" ? "დღე" : "days"} ` : ""}${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

export default function AuctionDetails({ client, itemId, ownerId, currentUserId, lang, isDarkMode, onSignIn }) {
  const text = TEXT[lang] ?? TEXT.EN;
  const [auction, setAuction] = useState(null);
  const [loadStatus, setLoadStatus] = useState("loading");
  const [liveStatus, setLiveStatus] = useState("connecting");
  const [now, setNow] = useState(Date.now);
  const [bidAmount, setBidAmount] = useState("");
  const [feedback, setFeedback] = useState(() => readBidRecovery(itemId, currentUserId) ? "uncertain" : "");
  const [submitting, setSubmitting] = useState(false);
  const [needsReview, setNeedsReview] = useState(() => Boolean(readBidRecovery(itemId, currentUserId)));
  const mountedRef = useRef(false);
  const generationRef = useRef(0);
  const snapshotRef = useRef(null);
  const watermarkRef = useRef(null);
  const requestRef = useRef(0);
  const submittingRef = useRef(false);

  const refreshState = useCallback(async () => {
    if (!mountedRef.current) return null;
    const generation = generationRef.current;
    const request = ++requestRef.current;
    try {
      const next = await getAuctionState(client, itemId);
      if (!mountedRef.current || generation !== generationRef.current || request !== requestRef.current) return null;
      if (snapshotBehindUpdate(next, watermarkRef.current) && next.accepting_bids !== false) {
        setLoadStatus("error");
        return null;
      }
      const merged = mergeAuctionSnapshot(snapshotRef.current, next);
      snapshotRef.current = merged;
      setAuction(merged);
      setLoadStatus(merged ? "ready" : "unavailable");
      return merged;
    } catch {
      if (mountedRef.current && generation === generationRef.current && request === requestRef.current) setLoadStatus("error");
      return null;
    }
  }, [client, itemId]);

  useEffect(() => {
    const generation = ++generationRef.current;
    mountedRef.current = true;
    Promise.resolve().then(() => {
      if (mountedRef.current && generation === generationRef.current) void refreshState();
    });
    let unsubscribe;
    try {
      unsubscribe = subscribeToAuctionUpdates(client, itemId, (update) => {
        if (!watermarkRef.current || Number(update.bidCount) >= Number(watermarkRef.current.bidCount)) watermarkRef.current = update;
        const merged = mergeAuctionUpdate(snapshotRef.current, update);
        snapshotRef.current = merged;
        if (merged) setAuction(merged);
        void refreshState();
      }, (status) => {
        if (status === "SUBSCRIBED") {
          setLiveStatus("live");
          void refreshState();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setLiveStatus("reconnecting");
        }
      });
    } catch {
      Promise.resolve().then(() => {
        if (mountedRef.current && generation === generationRef.current) setLiveStatus("reconnecting");
      });
    }
    let ticks = 0;
    let previousSeconds;
    const timer = window.setInterval(() => {
      const time = Date.now();
      setNow(time);
      const remaining = remainingAuctionSeconds(snapshotRef.current?.ends_at, time);
      const crossedDeadline = previousSeconds > 0 && remaining === 0;
      previousSeconds = remaining;
      ticks += 1;
      // Expiry emits no Realtime event. Poll even if the device clock is behind,
      // and recheck immediately when its estimated countdown reaches zero.
      if (crossedDeadline || (ticks % 10 === 0 && snapshotRef.current?.accepting_bids !== false)) {
        if (crossedDeadline) setLoadStatus("checking");
        void refreshState();
      }
    }, 1000);
    const onResume = () => { if (document.visibilityState === "visible") void refreshState(); };
    document.addEventListener("visibilitychange", onResume);
    window.addEventListener("online", onResume);
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      requestRef.current += 1;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onResume);
      window.removeEventListener("online", onResume);
      if (unsubscribe) Promise.resolve(unsubscribe()).catch(() => {});
    };
  }, [client, itemId, refreshState]);

  const secondsLeft = auction ? remainingAuctionSeconds(auction.ends_at, now) : 0;
  const accepting = auctionAcceptsBids(auction);
  const isOwner = Boolean(currentUserId && ownerId === currentUserId);

  const handleRefresh = async () => {
    await refreshState();
  };

  const handleReview = () => {
    if (!acknowledgeBidRecovery(itemId, currentUserId)) return;
    setNeedsReview(false);
    setBidAmount("");
    setFeedback("");
  };

  const handleBid = async (event) => {
    event.preventDefault();
    if (submittingRef.current || needsReview || loadStatus !== "ready") return;
    if (!currentUserId) {
      onSignIn();
      return;
    }
    if (isOwner) {
      setFeedback("owner");
      return;
    }
    if (!accepting) {
      setFeedback("closed");
      return;
    }

    let amount;
    try {
      amount = requireGelAmount(bidAmount, "Bid");
    } catch {
      setFeedback("invalidAmount");
      return;
    }
    if (!bidMeetsMinimum(amount, auction.next_minimum_bid)) {
      setFeedback("belowMinimum");
      return;
    }

    submittingRef.current = true;
    const generation = generationRef.current;
    setSubmitting(true);
    setFeedback("");
    try {
      // Recheck the server immediately before the write; the local countdown
      // cannot decide expiry, and the server may have received a competing bid.
      const beforeBid = await refreshState();
      if (!mountedRef.current || generation !== generationRef.current) return;
      if (!beforeBid) { setFeedback("loadError"); return; }
      if (!auctionAcceptsBids(beforeBid)) { setFeedback("closed"); return; }
      if (!bidMeetsMinimum(amount, beforeBid.next_minimum_bid)) { setFeedback("minimumChanged"); return; }
      const result = await submitAuctionBidOnce(client, { itemId, userId: currentUserId, amount });
      if (!mountedRef.current || generation !== generationRef.current) return;
      const latest = await refreshState();
      if (mountedRef.current && generation === generationRef.current) {
        const kind = result.status === "accepted" ? "success"
          : result.status === "storage_error" ? "storageError"
            : result.status === "uncertain" ? "uncertain" : bidFailureKind(result.error, beforeBid, latest);
        if (kind === "success") setBidAmount("");
        if (kind === "closed" && snapshotRef.current) {
          snapshotRef.current = { ...snapshotRef.current, accepting_bids: false };
          setAuction(snapshotRef.current);
        }
        setFeedback(kind);
        if (kind === "uncertain") setNeedsReview(true);
      }
    } finally {
      submittingRef.current = false;
      if (mountedRef.current && generation === generationRef.current) setSubmitting(false);
    }
  };

  const metrics = auction && [
    [text.starting, formatGel(auction.starting_price, lang)],
    [text.current, formatGel(auction.current_price, lang)],
    [text.count, String(auction.bid_count)],
    [text.minimum, formatGel(auction.next_minimum_bid, lang)],
    [text.remaining, accepting && secondsLeft === 0 ? text.serverOpen : formatRemaining(secondsLeft, lang)],
  ];

  return (
    <section aria-label={text.heading} className={`space-y-4 rounded-xl border p-4 sm:p-5 ${isDarkMode ? "border-slate-800 bg-slate-950/70" : "border-slate-200 bg-slate-50"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-black">{text.heading}</h3>
        <span className={`text-[11px] font-medium ${liveStatus === "live" ? "text-emerald-500" : "text-amber-500"}`}>
          {liveStatus === "live" ? text.live : liveStatus === "connecting" ? text.connecting : text.reconnecting}
        </span>
      </div>

      {loadStatus === "loading" && <p className="text-xs text-slate-400">{text.loading}</p>}
      {loadStatus === "unavailable" && <p className="text-xs text-slate-400">{text.unavailable}</p>}
      {loadStatus === "error" && <p role="alert" className="text-xs text-red-400">{text.loadError}</p>}

      {metrics && (
        <dl className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
          {metrics.map(([label, value]) => (
            <div key={label} className={`min-w-0 rounded-lg border p-3 ${isDarkMode ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white"}`}>
              <dt className="text-[11px] text-slate-400">{label}</dt>
              <dd className="mt-1 break-words text-sm font-black text-[#FF5500]">{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {auction && <p className="text-[11px] leading-relaxed text-slate-400">{text.timeEstimate}</p>}

      {auction && !accepting && <p className="text-xs font-semibold text-amber-500">{text.closed}</p>}
      {auction && accepting && isOwner && <p className="text-xs font-semibold text-amber-500">{text.owner}</p>}
      {auction && accepting && !isOwner && !currentUserId && (
        <button type="button" onClick={onSignIn} className="min-h-11 w-full rounded-lg bg-[#FF5500] px-4 py-2 text-xs font-bold text-white hover:bg-[#e04b00]">
          {text.signIn}
        </button>
      )}
      {auction && accepting && !isOwner && currentUserId && (
        <form onSubmit={handleBid} className="space-y-2">
          <label htmlFor={`auction-bid-${itemId}`} className="block text-xs font-semibold">{text.bidLabel}</label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id={`auction-bid-${itemId}`}
              type="text"
              inputMode="decimal"
              required
              value={bidAmount}
              onChange={(event) => setBidAmount(event.target.value)}
              placeholder={text.bidPlaceholder}
              disabled={submitting || needsReview || loadStatus !== "ready"}
              className={`min-h-11 min-w-0 flex-1 rounded-lg border px-3 text-sm outline-none focus:border-[#FF5500] disabled:opacity-60 ${isDarkMode ? "border-slate-700 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-900"}`}
            />
            <button type="submit" disabled={submitting || needsReview || loadStatus !== "ready"} className="min-h-11 rounded-lg bg-[#FF5500] px-5 py-2 text-xs font-bold text-white hover:bg-[#e04b00] disabled:cursor-not-allowed disabled:opacity-60">
              {submitting ? text.submitting : text.bidButton}
            </button>
          </div>
        </form>
      )}
      {feedback && <p role="alert" className={`text-xs leading-relaxed ${feedback === "success" ? "text-emerald-500" : "text-amber-500"}`}>{text[feedback]}</p>}
      {needsReview && <button type="button" onClick={handleReview} disabled={submitting || loadStatus !== "ready"} className="min-h-11 w-full rounded-lg border border-amber-500 px-3 py-2 text-xs font-bold text-amber-500 disabled:opacity-50">{text.reviewBid}</button>}
      <button type="button" onClick={handleRefresh} className={`min-h-10 rounded-lg border px-3 py-2 text-xs font-bold ${isDarkMode ? "border-slate-700 text-slate-200" : "border-slate-300 text-slate-700"}`}>
        {text.refresh}
      </button>
    </section>
  );
}
