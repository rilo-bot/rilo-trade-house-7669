import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, ChevronRight, Gavel, Trophy } from "lucide-react";
import { requireRole } from "@/lib/auth/guards";
import { UserRole } from "@/lib/enums";
import { listMyAuctions } from "@/features/auctions/auctions.service";
import {
  AUCTION_OUTCOME_BADGE,
  AUCTION_OUTCOME_LABELS,
  AUCTION_PHASE_BADGE,
  AUCTION_PHASE_LABELS,
} from "@/features/auctions/auction-labels";
import { formatNZD } from "@/features/listings/listing-labels";
import { imageSrc } from "@/lib/utils";
import { Reveal } from "@/components/common/reveal";

export const metadata = { title: "My auctions" };

// Phase/result depend on the current time, so never statically cache.
export const dynamic = "force-dynamic";

export default async function MyAuctionsPage() {
  const user = await requireRole([
    UserRole.Owner,
    UserRole.Agent,
    UserRole.Admin,
  ]);
  const auctions = await listMyAuctions(user);

  const liveCount = auctions.filter((a) => a.phase === "live").length;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10">
      <Link
        href="/dashboard"
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1.5 text-sm transition-colors"
      >
        <ArrowLeft className="size-4" /> Dashboard
      </Link>

      <div className="mb-6">
        <p className="text-muted-foreground text-sm font-medium">
          <span className="text-primary">Your auctions</span>
        </p>
        <h1 className="font-display mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
          Auctions
        </h1>
        <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 text-sm">
          <span>
            {auctions.length} auction {auctions.length === 1 ? "listing" : "listings"}
          </span>
          {liveCount > 0 && (
            <>
              <span aria-hidden>·</span>
              <span className="inline-flex items-center gap-1.5 font-medium text-red-600 dark:text-red-400">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-500/70" />
                  <span className="relative inline-flex size-2 rounded-full bg-red-600" />
                </span>
                {liveCount} live now
              </span>
            </>
          )}
        </p>
      </div>

      {auctions.length === 0 ? (
        <div className="border-border flex flex-col items-center gap-3 rounded-2xl border border-dashed p-12 text-center">
          <span className="bg-muted grid size-12 place-items-center rounded-full">
            <Gavel className="size-6 opacity-50" />
          </span>
          <p className="text-muted-foreground max-w-sm text-sm">
            You don&apos;t have any auction listings yet. Post a property and
            choose <strong className="text-foreground">Auction</strong> as the
            sale method to run one here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {auctions.map((a, i) => {
            const cover = a.listing.media?.images?.[0];
            const isSold = a.result?.outcome === "sold";
            return (
              <Reveal key={a.listing.id} delay={Math.min(i * 60, 300)}>
                <Link
                  href={`/dashboard/auctions/${a.listing.id}`}
                  className="group border-border bg-card shadow-soft hover:border-primary/30 flex flex-col gap-3 rounded-2xl border p-3 transition-all hover:-translate-y-0.5 hover:shadow-md sm:flex-row sm:items-center sm:gap-4"
                >
                  <div className="bg-muted relative size-20 shrink-0 overflow-hidden rounded-lg">
                    {cover ? (
                      <Image
                        src={imageSrc(cover)}
                        alt={a.listing.title}
                        fill
                        className="object-cover"
                        sizes="80px"
                      />
                    ) : (
                      <div className="text-muted-foreground flex h-full items-center justify-center text-[10px]">
                        No photo
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${AUCTION_PHASE_BADGE[a.phase]}`}
                      >
                        {AUCTION_PHASE_LABELS[a.phase]}
                      </span>
                      {a.result && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${AUCTION_OUTCOME_BADGE[a.result.outcome]}`}
                        >
                          {AUCTION_OUTCOME_LABELS[a.result.outcome]}
                        </span>
                      )}
                    </div>
                    <h3 className="mt-1 line-clamp-1 font-medium">
                      {a.listing.title}
                    </h3>
                    <p className="text-muted-foreground line-clamp-1 text-sm">
                      {a.listing.location.locality}, {a.listing.location.city}
                    </p>
                    {/* Winner line for a sold auction. */}
                    {isSold && a.result?.winnerName && (
                      <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                        <Trophy className="size-3.5 shrink-0" />
                        Won by {a.result.winnerName}
                        {a.result.finalAmount != null &&
                          ` · ${formatNZD(a.result.finalAmount)}`}
                      </p>
                    )}
                  </div>

                  <div className="border-border flex shrink-0 items-center justify-between gap-4 border-t pt-2 sm:border-t-0 sm:pt-0 sm:text-right">
                    <div>
                      <p className="text-muted-foreground text-[11px] tracking-wide uppercase">
                        {a.phase === "ended" ? "Final bid" : "Current bid"}
                      </p>
                      <p className="font-display text-lg font-bold tracking-tight">
                        {a.currentBid != null
                          ? formatNZD(a.currentBid)
                          : "No bids"}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {a.bidCount} {a.bidCount === 1 ? "bid" : "bids"} ·{" "}
                        {a.registeredBidders} registered
                      </p>
                    </div>
                    <ChevronRight className="text-muted-foreground group-hover:text-primary size-5 shrink-0 transition-colors" />
                  </div>
                </Link>
              </Reveal>
            );
          })}
        </div>
      )}
    </div>
  );
}
