# Flatter initialization plan

Status: proposed, documentation only. Prepared 9 November 2026.

No application implementation, dependency installation, account setup, database migration, or deployment is authorized by this planning task. All file paths and API contracts below describe future work.

## Outcome and scope

Build the smallest working foundation for Flatter: an Express health endpoint in `backend/`, a public landing page at literal `/route`, an original Flatter navbar logo, and working Clerk login/signup on both frontend and backend. Keep the existing TypeScript, Next.js, Express, Tailwind, Clerk, Neon, and Prisma stack.

Proposed route decision: `/route` is the canonical landing URL; `/` redirects to `/route` so visitors do not see the starter screen. Authentication uses Clerk modals and returns to `/route`; no dashboard or onboarding screen is invented for this slice.

See [architecture and sequence diagrams](./architecture.md) and the [visual overview](./architecture.html).

## What exists today

| Area | Observed state | Consequence |
| --- | --- | --- |
| Project guidance | Root `AGENTS.md`, `frontend/AGENTS.md`, `DESIGN.md` | Follow the actual uppercase design filename; it is the design source of truth. |
| Frontend | Next.js 16.4.5, React 19.3.0, TypeScript, Tailwind 4 | Reuse the scaffold and installed tooling; verify Clerk peer compatibility before installation. |
| Frontend implementation | Starter `src/app/page.tsx`, shared layout, global CSS, starter SVGs/favicon | Replace starter branding and content; no product screens exist to integrate. |
| Next configuration | Cache Components and partial prefetching enabled; Tailwind Turbopack loader configured | Preserve configuration; session reads need appropriate Suspense boundaries. |
| Backend | Express 5, CORS, dotenv, tsx, TypeScript installed | No source files or runnable server scripts yet. |
| Backend configuration | CommonJS package, NodeNext modules, verbatim module syntax, empty types list | Align module format/imports and enable Node types before compiling the server. |
| Authentication/data | No Clerk SDK, Prisma schema/client, or app database code | Clerk setup is new; data storage can wait until onboarding. |
| Tooling | Separate npm lockfiles and installed dependencies | Keep separate package workflows; no monorepo framework or extra package manager needed. |
| Version control | `.git` exists only inside `frontend/` | Backend and root docs are outside that repository; resolve repository coverage before committing implementation. Do not silently initialize or move repositories. |
| Checks | Frontend lint/build scripts; backend test script is a failing placeholder | Add real backend scripts and a small meaningful check during implementation. No existing product tests or fixtures were found. |

Read all project-owned source/configuration and available project docs, plus the installed Next.js routing, proxy, and authentication-with-Cache-Components guides. This is a static inspection, not a runtime health assessment.

## Architecture decisions

1. Next.js owns rendering, landing content, branding, and Clerk UI. Express owns the application API and validates authentication independently.
2. Clerk owns credentials, identity verification, sessions, and account management. No custom password/session system.
3. Browser-to-Express authenticated requests use Clerk session bearer tokens. The backend derives identity from the verified token; it never trusts a submitted user ID.
4. `GET /health` is public process liveness and has no Clerk or database network dependency. It does not claim database readiness.
5. Add `GET /api/me` as the smallest protected endpoint proving frontend/backend Clerk integration. It returns only the current verified Clerk user ID and does not create a database row. This is a technical acceptance surface, not a new product page.
6. Neon and Prisma remain the planned application-data layer, activated when onboarding/profile persistence begins. No database is required to render the landing page, authenticate, or answer these two endpoints.

### Do we need a users table?

**For this slice: no. For Flatter's roommate product: yes, application-owned user/profile data is needed.** Clerk handles login but is not the storage layer for lifestyle preferences, budgets, cities, discoverability, matches, chats, or listings.

When onboarding starts, introduce an application `User` with an internal primary key, a unique non-null `clerkUserId`, and creation/update timestamps. Keep the Clerk ID as text, not a database foreign key into Clerk. Add a one-to-one `Profile` only when actual onboarding fields are defined. Store only the display/contact fields that the product needs; do not duplicate passwords, sessions, or all Clerk attributes. Never use email as the identity join key.

Create/upsert the app user from the verified backend identity when saving onboarding, using the unique Clerk ID to handle concurrent/repeated requests. This makes onboarding independent of webhook timing. Other users' public profile information will come from Flatter's database rather than per-card calls to Clerk.

Before profile data ships, define account deletion, discovery visibility, and ownership rules. If Clerk dashboard edits/deletions must synchronize, add verified, idempotent webhooks with duplicate/out-of-order handling and a reconciliation policy in that phase. Webhooks must not gate successful signup. None of this data lifecycle is implemented in the initial landing/auth slice.

## Landing page and logo brief

Adapt the design language in `DESIGN.md` to Flatter; do not copy Arc branding, browser messaging, download controls, or testimonials.

| Element | Planned treatment |
| --- | --- |
| Navbar | Original mark plus Flatter wordmark on left; in-page “How it works” and “Why Flatter” links; Login and Sign up on right. Signed-in users see account/sign-out controls. Logo links to `/route`. |
| Logo | Create an original vector concept: two offset lowercase-f-inspired forms sharing a roof/doorway in the negative space, expressing two people making one home. Simple readable silhouette, electric-blue and white versions, reusable SVG and matching favicon. No stock icon or logo dependency. Original artwork is achievable; trademark uniqueness requires a separate clearance check. |
| Hero | Textured `#3B3BFF` full-width field; white heavy headline “Find your people. Then your place.” One supporting paragraph for students and professionals in India. Main CTA opens Clerk signup; secondary CTA scrolls to how it works. |
| Explanation | Smooth `#FFFEF0` band with three steps: share your lifestyle, meet compatible people, find a place together. Benefit statements use the design's expressive quote-like typography without pretending to be customer testimonials. |
| Closing CTA/footer | Wavy divider, textured blue CTA, compact Flatter footer with working section links. No invented success counts, user reviews, safety guarantees, or unavailable product links. |
| Typography | Preserve heavy display / clean sans / monospace label roles and specified sizes. Use the named Marlin/Favorit families only with supplied licensed assets. Otherwise document the fallback choice for review; do not fetch or claim those fonts are licensed. Use Inter for body as specified. |
| Spacing/components | Approximate 75rem content maximum, 6rem section spacing, 1.5rem related-element gaps; buttons use 0.75rem radius and 0.75rem × 1.5rem padding. Retain restrained palette, subtle grain, and scalloped transitions. |
| Responsive/accessibility | Headline scales from 4rem to about 2.5rem; stack CTAs and columns on mobile. Keep login/signup accessible at narrow widths; collapse optional section links first. Semantic landmarks, skip link, keyboard focus, labelled logo, decorative SVG hidden from assistive tech, reduced-motion support, contrast and zoom checks. |

No profile matching UI, property listings, chat, groups, analytics, or motion library in this slice.

## Clerk integration and API contracts

### Frontend

- Add compatible `@clerk/nextjs`; configure the same Clerk application/environment as the API.
- Put `ClerkProvider` inside `<body>` in the root layout. Use `src/proxy.ts` with `clerkMiddleware()` for Next.js 16; keep `/route` public and exclude static assets appropriately.
- Use Clerk's prebuilt `SignInButton` and `SignUpButton` in modal mode, styled to match the navbar. Use current SDK auth-state controls (`Show` in the current docs) and `UserButton` for the signed-in state.
- Keep request-dependent auth UI within Suspense, with a stable-size neutral loading fallback; do not cache personalized navbar content across users. Keep the rest of the landing page statically renderable.
- Use `getToken()` for the cross-origin API acceptance call. Handle a missing token and HTTP errors; do not persist tokens manually or log them. No need for a generic fetch framework for one call.

### Backend

- Split the Express app from the listening server so a small check can exercise routes without importing startup side effects.
- Load and validate required configuration at startup; invalid Clerk configuration should fail clearly rather than leave a misleading partially configured API.
- Register public `/health` before auth middleware. Configure exact frontend-origin CORS and preflight handling before protected routes; allow the Authorization header. CORS does not substitute for authentication.
- Add compatible `@clerk/express`, use `clerkMiddleware()` on protected API routes, accept session tokens, and return JSON `401` when verified authentication is absent/invalid. Validate allowed frontend origins/authorized parties using supported SDK options. No HTML login redirects from JSON endpoints.
- Register a JSON 404 and final JSON error handler; avoid leaking stack traces or secrets. Handle startup/listen failures and close the HTTP server on termination.

| Method/path | Auth | Success | Failure behavior |
| --- | --- | --- | --- |
| `GET /health` | Public | `200`, JSON `{ "status": "ok", "service": "flatter-backend" }` | If process is unavailable the request fails; no fabricated DB/Clerk status. Send `Cache-Control: no-store`. |
| `GET /api/me` | Valid Clerk session bearer token | `200`, JSON `{ "clerkUserId": "user_…" }` | `401` JSON `{ "error": "Unauthorized" }` for absent/invalid/expired token. `Cache-Control: no-store`. |
| Unknown API path | As applicable | — | `404` JSON; unexpected server failures produce safe `500` JSON. |

### Required configuration (future setup, no secret values)

| Location | Variable | Purpose |
| --- | --- | --- |
| `frontend/.env.local` | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Browser-safe Clerk publishable key. |
| `frontend/.env.local` | `CLERK_SECRET_KEY` | Server-only Next.js Clerk key; never public-prefixed. |
| `frontend/.env.local` | `NEXT_PUBLIC_API_URL` | Express origin, proposed `http://localhost:4000`. |
| `backend/.env` | `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Same Clerk instance as frontend; backend-only configuration. |
| `backend/.env` | `FRONTEND_ORIGIN` | Proposed `http://localhost:3000`; CORS and authorized-party allowlist. |
| `backend/.env` | `PORT` | Proposed `4000`; validate numeric port range. |
| Backend, later data phase | `DATABASE_URL` | Neon connection used by Prisma; keep server-only. Choose migration/runtime connection configuration when pinning Prisma. |

Use a supported Node LTS satisfying the actual installed package engine requirements and both SDKs. Retain npm lockfiles and verify package compatibility before adding dependencies. Clerk account access, development keys, enabled sign-in methods, and allowed development/production domains are setup prerequisites. Production needs production Clerk keys, HTTPS origins, and restricted redirect destinations. No secrets are needed to review this plan.

## Ordered implementation plan

1. **Verify the baseline:** confirm supported Node/npm, actual package versions and SDK peer ranges, run existing frontend checks, and resolve root/backend repository coverage. Add appropriate ignore rules and placeholder environment examples; allowlist `.env.example` because the frontend currently ignores `.env*`.
2. **Initialize Express:** reconcile package module format with TypeScript, enable Node types, add app/server entry points and dev/build/start/typecheck/test scripts. Add health route and safe fallback/error handling. Verify public liveness first.
3. **Wire Clerk end to end:** configure one Clerk development instance, add frontend/provider/proxy/auth controls and backend middleware. Add `/api/me`; verify signed-in browser-to-API calls and rejected unauthenticated requests.
4. **Build the landing page:** create original SVG/logo/favicon, map design tokens, add `/route`, replace starter home with redirect, implement navbar, hero, how-it-works/benefits, closing CTA and footer. Keep components small and split only genuinely reused or stateful parts.
5. **Validate and document setup:** run checks below, document local commands and configuration, and record remaining production setup needs. Only then is the first slice complete.

Neon project provisioning, Prisma packages/schema/migrations, and profile persistence belong to the next onboarding phase; no empty database setup is needed for the stated initial output.

## Files the implementation must reach

| File/area | Planned change and affected callers |
| --- | --- |
| `frontend/package.json`, lockfile | Clerk dependency; preserve existing scripts/configuration. |
| `frontend/src/app/layout.tsx` | Clerk provider, Flatter metadata, typefaces; affects all pages. |
| `frontend/src/proxy.ts` | New Clerk request handling; keep landing/assets public. |
| `frontend/src/app/page.tsx` | Starter screen replaced by redirect to `/route`. |
| `frontend/src/app/route/page.tsx` | New landing page and section anchor targets. |
| `frontend/src/components/` | Small logo/navbar/auth-control components as needed by landing/layout. |
| `frontend/src/app/globals.css` | Design tokens, typography, grain/dividers/focus treatment; replaces starter dark-mode behavior consistently with the guide. |
| `frontend/public/`, favicon | Original brand assets; remove unused starter SVGs only after checking references. |
| `backend/src/app.ts`, `server.ts` | New testable app and server startup; no service/repository layers for two routes. |
| `backend/package.json`, lockfile, `tsconfig.json` | Clerk dependency, module alignment, usable scripts and Node types. |
| Environment examples/ignore rules | Placeholder-only examples, ignore secrets/build output/dependencies on both sides. |
| Backend small test/check | Health contract and protected-route rejection; no new test framework unless existing tools cannot cover this. |
| READMEs/docs | Local setup, endpoint contracts, auth flow and acceptance instructions. |

No existing domain callers, fixtures, barrel exports, migrations, or product tests were found. Before implementation edits, recheck references to touched shared components/configuration and any files added since this inspection.

## Acceptance checks

- Frontend lint, TypeScript check and production build pass with valid development configuration; backend typecheck, compile and small route check pass. Start the compiled backend as well as the development server.
- A health request succeeds without credentials or external services; assert exact status, JSON shape and content type. Verify it stays public with an irrelevant malformed auth header. This is process liveness only.
- `/api/me` returns JSON 401 without a token and for invalid/expired tokens; a real signed-in Clerk session returns its verified ID. A submitted user ID cannot override identity. Test allowed-origin preflight; never treat CORS as an access-control test.
- Login, signup, cancellation, session reload, and sign-out work in a real browser. Navbar transitions without exposing another user's state. Signup returns to `/route` without waiting on a database/webhook.
- `/route` is public; `/` redirects to it; logo and section links work; no starter branding or broken placeholder links remain.
- Inspect 360px, tablet, desktop and 200% zoom; keyboard navigation, modal focus return, visible focus, contrast, reduced motion, and no horizontal overflow. Check logo readability at navbar/favicon sizes.
- Confirm no secret/DB URL/token enters client bundles, logs, or tracked files. Record which checks need actual credentials and which were automated.

## Documentation references

Current Clerk documentation was consulted through Context7; exact installation versions will be pinned and checked at implementation time.

- [Clerk Next.js quickstart](https://clerk.com/docs/nextjs/getting-started/quickstart): provider, proxy and auth controls.
- [Clerk rendering modes](https://clerk.com/docs/guides/development/rendering-modes): Cache Components and Suspense.
- [Clerk Express quickstart](https://clerk.com/docs/expressjs/getting-started/quickstart): backend integration reference to recheck before coding.
- [Clerk authenticated requests](https://clerk.com/docs/guides/development/making-requests): bearer tokens across origins.
- [Clerk data synchronization](https://clerk.com/docs/guides/development/webhooks/syncing): database duplication tradeoffs and eventual consistency.
- [Express 5 FAQ](https://expressjs.com/en/5x/starter/faq/): error handling; Context7's versioned Express result was history-heavy, so its official website result was also checked.
- Installed Next.js guides: `frontend/node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md`, `01-app/03-api-reference/03-file-conventions/proxy.md`, and `01-app/02-guides/authentication-with-cache-components.md`.

## Review limits

No dependencies installed, environment files created, code modified, migrations applied, or services started. Runtime/SDK compatibility and font licensing remain implementation prerequisites. The proposed logo is a design brief, not a produced or legally cleared asset.

## Final numbered sequence — landing, authentication and health

Read top to bottom. Numbered arrows show request order; labelled branches show alternatives. This is the original initialization scope; the later onboarding extension is summarized at the end of the architecture and onboarding documents.

```mermaid
sequenceDiagram
    autonumber
    actor Person
    participant UI as Next.js landing
    participant Clerk as Clerk authentication
    participant API as Express backend
    Note over Person,API: Stage A - public entry and original branding
    Person->>UI: Open the public landing at /route
    UI-->>Person: Show Flatter logo, hero, benefits and footer
    UI-->>Person: Show Login and Sign up after auth state loads
    Person->>UI: Use logo or section links
    UI-->>Person: Return to landing or scroll to the chosen section
    Note over Person,Clerk: Stage B - login or signup
    Person->>UI: Select Login or Sign up
    UI->>Clerk: Open the corresponding prebuilt modal
    alt Cancelled or unsuccessful authentication
        Clerk-->>UI: No active session
        UI-->>Person: Keep landing accessible and allow retry
    else Authentication succeeds
        Clerk-->>UI: Establish authenticated session
        UI-->>Person: Show account and sign-out controls
        Note over UI,API: Stage C - prove backend authentication independently
        UI->>Clerk: Request current session token
        Clerk-->>UI: Return session token
        UI->>API: GET /api/me with Authorization Bearer token
        API->>API: Verify token and authorized frontend origin
        alt Missing, invalid or expired token
            API-->>UI: 401 JSON Unauthorized
            UI-->>Person: Offer login or retry
        else Valid token
            API-->>UI: 200 JSON with verified clerkUserId
            Note over UI,API: No application user row is created by this GET
        end
        Person->>UI: Choose Sign out
        UI->>Clerk: End the session
        Clerk-->>UI: Signed-out state
        UI-->>Person: Restore Login and Sign up
    end
    Note over Person,API: Stage D - health probe is independent of authentication
    Person->>API: GET /health without credentials
    API-->>Person: 200 JSON status ok and service flatter-backend
    Note over API: Public route runs before Clerk middleware; no DB or Clerk network call
    Note over Person,API: Later onboarding changes the successful-auth destination; see onbaordig.md
```
