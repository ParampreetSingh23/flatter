# Flatter matching engine — implementation plan

Status: **plan only**. No application code, Prisma schema, migrations, matching data or infrastructure is changed by this task.

## 1. Product contract and priorities

Build a Tinder-style interest flow around **living compatibility**, using explicit rules and transparent weighted scoring. A compatibility score describes answers, not the probability of a successful tenancy or a guarantee of safety.

| Priority | Included behavior |
| --- | --- |
| P0 | Like/right swipe; Pass/left swipe; compatibility score; profile details with bio, habits, budget and allowed photos; Published flat details/photos; location/budget/move-in filters; mutual matches; server-enforced chat eligibility; Block/Report. |
| P0 supporting behavior | Matching-preference readiness, visibility/ownership checks, concurrency-safe duplicate prevention, match list and Unmatch so either person can end the connection. |
| P1 | User-facing Why you match explanations and Save profile bookmarks. Store reason codes in the internal scoring result from P0 so explanations use the same calculations later. |
| P2 | Undo the most recent Pass. Do not quietly permit this through the P0 swipe endpoint. |
| Separate feature | Full messaging UI, message storage/delivery, realtime transport, group management, property search as an independent feed, notifications and admin moderation UI. Matching establishes chat permission; it does not claim these other features are implemented. |

Keep the existing Next.js/Express/Clerk/Prisma/Neon stack and private R2 flat-photo delivery. No ML training, vector database, paid recommendation API, microservice, Redis, queue platform or PostGIS for the first release. Native PostgreSQL queries plus deterministic TypeScript scoring are sufficient for the proposed launch.

## 2. Current data and gaps

The codebase now has onboarding, My Profile edits/preferences, a shared dashboard, Delhi NCR city/locality IDs, profile visibility, public profile references, FlatListing/FlatPhoto, and private R2 image handling. Discovery, Matches and Messages are still marked unavailable in `backend/src/profiles.ts`. No swipe, mutual-match, block or report model was found.

Reuse Profile for name, derived age, occupation, bio, avatar and public reference; HousingPreference for search budget/location/timing; LifestylePreference for self habits and accepted flatmate habits; and **actual Published FlatListing values** for an available flat's location, rent and availability. A flat owner's old onboarding estimate must not override their actual listing.

Two requested scoring inputs are missing:

| Gap | Proposed addition |
| --- | --- |
| Move-in window | Add nullable `HousingPreference.moveInLatestDate`. Keep existing `moveInDate` as earliest date; flexible timing requires both dates null. Nonflexible matching requires earliest ≤ latest. An exact date is a valid window where both are equal. |
| Work/study schedule | Add `LifestylePreference.workStudySchedule` and `acceptedWorkStudySchedules`. Proposed choices: DAYTIME, EVENING, NIGHT, ROTATING, FLEXIBLE. Ask about the typical routine directly; Student/Working professional does not reveal their hours. |
| Matching consent/readiness | Add nullable `User.matchingEnabledAt` recording explicit enrollment. Existing `discoveryEnabled` remains required; publishing a flat alone does not enroll the owner into people matching. |

Introduce a short **Matching preferences** screen before first discovery use to confirm the new fields, current housing details and visibility. Reuse the existing profile-version mechanism for these edits, not the completed-onboarding PATCH routes. Include the new fields in first-time onboarding/profile preference editing when implementing. Existing users keep completed personal onboarding and dashboard access; they are not forced to restart onboarding.

Missing schedule/date answers mean **not ready for the full score**, not zero similarity, an invented answer or automatic weight redistribution. An explicit Flexible answer is valid; it is different from unanswered.

## 3. Discovery eligibility and hard rules

Evaluate hard eligibility **before** scoring and again on Like. Both people must be authenticated adults with complete, valid profiles/preferences, completed onboarding, active accounts, explicit matching enrollment and `discoveryEnabled = true`. Suspended/deleted accounts are excluded. Add a server-owned `User.suspendedAt` if no account-suspension state exists when implementing; normal profile PATCHes cannot change it.

| Viewer intent | Eligible candidate intent | Extra rule |
| --- | --- | --- |
| HAVE_ROOM | NEED_ROOM | Owner has an eligible Published listing with at least one available place. Use its actual rent/locality/available-from date. |
| NEED_ROOM | HAVE_ROOM | Candidate has the eligible Published listing described above. |
| TEAM_UP | TEAM_UP | Neither person needs an existing flat. Compare desired shared housing. Matching two people does not create a group automatically. |

Never return self, blocked pairs in either direction, already-decided candidates, existing active matches, or previously ended pairs in P0. Previously blocked pairs also do not reenter discovery automatically after unblocking in this conservative first release; direct profile access can resume under normal visibility rules. No HAVE_ROOM ↔ HAVE_ROOM or NEED_ROOM ↔ NEED_ROOM pairing without a later product decision.

Other hard rules:

- Same supported NCR city. Selected locality preferences influence location scoring; an explicit current locality filter is a stricter search requirement. Do not call different NCR cities “nearby” automatically.
- Rent feasibility: TEAM_UP budget ranges intersect; for a flat/room pair, actual per-person rent lies inside the seeker's range. Amounts compare in integer paise and exclude utilities/deposit consistently with the existing forms.
- Nonflexible time feasibility: TEAM_UP move-in windows intersect; a flat must be available by the seeker's latest acceptable date. Use calendar dates, not elapsed-hour calculations.
- Both parties accept the other's declared food, cleanliness, sleep, smoking, guest and gender answers, and pet situation. Add the same two-way acceptance check for work/study schedule. Existing accepted lists are proposed **hard tolerances** for matching; make that explicit in the preferences UI before enrollment. “Any” expands to all supported choices; empty means unanswered.
- A person bringing a pet is excluded if the other person's flatmate-pet setting is No pets. No preference accepts either. Do not infer that someone who has a pet also requires the other person to have one.
- “Prefer not to say” gender is its own declared choice, accepted only if the other person's explicit accepted set includes it. Never infer gender from name or photo or expose hidden acceptance filters in explanations.
- Any explicit smart filters further narrow results. Filters cannot override blocks, visibility, intent or hard tolerances. The API validates merged filters against the saved profile rather than letting a query silently widen hard personal constraints.

For an existing flat, the owner's accepted flatmate habits are the declared household tolerances in this MVP. Do not infer landlord permission, allergies or stricter pet/smoking/guest rules from free-text descriptions. If structured listing-specific rules are added, apply the stricter intersection of those rules and the owner's personal tolerances before matching.

Hard failures produce **no candidate**, not a low score and not a reason shown to the rejected person. A 99% score never overrules safety or a declared restriction. This hard-tolerance policy is a documented v1 recommendation, rather than a claim that every preference is inherently a deal-breaker; changing to soft preferences later needs an explicit preference/importance design.

## 4. Weighted scoring — fixed 100-point model

For an eligible pair, calculate eight similarities in [0,1]:

**Score = 20B + 20L + 15C + 15H + 10S + 10M + 5F + 5W.**

| Parameter | Symbol | Weight | Inputs |
| --- | --- | --- | --- |
| Budget | B | 20% | Search budget ranges or actual listing rent versus seeker budget. |
| Location | L | 20% | Canonical desired locality sets, flexibility or actual flat locality. |
| Cleanliness | C | 15% | Own cleanliness levels after two-way acceptance. |
| Lifestyle habits | H | 15% | Smoking, guests and pet compatibility; equal 5-point contributions. |
| Sleep schedule | S | 10% | Own sleep patterns and acceptance. |
| Move-in timing | M | 10% | Confirmed desired windows or actual listing availability. |
| Food | F | 5% | Own food preferences and acceptance. |
| Work/study schedule | W | 5% | Directly answered routine and accepted routines. |
| **Total** | | **100%** | No appearance, occupation prestige, religion or inferred traits. |

Keep unrounded precision for ranking, clamp arithmetic to valid bounds, and display a whole-number score using round-half-up. A score is calculated on the backend. Client-supplied scores, weights or eligibility flags are ignored.

### 4.1 Budget similarity

For TEAM_UP, use **overlap coefficient**, not a midpoint-distance guess:

- For inclusive integer-paise intervals A=[a,b], B=[c,d], intersection size is `max(0, min(b,d) - max(a,c) + 1)`.
- Similarity is intersection size divided by the smaller interval's size: `min(b-a+1, d-c+1)`.
- This supports point budgets, partial overlaps and full containment without division by zero. Nonoverlap has already failed the hard gate.

For HAVE_ROOM ↔ NEED_ROOM, similarity is **1 when the actual rent is in the seeker's range**, otherwise the pair is excluded. Do not invent a better budget match just because a flat is cheaper. Budget contributes a constant 20 points among feasible room pairs; that is an intentional limit of the declared data, not hidden ranking precision.

### 4.2 Location similarity

- TEAM_UP: for two explicit locality sets, use `intersection count / smaller set count`. No shared locality gives 0, unless an explicit locality filter already excluded the pair. A shared supported city alone does not earn locality points.
- If either person explicitly accepts any supported area in the same city, use 1. Both-flexible is also 1. Null/unanswered is not flexible.
- Flat/room: 1 if the actual listing locality is accepted by the seeker or the seeker is city-flexible; otherwise 0 unless the explicit current locality filter makes this a hard exclusion.

Use the existing catalogue IDs. No text-similarity matching of place names, guessed distances or numeric sector proximity. Overlapping marketed neighborhoods need a reviewed catalogue mapping before they are treated as equivalent. PostGIS/radius searching is later work, after legitimate coordinates and distance semantics exist.

### 4.3 Cleanliness similarity

Map RELAXED=0, REGULAR=1, VERY_TIDY=2, then use `1 - absolute difference / 2`: same=1, adjacent=0.5, opposite=0. The pair is still eligible only if both explicitly accepted those levels. A zero contribution is allowed for a tolerated difference; it is not a hidden rejection.

### 4.4 Lifestyle similarity — three equal subcomponents

| Component | Similarity rule after hard acceptance |
| --- | --- |
| Smoking | Same declared habit=1; different but mutually accepted habits=0.75. |
| Guests | RARELY=0, OCCASIONALLY=1, FREQUENTLY=2; `1 - absolute difference / 2`. |
| Pets | 1 when both declared pet situations are accepted; otherwise hard exclusion. No extra score for owning/not owning a pet. |

H is the arithmetic mean of these three values. Pet acceptance is binary in the current model, so it does not distinguish rankings among eligible pairs; do not pretend otherwise. Cleanliness, sleep and food are scored in their own categories and are not counted again here.

### 4.5 Sleep, food and work/study similarities

- Sleep: same pattern=1; either explicitly FLEXIBLE=1; different but mutually accepted patterns=0.75.
- Food: same declared food habit=1; different but mutually accepted habits=0.75. No ordering that treats a diet as better, no allergy/religion inference.
- Work/study: same schedule=1; either explicitly FLEXIBLE=1; different but mutually accepted routines=0.75. ROTATING is a real schedule category, not an unanswered value or automatic synonym for Flexible.

The 0.75 defaults are explainable product heuristics, **not scientifically validated compatibility estimates**. Keep them and the weights in one versioned policy, initially `compatibility-v1`. Do not silently personalize weights or train an opaque model from swipes in P0.

### 4.6 Move-in similarity

Use inclusive calendar-day windows, with the earliest effective day clamped to today. An entirely expired desired window requires the person to update matching preferences; it does not invalidate personal onboarding.

- TEAM_UP, both nonflexible: intersection days divided by the smaller window's day count. Exact-date windows have one day and are valid. Nonoverlap is excluded.
- Either explicitly flexible: 1, after any explicit viewer date filter is checked.
- Flat/room, seeker nonflexible and listing nonflexible: feasible-day fraction = days from `max(seeker earliest, listing available-from, today)` through seeker latest, divided by the seeker's effective window length. If none remain, exclude. A listing available before the seeker window gets 1; becoming available only near its end gets a smaller score.
- A Published listing's available-from date in the past means available from that date onward; it is not a one-day availability slot. Explicit listing flexibility earns 1 if no tighter date filter applies.

### 4.7 Worked example and score version

Illustrative eligible TEAM_UP component values: B=0.8, L=1, C=0.5, H=0.75, S=1, M=0.9, F=0.75, W=1.

Contributions: **16 + 20 + 7.5 + 11.25 + 10 + 9 + 3.75 + 5 = 82.5**, displayed as **83% compatibility**. These are example inputs, not measured user results.

Return the policy version and source Profile versions/listing version with the score. Recompute from current permitted data for details/actions; never store a permanent score on User. A Match may retain its score/policy at creation for audit, clearly distinct from the latest compatibility score.

## 5. Discovery, filters and ranking

Add `/dashboard/discover` within the current shared application shell. Personalization stays intact: HAVE_ROOM sees seekers, NEED_ROOM sees eligible flat owners, TEAM_UP sees other team-up people.

Card content: current allowed photo/initials, name, derived age, occupation, short bio, intent, city/locality context, rent/budget, timing and compatibility score. Expand to a detail view for own habits, schedules and Published flat photos where allowed. Personal profile photos stay optional; appearance/face embeddings/photo count never enter scoring. Never use sample people or fake compatibility percentages in production states.

P0 smart filters: supported city (bound to the caller's saved city in v1), supported localities within it, rent interval within their saved budget, and move-in window within their stated constraints. Unknown locations, inconsistent ranges and impossible dates give validation errors. Changing city requires updating the actual saved matching preferences; do not expand the launch area by URL input.

Filters narrow eligibility only. Score using the saved pair answers and actual listing, not a silently rewritten profile based on today's filter selection. The same pair should receive the same compatibility result for the same source data, calculation date and policy, regardless of who opens it; narrowing a filter must not artificially boost the percentage.

### Practical first-release retrieval

1. SQL prefilter by eligibility, intent, city, feasible rent/timing and exclusions. Use indexed owner/action/block lookups; apply the exact two-way rules before returning cards.
2. Score a bounded **500-person working pool** and return the best 20 by unrounded score descending, then stable public profile ID ascending. Pool selection uses a deterministic, daily rotating ordering derived from viewer/candidate IDs so an arbitrary first UUID page is not permanently favored. The same pair's score does not depend on this sampling order.
3. Be explicit: ranking is best **within the working pool**, not proof of the highest score across all NCR users. Expand/optimize retrieval when excluded volumes or measured latency justify it. Do not silently fetch every profile into browser memory.
4. P0 uses a small card queue, not infinite-scroll pagination: after queued decisions are confirmed, request a fresh batch excluding prior decisions. A refresh also refills it. Do not introduce persistent feed sessions or claim stable keyset pagination over changing scores.
5. Return fewer cards when necessary; never loosen hard requirements automatically. Exhaustion, current filters, incomplete matching preferences and network failure have distinct messages. Offer changing preferences/filters, not a made-up candidate.

If data changes while cards are queued, revalidate current eligibility on detail/Like. Return stale-candidate refresh instructions for changed profile/listing versions; do not display yesterday's budget or score as current. Filters changing clears the local queue. No daily active-usage tracking is needed just to rank P0; add recency signals only after defining them honestly.

Support swipe gestures **and** labelled Like/Pass buttons, keyboard navigation, visible focus, screen-reader status, reduced motion and mobile layouts from `DESIGN.md`. Disable duplicate submissions while pending; do not irreversibly advance the card until the decision is acknowledged. On timeout retry the same decision idempotently before sending a conflicting new one.

## 6. Like, Pass, mutual match and chat unlock

### Decision semantics

- A directed decision records A → B as LIKE or PASS. It is private. Neither incoming nonmutual likes nor “B passed you” is exposed in P0.
- Unique `(actorId, targetId)` prevents duplicate records. Repeating the same action returns the existing result; a different decision for that pair returns 409 in P0. Undo Pass is a later, explicit P2 operation.
- LIKE revalidates both accounts, versions, visibility, intent, listing and hard constraints. PASS may acknowledge an already-unavailable card without revealing its current private state or creating/reactivating interest; do not require a fresh score to let a person dismiss a stale card.
- LIKE alone never creates a Match or grants chat. When the reciprocal current LIKE exists and both remain eligible, create exactly one Match for the canonical unordered pair.

### Race handling and lifecycle

Use a transaction-scoped lock on the canonical pair for Like/Pass, mutual creation, Block, Unblock, Unmatch and eventual message-permission operations. All use the same key/order. Within the transaction check blocks/terminal history, write the idempotent decision, check the reciprocal decision and create/read the uniquely constrained match. No remote image/network call inside the transaction. Retry bounded database conflicts; do not retry semantic validation failures as new actions.

Canonical pair means the two internal user UUIDs in deterministic order; database uniqueness plus no-self-pair constraints are required. A concurrent pair of Likes must return one Match, not two. A Block that commits before a Like is processed must prevent that Like from creating a Match. An end action prevents a stale/retried Like from recreating the connection.

Either person can Unmatch. Mark the match ended and deny further messages; do not erase the only evidence needed for a report. P0 does not automatically resurface ended pairs or rematch them from old Likes. Unblocking later never restores old Likes, a match or chat access automatically.

### Chat authorization is P0; messaging implementation is separate

Chat permission is two separate rules (see [messaging.md](./messaging.md), which owns the chat design and supersedes the earlier blanket denial for Block and Unmatch):

- **`canSendMessage(A,B)`** (also typing and shared receipts) requires membership, a Match that has not ended, both accounts adult, onboarded and not suspended, and **no active block in either direction**. It is rechecked for every send, typing and receipt event, inside the pair lock.
- **`canReadHistory(A,B)`** requires only that the caller is a member and an eligible (not suspended) account. After **Block or Unmatch the previous messages stay readable and read-only for both people** until either account is deleted. This does not make blocked profiles or listings visible again, and the other person's identity is shown neutrally (name only, no avatar or profile link) once a chat is not interactive. A suspended peer leaves the chat read-only for the other person; a suspended caller loses access entirely.

A public profile ID, a single Like, a client-side enabled button or knowing a Match UUID is insufficient for either rule. Turning off discovery stops new discovery/likes but does not end an existing Match and does not re-run compatibility as a chat gate; pausing/closing a flat likewise only stops new room-pair discovery. Block, Unmatch and suspension close sending; account deletion removes the shared conversation. Unblock never restores sending.

Start chat links to the real Messages routes (`/dashboard/messages/[matchId]`); the Matches list reports `chat.available` from the same server rules.

## 7. Block, Report and visibility controls

- **Block:** available from cards, profile details and Matches. Store a directed block; enforce it symmetrically for discovery, likes, profile/listing reads, matches and chat. End an active Match and invalidate pending interest for the pair in the same locked operation. Never disclose who blocked whom.
- Apply safety checks to the existing `/api/profiles/:publicId` and `/api/listings/:id` viewer reads as well as new matching APIs; otherwise blocked people could bypass the swipe screen. Owner access remains available. Return nonrevealing 404 for inaccessible targets.
- Existing R2 signed image links may remain usable until expiry and saved downloads cannot be recalled. Block stops issuing new links; no claim of revoking already delivered bytes.
- **Report:** reason (harassment, scam, fake profile/listing, inappropriate content, other), optional bounded description, target and optional related Match/listing reference. Verify the referenced relationship; do not allow reporting arbitrary private objects by ID. A report can concern a previously viewed/matched profile that is now unavailable, without restoring its content to the reporter.
- Offer clearly separated Report and block / Report only choices. A report alone does not silently publish allegations or automatically suspend the target based on unreviewed claims.
- Store minimal reviewable evidence: reporter/target, timestamps, context references and bounded relevant public-content snapshot where permitted, not full DOB/contact data or staging URLs. Chat evidence is only what the reporter explicitly selects (at most 10 messages, previewed and confirmed); the server rebuilds each excerpt from stored rows and never accepts client-supplied text. Chat history is never scraped into a report.
- Reports require an authenticated operator review process before release (intake, triage owner, decision/audit and a documented retention policy). An admin UI/automatic moderation model is not required to build the intake, but collecting reports with no review owner is not an acceptable finished P0.
- Rate-limit decisions and reports per verified account plus existing IP controls. Avoid a single user discovering/reporting the entire user database by enumeration. Report spam does not disclose private target information.

Block takes precedence over published-flat visibility and profile-discovery consent. No profile score or explanation may reveal that a hidden person failed someone else's private gender/pet/smoking filter.

## 8. Proposed tables and fields — no schema code now

| Model/addition | Important fields and constraints |
| --- | --- |
| Existing HousingPreference | New nullable `moveInLatestDate`; reuse earliest date/flexibility, canonical city/localities and integer-paise budgets. |
| Existing LifestylePreference | New directly answered work/study schedule and nonempty accepted schedule array for matching readiness. |
| Existing User | `matchingEnabledAt` and server-owned `suspendedAt`; existing onboarding completion/discovery visibility still apply. |
| `DiscoveryAction` | UUID, actor FK, target FK, LIKE/PASS, context listing FK where relevant, nullable `invalidatedAt`, timestamps; unique actor/target; actor ≠ target. Block/end operations invalidate old interest and invalidated Likes never count as reciprocal consent. Snapshot policy/version metadata only as needed for diagnosing decisions; never store raw client score as truth. |
| `Match` | UUID, canonical userLow/userHigh FKs, createdAt, endedAt/endReason, scoreAtMatch and scorePolicyVersion; unique unordered pair and no-self constraint. Current match status is derived from endedAt plus current block/account safety state. |
| `UserBlock` | blocker FK, blocked FK, createdAt, nullable `revokedAt`; unique directed pair, no self-block; indexes allow either-direction checks. Unblock records revocation instead of erasing safety history; active blocks deny access and historical blocks prevent automatic discovery resurfacing in P0. |
| `UserReport` | UUID, reporter/target FKs, reason, bounded description, optional verified Match/listing references, review status/timestamps and restricted evidence snapshot. Access restricted to reporter acknowledgement and authorized review operations. |
| P1 `SavedProfile` | saver/target FKs, createdAt; unique pair; saving grants neither visibility nor chat and never bypasses block checks. Do not create this table for P0 unless P1 is actually in scope. |

Use existing Profile.version for matching preference changes and revalidate current listing.version separately. Ensure every writer of scoring/eligibility fields participates in consistent versioning. Budget/date constraints and canonical-pair checks require reviewed database constraints in addition to API validation.

No Message/Conversation/Group table is added solely to represent an unlock. Future messaging owns those models and must reference/authorize against Match. Account deletion must immediately deny discovery/chat and preserve only the minimum report/audit evidence under the agreed retention policy; coordinate deletion with existing listing/R2 cleanup rather than unsafe cascades that lose object references.

## 9. Proposed API and interface changes

| Endpoint | Responsibility |
| --- | --- |
| `PATCH /api/profile/me/matching` | Versioned complete matching-preference section, new schedule/window fields and explicit enrollment/visibility choice. Reuse existing validation/DTO conventions, keep personal onboarding complete. |
| `GET /api/discovery` | Validate filters/readiness, prefilter, score/rank bounded pool; return safe card DTOs, policy/source versions and genuine availability state. No writes on GET. |
| `GET /api/discovery/:publicId` | Fresh eligibility/visibility check and detailed candidate DTO with permitted budget, timing, habits, schedule and Published flat. |
| `POST /api/discovery/actions` | Target public reference, LIKE/PASS, source versions; server derives actor and recomputes eligibility. Return decision acknowledgement and optional mutual Match result. |
| `GET /api/matches` | Caller's currently accessible matches; no list of incoming private Likes. Include truthful chat availability. |
| `POST /api/matches/:id/unmatch` | Pair-locked, member-only terminal end; revoke chat. |
| `POST /api/blocks`, `DELETE /api/blocks/:publicId` | Idempotent owner block/unblock; DELETE revokes the block while preserving history. Unblock never restores an ended connection or invalidated Like. |
| `POST /api/reports` | Validated report intake with optional explicit block action and acknowledgement; no unauthenticated intake exposing target state. |
| Future chat operations | Must call the same current Match/block/account authorization policy for send/read/subscription. A standalone client-readable permission endpoint is not enforcement. |

Use Clerk-derived identity, strict request schemas, bounded payloads, existing `{ error: { code, message, fields? } }`, private/no-store responses and account-scoped rate limits. 401 for no session; 403 for readiness/eligibility; 404 for hidden/nonowned target; 409 for stale source versions/conflicting decisions; 422 for invalid filters; 429 for rate limits; 503 for service failure. Do not return raw Clerk IDs/internal safety rows.

Discovery enrollment must explain which additional data other eligible people can see: search budget, preferred location/timing and work/study habits. Current public-profile responses intentionally exclude some of this data. Add a dedicated **discovery DTO** and enrollment consent instead of accidentally broadening every public profile response. Never expose DOB, contact details, raw accepted filters or private photos.

Reuse the shared dashboard layout: enable Discover and Matches only when their real routes/APIs exist; leave Groups and full Messages marked unavailable until delivered. Reuse current profile/details, listing policy, location catalogue, INR/date formatting, errors and image components. Cards always have accessible button equivalents to gestures.

## 10. Delivery phases and verification

1. **Policy and data readiness:** review the hard-tolerance policy and exact similarity rules; add schedule/window/enrollment/suspension fields with a reviewed migration; update preference forms and owner version handling. Do not erase or reopen completed onboarding.
2. **Safety foundation:** implement shared visibility/block/account predicates, directed decisions and canonical Match constraints, report intake and operator review procedure. Update existing profile/listing viewer APIs before enabling discovery.
3. **Pure scoring:** one deterministic versioned function with the eight weighted outputs and internal reason codes. No network/DB access inside the scoring function. Confirm the published weights sum to 100.
4. **Discovery UI/API:** bounded retrieval, server scoring/ranking, safe DTOs, strict filters, empty/error states, accessible profile/photo details and Like/Pass acknowledgement behavior.
5. **Mutual matches and unlock:** pair-locked actions, one Match per reciprocal pair, Match list, Unmatch, and enforced future-chat permission contract. Do not enable a nonexistent messaging route.
6. **P0 release checks:** exercise all three intents, visibility/safety bypasses, simultaneous Likes/Blocks/Unmatches, account removal, stale candidate data, listing pause/close, R2 outages and direct-ID attacks. Run backend unit/integration checks and frontend lint/types/build plus keyboard/mobile review.
7. **P1/P2 later:** safe explanations and bookmarks; then versioned Undo Pass behavior. Reassess bounded-pool retrieval using measured latency/quality rather than introducing ML prematurely.

Future files include a scoring policy/function, focused discovery/action/match/safety backend modules, new reviewed Prisma migrations, profile preference callers/types/validators, existing profile/listing visibility readers, Discover/Matches routes and focused client gesture/action controls. Update existing `FEATURES`, dashboard/nav callers and tests. Do not replace the current authentication or photo-storage flow.

### Minimum meaningful test matrix

| Area | Required cases |
| --- | --- |
| Arithmetic | Weights exactly 100; eight similarities finite and in [0,1]; identical/flexible and opposite-but-accepted categories; worked example 82.5 → 83; no early rounding. |
| Intervals | Disjoint/partial/contained/point budgets; exact dates, leap/calendar boundaries, expired windows, available-before/within/after seeker window; integer-paise boundaries. |
| Hard filters | Both directions of every acceptance, all intent combinations, opt-out, missing fields, unsupported city/locality, no Published flat, zero available places, no self. |
| Ranking | Deterministic tie-breaks and policy version; only eligible records; working-pool bound is explicit; missing data never becomes a fabricated percentage. |
| Decisions | Repeated same Like/Pass is idempotent; conflicting action rejected; one-way Like has no Match; simultaneous reciprocal Likes yield exactly one Match. |
| Safety/races | Concurrent Block/Like cannot leave accessible active match/chat; repeated Unmatch cannot resurrect; unblock does not replay Likes; direct profile/listing reads and image issuance respect blocks. |
| Privacy | No incoming-Like/pass disclosure, DOB/contact/accepted filters/staging keys in DTOs; report acknowledgement does not expose private target state. |
| UX/failure | Button/keyboard/swipe equivalence, failed action preserves card, stale card refresh, true exhaustion versus outage, personal photo fallback and private flat photo failure. |

## 11. Decision status and limits

The user's P0/P1/P2 priorities, eight parameters and weights are preserved. Exact similarity constants, hard-tolerance semantics, enrollment fields, bounded-pool sizing and conservative ended-pair resurfacing rules are explicit v1 recommendations in this plan, not research-proven outcomes. Review these policies before implementation; score calibration requires real opt-in usage and user feedback, not a higher-looking percentage.

Related contracts: [dashboard](./dashboard.md), [onboarding](./onbaordig.md), [locations](./locations.md), [listing/R2](./flat-listing.md), [database overview](./databse.md). Current profile/listing/onboarding source and schema were inspected; no new runtime checks or live account/database inspection was performed. No code or schema is written by this planning task.

## 12. Final numbered sequence — discovery to mutual match, chat gate and safety

```mermaid
sequenceDiagram
    autonumber
    actor A as Person A
    actor B as Person B
    participant UI as Shared dashboard Discover/Matches UI
    participant API as Express eligibility and scoring
    participant DB as Neon through Prisma
    participant Photos as Existing permitted photo delivery
    Note over A,Photos: Stage 1 - matching enrollment without restarting personal onboarding
    A->>UI: Open Discover
    UI->>API: Request readiness with Clerk session
    API->>DB: Read completion, visibility, intent, preferences and listing state
    alt New matching fields or consent missing
        API-->>UI: Matching preferences required, dashboard remains usable
        UI-->>A: Confirm work schedule, move-in window and discovery consent
        A->>UI: Save matching preferences
        UI->>API: Versioned matching-preference save
        API->>DB: Validate and persist new answers/enrollment
    else Ready
        API-->>UI: Matching ready
    end
    Note over A,Photos: Stage 2 - hard filtering before weighted scoring
    UI->>API: GET discovery with supported filters
    API->>DB: Fetch bounded eligible pool, exclude self, decided, ended, matched and blocked pairs
    API->>API: Check reciprocal intent, city, rent/time feasibility and accepted habits
    API->>API: Calculate eight similarities and fixed weighted score, rank eligible pool
    alt No candidates or invalid/stale preferences
        API-->>UI: Genuine empty/readiness/filter state
        UI-->>A: Offer update filters/preferences, no invented profiles
    else Candidates available
        API-->>UI: Safe cards, score policy and source versions
        UI-->>A: Profile, compatibility, budget, location and timing
        opt Open candidate details
            UI->>API: GET fresh discovery profile by public reference
            API->>DB: Recheck visibility/blocks and current profile/listing
            API-->>UI: Permitted detail DTO and Published flat only
            UI->>Photos: Load allowed profile/Ready flat photos
        end
        Note over A,DB: Stage 3 - one directed decision, acknowledged before advancing
        alt A passes
            A->>UI: Swipe left or press Pass
            UI->>API: PASS candidate with source versions
            API->>DB: Pair-locked idempotent decision write
            API-->>UI: Acknowledgement, no Match or chat
            UI-->>A: Advance card
        else A likes
            A->>UI: Swipe right or press Like
            UI->>API: LIKE candidate with source versions
            API->>DB: Lock canonical pair and read current safety/eligibility/decisions
            API->>API: Revalidate current data, reject stale or excluded candidate
            alt Candidate stale or no longer eligible
                API-->>UI: Conflict or unavailable, no new Like or Match
                UI-->>A: Refresh card or skip unavailable profile
            else Current eligible pair
                API->>DB: Persist A to B Like and check reciprocal Like
                alt B has not liked A
                    API->>DB: Commit directed Like only
                    API-->>UI: Interest saved, no chat permission
                else B already likes A and both still eligible
                    API->>DB: Create/read unique active Match and commit
                    API-->>UI: Mutual Match result
                    UI-->>A: Show mutual match, actual messaging availability is truthful
                end
            end
        end
    end
    opt B later likes A through the same verified flow
        B->>API: Authenticated LIKE A
        API->>DB: Pair lock, current safety checks, write Like, check A's Like
        alt A's Like exists and pair remains eligible with no terminal history
            API->>DB: Create/read exactly one mutual Match and commit
            API-->>B: Mutual Match result
        else No reciprocal Like
            API->>DB: Commit B's directed Like only
            API-->>B: Interest saved, no chat permission
        end
    end
    Note over A,DB: Stage 4 - Matches and server-side chat gate
    A->>UI: Open Matches
    UI->>API: GET caller's accessible mutual Matches
    API->>DB: Read active member matches and current block/account state
    API-->>UI: Match list with Start chat (real Messages route)
    opt Messaging operation: send, typing, receipt, read history
        UI->>API: Authenticated Match-scoped operation
        API->>DB: Membership; sends also pair-lock and check active Match, blocks and account state
        alt Send, typing or receipt denied after Block, Unmatch or suspension
            API-->>UI: CONVERSATION_CLOSED, nothing stored; Like alone or Match UUID is insufficient
        else Read history by an eligible member
            API-->>UI: Previous messages, read-only when ended
        else Interactive and allowed
            API-->>UI: Authorize the operation
        end
    end
    Note over A,Photos: Stage 5 - safety overrides compatibility and published visibility
    opt A blocks or unmatches B
        A->>UI: Confirm Block or Unmatch
        UI->>API: Authenticated safety action
        API->>DB: Lock same pair, persist block/end Match, invalidate stale interest
        API-->>UI: Connection unavailable; chat closed for sending, typing and receipts, history stays readable
        Note over API,Photos: Block also prevents direct profile/listing reads and new image links
    end
    opt A reports B or a verified related listing/match
        A->>UI: Select reason, optional details and explicit block choice
        UI->>API: Validated report request
        API->>DB: Save restricted report evidence and optional pair-locked block
        API-->>UI: Acknowledgement without private target-state disclosure
        Note over API,DB: Assigned operator reviews intake, no automatic public allegation
    end
    Note over A,Photos: Existing short-lived photo links may expire later, downloaded copies cannot be recalled
    Note over A,DB: P1 explanations/bookmarks and P2 Undo Pass are separate releases
```
