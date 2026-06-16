"use client";

import { useMemo, useState } from "react";
import { Check, Loader2, Mail, Phone, X } from "lucide-react";
import { RegistrationStatus } from "@/lib/enums";
import type { Registration } from "@/features/auctions/auctions.repository";
import {
  BID_METHOD_LABELS,
  REGISTRATION_STATUS_BADGE,
  REGISTRATION_STATUS_LABELS,
} from "@/features/auctions/auction-labels";
import { Button } from "@/components/ui/button";

/** Stable, deterministic timestamp (no relative "Date.now()" — avoids SSR drift). */
function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-NZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const chip =
  "border-border bg-muted/40 text-muted-foreground hover:border-primary/30 hover:text-foreground inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors";

/**
 * Owner/agent manager for an auction's "register to bid" list. Shows the full
 * details each bidder submitted (name, phone, email, how they'll bid) and lets
 * the owner approve or decline them. Status changes are optimistic and revert
 * that one row on failure. PATCHes `/api/auctions/registrations/:id`.
 */
export function AuctionRegistrationsManager({
  initial,
}: {
  initial: Registration[];
}) {
  const [registrations, setRegistrations] = useState(initial);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c = { approved: 0, pending: 0, declined: 0 };
    for (const r of registrations) {
      if (r.status === RegistrationStatus.Approved) c.approved++;
      else if (r.status === RegistrationStatus.Declined) c.declined++;
      else c.pending++;
    }
    return c;
  }, [registrations]);

  const setStatus = async (id: string, status: RegistrationStatus) => {
    const prev = registrations.find((r) => r.id === id)?.status;
    if (!prev || prev === status || updatingId === id) return;
    setError(null);
    setUpdatingId(id);
    setRegistrations((cur) =>
      cur.map((r) => (r.id === id ? { ...r, status } : r)),
    );
    try {
      const res = await fetch(`/api/auctions/registrations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || json?.error) {
        throw new Error(
          json?.error?.message || "Couldn't update the registration.",
        );
      }
    } catch (err) {
      setRegistrations((cur) =>
        cur.map((r) => (r.id === id ? { ...r, status: prev } : r)),
      );
      setError(
        err instanceof Error ? err.message : "Couldn't update the registration.",
      );
    } finally {
      setUpdatingId(null);
    }
  };

  if (registrations.length === 0) {
    return (
      <div className="border-border text-muted-foreground rounded-2xl border border-dashed p-10 text-center text-sm">
        No one has registered to bid yet. Registrations from interested bidders
        will show up here.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        {counts.approved} approved · {counts.pending} pending · {counts.declined}{" "}
        declined
      </p>

      {error && (
        <div
          className="border-destructive/20 bg-destructive/10 text-destructive rounded-lg border p-3 text-sm"
          role="alert"
        >
          {error}
        </div>
      )}

      {registrations.map((r) => {
        const busy = updatingId === r.id;
        return (
          <article
            key={r.id}
            className="border-border bg-card shadow-soft rounded-2xl border p-4 sm:p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 gap-3">
                <span className="bg-primary/10 text-primary grid size-11 shrink-0 place-items-center rounded-full text-sm font-semibold uppercase">
                  {r.name.slice(0, 2)}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-base font-semibold tracking-tight">
                      {r.name}
                    </h3>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${REGISTRATION_STATUS_BADGE[r.status]}`}
                    >
                      {REGISTRATION_STATUS_LABELS[r.status]}
                    </span>
                    <span className="border-border text-muted-foreground rounded-full border px-2 py-0.5 text-[11px]">
                      {BID_METHOD_LABELS[r.bidMethod]}
                    </span>
                  </div>
                  <p className="text-muted-foreground mt-1 text-xs">
                    Registered {formatWhen(r.createdAt)}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <a href={`tel:${r.phone}`} className={chip}>
                      <Phone className="size-3.5" /> {r.phone}
                    </a>
                    {r.email && (
                      <a href={`mailto:${r.email}`} className={chip}>
                        <Mail className="size-3.5" /> {r.email}
                      </a>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <Button
                  size="sm"
                  variant={
                    r.status === RegistrationStatus.Approved
                      ? "secondary"
                      : "default"
                  }
                  disabled={busy || r.status === RegistrationStatus.Approved}
                  onClick={() => setStatus(r.id, RegistrationStatus.Approved)}
                >
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Check className="size-4" />
                  )}
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || r.status === RegistrationStatus.Declined}
                  onClick={() => setStatus(r.id, RegistrationStatus.Declined)}
                >
                  <X className="size-4" /> Decline
                </Button>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
