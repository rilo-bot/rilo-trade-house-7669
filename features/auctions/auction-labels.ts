import { BidMethod, RegistrationStatus } from "@/lib/enums";
import type { AuctionLivePhase, AuctionOutcome } from "./bidding";

/**
 * Client-safe presentation helpers for auctions — human labels + badge classes
 * for phases, settlement outcomes, registration statuses and bid methods. No
 * server imports, so these are safe in Client Components. Same pattern as
 * `features/listings/listing-labels.ts`.
 */

export const AUCTION_PHASE_LABELS: Record<AuctionLivePhase, string> = {
  upcoming: "Upcoming",
  live: "Live now",
  ended: "Ended",
};

export const AUCTION_PHASE_BADGE: Record<AuctionLivePhase, string> = {
  upcoming:
    "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  live: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  ended: "bg-muted text-muted-foreground",
};

export const AUCTION_OUTCOME_LABELS: Record<AuctionOutcome, string> = {
  sold: "Sold",
  passed_in: "Passed in",
  no_bids: "No bids",
};

export const AUCTION_OUTCOME_BADGE: Record<AuctionOutcome, string> = {
  sold: "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300",
  passed_in:
    "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  no_bids: "bg-muted text-muted-foreground",
};

export const BID_METHOD_LABELS: Record<BidMethod, string> = {
  [BidMethod.Online]: "Bid online",
  [BidMethod.Phone]: "Bid by phone",
  [BidMethod.InRoom]: "Bid in the room",
};

export const REGISTRATION_STATUS_LABELS: Record<RegistrationStatus, string> = {
  [RegistrationStatus.Pending]: "Pending",
  [RegistrationStatus.Approved]: "Approved",
  [RegistrationStatus.Declined]: "Declined",
};

export const REGISTRATION_STATUS_BADGE: Record<RegistrationStatus, string> = {
  [RegistrationStatus.Pending]:
    "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  [RegistrationStatus.Approved]:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  [RegistrationStatus.Declined]: "bg-destructive/10 text-destructive",
};
