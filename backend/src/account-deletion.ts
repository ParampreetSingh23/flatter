import { chatHub } from "./chat-hub.js";
import { db } from "./db.js";
import type { Storage } from "./storage.js";

/**
 * Idempotent account removal (driven by Clerk's verified user.deleted event). Order matters:
 * 1. gather peer ids and photo object keys, 2. remove R2 objects (a network call, never inside a DB transaction),
 * 3. delete photo rows and the listing (their FKs are Restrict by design), 4. delete the user, whose cascades remove
 * profile, preferences, decisions, blocks, matches, messages, receipt cursors and reports involving them,
 * 5. disconnect their sockets and tell peers to reconcile. Repeating it for a missing user is a no-op.
 */
export async function deleteAccount(clerkUserId: string, storage: Storage | null) {
  const u = await db.user.findUnique({ where: { clerkUserId }, include: { flatListing: { include: { photos: true } } } });
  if (!u) return { deleted: false };
  const matches = await db.match.findMany({ where: { OR: [{ userLowId: u.id }, { userHighId: u.id }] }, select: { userLowId: true, userHighId: true } });
  const peers = [...new Set(matches.flatMap((m) => [m.userLowId, m.userHighId]).filter((id) => id !== u.id))];
  const keys = (u.flatListing?.photos ?? []).flatMap((p) => [p.stagingKey, p.finalKey]).filter((k): k is string => !!k);
  if (keys.length) {
    if (!storage) throw new Error("storage unavailable: refusing to delete a listing whose photos can't be removed"); // webhook retries later
    for (const k of keys) await storage.remove(k);
  }
  await db.$transaction(async (tx) => {
    if (u.flatListing) {
      await tx.flatListing.update({ where: { id: u.flatListing.id }, data: { coverPhotoId: null } });
      await tx.flatPhoto.deleteMany({ where: { listingId: u.flatListing.id } });
      await tx.flatListing.delete({ where: { id: u.flatListing.id } });
    }
    await tx.user.delete({ where: { id: u.id } });
  });
  chatHub.disconnect(u.id);
  chatHub.inbox(peers);
  return { deleted: true };
}
