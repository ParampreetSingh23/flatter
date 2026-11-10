# Deployment notes (API + realtime)

Flatter's backend is **one always-running Express process**: REST, Clerk-verified auth, the cleanup timer and Socket.IO chat all share one HTTP server (`backend/src/server.ts`). This is a deliberate launch limit.

## Run exactly one instance

Socket rooms, per-user socket caps, send/typing/receipt rate limits and typing state live in process memory. Do not scale to several replicas or serverless functions until a shared Socket.IO adapter and shared limit/revocation state are added ([multiple nodes](https://socket.io/docs/v4/using-multiple-nodes)). A restart only loses transient typing; messages are in PostgreSQL and clients reconnect and catch up from the database.

## Container and proxy

- Platform: a long-lived container or VM (not request-scoped serverless). Health check: `GET /health` (independent of Clerk and the database).
- The reverse proxy must forward WebSocket upgrades on `/socket.io/` and allow long-polling fallback ([reverse proxy guide](https://socket.io/docs/v4/reverse-proxy)). Set the idle timeout above 45 s (Socket.IO ping interval 25 s plus timeout 20 s).
- On `SIGTERM` the server drains: it disconnects sockets (browsers reconnect) and closes the HTTP server, force-exiting after 10 s. Give the platform at least a 15 s stop grace period.
- Terminate TLS at the proxy so the browser uses HTTPS and WSS. Chat is private server-side storage, **not end-to-end encrypted**.

## Environment

| Variable | Where | Notes |
| --- | --- | --- |
| `FRONTEND_ORIGIN` | backend | Exact site origin. Used for CORS and as the **only** accepted `Origin` at the Socket.IO handshake and as the Clerk authorized party. |
| `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | backend | Socket tokens are verified with these (signature, expiry, authorized party). |
| `DATABASE_URL`, `DIRECT_URL` | backend | Runtime pooled URL; direct URL only for `prisma migrate deploy`. |
| `CLERK_WEBHOOK_SIGNING_SECRET` | backend (secret store only) | Enables `POST /api/webhooks/clerk`. Unset means the route answers 503 and account deletion is **not** wired. |
| `NEXT_PUBLIC_API_URL` | frontend | Public API origin; the browser connects Socket.IO to the same origin. |

## Clerk account-deletion webhook (remaining manual setup)

1. In the Clerk dashboard add an endpoint `https://<api-host>/api/webhooks/clerk` subscribed to **`user.deleted`**.
2. Copy its signing secret into the deployment secret store as `CLERK_WEBHOOK_SIGNING_SECRET` (never commit it, never paste it in chat).
3. Verify with a Clerk "Send test event". Retries are harmless: cleanup is idempotent.

The handler verifies the Svix signature, removes the user's listing photos from R2, deletes the user (cascading chats, receipts, matches and reports) and disconnects their sockets. If R2 is not configured it refuses to delete a user who has listing photos and answers 500 so Clerk retries after R2 is set up.

## Migrations

Apply with `npx prisma migrate deploy` against the intended database only. The messaging migration (`20261109170000_messaging`) is additive. Verify the target host before running it, and run production migrations as a separate release step.

## Before public launch

Review retention (chat history, report evidence, backups, service logs) and user-facing deletion wording; see `report-review.md`.
