# Report review procedure (matching and messaging)

Reports land in `user_reports` with `status = OPEN`. Nothing is shown to the target, and nothing is actioned automatically.

**Owner:** the founder/on-call owns triage until a named moderator is assigned. Update this line when that changes.

1. **Intake check (daily):** `SELECT id, reason, "createdAt", "targetId" FROM user_reports WHERE status = 'OPEN' ORDER BY "createdAt";`
2. **Triage:** read `details` and `snapshot` (public-content snapshot taken at report time). For a conversation report, `snapshot.messages` holds only the excerpts the reporter selected (at most 10: sequence, who sent it, time, text), rebuilt by the server from stored messages. Do not open the rest of the conversation unless the report cannot be decided without it, and note why in your ticket. Message text is server-readable (not end-to-end encrypted); restrict this access to the triage owner.
3. **Decision:** set `status` to `IN_REVIEW`, then `ACTIONED` (e.g. set `users."suspendedAt"` on the target) or `DISMISSED`; set `"reviewedAt" = now()`.
4. **Audit:** note the decision and reason in your ticket tracker. The table holds the outcome only.
5. **Retention:** keep `ACTIONED` reports 2 years and `DISMISSED` 90 days, then delete. These periods are a proposal; confirm them before launch.

Suspending (`suspendedAt`) removes a person from discovery and blocks their matching API access immediately. It does not touch their onboarding or listing data.

Open gaps: no admin UI, no alerting on new reports, and `user_reports` rows are deleted if either account is deleted (cascade). Decide on evidence retention before public launch.

**Chat retention (decide before public launch):** active and ended conversations, including read-only history after Block or Unmatch, are kept until either account is deleted; deleting either account removes the shared conversation, its messages and receipt cursors, and any reports involving that account (same cascade). Account deletion is driven by Clerk's verified `user.deleted` webhook (see `deployment.md`). Provider backups and service logs are not erased synchronously: review their retention, who can query the database, and the user-facing wording about what deletion does to the other person's history. Chat bodies, tokens and report excerpts must not appear in application logs; the realtime layer logs only event names and error types.
