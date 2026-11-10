import { z } from "zod";
import { CITY_IDS, LOCALITY_CITY } from "./cities.js";
import { DecisionKind, ReportReason, WorkStudySchedule } from "./generated/prisma/client.js";
import { MAX_REPORT_MESSAGES } from "./chat-rules.js";
import { dateStr } from "./onboarding-rules.js";

export const POOL_SIZE = 500; // working pool per request: best within the pool, not across all users
export const PAGE_SIZE = 20;

const uuid = z.string().regex(/^[0-9a-f-]{36}$/i, "Invalid reference");

// Complete matching-preferences section. Move-in fields apply to people looking for a place (a flat owner's flat supplies them).
export const matchingPatch = z.strictObject({
  version: z.int().min(0),
  workStudySchedule: z.enum(WorkStudySchedule),
  acceptedWorkStudySchedules: z.array(z.enum(WorkStudySchedule)).min(1).transform((a) => [...new Set(a)]),
  moveInFlexible: z.boolean().optional(),
  moveInDate: dateStr.nullable().optional(),
  moveInLatestDate: dateStr.nullable().optional(),
  enrolled: z.boolean(),
});

const csv = z.string().max(2000).transform((s) => s.split(",").map((x) => x.trim()).filter(Boolean));
const paise = z.coerce.number().int().min(1).max(2147483647);
// City is never a filter: it is bound to the caller's saved city.
export const filtersQuery = z.strictObject({
  localities: csv.optional(), rentMinPaise: paise.optional(), rentMaxPaise: paise.optional(),
  moveInFrom: dateStr.optional(), moveInTo: dateStr.optional(),
});

export const actionBody = z.strictObject({
  publicId: uuid, kind: z.enum(DecisionKind),
  profileVersion: z.int().min(0).optional(), listingVersion: z.int().min(0).nullable().optional(),
});
export const blockBody = z.strictObject({ publicId: uuid });
export const reportBody = z.strictObject({
  // From an ended chat the profile reference is hidden, so the conversation (matchId) identifies the person instead.
  publicId: uuid.optional(), reason: z.enum(ReportReason),
  details: z.string().trim().max(1000).optional(),
  matchId: uuid.optional(), listingId: uuid.optional(), alsoBlock: z.boolean().optional(),
  // Up to 10 chat messages as evidence; the server rebuilds the excerpts from stored rows. Requires matchId.
  messageIds: z.array(uuid).max(MAX_REPORT_MESSAGES).optional(),
}).refine((b) => b.publicId || b.matchId, { message: "Say who you are reporting", path: ["publicId"] });
export const idParam = uuid;
export { CITY_IDS, LOCALITY_CITY };
