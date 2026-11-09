# Report review procedure (matching P0)

Reports land in `user_reports` with `status = OPEN`. Nothing is shown to the target, and nothing is actioned automatically.

**Owner:** the founder/on-call owns triage until a named moderator is assigned. Update this line when that changes.

1. **Intake check (daily):** `SELECT id, reason, "createdAt", "targetId" FROM user_reports WHERE status = 'OPEN' ORDER BY "createdAt";`
2. **Triage:** read `details` and `snapshot` (public-content snapshot taken at report time). Do not look at private data unless the report needs it.
3. **Decision:** set `status` to `IN_REVIEW`, then `ACTIONED` (e.g. set `users."suspendedAt"` on the target) or `DISMISSED`; set `"reviewedAt" = now()`.
4. **Audit:** note the decision and reason in your ticket tracker. The table holds the outcome only.
5. **Retention:** keep `ACTIONED` reports 2 years and `DISMISSED` 90 days, then delete. These periods are a proposal; confirm them before launch.

Suspending (`suspendedAt`) removes a person from discovery and blocks their matching API access immediately. It does not touch their onboarding or listing data.

Open gaps: no admin UI, no alerting on new reports, and `user_reports` rows are deleted if either account is deleted (cascade). Decide on evidence retention before public launch.
