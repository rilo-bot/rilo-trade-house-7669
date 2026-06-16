import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Clock,
  ExternalLink,
  Gavel,
  MapPin,
  Trophy,
  Users,
} from "lucide-react";
import { requireRole } from "@/lib/auth/guards";
import { UserRole } from "@/lib/enums";
import { getAuctionManagement } from "@/features/auctions/auctions.service";
import { AuctionRegistrationsManager } from "@/features/auctions/components/auction-registrations-manager";
import {
  AUCTION_OUTCOME_BADGE,
  AUCTION_OUTCOME_LABELS,
  AUCTION_PHASE_BADGE,
  AUCTION_PHASE_LABELS,
} from "@/features/auctions/auction-labels";
import {
  STATUS_BADGE,
  STATUS_LABELS,
  formatDateTimeNZ,
  formatNZD,
} from "@/features/listings/listing-labels";

export const metadata = { title: "Auction detail" };

// Reads live auction state + settles on view, so never statically cache.
export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-NZ", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function AuctionManagePage({ params }: PageProps) {
  const user = await requireRole([
    UserRole.Owner,
    UserRole.Agent,
    UserRole.Admin,
  ]);
  const { id } = await params;

  // Ownership-gated; any failure (not found / not yours / not an auction) is a
  // 404 for the dashboard user.
  const view = await getAuctionManagement(user, id).catch(() => null);
  if (!view) notFound();

  const { listing, phase, result, registrations, bids, highBid } = view;
  const isSold = result?.outcome === "sold";

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10">
      <Link
        href="/dashboard/auctions"
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1.5 text-sm transition-colors"
      >
        <ArrowLeft className="size-4" /> All auctions
      </Link>

      {/* Header */}
      <div className="mb-6 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${AUCTION_PHASE_BADGE[phase]}`}
          >
            {AUCTION_PHASE_LABELS[phase]}
          </span>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[listing.status]}`}
          >
            {STATUS_LABELS[listing.status]}
          </span>
          {result && (
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${AUCTION_OUTCOME_BADGE[result.outcome]}`}
            >
              {AUCTION_OUTCOME_LABELS[result.outcome]}
            </span>
          )}
        </div>
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
          {listing.title}
        </h1>
        <p className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="size-4" />
            {listing.location.locality}, {listing.location.city}
          </span>
          <Link
            href={`/properties/${listing.id}`}
            className="text-primary inline-flex items-center gap-1 font-medium hover:underline"
          >
            View public listing <ExternalLink className="size-3.5" />
          </Link>
        </p>
      </div>

      {/* Result / winner banner (ended) or live snapshot. */}
      {phase === "ended" ? (
        <ResultBanner
          isSold={isSold}
          outcome={result?.outcome ?? "no_bids"}
          winnerName={result?.winnerName ?? null}
          finalAmount={result?.finalAmount ?? null}
          hasReserve={view.hasReserve}
        />
      ) : (
        <section className="border-border bg-card shadow-soft rounded-2xl border p-5 sm:p-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat
              label={view.currentBid != null ? "Current bid" : "Starting bid"}
              value={formatNZD(view.currentBid ?? view.startingBid)}
            />
            <Stat label="Bids" value={String(bids.length)} />
            <Stat label="Registered" value={String(registrations.length)} />
            <Stat
              label="Reserve"
              value={
                !view.hasReserve
                  ? "None"
                  : view.reserveMet
                    ? "Met"
                    : "Not met"
              }
            />
          </div>
          <p className="text-muted-foreground mt-4 flex items-center gap-1.5 text-sm">
            <Clock className="size-4" />
            {phase === "upcoming"
              ? `Starts ${formatDateTimeNZ(listing.price.auctionDate ?? "")}`
              : `Closes around ${formatWhen(view.endsAt)}`}
          </p>
        </section>
      )}

      {/* Registrations — who registered to bid (full details + approve/decline). */}
      <section className="mt-8">
        <div className="mb-3 flex items-center gap-2">
          <Users className="text-primary size-5" />
          <h2 className="font-display text-lg font-semibold">
            Registered bidders
          </h2>
          <span className="text-muted-foreground text-sm">
            ({registrations.length})
          </span>
        </div>
        <AuctionRegistrationsManager initial={registrations} />
      </section>

      {/* Bid history — the full trail, highest first, with real bidder names. */}
      <section className="mt-8">
        <div className="mb-3 flex items-center gap-2">
          <Gavel className="text-primary size-5" />
          <h2 className="font-display text-lg font-semibold">Bid history</h2>
          <span className="text-muted-foreground text-sm">({bids.length})</span>
        </div>

        {bids.length === 0 ? (
          <div className="border-border text-muted-foreground rounded-2xl border border-dashed p-10 text-center text-sm">
            No bids were placed on this auction.
          </div>
        ) : (
          <ul className="border-border bg-card shadow-soft divide-border divide-y overflow-hidden rounded-2xl border">
            {bids.map((b, i) => {
              const isWinner = highBid?.bidderId === b.bidderId && i === 0;
              return (
                <li
                  key={b.id}
                  className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    {isWinner ? (
                      <Trophy className="size-4 shrink-0 text-amber-500" />
                    ) : (
                      <span className="text-muted-foreground w-4 shrink-0 text-center text-xs tabular-nums">
                        {i + 1}
                      </span>
                    )}
                    <span className="truncate text-sm font-medium">
                      {b.bidderName}
                    </span>
                    {b.auto && (
                      <span className="border-border text-muted-foreground rounded-full border px-1.5 py-0.5 text-[10px]">
                        auto
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-4">
                    <span className="font-semibold">{formatNZD(b.amount)}</span>
                    <span className="text-muted-foreground w-24 text-right text-xs">
                      {formatWhen(b.createdAt)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-[11px] tracking-wide uppercase">
        {label}
      </p>
      <p className="font-display text-xl font-bold tracking-tight">{value}</p>
    </div>
  );
}

function ResultBanner({
  isSold,
  outcome,
  winnerName,
  finalAmount,
  hasReserve,
}: {
  isSold: boolean;
  outcome: "sold" | "passed_in" | "no_bids";
  winnerName: string | null;
  finalAmount: number | null;
  hasReserve: boolean;
}) {
  if (isSold) {
    return (
      <section className="rounded-2xl border border-emerald-500/30 bg-emerald-50 p-5 sm:p-6 dark:bg-emerald-500/10">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
            <Trophy className="size-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
              Sold {hasReserve ? "— reserve met" : ""}
            </p>
            <p className="mt-0.5 text-lg font-bold">
              {winnerName ?? "Winning bidder"}
              {finalAmount != null && (
                <span className="text-muted-foreground font-medium">
                  {" "}
                  · {formatNZD(finalAmount)}
                </span>
              )}
            </p>
            <p className="text-muted-foreground mt-1 text-sm">
              The listing has been marked Sold. Confirm the contract with the
              winning bidder under the vendor&apos;s terms.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="border-border bg-card shadow-soft rounded-2xl border p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="bg-muted text-muted-foreground grid size-10 shrink-0 place-items-center rounded-xl">
          <Gavel className="size-5" />
        </span>
        <div>
          <p className="font-semibold">
            {outcome === "no_bids" ? "Ended — no bids" : "Passed in"}
          </p>
          <p className="text-muted-foreground mt-1 text-sm">
            {outcome === "no_bids"
              ? "Bidding has closed with no bids placed."
              : `The top bid${
                  finalAmount != null ? ` of ${formatNZD(finalAmount)}` : ""
                } did not meet the reserve, so the property didn't sell. It stays active for post-auction negotiation.`}
          </p>
        </div>
      </div>
    </section>
  );
}
