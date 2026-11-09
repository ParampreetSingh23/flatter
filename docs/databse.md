# Flatter database schemas

Status: proposal only. A proposed Prisma schema now exists at [`backend/prisma/schema.prisma`](../backend/prisma/schema.prisma). No database or migration has been applied and no onboarding behavior is implemented.

This file indexes the database design as the product grows. The current proposal covers `User`, `Profile`, `HousingPreference`, and `LifestylePreference`. See the [complete onboarding plan](./onbaordig.md) for field rules, tables, API contracts, interview decisions and diagrams. The database remains Neon PostgreSQL, accessed by the Express backend through Prisma.

## Phase 1: application user

### Do we need this table?

**Not for login/signup alone. Yes when we start storing Flatter onboarding and profile data.** Clerk already manages authentication. A Flatter user record gives our product a stable identity for future profiles, likes, matches, messages, and listings.

The current implementation has Clerk on the frontend and backend. `GET /api/me` returns a verified `clerkUserId`; it does not create or retrieve an application user. Neither this endpoint nor public `GET /health` needs a database today.

Recommendation: introduce the following table with the first onboarding persistence work. Do not create an empty database merely to make Clerk login work.

### Proposed `User` schema

Logical model name: `User`. Proposed PostgreSQL table name: `users`. Types below describe the design, not executable SQL or Prisma code.

| Field | PostgreSQL type | Required? | Default / constraint | Purpose |
| --- | --- | --- | --- | --- |
| `id` | UUID | Yes | Primary key; generated once on creation | Internal Flatter user ID. Future application tables reference this ID. |
| `clerkUserId` | Text | Yes | Unique; no default; immutable | Links this row to the authenticated Clerk account. |
| `housingIntent` | Enum `HousingIntent` | Required to complete onboarding | Null while onboarding is unfinished; no preselected default | The user's current housing goal; one of the three values below. |
| `onboardingRevision` | Integer | Yes | 0 initially; increment on each onboarding write | Detect stale submissions and serialize concurrent changes. |
| `onboardingCompletedAt` | Timestamp with time zone | No | Null | Null means onboarding is unfinished; set by the backend after required onboarding data passes validation. |
| `discoveryEnabled` | Boolean | Yes | False | User's explicit visibility choice; completion is also required for discovery. |
| `createdAt` | Timestamp with time zone | Yes | Current time on insertion; immutable | When the Flatter record was created, which may be later than Clerk signup. |
| `updatedAt` | Timestamp with time zone | Yes | Current time on insertion; refreshed on actual row updates | Last change to this record. |

Keep timestamps in UTC and format them for display as needed. Timestamp update behavior must be explicitly configured when implementing Prisma; PostgreSQL does not automatically refresh `updatedAt` on ordinary updates.

`displayName` and `avatarUrl` now belong exclusively to `Profile`, not `User`. This replaces the previous user-only proposal and avoids duplicate sources for personal data. Clerk can prefill the name and provide/upload the optional avatar; the onboarding plan defines explicit photo snapshot refresh behavior.

The dependent tables use `userId` as both primary key and foreign key to `User.id`, giving each user at most one row of each type. They are optional during drafting and cascade on user deletion.

| Model | Contents |
| --- | --- |
| `Profile` | Name, private birth date (derive age), occupation, optional bio/photo, timestamps. |
| `HousingPreference` | City, preferred locations or explicit flexibility, monthly per-person rent in integer paise, move-in date or flexibility, timestamps. |
| `LifestylePreference` | Sleep, cleanliness, food, smoking, bringing a pet and guests; separate accepted flatmate habits and pet preference; timestamps. |

Adults 18+ only. Draft fields may be null; finishing requires all specified answers across the three tables. Optional photo and bio do not block completion. Prisma enums/types and relations alone do not enforce completeness; see the onboarding plan for backend transaction rules and additional migration constraints.

### Housing intent

Ask: **What are you looking for on Flatter?** Store one current answer on `User.housingIntent`.

| Value | Choice shown to the user | Meaning |
| --- | --- | --- |
| `HAVE_ROOM` | I have a room and need a flatmate | The user already has a place with space available and wants someone to move in. |
| `NEED_ROOM` | I need a room in a shared flat | The user wants to join people in an existing flat, finding both a room and flatmates. |
| `TEAM_UP` | I want to find people to rent a flat together | The user wants to form a group first, then search for a flat together. No existing room is assumed. |

Use one enum rather than separate `hasRoom`, `needsFlat`, and `needsFlatmate` booleans: the choices capture the primary goal without contradictory combinations. For phase 1, users select one current goal and may change it later through a validated update. Supporting several simultaneous goals would require a later product decision; it is not represented by this field.

Allow null only while onboarding is unfinished. The backend must reject unknown values, require a valid choice before marking onboarding complete, and prevent clearing the choice on a completed account. Enforce the allowed enum values in the database and the completion rule at both the API and database boundary: a non-null `onboardingCompletedAt` requires a non-null `housingIntent`.

This is self-reported intent, not proof of property ownership, room availability, or listing verification. Room details and availability belong to a later listing schema, not this user field. A selection also does not by itself enable public discovery.

For future discovery, `HAVE_ROOM` and `NEED_ROOM` are complementary goals; `TEAM_UP` users seek other people who want to search together. These goals guide candidate filtering, but do not establish lifestyle compatibility or create matches automatically. Matching logic remains deferred.

### Identity and constraints

- `id` is the application's primary key. `clerkUserId` is the unique link to Clerk; it is text because Clerk IDs are not UUIDs.
- The Clerk link is logical: PostgreSQL cannot enforce a foreign key into Clerk's hosted identity store.
- Use only the primary-key and unique-Clerk-ID indexes initially. Add discovery/search indexes when real queries exist.
- Multiple login methods linked to one Clerk account map to the same row. Two different Clerk accounts are not merged automatically, even if contact details look similar.
- Never identify or join users by email. Email is mutable and is not the application's identity key.

### What stays in Clerk

Do not add password hashes, session tokens, refresh tokens, OAuth credentials, provider IDs, email-verification flags, or MFA secrets to this table.

Do not duplicate email or phone in phase 1: there is no stated application requirement to store them. Retrieve the current account's contact details through Clerk when needed. Any later contact-data storage must define purpose, access rules, and synchronization behavior; it must not be publicly exposed on roommate cards.

### When the record is created

1. A visitor signs up or logs in through Clerk. This alone does not require a Flatter row.
2. When the signed-in user first saves onboarding data, Express verifies the Clerk session and derives `clerkUserId` from that session.
3. The backend creates or finds the row using the unique `clerkUserId`. Repeated or concurrent requests must resolve to the same row, preserving its internal `id` and existing profile values.
4. Save the row and any related onboarding data atomically where needed. A failed database write returns a retriable error; it must not report onboarding as complete.
5. Set `onboardingCompletedAt` only once `housingIntent` and the other agreed required onboarding fields are valid. Do not set it merely because Clerk signup or email verification succeeded.

This is a write-path decision for later implementation. Keep the current `GET /api/me` read-only; do not add hidden database writes to a GET endpoint.

Webhook delivery must not be a prerequisite for onboarding. Clerk webhooks are asynchronous and can arrive late, more than once, or out of order. If we later add identity synchronization, verify signatures and define retry/idempotency behavior before enabling it.

### Ownership and visibility

- Accept identity only from a verified backend session, never from a client-supplied `clerkUserId` or owner ID.
- The backend controls `id`, `clerkUserId`, timestamps, and onboarding completion. Clients cannot mass-update these fields.
- Validate editable names and avatar URLs at the API boundary. Accept only approved HTTPS avatar sources; do not fetch arbitrary submitted URLs on the backend.
- A missing user row means the account has not started application onboarding, not that its Clerk session is invalid.
- A valid Clerk session or completed onboarding alone must not make a user discoverable. Discoverability/consent rules belong to the later profile design.
- Public profile responses should select intended display fields explicitly. Do not expose the Clerk ID or internal onboarding/audit fields to other users.

### Account deletion

Before persistent user data goes live, implement an account-deletion path that removes or anonymizes Flatter data as well as deleting the Clerk identity. Deleting an account in Clerk does not automatically delete its Neon row.

At this stage, with only this table, deletion can remove the row. Once messages, matches, or listings exist, define their retention and foreign-key deletion rules before adding those relationships. Handle deletion initiated through Clerk as well, using a verified deletion webhook or a defined reconciliation process; block access and discovery while cleanup is pending. Do not rely on an unverified webhook or assume delivery is instantaneous.

### Deferred schemas and fields

The current schema now includes the personal, housing and lifestyle onboarding tables requested after the original user-only discussion. The [onboarding plan](./onbaordig.md) is the detailed specification; the Prisma file is the schema source.

Likes, matches, chats, listings, reports, roles, subscriptions, and flexible JSON metadata remain outside this onboarding phase. Do not store a changing `age` value: the confirmed 18+ flow uses a private birth date and derives age. Full room listings are created after onboarding, including for `HAVE_ROOM` users.

### Checks required when implemented

- Repeat/concurrent provisioning for one verified Clerk ID produces one row; different Clerk IDs produce different internal IDs.
- A user cannot update another account or submit protected identity/completion fields.
- Incomplete onboarding leaves `onboardingCompletedAt` null; successful completion uses server-validated data and an atomic save.
- Missing optional avatar/name values work; invalid names and unsafe URLs are rejected.
- Each of the three housing intents can be saved and changed; unknown values are rejected. Unfinished accounts can have null intent, but completing onboarding without an intent or clearing it afterward is rejected.
- Deletion removes application data as designed; incomplete or deleted accounts do not appear in discovery.

## References and decision status

This is a proposed schema for review, not an applied or approved migration. It expands the user-data direction in the [initialization plan](./initialization-plan.md); that plan's original codebase inventory is historical and predates the current Clerk implementation.

Clerk's current [user-data synchronization guidance](https://clerk.com/docs/guides/development/webhooks/syncing), consulted through Context7, explains why social applications may need their own display data and why webhook synchronization is eventually consistent. The fields, housing intents, and lifecycle choices above are Flatter design recommendations, not Clerk requirements.

## Final numbered sequence — user data from signup to deletion

Numbered arrows show data movement. Section saves are successful paths unless an alternative is shown; every mutation verifies the Clerk owner, validates its section, and checks the current revision before commit. No tables are applied by this document.

```mermaid
sequenceDiagram
    autonumber
    actor Person
    participant UI as Onboarding UI
    participant Clerk as Clerk identity
    participant API as Express validators
    participant DB as Neon through Prisma
    Note over Person,DB: Stage A - identity is separate from application data
    Person->>Clerk: Sign up or log in using Google/email
    Clerk-->>UI: Authenticated session
    UI->>API: GET onboarding with session token
    API->>API: Verify token and derive clerkUserId
    API->>DB: Find User by unique clerkUserId and load child rows
    DB-->>API: No row, draft, or completed state
    API-->>UI: Owner-only state and revision
    Note over UI,DB: Complete accounts skip the wizard; an empty GET creates nothing
    opt New or incomplete account continues
        Note over Person,DB: Stage B - populate the four tables
        Person->>UI: Step 1 - choose HAVE_ROOM, TEAM_UP or NEED_ROOM
        UI->>API: PATCH intent with revision
        API->>DB: Create/find unique User; persist housingIntent and revision
        DB-->>API: Committed intent and new revision
        API-->>UI: Saved intent and new revision
        Person->>UI: Step 2 - name, DOB, occupation, optional bio/photo
        opt Person selects or uploads a Clerk photo
            UI->>Clerk: Upload/select own profile image
            Clerk-->>UI: Own image ready or recoverable upload error
        end
        UI->>API: PATCH profile with current revision and photo action
        API->>API: Enforce 18+ and validate profile; derive own Clerk image if requested
        API->>DB: Lock/check User revision; upsert Profile by userId; commit
        DB-->>API: Committed profile and new revision
        API-->>UI: Saved profile; DOB remains private
        Person->>UI: Step 3 - city, localities, rent and timing
        UI->>API: PATCH housing with current revision
        API->>API: Validate intent rules, paise amounts and explicit flexibility
        API->>DB: Lock/check revision; upsert HousingPreference; commit
        Person->>UI: Step 4 - own sleep, cleanliness, food, smoking, pets and guests
        UI->>API: PATCH lifestyle with current revision
        API->>DB: Lock/check revision; upsert own LifestylePreference fields; commit
        Person->>UI: Step 5 - accepted flatmate habits and pet preference
        UI->>API: PATCH flatmate with current revision
        API->>DB: Lock/check revision; update accepted fields in same LifestylePreference row; commit
        Note over UI,DB: Each successful save returns a new revision; reopening loads saved answers
        Person->>UI: Step 6 - review, edit if needed and choose visibility
        UI->>API: POST complete with revision and discoveryEnabled
        API->>DB: Begin transaction; lock/check User revision; read all child rows
        API->>API: Validate all persisted required answers and eligibility
        alt Missing/invalid answers or stale revision
            API->>DB: Roll back; keep existing draft and revision
            API-->>UI: 422 field errors or 409 conflict; no completion
        else All valid
            API->>DB: Set onboardingCompletedAt and discoveryEnabled; commit
            API-->>UI: Return completed state after commit
        end
    end
    Note over Person,DB: Stage C - safe reuse, privacy and lifecycle
    UI->>API: Later authenticated read
    API->>DB: Read only the verified owner's rows
    DB-->>API: Saved state
    API-->>UI: Owner-only result; public DTO separately excludes DOB/Clerk ID
    opt Account deletion initiated through Clerk
        Clerk->>API: Signed deletion event
        API->>API: Verify signature and handle duplicate/late events safely
        API->>DB: Delete User; cascade Profile, HousingPreference and LifestylePreference
        API-->>Clerk: Acknowledge successful cleanup
        Note over API,DB: Retry failures; block visibility during pending cleanup; never resurrect deleted data
    end
```
