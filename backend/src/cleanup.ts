import { db } from "./db.js";
import type { Storage } from "./storage.js";

const GRACE_MS = 60 * 60_000;

// Retryable reconciliation between PostgreSQL and R2 (no shared transaction). Each row is independent; failures leave it for the next run.
export async function runCleanup(storage: Storage, now = new Date()) {
  const old = new Date(now.getTime() - GRACE_MS);
  const rows = await db.flatPhoto.findMany({
    where: {
      OR: [
        { state: "DELETE_PENDING" },
        { state: "PENDING", uploadExpiresAt: { lt: old } }, // never uploaded/finalized
        { state: "PROCESSING", processingLeaseUntil: { lt: old } }, // abandoned claim; finalKey recorded before any write
        { state: "FAILED", updatedAt: { lt: old } },
      ],
    },
    take: 200,
  });
  let removed = 0;
  for (const p of rows) {
    try {
      await storage.remove(p.stagingKey);
      if (p.finalKey) await storage.remove(p.finalKey);
      await db.flatPhoto.deleteMany({ where: { id: p.id, state: p.state } }); // re-check state: skip if a retry just claimed it
      removed++;
    } catch (e) {
      console.error("photo cleanup failed", p.id, e);
    }
  }
  return { removed };
}
