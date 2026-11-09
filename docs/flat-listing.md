# Flat listing after personal onboarding

Status: plan only. No application code, Prisma schema, migrations, Cloudflare resources, secrets or database data are changed by this task.

## 1. Agreed behavior and MVP choices

**A person can finish personal onboarding without any flat photos or completed listing.** Listing creation is a separate, optional-to-start flow after onboarding, primarily for `HAVE_ROOM` users.

| Requirement | Planned behavior |
| --- | --- |
| Finish personal onboarding | Keep the existing personal/profile/housing/lifestyle requirements. Do not check listing existence, flat photos or R2 availability. Personal avatar remains optional and stays with Clerk. |
| Arrive afterward | New protected `/dashboard` replaces the current `/route` completion destination when this feature is implemented. The marketing landing stays public. |
| Primary action for `HAVE_ROOM` | Show **Complete your flat listing** while no listing exists or its state is Draft. Show missing details/photos and reassure: **Your profile is ready. Your flat listing stays private until you publish it.** |
| Save now, photos later | Save valid partial details as an unpublished Draft, including a draft with zero photos. Resume after refresh or later login. |
| Publish | Explicit owner action only; require complete listing details and validated photos. Uploading the last photo never automatically publishes. |
| Manage anytime | Owner can edit, pause, or close. These actions never undo personal onboarding. |
| Storage | Cloudflare R2 for flat-photo bytes; Neon + Prisma for listing/photo metadata. No image blobs or signed URLs stored in PostgreSQL. |

Proposed MVP defaults, adjustable before implementation: **one reusable listing per owner; 3–10 photos to publish; at most 5 MiB per original image; JPEG, PNG or WebP; authenticated viewers only.** Photo policy is a product recommendation, not a Cloudflare requirement. No video, floor-plan upload, multiple-property dashboard or concurrent public/draft revisions in this slice.

## 2. Current baseline and integration scope

The current code has Clerk, persisted onboarding and local migration files. `auth/continue` and the onboarding wizard send complete users to `/route`. There is no `/dashboard`, flat-listing model, photo uploader or R2 integration. This inspection does not establish which migrations are applied remotely.

The [Delhi NCR location plan](./locations.md) defines the launch allowlist. The current `backend/src/cities.ts` still contains a wider placeholder list; implementing the authoritative NCR catalogue is a prerequisite for listing publication. Do not accept that placeholder list as launch policy or reset someone's completed onboarding to correct it.

Existing `HousingPreference` is an onboarding/search preference, not a published flat listing. Prefill a draft from it only where values map unambiguously to supported location IDs, rent and availability. The owner reviews and confirms actual listing details. Later listing edits do not silently rewrite their personal profile/preferences.

## 3. Dashboard and editor

| Owner state | Primary dashboard action | Secondary controls |
| --- | --- | --- |
| `HAVE_ROOM`, no listing | Complete your flat listing | Start editor; create Draft only on an explicit create/save request, never on dashboard GET. |
| Draft | Complete your flat listing | Resume saved details, upload photos, private preview; Publish stays unavailable with a clear missing-items checklist. |
| Published | Manage your flat listing | Edit, Pause, Close; show visible status. |
| Paused | Review and republish | Edit, private preview, Close. Preserve saved details/photos. |
| Closed | Listing closed | View saved details; optional explicit Reopen draft reuses the listing and requires validation before publishing again. |
| `NEED_ROOM` / `TEAM_UP` | Intent-relevant dashboard content | Do not show the flat-listing completion requirement or block their dashboard on one. Discovery/matching UI is a separate task. |

Editor blocks: **Flat and room → Rent and availability → Photos → Review and publish**. Allow Save draft and exit from each block; drafts may be incomplete but any supplied values must be valid. Show saved/saving/error status, clear missing-photo counts, upload progress, per-file retry/remove, cover selection and private preview. Retain unsaved inputs after recoverable errors. A failed upload does not discard already saved flat details.

Reuse `DESIGN.md`, the existing logo, form controls, typography and palette. Use accessible labelled inputs, keyboard photo ordering (Move earlier/later buttons rather than drag-only), descriptive image alt text, visible focus and mobile layouts. Dashboard copy must distinguish “profile complete” from “listing unpublished”; do not send users back through personal onboarding to supply flat photos.

## 4. Required listing details and publishing gate

| Data | Draft | Required to publish |
| --- | --- | --- |
| Title and description | May be absent | Trimmed title 10–100 characters; plain-text description 30–2,000 characters. |
| City and locality | May be absent | One supported NCR city and one locality belonging to it, validated using the current catalogue. No Anywhere option for an existing flat. |
| Flat/room setup | May be absent | Flat bedroom count (1–10), available places (1–10), private/shared room type, and furnishing: unfurnished / semi-furnished / furnished. “Available places” means people who can move in, not necessarily empty bedrooms. |
| Monthly rent per person | May be absent | Positive integer paise, INR; one actual amount rather than a search range. Explain what is included. |
| Refundable deposit | May be absent | Nonnegative integer paise; explicit zero is valid. |
| Recurring charges | May be absent | A required plain-text explanation (1–500 characters) of utilities, maintenance and exclusions; “Included in rent” is valid. |
| Available from / Flexible | May be absent | Explicit choice. A selected date is date-only and today or later at publish/re-publish; Flexible means no date. |
| Flat photos | Zero is valid | 3–10 `READY` photos, including one bedroom/room image and one shared-space image, plus an explicitly selected ready cover. Categories are owner-declared, not automatic scene verification. |
| Permission to advertise | Not needed to save | Explicit owner confirmation that they have permission to advertise the space and use the photos. This is self-attestation, not a verification badge. |

Use a third photo category Other for additional views. No duplicate photo IDs or uploading the same decoded photo repeatedly to satisfy the minimum. Proposed image bounds: at least 640 × 480 pixels in either orientation and no more than 40 megapixels; validate decoded dimensions before accepting. Explain the upload requirements before file selection. HEIC/SVG/GIF are unsupported in this MVP; tell users how to export an accepted format rather than silently dropping the file.

No exact street address, flat number, ownership papers or public contact number is needed in this slice. Room photos should avoid documents, addresses and other people's personal information. Future private address sharing is a separate design.

The backend derives `canPublish` and a missing-items list; neither is a separately stored truth. Publish verifies owner eligibility/completed onboarding, current `HAVE_ROOM` intent, location support, details, photo metadata/object readiness and permission confirmation. Profile-discovery consent and listing publication are separate: Publish explicitly consents to the listing plus minimal owner name/avatar being visible to signed-in users; it does not silently switch on personal-profile discovery.

## 5. Listing lifecycle

| Transition | Rule |
| --- | --- |
| No listing → `DRAFT` | Authenticated, completed `HAVE_ROOM` owner explicitly creates a draft. Repeated creation returns the same listing using unique owner identity. |
| `DRAFT` → `PUBLISHED` | Full publish validation succeeds and the owner explicitly publishes. |
| `PUBLISHED` → `PAUSED` | Owner pauses. Remove from results and deny new viewer reads immediately after commit. |
| `PUBLISHED` → `PAUSED` on edit | Opening the editor changes nothing. Saving public details, adding/removing a ready photo, changing cover or order atomically pauses it. Review and publish again. |
| `PAUSED` → `PUBLISHED` | Explicit republish with full current validation. No automatic resume after an upload. |
| Any open state → `CLOSED` | Owner explicitly closes. Hide it and cancel outstanding upload finalization. Keep private saved details/photos. |
| `CLOSED` → `DRAFT` | Explicit Reopen draft, never an implicit effect of editing or a late upload callback. |

Private edits to a closed listing can remain closed; publishing requires reopening first. Uploading new photos requires an open listing. Proposed simple edit policy avoids maintaining a public snapshot beside an editable version; the tradeoff is temporary removal from discovery while saved edits are reviewed.

`onboardingCompletedAt` never changes because a listing is paused, closed, incomplete or has no photos. If the owner changes away from `HAVE_ROOM` through a future intent-edit flow, pause any published flat listing in the same database operation. Do not allow stale listing writes to undo that change.

Every listing mutation checks an owner-scoped listing `version` and uses a consistent parent-first transaction/lock. Stale requests return 409 and preserve local input; they do not overwrite newer changes. Pause/Close must remain usable during an R2 outage because they depend only on database state. An unavailable database cannot report those changes as successful; show retry.

## 6. Proposed data additions — documentation only

Keep the current onboarding tables. Add these models only during implementation, after inspecting the real database and generating a reviewed migration. Do not rewrite applied migration files.

| Proposed model | Fields and constraints |
| --- | --- |
| `FlatListing` | UUID `id`; unique FK `ownerId` → User; `status` default Draft; integer `version`; nullable draft title/description/cityId/localityId/setup fields; INR rent/deposit integer paise; charges description; date/flexibility; nullable permission-confirmed timestamp; nullable `publishedAt`; optional unique selected `coverPhotoId`; created/updated timestamps. Cover must reference a ready, non-deleted photo belonging to this same listing. |
| `FlatPhoto` | UUID `id`; FK `listingId`; unique server-generated staging key and final R2 object key; `state` (Pending / Processing / Ready / Failed / Delete pending); category; order; validated MIME/byte count/dimensions/content hash; upload expiry; processing-lease expiry for recovery; created/updated timestamps. Original filenames are display-only, never object paths. |

One-to-many User → listings can be narrowed to one per owner using the unique FK for this MVP; closed/reopened listing reuses that row. `FlatListing` has many photos. Use ordinary owner/listing indexes plus a discovery status/city/locality index when that query is implemented; no speculative search service.

Draft fields stay nullable. Enum/FK/uniqueness and local numeric/date constraints belong in the migration; cross-table publishing invariants also require backend validation in the locked transaction. Mark photo deletion in metadata before deleting bytes; retain enough metadata to retry failed storage deletion. Do not cascade away the only object-key references before cleanup can run.

## 7. Cloudflare R2 storage and upload flow

**Keep the bucket private**: no public `r2.dev` access, no public custom-domain bucket. Separate development/production storage, use bucket-scoped credentials on the backend only, and never send credentials or signed URLs to logs. No new Worker service is needed for this MVP; reuse Express with R2's S3-compatible API.

### Direct upload, then server validation

1. Owner requests an upload slot with declared file type/size/category and current listing version. Express verifies owner, onboarding, intent, listing state, rate/quota limits and available photo slots. Pending uploads count toward the maximum so parallel requests cannot reserve unlimited objects.
2. Create a pending photo record and random key under `staging/{listingId}/{photoId}/{randomId}`. Return a **5-minute presigned PUT URL** restricted to that key and signed Content-Type. The browser does not choose keys or receive write access to the final-photo prefix.
3. Browser PUTs directly to R2 with the required headers. Configure bucket CORS for the exact frontend origins and required PUT/GET/HEAD headers only. CORS is browser policy, not authorization.
4. Browser requests finalization by photo ID. A successful PUT or browser-reported ETag is not proof of a usable photo. Express claims that pending record for processing; repeated finalizations are idempotent and competing processors cannot attach separate results.
5. Outside a database transaction, read the object with bounded bytes, decode it, enforce MIME/dimensions/size, reject unsupported/broken content and duplicate decoded-photo hashes, strip metadata including GPS, and re-encode to a controlled image format. The server performs final type checks; extensions and Content-Type alone are untrusted.
6. Write the sanitized bytes to a new immutable key under `flats/{listingId}/{photoId}/{attemptId}` and record the intended final key before writing for recovery. Never publish/serve the staging object. A reusable PUT URL can otherwise overwrite staging bytes after validation; immutable sanitized output prevents that from changing an accepted photo.
7. In a short transaction, recheck ownership, listing state/version and the processing claim, attach only the current sanitized result and mark it Ready. If a published listing's photo set changes, atomically pause it. A concurrent Close, intent change or deletion wins over stale finalization; discard its result and schedule cleanup instead of reopening/reactivating the listing.
8. Return the authoritative photo/listing state and new version. Delete consumed staging bytes with retry. A failed/expired upload can reserve a new slot; it does not discard saved listing details or other accepted photos.

Presigned PUTs are bearer capabilities and can be reused until expiry; signing MIME is not a hard content/size validator. Oversized data may temporarily reach R2 before backend rejection/deletion. Short expiry, upload-ticket rate limits, pending-slot limits and cleanup bound this MVP risk. If a hard pre-storage byte ceiling becomes a requirement, use bounded server-mediated uploads instead.

### Reading and removing photos

- Store object keys, not expiring URLs. Owner preview issues short-lived GET URLs only for their Ready photos. Nonowners receive URLs only after an authenticated read verifies the viewer has completed onboarding, the listing is Published and the owner remains eligible.
- Proposed GET URL lifetime: **60 seconds**. Pause/Close stops new URLs and listing reads after its database commit; already issued URLs may work until expiry and downloaded copies cannot be recalled. Do not promise instant revocation of bytes already delivered.
- Keep API responses/private previews noncached. Avoid a shared image-optimization cache that outlives visibility checks; choose delivery/cache configuration during implementation. Use immutable keys for replacements so cached bytes cannot be overwritten.
- Removing a photo or changing a published photo set pauses the listing in the metadata transaction. A selected cover must be replaced or cleared atomically. Record deletion intent, then delete R2 bytes outside the transaction with retry; never count a delete-pending photo toward publication.

### Cleanup and configuration

Configure an R2 lifecycle rule for **staging only**, proposed one-day expiry; never apply it to saved final-photo prefixes because users may return to drafts much later. A small scheduled backend cleanup reconciles expired pending/failed photos, abandoned processing claims, unreferenced finalization results and delete-pending objects. Use a grace period and check current references/claims before deleting; R2 and PostgreSQL do not share a transaction. Lifecycle expiry is not immediate access revocation.

Saved Draft/Paused/Closed photos remain until explicit photo/listing deletion or account cleanup; do not silently expire useful saved drafts. Account deletion must preserve object cleanup references until R2 deletion succeeds, with discovery/access blocked immediately by database eligibility state.

Future backend-only configuration: `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, frontend-origin CORS and a cleanup schedule. R2 S3 requests use the account endpoint and `auto` region; implementation can use the documented AWS SDK v3 S3 client and presigner. No SDK is installed and no bucket/token is created now. R2 bytes/operations and backend image processing use resources; private storage is not a claim of zero cost.

## 8. API and implementation blocks

All owner routes verify Clerk and owner scope. Listing creation, editing and uploads require completed onboarding; creation, new uploads and publication also require current `HAVE_ROOM` intent. Existing owners retain private read/edit, Pause and Close access after changing intent, but cannot republish under another intent. Return no-store JSON; use the existing error-envelope conventions. Unknown/nonowned IDs return 404 without exposing another owner's draft. New mutations use `version`; rejected publish returns 422 with missing fields/photo requirements, stale state returns 409, quota/rate violations 429, unavailable services 503.

| Proposed route | Responsibility |
| --- | --- |
| `GET /api/listings/mine` | Existing listing/status/checklist or none; never creates a row. |
| `POST /api/listings` | Explicit idempotent create/find Draft from verified owner identity. |
| `PATCH /api/listings/:id` | Validate and save supplied partial fields; pause a Published listing if public content changes. |
| `POST /api/listings/:id/photos/uploads` | Reserve pending slot and issue constrained presigned PUT. |
| `POST /api/listings/:id/photos/:photoId/complete` | Validate/sanitize/finalize upload idempotently. |
| `PATCH /api/listings/:id/photos` | Owner category/order/cover changes; enforce unique photo IDs from this listing. |
| `DELETE /api/listings/:id/photos/:photoId` | Logical remove and durable storage-cleanup intent. |
| `POST /api/listings/:id/publish`, `/pause`, `/close`, `/reopen` | Explicit validated status transitions; no client-set raw status/timestamps. |
| `GET /api/listings/:id` | Owner private preview or authenticated published read; deny nonowners otherwise. |

Publish checks object readiness outside long-held DB transactions, then locks/rechecks current version, Ready photo membership, owner eligibility and all metadata before committing. All photo changes use the same parent-first lock; an external missing object causes a controlled failure and leaves the listing unpublished. Failed storage/network operations never set Published. No storage upload, image processing or remote HEAD request inside an open database transaction.

Implement in order: (1) reconcile the NCR catalogue, define models and reviewed migrations; (2) owner draft CRUD and dashboard continuation; (3) private R2 config and validated upload/finalization; (4) explicit lifecycle and publication gate; (5) cleanup/recovery and tests; (6) accessible editor/review and regression checks. Keep modules within the existing Express backend rather than adding a microservice or queue platform for this slice.

Files implementation must reach: dashboard route; completed-user destinations in `auth/continue` and wizard; existing API/types/form patterns; Express listing/media routes and validators; future Prisma models/migration; R2 adapter/image processor and cleanup runner; environment examples; focused integration checks. Existing onboarding completion validators must remain independent of the new listing tables/R2.

## 9. Acceptance checks and open policy choices

- Complete onboarding with no listing, zero flat photos and an unavailable R2 service; still reach the dashboard. `NEED_ROOM`/`TEAM_UP` never see a mandatory flat-listing task.
- Save an incomplete Draft, refresh/sign out/in, and resume it. No draft/paused/closed listing or photo is exposed through nonowner reads, feed queries or new signed URLs.
- Reject publish without required fields, permission confirmation, supported location, required ready photo categories/count or cover. Pending/broken/duplicate/deleted/other-owner photos cannot satisfy the gate.
- Exercise oversized and spoofed images, expired/replayed PUTs, concurrent slot reservations/finalization, stale versions, retry after a lost response, failed sanitization, R2 failure and DB failure after a final object write.
- Pause/Close hide the listing without R2 calls; edits cannot leave an invalid Published row. A late upload cannot resurrect a closed listing. Reopen returns Draft, not Published.
- Remove/reorder/replace cover safely; recover pending cleanup without deleting an accepted draft photo. Verify account deletion across database metadata and storage.
- Test actual signed URL/CORS behavior in isolated development storage, source-image metadata stripping, no public bucket access, cross-account ID attacks and 60-second read-link expiry. Test build/types plus keyboard/mobile/error-state flows.

Policy choices proposed for review: minimum/photo categories, size/dimension bounds, short link lifetimes, staging retention and the pause-on-saved-edit behavior. They are documented defaults, not unasked infrastructure changes. No moderation automation, property verification badge, listing expiry policy, pricing claims or paid Cloudflare add-on is assumed.

## 10. References

Cloudflare's current docs were consulted through Context7:

- [R2 presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/): operation/key/expiry scoping, signed Content-Type, S3 endpoint and supported SDK pattern. Signed links use the S3 domain rather than custom domains.
- [R2 CORS](https://developers.cloudflare.com/r2/buckets/cors/): browser requests still require a bucket CORS policy; expired links can surface as browser CORS/network failures.
- [R2 object lifecycle rules](https://developers.cloudflare.com/r2/buckets/object-lifecycles/): prefix-scoped cleanup and asynchronous deletion behavior.

Related plans: [personal onboarding](./onbaordig.md), [database design](./databse.md), [Delhi NCR locations](./locations.md). Actual account configuration, storage cost, migration state and image-processing performance have not been tested in this planning task.

## 11. Final numbered sequence — onboarding to a managed flat listing

```mermaid
sequenceDiagram
    autonumber
    actor Owner
    participant UI as Next.js onboarding/dashboard
    participant API as Express + Clerk verification
    participant DB as Neon via Prisma
    participant R2 as Private Cloudflare R2
    Note over Owner,R2: Stage 1 - personal onboarding never requires a flat listing or flat photos
    Owner->>UI: Finish personal onboarding with no flat photos
    UI->>API: Submit existing personal onboarding completion
    API->>DB: Validate personal answers and commit onboarding completion
    API-->>UI: Personal onboarding complete; no R2 dependency
    UI-->>Owner: Open protected dashboard
    UI->>API: GET own listing/status
    API->>DB: Read verified owner's listing, if any
    DB-->>API: No listing or current state
    API-->>UI: Status and missing-items checklist
    alt Owner has HAVE_ROOM intent and no listing or Draft
        UI-->>Owner: Primary action - Complete your flat listing
    else Other intent or existing managed listing
        UI-->>Owner: Intent-relevant content or manage/review listing action
    end
    opt Owner starts or resumes flat listing
        Note over Owner,R2: Stage 2 - save now, upload later
        Owner->>UI: Enter partial details and Save draft
        UI->>API: Create/find Draft then save valid partial details
        API->>DB: Check owner/version and commit private Draft
        API-->>UI: Saved Draft; missing photos do not fail save
        UI-->>Owner: Resume later; listing remains unpublished
        opt Owner returns with photos
            Note over Owner,R2: Stage 3 - constrained staging upload and sanitized final photo
            UI->>API: Request upload slot with listing version, type, size and category
            API->>DB: Check owner/state/quota; reserve pending photo and new revision
            API-->>UI: Five-minute presigned PUT for server-generated staging key
            UI->>R2: PUT original image directly with signed headers
            R2-->>UI: Upload result
            UI->>API: Finalize photo by ID
            API->>DB: Claim pending photo processing
            API->>R2: Read original with byte limits
            API->>API: Decode, validate, deduplicate, strip metadata and re-encode
            alt Rejected photo or storage/processing failure
                API->>DB: Record failure or recoverable pending state
                API-->>UI: Retry/remove; keep saved listing details
            else Accepted photo
                API->>DB: Record intended immutable final key
                API->>R2: Write sanitized image under private final prefix
                API->>DB: Recheck listing/version/claim; attach Ready photo and commit
                API-->>UI: Accepted photo and authoritative listing version
                Note over API,R2: Concurrent Close/deletion rejects stale finalization; cleanup removes abandoned bytes
            end
        end
        Note over Owner,R2: Stage 4 - explicit review and publishing
        Owner->>UI: Review details, Ready photos, cover and permission confirmation
        UI->>API: Publish with current version
        API->>R2: Check accepted final objects outside DB transaction
        API->>DB: Lock/check version; revalidate owner, details and Ready photo membership
        alt Required details/photos missing or invalid
            API->>DB: Roll back any publication transaction
            API-->>UI: Validation errors or conflict; stay unpublished
            UI-->>Owner: Correct missing items; personal onboarding stays complete
        else Publication gate passes
            API->>DB: Atomically commit Published state
            API-->>UI: Published listing
            UI-->>Owner: Manage your flat listing
        end
    end
    Note over Owner,R2: Stage 5 - authenticated viewing and lifecycle control
    UI->>API: Authenticated listing/photo read
    API->>DB: Check current visibility and eligibility
    API-->>UI: Owner preview or Published data plus short-lived photo GET URLs
    UI->>R2: Read allowed sanitized photos before link expiry
    opt Owner saves edits or changes Ready photos
        UI->>API: Save changes with current version
        API->>DB: Apply changes and atomically pause a Published listing
        API-->>UI: Saved Paused state; review and republish explicitly
    end
    opt Owner pauses or closes anytime
        Owner->>UI: Pause or Close
        UI->>API: Explicit status action with current version
        API->>DB: Commit Paused or Closed; no R2 request required
        API-->>UI: Hidden listing; preserve saved details/photos
        Note over API,R2: Stop new viewer links immediately; existing GET links may last 60 seconds
    end
    opt Owner explicitly reopens a Closed listing
        UI->>API: Reopen draft
        API->>DB: Change Closed to Draft
        API-->>UI: Private draft; full validation required before publishing
    end
    Note over API,R2: Stage 6 - retryable cleanup, separate from listing visibility
    API->>DB: Read expired uploads and durable deletion intents
    API->>R2: Delete unneeded bytes after checking live references
    API->>DB: Record cleanup success or retain retry state
    Note over Owner,R2: Draft photos never block personal onboarding; R2 alone never decides publication
```
