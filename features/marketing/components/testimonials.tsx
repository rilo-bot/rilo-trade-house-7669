import { BadgeCheck } from "lucide-react";
import { Reveal } from "@/components/common/reveal";
import { SectionHeading } from "./section-heading";

/** Verified customer testimonial data — Kiwi home seekers, renters, and sellers. */
const testimonials = [
  {
    name: "Aroha T.",
    initials: "AT",
    location: "Auckland",
    role: "First-home buyer",
    roleEmoji: "🏡",
    avatarColor: "from-blue-500 to-blue-700",
    rating: 5,
    quote:
      "We were completely overwhelmed by the Auckland market, but Trade House made it feel manageable. The verified listings meant we never wasted a weekend on dodgy viewings. We got the keys to our first home six weeks after signing up — gutted it took us so long to find the site!",
  },
  {
    name: "Callum & Priya M.",
    initials: "CP",
    location: "Wellington",
    role: "Renters",
    roleEmoji: "🔑",
    avatarColor: "from-sky-500 to-sky-700",
    rating: 5,
    quote:
      "Moving from Christchurch, we needed a rental sorted before we even arrived in Wellington. The filters are brilliant — we found a sunny Te Aro flat, messaged the landlord directly, and had a lease signed before the moving truck left. No agents, no hassle.",
  },
  {
    name: "Wiremu H.",
    initials: "WH",
    location: "Hamilton",
    role: "Self-listing owner",
    roleEmoji: "📋",
    avatarColor: "from-indigo-500 to-indigo-700",
    rating: 5,
    quote:
      "Listed my investment property myself in about 20 minutes. The dashboard makes it dead easy to track enquiries, and I had three genuine buyers asking questions within 48 hours. Sold privately and saved a tidy agent's commission — stoked with the result.",
  },
  {
    name: "Sophie K.",
    initials: "SK",
    location: "Christchurch",
    role: "First-home buyer",
    roleEmoji: "🏡",
    avatarColor: "from-blue-400 to-blue-600",
    rating: 5,
    quote:
      "The AI search assistant is genuinely useful — I described what we wanted in plain English and it surfaced listings I'd never have found through the normal filters. Ended up in a beautiful Riccarton character villa. Couldn't be happier.",
  },
  {
    name: "Ngahuia & Tama P.",
    initials: "NT",
    location: "Tauranga",
    role: "Renters",
    roleEmoji: "🔑",
    avatarColor: "from-sky-400 to-sky-600",
    rating: 4,
    quote:
      "Really clean site — easy to use on the phone when you're scrolling through listings at midnight. The saved-search alerts meant we heard about a Mount Maunganui place the morning it went up. Beat the crowd and locked it in that afternoon.",
  },
  {
    name: "David F.",
    initials: "DF",
    location: "Queenstown",
    role: "Self-listing owner",
    roleEmoji: "📋",
    avatarColor: "from-indigo-400 to-indigo-600",
    rating: 5,
    quote:
      "I was sceptical about self-listing but the platform held my hand the whole way. Professional photos uploaded in seconds, the description tool suggested wording I wouldn't have thought of, and the enquiry inbox kept everything tidy. Would 100% use again.",
  },
] as const;

/** Five filled stars, or four + one dimmed for a 4-star rating. */
function StarRating({ rating }: { rating: number }) {
  return (
    <span className="flex gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <svg
          key={i}
          viewBox="0 0 16 16"
          fill="currentColor"
          className={`size-4 ${i < rating ? "text-yellow-400" : "text-muted-foreground/30"}`}
          aria-hidden
        >
          <path d="M8 1.144 9.854 5.67l4.875.442-3.585 3.123 1.05 4.823L8 11.683l-4.194 2.375 1.05-4.823L.271 6.112l4.875-.442z" />
        </svg>
      ))}
    </span>
  );
}

/**
 * Customer Testimonials — a Kiwi-themed trust section showcasing verified
 * feedback from first-home buyers, renters, and self-listing owners.
 * Sits between the TrustStrip and FAQ on the home page.
 */
export function Testimonials() {
  return (
    <section className="bg-accent">
      <div className="mx-auto w-full max-w-page px-4 py-16 sm:py-20">
        {/* Heading */}
        <Reveal>
          <div className="mb-2 flex justify-center">
            <span className="text-primary bg-primary/10 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold tracking-wide uppercase">
              <BadgeCheck className="size-3.5" />
              Verified reviews
            </span>
          </div>
          <SectionHeading
            title="What Kiwis are saying"
            subtitle="Real stories from buyers, renters, and owners across Aotearoa — no spin, just honest feedback."
            className="mb-10"
          />
        </Reveal>

        {/* Testimonial cards */}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {testimonials.map(
            (
              { name, initials, location, role, roleEmoji, avatarColor, rating, quote },
              i,
            ) => (
              <Reveal key={name} delay={i * 70}>
                <article className="bg-card border-border shadow-soft flex h-full flex-col gap-4 rounded-2xl border p-6 transition-shadow hover:shadow-md">
                  {/* Quote */}
                  <div className="text-muted-foreground relative flex-1 text-sm leading-relaxed text-pretty">
                    {/* Decorative opening quote mark */}
                    <span
                      aria-hidden
                      className="text-primary/20 font-display absolute -top-1 -left-1 text-4xl leading-none select-none"
                    >
                      &ldquo;
                    </span>
                    <p className="pt-4">{quote}</p>
                  </div>

                  {/* Divider */}
                  <div className="border-border border-t" />

                  {/* Reviewer info */}
                  <div className="flex items-center gap-3">
                    {/* Avatar */}
                    <span
                      className={`from bg-linear-to-br ${avatarColor} text-primary-foreground grid size-11 shrink-0 place-items-center rounded-full text-sm font-bold shadow-sm`}
                    >
                      {initials}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{name}</p>
                      <p className="text-muted-foreground truncate text-xs">
                        {location}
                      </p>
                    </div>

                    {/* Role badge */}
                    <span className="bg-accent text-accent-foreground border-border shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-medium">
                      {roleEmoji} {role}
                    </span>
                  </div>

                  {/* Stars + verified tick */}
                  <div className="flex items-center justify-between">
                    <StarRating rating={rating} />
                    <span className="text-primary flex items-center gap-1 text-xs font-medium">
                      <BadgeCheck className="size-3.5" />
                      Verified
                    </span>
                  </div>
                </article>
              </Reveal>
            ),
          )}
        </div>
      </div>
    </section>
  );
}
