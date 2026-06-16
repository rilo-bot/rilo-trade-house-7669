import { ListingStatus, SaleMethod, UserRole } from "@/lib/enums";
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from "@/lib/errors";
import type { CurrentUser } from "@/lib/auth/guards";
import {
  findAuctionsByOwner,
  findListingById,
  findStartedActiveAuctions,
  setListingStatus,
  type Listing,
} from "@/features/listings/listings.repository";
import { countFavoritesByListings } from "@/features/favorites/favorites.repository";
import {
  auctionDurationMs,
  auctionPhase,
  auctionPhaseOf,
  AUCTION_LIVE_MS,
  isAuctionListing,
  nzWallClockToInstant,
  toNzWallClock,
} from "./auction-window";
import {
  ANTI_SNIPE_MINUTES,
  maskBidderName,
  minBidIncrement,
  minNextBid,
  type AuctionLivePhase,
  type AuctionResult,
  type AuctionState,
} from "./bidding";
import {
  claimHighBid,
  countBids,
  countRegistrationsByListing,
  deleteAutoBid,
  DEMO_AUCTION_SEED_SOURCE,
  existsRegistration,
  findDemoAuction,
  findRegistrationById,
  findRegistrationsByBidder,
  findRegistrationsByListing,
  getAuctionOutcome,
  getAuctionRuntime,
  getAutoBidFor,
  getHighBid,
  insertBid,
  insertRegistration,
  listAllBids,
  listAutoBids,
  listRecentBids,
  setAuctionCloseAt,
  setAuctionOutcome,
  setDemoAuctionDate,
  updateRegistrationStatus,
  upsertAutoBid,
  type Bid,
  type Registration,
} from "./auctions.repository";
import type { CreateRegistrationInput } from "./auctions.schema";
import type { RegistrationStatus } from "@/lib/enums";

/**
 * Business logic for auctions. Registering to bid requires a signed-in user
 * (`bidder`); the bidder identity comes from the session, never the client.
 * Throws AppError subclasses for the controller to map to HTTP.
 */
export async function registerToBid(
  bidder: CurrentUser,
  input: CreateRegistrationInput,
): Promise<Registration> {
  const listing = await findListingById(input.listingId);
  if (!listing || listing.status !== ListingStatus.Active) {
    throw new NotFoundError("Auction not found");
  }
  if (listing.price.method !== SaleMethod.Auction || !listing.price.auctionDate) {
    throw new BadRequestError("This listing isn't an auction");
  }
  if (auctionPhaseOf(listing.price) === "ended") {
    throw new BadRequestError("This auction has already ended");
  }
  if (bidder.id === listing.ownerId) {
    throw new BadRequestError("You can't register to bid on your own auction");
  }
  if (await existsRegistration(bidder.id, listing.id)) {
    throw new BadRequestError(
      "You're already registered to bid on this auction",
    );
  }

  return insertRegistration({
    listingId: listing.id,
    ownerId: listing.ownerId,
    bidderId: bidder.id,
    name: input.name,
    phone: input.phone,
    email: input.email || undefined,
    bidMethod: input.bidMethod,
    listingTitle: listing.title,
    listingLocality: listing.location.locality,
    listingCity: listing.location.city,
  });
}

/** Registrations a bidder has made (their "auctions I'm registered for"). */
export async function listMyRegistrations(
  bidder: CurrentUser,
): Promise<Registration[]> {
  return findRegistrationsByBidder(bidder.id);
}

/** Registrations on a listing — owner/admin only (manage who can bid). */
export async function listListingRegistrations(
  user: CurrentUser,
  listingId: string,
): Promise<Registration[]> {
  const listing = await findListingById(listingId);
  if (!listing) throw new NotFoundError("Auction not found");
  if (listing.ownerId !== user.id && user.role !== UserRole.Admin) {
    throw new ForbiddenError("You can only manage your own auctions");
  }
  return findRegistrationsByListing(listingId);
}

/** Approve/decline a registration — owner/admin only. */
export async function changeRegistrationStatus(
  user: CurrentUser,
  id: string,
  status: RegistrationStatus,
): Promise<Registration> {
  const registration = await findRegistrationById(id);
  if (!registration) throw new NotFoundError("Registration not found");
  if (registration.ownerId !== user.id && user.role !== UserRole.Admin) {
    throw new ForbiddenError("You can only manage your own auctions");
  }
  const updated = await updateRegistrationStatus(id, status);
  if (!updated) throw new NotFoundError("Registration not found");
  return updated;
}

/* ── always-live demo auction ─────────────────────────────────────────────────
 * The seeder plants ONE demo auction (seedSource "auction-demo") that should read
 * as "live" at all times — locally and in production — without a cron or a
 * long-running refresher. We keep it live lazily: whenever an auction surface is
 * rendered, if the demo's start time has drifted out of the live window we nudge
 * it back to a couple of minutes ago. Idempotent, best-effort, and only ever
 * touches that single seeded row.                                                */

/** True when this listing is the seeded always-live demo auction. */
export function isDemoAuction(listing: Listing): boolean {
  return (
    (listing as { seedSource?: string }).seedSource === DEMO_AUCTION_SEED_SOURCE
  );
}

/** Keep the seeded demo auction permanently "live" (no-op if there's no demo or
 *  it's already live). Safe to call on any auction page render. */
export async function ensureDemoAuctionLive(now: Date = new Date()): Promise<void> {
  try {
    const demo = await findDemoAuction();
    if (!demo) return;
    if (demo.auctionDate && auctionPhase(demo.auctionDate, now) === "live") return;
    // Start two minutes ago → unambiguously live, ~58 min before it drifts again.
    await setDemoAuctionDate(
      demo.id,
      toNzWallClock(new Date(now.getTime() - 2 * 60 * 1000)),
    );
  } catch {
    /* demo convenience only — never block a page render on it. */
  }
}

/* ── live bidding ──────────────────────────────────────────────────────────── */

const ANTI_SNIPE_MS = ANTI_SNIPE_MINUTES * 60 * 1000;
const PROXY_MAX_ITERATIONS = 40; // backstop for the auto-bid resolution loop

/** Load + validate that a listing is an active auction; returns the listing.
 *  Used by the WRITE paths (place bid / set auto-bid), so a sold/withdrawn
 *  auction (status !== Active) is correctly rejected. */
async function getAuctionListing(listingId: string): Promise<Listing> {
  const listing = await findListingById(listingId);
  if (!listing) throw new NotFoundError("Auction not found");
  if (listing.price.method !== SaleMethod.Auction || !listing.price.auctionDate) {
    throw new NotFoundError("This listing isn't an auction");
  }
  if (listing.status !== ListingStatus.Active) {
    throw new BadRequestError("This auction is no longer available.");
  }
  return listing;
}

/**
 * Load an auction for a READ/VIEW — ANY status, so an ended/sold auction still
 * resolves and can render its final result. (The public detail page itself 404s
 * once a listing leaves Active; this lets the bidding panel's last poll and the
 * owner dashboard still show the outcome.) Throws only when the listing is
 * missing or isn't an auction at all.
 */
async function getAuctionListingForView(listingId: string): Promise<Listing> {
  const listing = await findListingById(listingId);
  if (!listing) throw new NotFoundError("Auction not found");
  if (!isAuctionListing(listing.price)) {
    throw new NotFoundError("This listing isn't an auction");
  }
  return listing;
}

/** Opening bid floor — the listing's headline amount, price guide, or RV. */
function startingBidFor(listing: Listing): number {
  return (
    listing.price.amount || listing.price.priceGuide || listing.rateableValue || 0
  );
}

/**
 * Resolve start/close/phase. `auctionDate` is an offset-less NZ wall-clock
 * string, so it's converted to an absolute instant via Pacific/Auckland — phase
 * decisions are then correct on any host timezone. A persisted close time is only
 * honoured when it was computed from the CURRENT auctionDate (reschedule-safe).
 */
async function timing(listing: Listing, now: Date) {
  const startMs = nzWallClockToInstant(listing.price.auctionDate as string);
  // Unparseable date → treat as upcoming (matches auctionPhase), never "ended".
  if (Number.isNaN(startMs)) {
    const farFuture = new Date(now.getTime() + AUCTION_LIVE_MS);
    return { start: farFuture, closeAt: farFuture, phase: "upcoming" as const };
  }
  const start = new Date(startMs);
  const defaultClose = new Date(startMs + auctionDurationMs(listing.price));
  const runtime = await getAuctionRuntime(listing.id);
  const closeAt =
    runtime.closeAt && runtime.basis === listing.price.auctionDate
      ? runtime.closeAt
      : defaultClose;
  const t = now.getTime();
  const phase: AuctionState["phase"] =
    t < start.getTime() ? "upcoming" : t < closeAt.getTime() ? "live" : "ended";
  return { start, closeAt, phase };
}

/* ── settlement (auto-close ended auctions) ──────────────────────────────────
 * When an auction's (possibly anti-snipe-extended) close has passed we finalize
 * it ONCE: persist the outcome and — when it sold — flip the listing to
 * RentedSold so it leaves the live marketplace. Reserve-aware: a high bid below
 * a set reserve "passes in" (the listing stays Active for negotiation); with no
 * reserve, any bid sells.                                                        */

/** The outcome implied by the high bid + the listing's (secret) reserve. */
function outcomeFor(listing: Listing, high: Bid | null): AuctionResult["outcome"] {
  if (!high) return "no_bids";
  const reserve = listing.price.reserve;
  return reserve == null || high.amount >= reserve ? "sold" : "passed_in";
}

/**
 * Finalize an auction if its close has passed. Idempotent — a second call returns
 * the already-stored outcome without rewriting or re-flipping the listing.
 * Returns null when the auction isn't actually ended yet. The returned
 * `winnerName` is the REAL bidder name (owner-facing); public callers must mask.
 */
export async function settleAuctionIfEnded(
  listing: Listing,
  now: Date = new Date(),
): Promise<AuctionResult | null> {
  if (!isAuctionListing(listing.price)) return null;
  // The seeded demo auction is kept permanently "live" — never settle it (that
  // would flip it to Sold and `findDemoAuction` could no longer revive it).
  if (isDemoAuction(listing)) return null;
  const { phase } = await timing(listing, now);
  if (phase !== "ended") return null;

  const basis = listing.price.auctionDate as string;

  // Already settled for THIS auctionDate → return it unchanged (idempotent).
  const existing = await getAuctionOutcome(listing.id);
  if (existing && existing.basis === basis) {
    return {
      outcome: existing.outcome,
      winnerName: existing.winnerName,
      finalAmount: existing.finalAmount,
      settledAt: existing.settledAt,
    };
  }

  const high = await getHighBid(listing.id);
  const outcome = outcomeFor(listing, high);

  await setAuctionOutcome({
    listingId: listing.id,
    basis,
    outcome,
    winnerId: high?.bidderId ?? null,
    winnerName: high?.bidderName ?? null,
    finalAmount: high?.amount ?? null,
  });

  // Sold → remove it from the live marketplace. Guard on Active so we never
  // stomp a status the owner set manually in the meantime.
  if (outcome === "sold" && listing.status === ListingStatus.Active) {
    await setListingStatus(listing.id, ListingStatus.RentedSold);
  }

  return {
    outcome,
    winnerName: high?.bidderName ?? null,
    finalAmount: high?.amount ?? null,
    settledAt: new Date().toISOString(),
  };
}

/**
 * Sweep every started, still-Active auction and settle the ones whose close has
 * passed — the `/api/cron/auctions` job. This is what guarantees auctions
 * finalize (and sold listings flip to RentedSold) "everywhere", even when nobody
 * is viewing them. Best-effort per listing: one bad row never aborts the run.
 */
export async function settleEndedAuctions(now: Date = new Date()): Promise<{
  checked: number;
  settled: number;
  sold: number;
  passedIn: number;
  noBids: number;
  alreadySettled: number;
}> {
  const candidates = await findStartedActiveAuctions(toNzWallClock(now));
  let settled = 0;
  let sold = 0;
  let passedIn = 0;
  let noBids = 0;
  let alreadySettled = 0;
  for (const listing of candidates) {
    try {
      const before = await getAuctionOutcome(listing.id);
      if (before && before.basis === listing.price.auctionDate) {
        alreadySettled++;
        continue;
      }
      const res = await settleAuctionIfEnded(listing, now);
      if (!res) continue; // not actually ended (anti-snipe window still open)
      settled++;
      if (res.outcome === "sold") sold++;
      else if (res.outcome === "passed_in") passedIn++;
      else noBids++;
    } catch {
      /* skip this row; the next sweep retries it. */
    }
  }
  return { checked: candidates.length, settled, sold, passedIn, noBids, alreadySettled };
}

/**
 * Full live snapshot for the bidding panel. Reads the SECRET reserve to derive a
 * `reserveMet` boolean — the figure itself never leaves the server. Once the
 * auction has ended it finalizes it on view (idempotent) and includes a masked
 * `result`.
 */
export async function getAuctionState(
  listingId: string,
  viewer: CurrentUser | null,
): Promise<AuctionState> {
  let listing = await getAuctionListingForView(listingId);
  const now = new Date();
  // Keep the demo auction live on its own detail page too (cost only for the demo).
  if (isDemoAuction(listing) && auctionPhaseOf(listing.price, now) !== "live") {
    await ensureDemoAuctionLive(now);
    listing = await getAuctionListingForView(listingId);
  }
  const { start, closeAt, phase } = await timing(listing, now);

  const startingBid = startingBidFor(listing);
  const high = await getHighBid(listing.id);
  const currentBid = high?.amount ?? null;

  const reserve = listing.price.reserve;
  const hasReserve = reserve != null;
  const reserveMet = hasReserve && currentBid != null && currentBid >= reserve;

  // Once closed, finalize on view (idempotent, best-effort) and surface the
  // result with the winner's name MASKED for this public snapshot.
  let result: AuctionResult | null = null;
  if (phase === "ended") {
    try {
      await settleAuctionIfEnded(listing, now);
    } catch {
      /* best-effort — still build a result from the high bid below. */
    }
    result = {
      outcome: outcomeFor(listing, high),
      winnerName: high ? maskBidderName(high.bidderName) : null,
      finalAmount: currentBid,
      settledAt: null,
    };
  }

  const [bidCount, registeredBidders, favCounts, recent] = await Promise.all([
    countBids(listing.id),
    countRegistrationsByListing(listing.id),
    countFavoritesByListings([listing.id]),
    listRecentBids(listing.id, 6),
  ]);

  const registered = viewer
    ? await existsRegistration(viewer.id, listing.id, { excludeDeclined: true })
    : false;
  const autoBid = viewer ? await getAutoBidFor(listing.id, viewer.id) : null;

  return {
    phase,
    auctionDate: listing.price.auctionDate as string,
    startsAt: start.toISOString(),
    endsAt: closeAt.toISOString(),
    currentBid,
    startingBid,
    minNextBid: minNextBid(currentBid, startingBid),
    increment: minBidIncrement(currentBid ?? startingBid),
    bidCount,
    registeredBidders,
    watching: favCounts[listing.id] ?? 0,
    reserveMet,
    hasReserve,
    result,
    recentBids: recent.map((b) => ({
      name: maskBidderName(b.bidderName),
      amount: b.amount,
      at: b.createdAt,
      you: viewer?.id === b.bidderId,
    })),
    viewer: {
      signedIn: !!viewer,
      isOwner: viewer?.id === listing.ownerId,
      registered,
      isHighBidder: !!viewer && high?.bidderId === viewer.id,
      autoBidMax: autoBid?.maxAmount ?? null,
    },
    antiSnipingMinutes: ANTI_SNIPE_MINUTES,
  };
}

/** Shared gate: a signed-in, registered, non-owner bidder on a LIVE auction. */
async function assertCanBid(
  listing: Listing,
  bidder: CurrentUser,
  now: Date,
): Promise<void> {
  const { phase } = await timing(listing, now);
  if (phase !== "live") {
    throw new BadRequestError(
      phase === "upcoming"
        ? "Bidding hasn't opened yet."
        : "This auction has closed.",
    );
  }
  if (bidder.id === listing.ownerId) {
    throw new BadRequestError("You can't bid on your own auction.");
  }
  if (!(await existsRegistration(bidder.id, listing.id, { excludeDeclined: true }))) {
    throw new ForbiddenError("Register to bid before placing a bid.");
  }
}

/**
 * Place a manual bid. Validates live + registered + amount ≥ min next bid,
 * extends the close time if it lands inside the anti-snipe window, then lets the
 * proxy engine counter on behalf of any auto-bidders.
 */
export async function placeBid(
  bidder: CurrentUser,
  listingId: string,
  amount: number,
): Promise<AuctionState> {
  const listing = await getAuctionListing(listingId);
  const now = new Date();
  await assertCanBid(listing, bidder, now);

  const startingBid = startingBidFor(listing);
  const high = await getHighBid(listing.id);
  const required = minNextBid(high?.amount ?? null, startingBid);
  if (amount < required) {
    throw new BadRequestError(
      `Your bid must be at least $${required.toLocaleString("en-NZ")}.`,
    );
  }

  // Atomically claim the high at this amount BEFORE inserting, so a concurrent
  // bid at a different amount can't slip in below the committed high.
  if (!(await claimHighBid(listing.id, amount))) {
    throw new BadRequestError("Another bid just landed — refresh and try again.");
  }
  try {
    await insertBid({
      listingId: listing.id,
      bidderId: bidder.id,
      bidderName: bidder.name,
      amount,
    });
  } catch (err) {
    if (isDuplicateKey(err)) {
      throw new BadRequestError(
        "Another bid just landed — refresh and try again.",
      );
    }
    throw err;
  }

  await extendCloseIfSniping(listing, now);
  await resolveAutoBids(listing.id, startingBid, bidder.id);

  return getAuctionState(listing.id, bidder);
}

/** Set or clear the viewer's proxy ("auto-bid") ceiling, then resolve proxies. */
export async function setAutoBid(
  bidder: CurrentUser,
  listingId: string,
  maxAmount: number | null,
): Promise<AuctionState> {
  const listing = await getAuctionListing(listingId);
  const now = new Date();

  if (maxAmount == null) {
    await deleteAutoBid(listing.id, bidder.id);
    return getAuctionState(listing.id, bidder);
  }

  await assertCanBid(listing, bidder, now);
  const startingBid = startingBidFor(listing);
  const high = await getHighBid(listing.id);
  const required = minNextBid(high?.amount ?? null, startingBid);
  if (maxAmount < required) {
    throw new BadRequestError(
      `Your maximum must be at least $${required.toLocaleString("en-NZ")}.`,
    );
  }

  await upsertAutoBid({
    listingId: listing.id,
    bidderId: bidder.id,
    bidderName: bidder.name,
    maxAmount,
  });
  await resolveAutoBids(listing.id, startingBid, bidder.id);

  return getAuctionState(listing.id, bidder);
}

/** Push the close time out by the anti-snipe window if a bid lands near close. */
async function extendCloseIfSniping(listing: Listing, now: Date): Promise<void> {
  const { closeAt } = await timing(listing, now);
  if (closeAt.getTime() - now.getTime() <= ANTI_SNIPE_MS) {
    await setAuctionCloseAt(
      listing.id,
      listing.price.auctionDate as string,
      new Date(now.getTime() + ANTI_SNIPE_MS),
    );
  }
}

/**
 * eBay-style proxy resolution in PRICE SPACE (one jump, not an increment walk):
 * the highest-ceiling auto-bidder (other than the current leader) takes the lead
 * at just enough to beat the runner-up's ceiling — capped at their own max, and
 * never below the legal next bid. When a higher ceiling can't make a full
 * increment but can still beat the current high, it bids its max (cap-to-max) so
 * the highest ceiling always wins. Bounded by `PROXY_MAX_ITERATIONS`.
 */
async function resolveAutoBids(
  listingId: string,
  startingBid: number,
  triggeredBy: string,
): Promise<void> {
  for (let i = 0; i < PROXY_MAX_ITERATIONS; i++) {
    const high = await getHighBid(listingId);
    const leaderId = high?.bidderId ?? null;
    const currentAmt = high?.amount ?? null;

    // ALL auto-bidders, strongest ceiling first (the just-acted human breaks
    // ties so an equal ceiling can't leapfrog them).
    const autos = (await listAutoBids(listingId)).sort(
      (a, b) =>
        b.maxAmount - a.maxAmount ||
        (a.bidderId === triggeredBy ? -1 : 0) -
          (b.bidderId === triggeredBy ? -1 : 0),
    );
    if (autos.length === 0) break;

    const top = autos[0];
    // The strongest-ceiling auto-bidder already leads → settled.
    if (top.bidderId === leaderId) break;
    // Even the top ceiling can't beat the current high → no proxy bid possible.
    if (currentAmt != null && top.maxAmount <= currentAmt) break;

    // Clearing price = one increment over the strongest competing interest (the
    // current high or the runner-up ceiling, whichever is greater), but at least
    // the legal floor and never above the winner's own max (cap-to-max). This is
    // the eBay single-jump, so the loop runs O(#auto-bidders), not O(price gap).
    const secondCeiling = autos[1]?.maxAmount ?? 0;
    const competing = Math.max(currentAmt ?? 0, secondCeiling);
    const floor = minNextBid(currentAmt, startingBid);
    const clearing = Math.min(
      top.maxAmount,
      Math.max(competing + minBidIncrement(competing), floor),
    );

    // No bids yet → must meet the opening floor; otherwise → must beat the high.
    if (currentAmt == null ? clearing < floor : clearing <= currentAmt) break;

    if (!(await claimHighBid(listingId, clearing))) continue; // price moved
    try {
      await insertBid({
        listingId,
        bidderId: top.bidderId,
        bidderName: top.bidderName,
        amount: clearing,
        auto: true,
      });
    } catch (err) {
      if (isDuplicateKey(err)) continue; // exact amount taken — re-read & retry
      throw err;
    }
  }
}

/** True for a MongoDB duplicate-key (E11000) error. */
function isDuplicateKey(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: number }).code === 11000
  );
}

/* ── dashboard auction management (owner / agent / admin) ─────────────────────
 * Owner-facing views of their own auctions: the list of auctions they're running
 * and, per auction, who registered to bid plus the full bid trail and the
 * winner. Unlike the public snapshot, bidder names here are REAL (the owner runs
 * the sale).                                                                      */

/** One row in the owner's auction list (`/dashboard/auctions`). */
export type AuctionSummary = {
  listing: Listing;
  phase: AuctionLivePhase;
  startsAt: string;
  endsAt: string;
  startingBid: number;
  currentBid: number | null;
  bidCount: number;
  registeredBidders: number;
  /** Final result once ended; null while upcoming/live. Real winner name. */
  result: AuctionResult | null;
};

/** Full management detail for one auction (`/dashboard/auctions/[id]`). */
export type AuctionManagementView = {
  listing: Listing;
  phase: AuctionLivePhase;
  startsAt: string;
  endsAt: string;
  startingBid: number;
  currentBid: number | null;
  hasReserve: boolean;
  reserve: number | null;
  reserveMet: boolean;
  result: AuctionResult | null;
  registrations: Registration[];
  bids: Bid[];
  highBid: { bidderId: string; bidderName: string; amount: number } | null;
};

/** Owner-facing result (REAL winner name) — the stored outcome if settled, else
 *  derived from the current high bid. */
async function ownerResult(
  listing: Listing,
  high: Bid | null,
): Promise<AuctionResult> {
  const stored = await getAuctionOutcome(listing.id);
  if (stored && stored.basis === listing.price.auctionDate) {
    return {
      outcome: stored.outcome,
      winnerName: stored.winnerName,
      finalAmount: stored.finalAmount,
      settledAt: stored.settledAt,
    };
  }
  return {
    outcome: outcomeFor(listing, high),
    winnerName: high?.bidderName ?? null,
    finalAmount: high?.amount ?? null,
    settledAt: null,
  };
}

/** The owner/agent/admin's own auction listings, with live stats + final result. */
export async function listMyAuctions(
  user: CurrentUser,
): Promise<AuctionSummary[]> {
  const listings = await findAuctionsByOwner(user.id);
  const now = new Date();
  return Promise.all(
    listings.map(async (listing): Promise<AuctionSummary> => {
      const { start, closeAt, phase } = await timing(listing, now);
      // Finalize ended auctions on view (idempotent, best-effort) so an owner's
      // dashboard flips sold listings even without the cron configured.
      if (phase === "ended") {
        await settleAuctionIfEnded(listing, now).catch(() => null);
      }
      const [high, bidCount, registeredBidders] = await Promise.all([
        getHighBid(listing.id),
        countBids(listing.id),
        countRegistrationsByListing(listing.id),
      ]);
      return {
        listing,
        phase,
        startsAt: start.toISOString(),
        endsAt: closeAt.toISOString(),
        startingBid: startingBidFor(listing),
        currentBid: high?.amount ?? null,
        bidCount,
        registeredBidders,
        result: phase === "ended" ? await ownerResult(listing, high) : null,
      };
    }),
  );
}

/**
 * Full management detail for ONE auction. Ownership-gated (owner or admin), and
 * finalizes the auction on view (idempotent) so the owner always sees the
 * settled result + winner.
 */
export async function getAuctionManagement(
  user: CurrentUser,
  listingId: string,
): Promise<AuctionManagementView> {
  const existing = await findListingById(listingId);
  if (!existing) throw new NotFoundError("Auction not found");
  if (existing.ownerId !== user.id && user.role !== UserRole.Admin) {
    throw new ForbiddenError("You can only manage your own auctions");
  }
  if (!isAuctionListing(existing.price)) {
    throw new BadRequestError("This listing isn't an auction");
  }

  const now = new Date();
  if ((await timing(existing, now)).phase === "ended") {
    try {
      await settleAuctionIfEnded(existing, now);
    } catch {
      /* best-effort; the view still derives a result below. */
    }
  }
  // Re-read in case settlement just flipped the status to RentedSold.
  const listing = (await findListingById(listingId)) ?? existing;

  const { start, closeAt, phase } = await timing(listing, now);
  const [high, registrations, bids] = await Promise.all([
    getHighBid(listingId),
    findRegistrationsByListing(listingId),
    listAllBids(listingId),
  ]);
  const currentBid = high?.amount ?? null;
  const reserve = listing.price.reserve ?? null;
  const reserveMet =
    reserve == null
      ? currentBid != null
      : currentBid != null && currentBid >= reserve;

  return {
    listing,
    phase,
    startsAt: start.toISOString(),
    endsAt: closeAt.toISOString(),
    startingBid: startingBidFor(listing),
    currentBid,
    hasReserve: reserve != null,
    reserve,
    reserveMet,
    result: phase === "ended" ? await ownerResult(listing, high) : null,
    registrations,
    bids,
    highBid: high
      ? { bidderId: high.bidderId, bidderName: high.bidderName, amount: high.amount }
      : null,
  };
}
