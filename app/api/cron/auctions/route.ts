import { withErrorHandling } from "@/lib/api/handler";
import { handleSettleAuctions } from "@/features/auctions/auctions.controller";

// GET /api/cron/auctions — settle ended auctions (shared-secret gated).
// Trigger from an external scheduler (Vercel Cron / system cron / the /schedule
// skill) with header: x-cron-secret: <CRON_SECRET>
export const GET = withErrorHandling(handleSettleAuctions);
