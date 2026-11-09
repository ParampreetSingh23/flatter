# Personalized dashboard and My Profile — final implementation plan

Status: documentation only. This task creates a plan, not application features, routes, migrations or infrastructure.

## 1. Release boundary

Build **one common dashboard layout with three intent-based home experiences**, plus a working My Profile feature. The user confirmed that the listing editor remains a separate feature.

| Build in this release | Represent clearly, but do not implement |
| --- | --- |
| Protected dashboard and post-onboarding routing | Candidate/people discovery and compatibility scoring |
| Intent-based heading, action area and information blocks | Room search/feed and room browsing |
| Shared desktop/mobile navigation | Matches, likes, messaging/chat and unread counts |
| Real own-profile view and basic editing | Group creation, membership and group discovery |
| Real saved housing/lifestyle summaries | Listing editor, amenities form, photo uploader and listing management controls |
| Existing listing-status summary and published-listing display within profiles | Intent switching and editing housing/lifestyle preferences after onboarding |
| Privacy-safe viewer profile/read view, so published flats can actually appear on a profile | Notifications, recommendations, analytics and fabricated sample activity |

The distinction matters: the dashboard may explain “Create a listing + meet candidates,” but it must not pretend that either unbuilt workflow is available. My Profile is the working destination in the first release. Existing backend listing support can supply real status/published data without building its editor.

## 2. Current codebase baseline

- Personal onboarding, gender/preferences and the Delhi NCR catalogue are implemented locally. `User.housingIntent` is already `HAVE_ROOM`, `TEAM_UP` or `NEED_ROOM`.
- Completed-user routing still points to `/route` in `frontend/src/app/auth/continue/page.tsx` and two completion paths in the onboarding wizard. No dashboard or My Profile route currently exists.
- Shared Clerk identity, API caller, form controls, database validators/error handling, logo and design tokens exist and should be reused.
- FlatListing/FlatPhoto models and listing/R2 backend modules now exist. `GET /api/listings/mine` returns owner listing status, details/photos and a checklist; `GET /api/listings/:id` has a restricted published-view response. This supersedes the older “not implemented” baseline in the [listing plan](./flat-listing.md), not its product rules.
- Listing amenities are not currently modeled. Do not show an empty amenity list as a confirmed absence of amenities.
- No matches, chat, group or discovery implementation was found. Remote migration deployment, actual R2 configuration and production behavior are not verified by this plan.

## 3. One shared application layout

Routes: `/dashboard` (personalized home), `/dashboard/profile` (own profile/edit), and `/profiles/[publicId]` (safe profile preview/viewer read). All require authentication and completed onboarding. Keep `/route` as the public marketing page.

Use a shared dashboard layout with:

- **Header:** Flatter logo linking to dashboard home, current city and housing-intent label, Clerk account menu and sign-out.
- **Navigation:** Dashboard, My Profile, Matches, Messages and Groups. Only Dashboard and My Profile navigate in this release. Other items visibly say Coming soon, are noninteractive with an accessible explanation, and have no fake badges or dead URLs.
- **Main content:** greeting with saved display name; personalized intent heading/action area; saved housing summary; profile summary; only the relevant listing/status or future-discovery blocks.
- **Mobile:** compact header and accessible navigation drawer containing the same items. Do not invent a separate mobile feature model.

Use `DESIGN.md` as the source: cream main canvas, textured electric-blue brand surface, deep-indigo accents, existing Inter/Geist Mono fallbacks, 0.75rem button radius and generous but form-appropriate spacing. No new design system, UI dependency, dark theme, chart library or animation library. Apply accessible focus, labels, contrast, semantic navigation, touch sizing and reduced-motion behavior.

Use small shared blocks such as DashboardShell, IntentHome, HousingSummary, ProfileSummary, ListingSummary and a reusable Coming soon notice. Select the home variant from the backend-returned intent using a simple typed mapping; do not create three page trees, role systems or dashboard tables.

## 4. Personalized home experiences

| Saved intent | Heading and purpose | Prominent intent area | What is actually usable now |
| --- | --- | --- | --- |
| `HAVE_ROOM` — Need a flatmate | Find the right person for your place | **Create Your Flat Listing** when no listing exists; show photo, rent, location and amenity checklist labels. Secondary block: Meet potential flatmates — Coming soon. | View/edit My Profile; read real listing status if one exists; inspect an existing published flat through the profile. Creation remains unavailable until the separate editor ships. |
| `TEAM_UP` — Find a flat together | Find your people, then your place | Discover compatible people and Create a group, both visibly Coming soon. Show saved preferred city/localities and rent range as context. | View/edit My Profile and inspect its saved preference summaries. No group request, candidate API or synthetic people feed. |
| `NEED_ROOM` — Need a room | Find a room and people you can live with | Browse available rooms and Meet flatmates, both visibly Coming soon. Show saved location, rent and move-in preferences. | View/edit My Profile. No room inventory API, search filters or fake room cards. |

Include an active **View My Profile** action for every intent, so each home has a working next step while future features are unavailable. Do not use a generic empty page for two of the three intents; their headings, explanations and saved housing context should reflect their actual goal.

### Flat-owner action by real listing state

| State | Heading/action presentation | Behavior in the first dashboard release |
| --- | --- | --- |
| None | **Create Your Flat Listing** | Prominent callout with “Listing editor coming soon”; explain photos, rent, location and amenities. No click may create a draft or link to a missing editor. |
| Draft | **Complete Your Flat Listing** | Show real missing-items/photo status; editor action clearly unavailable. Draft remains owner-only and never blocks dashboard/profile access. |
| Published | **Your Flat Listing Is Live** | Show real cover or neutral image fallback, title, rent, locality and a View on My Profile link. No publish/edit control is invented. |
| Paused | **Your Flat Listing Is Paused** | Show owner-only status and saved summary; republish/edit controls remain part of the separate listing feature. |
| Closed | **Your Flat Listing Is Closed** | Show owner-only status. Reopen belongs to the separate listing feature. |
| Listing status failed to load | **We couldn't load your listing** | Retry this block; do not render “no listing” or offer creation based on an error. Other dashboard/profile content remains usable. |

When the editor is implemented later, enable the corresponding action only when its real protected route is available. Reuse the existing listing API and the [listing plan](./flat-listing.md); do not duplicate uploads or publishing rules inside dashboard components. Opening a dashboard/profile GET never creates or modifies a listing.

### Amenities handoff to the separate listing feature

The future editor must cover photos, rent, supported city/locality and structured amenities. Proposed initial amenity choices: Wi-Fi, air conditioning, washing machine, refrigerator, equipped kitchen, power backup, lift, parking and security. Store explicitly selected canonical values on FlatListing when that editor is built; no amenities migration is part of the dashboard release. Until then omit amenity chips or say “Amenities not provided,” never “No amenities.” Other flat requirements and R2 photo rules stay in the existing listing plan.

## 5. My Profile — working feature now

### Own-profile view

Show personal summary (avatar/initials, name, derived age, occupation, optional bio and chosen gender), housing intent, saved city/localities/budget/move-in preference, own lifestyle habits, accepted flatmate preferences and profile-discovery visibility. Keep own preferences clearly distinct from personal habits. Render existing canonical labels; do not show raw enum values or ambiguous sector numbers.

Add a **My Flat Listing** section only when relevant. Owners may see private Draft/Paused/Closed status cards here. An existing Published listing appears as a real read-only listing card, with cover, title, monthly per-person rent, locality/city, availability and available setup details. An expandable read-only detail panel can reuse the existing published listing response without inventing a separate room-browser feature. Do not fetch/sanitize/upload photos from this component.

Show a status explanation, not a fake completion percentage. Personal onboarding remains complete even when the listing is absent or lacks photos. A historical saved move-in date being in the past must not send an otherwise completed user back through onboarding.

### Edits included in this release

| Field/action | Rule |
| --- | --- |
| Display name | Trimmed 1–80 characters; application-owned name, not a mandatory legal name. |
| Occupation | Existing allowed values. |
| Gender | Existing allowed values, including Prefer not to say. Do not reset a valid answer to a default. |
| Bio | Optional plain text, max 500 characters; whitespace-only becomes null. |
| Personal avatar | Keep / use current Clerk image / clear; support existing Clerk photo upload and initials fallback. Derive the saved URL from the caller's Clerk identity, not an arbitrary submitted URL. Personal avatar stays separate from R2 flat photos. |
| Profile-discovery visibility | Explicit toggle using existing `User.discoveryEnabled`. Saving false removes future people-discovery eligibility; never silently pause an independently published flat solely because profile discovery is off. |
| Account/security settings | Use Clerk's existing Manage account UI for email, linked Google account, password/security and sign-out. Do not treat Clerk's account editor as Flatter's My Profile editor. |

Age is derived from the existing private DOB. DOB changes, housing-intent changes, and editing housing/lifestyle/accepted preferences are outside this first profile-edit release; show the saved values without a broken Edit action. Do not reuse completed onboarding PATCH routes: they intentionally reject writes after completion. Use a small separate profile PATCH that preserves completion, preferences, listing state and identity fields.

Save/Cancel with visible pending/saved/errors, stable form values on failure and a leave-page prompt for unsaved changes. A failed Clerk-image request must not be reported as a successful photo save. Explain that a changed Clerk image is copied to Flatter only on an explicit profile save; identity provider changes do not overwrite the Flatter profile automatically.

## 6. Profile seen by potential flatmates

Include a minimal read-only viewer profile as part of My Profile, not a discovery feed. Owners can open **Preview Profile**; another completed, signed-in user can open its direct link. No message, like, match or group controls function in this release.

| Viewer/visibility state | Allowed response |
| --- | --- |
| Owner | Private My Profile is available. Preview uses the same safe DTO as other viewers, with an owner-only note if it would be hidden. |
| Nonowner; owner opted into profile discovery | Safe profile fields: public name/avatar, derived age, occupation, optional bio, intent, city, and self-reported lifestyle habits. Gender is omitted when Prefer not to say. Do not expose accepted flatmate filters or exact preferred-locality/budget arrays by default. Add the flat card only if Published and owner remains eligible. |
| Nonowner; discovery off, but owner has an eligible Published flat | Minimal publisher profile: name/avatar and the Published flat only. Publishing is the explicit consent for this minimal identity/listing view, as specified in the listing plan. Hide the rest of the personal profile. |
| Nonowner; discovery off and no eligible Published flat | 404, including private Draft/Paused/Closed flat data. |
| Viewer unauthenticated or not onboarded | Require sign-in/onboarding before serving profile/listing data; direct API calls receive 401/403 rather than relying on navigation. |

DOB, email, phone, Clerk user ID, internal owner foreign keys, onboarding data, accepted preferences, photo staging keys and private listing metadata never enter viewer DTOs. Use explicit field selection; never serialize the owner onboarding response and hide it with CSS.

Profile visitors may see only the current Published listing and Ready photos. Use the existing listing eligibility checks and short-lived R2 read mechanism. Pause/Close removes it from subsequent profile responses and stops issuing new links; previously issued photo links may remain usable until expiry. R2 failure yields a neutral image and retry state, not disclosure of storage keys or an entirely broken profile.

No people-search page is required for this: a protected direct-link profile and a read-only listing section satisfy the viewing requirement without implementing matching or discovery.

## 7. Data/API changes proposed for implementation

No new Dashboard, Match, Message or Group table. Reuse the existing User/Profile/HousingPreference/LifestylePreference/FlatListing/FlatPhoto records. Add only two proposed Profile fields when implementing: **`publicId`** (unique random UUID, stable public profile reference) and **`version`** (integer default 0 for safe completed-profile edits). Backfill existing profiles with unique references; do not expose Clerk IDs or owner foreign keys in profile URLs. This plan does not modify the Prisma file or any applied migration.

| API | Contract/purpose |
| --- | --- |
| `GET /api/dashboard` | Authenticated, completed owner only. Return saved intent, small self-profile summary, housing context, visibility, read-only listing state/checklist summary and feature availability. Read-only; do not create drafts or request all photo URLs. |
| `GET /api/profile/me` | Owner-only profile editor values, saved housing/lifestyle summaries, public reference, profile version and minimal own listing summary. Full listing/photo details load only when needed. |
| `PATCH /api/profile/me` | `{ version, displayName?, occupation?, gender?, bio?, photoAction?, discoveryEnabled? }`, strict allowlist. Validate the merged profile, derive Clerk photo outside the DB transaction, conditionally increment profile version and commit approved values atomically. No owner IDs, intent, DOB, completion timestamps or listing writes accepted. |
| `GET /api/profiles/:publicId` | Authenticated completed viewer; apply the visibility matrix, safe fields and Published-listing predicate. Owner preview receives the same safe presentation. |
| Existing listing reads | Reuse eligibility/DTO building logic for real Published flat details; do not call create/publish/upload routes from dashboard/profile loads. |

Use current JSON error conventions: 401 unauthenticated; 403 incomplete onboarding; 404 unavailable/nonvisible profile; 409 stale profile version; 422 field validation; 503 transient service failure. Server derives identity exclusively from verified Clerk auth. Reads are no-store. Do not introduce a global profile cache that can leak across sessions.

Profile mutation conflicts preserve local edits and offer Reload saved profile. Never reset `onboardingCompletedAt` or require fresh flat photos for a basic profile edit. Updating the owner name/avatar will be reflected in the minimal listing publisher identity on the next read; it must not rewrite flat details or automatically republish a paused flat.

Feature availability can be one small typed constant/configuration shared by the dashboard response and rendering; no admin feature-flag service or new configuration database. Unimplemented matches/messages/groups have **unavailable** status, not fabricated zeros. Do not request their nonexistent APIs.

Dashboard summary queries should select listing metadata without calling the current full owner-photo DTO for every render. Optional photo/R2 work is isolated to the visible listing/profile section so a photo problem cannot block navigation or personal profile edits.

## 8. Routing, failure states and accessibility

1. Replace successful onboarding destination with `/dashboard` in the submit path and already-completed-user effect. Update `/auth/continue` to send complete users there and incomplete users to the earliest incomplete step.
2. Protect `/dashboard(.*)` and `/profiles(.*)` alongside existing auth routes. Enforce auth/completion in protected page reads and every new backend resource; proxy redirects alone do not authorize access.
3. Preserve `/route` and the `/` marketing redirect. The dashboard logo returns to `/dashboard`; marketing links remain marketing links.
4. Keep request-dependent session/profile reads under Suspense because Cache Components are enabled. Prefer server-rendered initial data and focused client forms; reuse the existing `api` helper and form/error patterns.
5. Distinguish initial loading, true missing profile, incomplete account, service outage, listing unavailable, photo unavailable, edit conflict, expired session, save failure and nonvisible viewer profile. Never infer `HAVE_ROOM` or “no listing” from an API error.
6. Incomplete users resume onboarding. Completed users with missing/corrupt required profile data receive a recovery message, not a blank dashboard or silent deletion/reinitialization.
7. Test desktop/sidebar, mobile drawer, 200% zoom, keyboard focus, screen-reader labels, active navigation and noninteractive Coming soon semantics. Avoid multiple nested full-page shells and focus loss after successful saves.

## 9. Implementation order and file scope

1. **Contracts and profile foundation:** define private/public DTOs and the visibility matrix; add the two Profile fields with a reviewed migration/backfill; reuse existing validators and owner authentication.
2. **Read APIs:** dashboard summary, own profile and viewer profile. Reuse listing queries/policies; test private states and R2-failure isolation before rendering them.
3. **Shared dashboard:** one shell/navigation; three typed intent variants; real saved context; read-only listing state; truthful Coming soon blocks. No missing feature routes.
4. **My Profile:** basic editor, avatar/visibility behavior, concurrency conflict handling, own summaries, safe preview/viewer page and Published flat card/details.
5. **Entry points:** update continuation, both wizard completion paths and protected route matchers; refresh relevant dashboard/profile data after a successful profile save.
6. **Verification:** checks below plus frontend lint/types/production build and backend types/integration tests appropriate to the new APIs. Use development data/storage only; inspect real migration state before applying changes.

Future files: shared dashboard layout and home/profile routes; viewer profile route; focused dashboard/profile components; typed DTOs using the current API helper; profile/dashboard backend modules mounted in `app.ts`; shared safe profile/listing selectors; Prisma schema and a new migration for the two fields; continuation/wizard/proxy callers; focused checks. Add no chat SDK, WebSocket server, notification service, group schema, discovery engine or dashboard-specific storage.

## 10. Acceptance checklist

- Each of the three saved intents renders the correct home copy/context from one layout; clients cannot change identity/intent by query parameter. Missing intent on a completed account is a recovery error.
- Dashboard and My Profile work after onboarding with no listing and no flat photos, including when R2 is unavailable. Reload/login does not restart onboarding.
- `HAVE_ROOM` prominently shows **Create Your Flat Listing** for no listing and the correct real state thereafter. The editor is visibly unavailable in this release; no draft is created by a read.
- Matches/Messages/Groups and intent-specific future actions are marked Coming soon with no fake users, rooms, activity, scores or counters, no dead links and no background requests to unbuilt services.
- Own-profile basic edits persist with version checks; invalid/mass-assigned fields fail; stale tabs cannot overwrite; completion/housing/lifestyle/listing data remain unchanged.
- Viewer profiles enforce every visibility-matrix case. A Published flat appears; Draft/Paused/Closed data, private photos, DOB, Clerk IDs and accepted-preference arrays do not leak.
- Visibility changes refresh subsequent reads. Published listing remains separately viewable with minimal publisher identity when personal discovery is off; paused/closed listings disappear from that view.
- Missing or expired photo links degrade locally. No protected data is shared through a page/image cache or exposed to another signed-in session.
- A permitted, existing listing card renders real rent/location/setup; unsupported amenities are omitted/not provided rather than invented. Future editor/amenity work has no dependency on dashboard completion.
- All existing public landing, onboarding, listing API and health behavior remains intact. Code changes and actual migrations are a later implementation task, not part of this document.

## 11. References and scope status

Related feature contracts: [onboarding](./onbaordig.md), [flat listings and R2](./flat-listing.md), [Delhi NCR catalogue](./locations.md), [database overview](./databse.md), and `DESIGN.md`.

Clerk's current [UserButton documentation](https://clerk.com/docs/reference/components/user/user-button), consulted through Context7, confirms that Manage account handles Clerk account management; application My Profile remains our database-backed UI. Installed Next.js documentation on authentication with Cache Components was checked for the existing Suspense requirement.

Only `docs/dashboard.md` is created by this planning task. No feature is implemented, no code/schema is edited and no migration/resource is provisioned. Minimum required migration and API work are future implementation scope. The user explicitly confirmed **dashboard + My Profile now; listing editor separately**; this takes precedence over any older plan wording implying the editor launches with the dashboard.

## 12. Final numbered sequence — one dashboard, three experiences and My Profile

```mermaid
sequenceDiagram
    autonumber
    actor Person
    participant UI as Next.js common dashboard
    participant Clerk as Clerk identity/account UI
    participant API as Express dashboard/profile API
    participant DB as Neon through Prisma
    participant R2 as Existing private flat-photo storage
    Note over Person,R2: Stage 1 - authenticated entry and completion check
    Person->>Clerk: Sign in using Google/email or finish an existing session flow
    Clerk-->>UI: Session available
    UI->>API: GET dashboard with verified session bearer token
    API->>DB: Read caller's completion, intent, profile, housing and listing summary
    alt Unauthenticated or incomplete onboarding
        API-->>UI: 401 or 403
        UI-->>Person: Sign in or resume earliest incomplete onboarding step
    else Required data unavailable or corrupt
        API-->>UI: Error, not guessed intent or empty listing
        UI-->>Person: Retry or recovery message
    else Completed account
        API-->>UI: Saved intent/context, profile and actual listing state
        UI-->>Person: One common header/navigation/dashboard layout
        Note over Person,DB: Stage 2 - personalize content, not separate applications
        alt HAVE_ROOM
            UI-->>Person: Create Your Flat Listing, or real existing listing-state callout
            Note over Person,UI: Listing editor unavailable; candidate discovery Coming soon
        else TEAM_UP
            UI-->>Person: Find a flat together with saved housing context
            Note over Person,UI: Discover people and create groups Coming soon
        else NEED_ROOM
            UI-->>Person: Find a room with saved budget, location and timing
            Note over Person,UI: Browse rooms and meet flatmates Coming soon
        end
        UI-->>Person: Working View My Profile action for every intent
        Note over Person,UI: Matches, Messages and Groups are noninteractive Coming soon navigation
        Note over Person,R2: Stage 3 - working private My Profile
        Person->>UI: Open My Profile
        UI->>API: GET own profile with bearer token
        API->>DB: Select owner profile, saved preferences and listing summary
        API-->>UI: Owner-only editor data, public reference and profile version
        UI-->>Person: Profile, saved summaries, visibility and relevant flat status
        opt Person edits basic profile or discovery visibility
            Person->>UI: Change allowed fields and Save
            opt Person chooses a new personal avatar
                UI->>Clerk: Upload/select own account image
                Clerk-->>UI: Image result or recoverable error
            end
            UI->>API: PATCH own profile with version and allowed fields
            API->>API: Verify owner, validate merged profile and resolve own Clerk image if selected
            API->>DB: Transaction checks profile version and saves approved values atomically
            alt Stale version or invalid fields
                API-->>UI: 409 conflict or 422 field errors
                UI-->>Person: Keep local edits; reload/correct before retrying
            else Save succeeds
                API-->>UI: Updated profile and version
                UI-->>Person: Saved; refresh profile/dashboard presentation
            end
            Note over API,DB: No reset of onboarding, change of intent/preferences or listing mutation
        end
        opt Person opens Manage account
            UI->>Clerk: Existing account/security UI
            Clerk-->>Person: Email, linked-account, security and sign-out controls
        end
        Note over Person,R2: Stage 4 - privacy-safe profile preview or potential-flatmate direct-link view
        Person->>UI: Open profile by public reference
        UI->>API: GET viewer profile with authenticated completed session
        API->>DB: Read visibility and eligible Published listing using safe field selection
        alt Owner preview
            API-->>UI: Safe preview DTO and owner-only visibility note
        else Personal discovery enabled
            API-->>UI: Safe personal profile and eligible Published flat, if any
        else Discovery off but eligible Published flat exists
            API-->>UI: Minimal publisher name/avatar and Published flat only
        else Neither form of visibility allowed
            API-->>UI: 404, no private profile or listing data
        end
        opt Allowed Published flat is included
            API-->>UI: Read-only rent/location/setup and allowed short-lived photo links
            UI->>R2: Load Ready published photos
            alt Photo unavailable or expired
                UI-->>Person: Neutral image and retry; profile remains usable
            else Photo loads
                UI-->>Person: Published flat shown within profile
            end
        end
        Note over API,R2: Draft, Paused and Closed flats never enter nonowner responses
    end
    Note over Person,R2: Stage 5 - separate later feature releases
    Note over Person,UI: Enable listing-editor actions only when real routes ship; no editor/uploads built now
    Note over Person,UI: Discovery, matches, messages/chats and groups remain separate features
```
