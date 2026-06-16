import { withErrorHandling } from "@/lib/api/handler";
import { handleUpdateRegistrationStatus } from "@/features/auctions/auctions.controller";

// PATCH /api/auctions/registrations/:id — approve/decline a bidder (owner/admin).
export const PATCH = withErrorHandling(handleUpdateRegistrationStatus);
