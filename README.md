# Ecom SA Member Workspace

Separate from ecomsa.store marketing pages. Sites + React + D1 + R2.

## Access
Platform sign-in identifies a user. The application separately checks active membership on every data API and file download. ADMIN_EMAIL must be set to the intended owner's verified platform email. There is no first-visitor administrator bootstrap. Invitations are single-use, email-bound and expire after 7 days.

The initial publication is owner-private. Before member invitations or external integrations can function, explicitly approve the public sign-in/API gateway in Sites; application data remains gated. Custom-domain DNS and TLS must also be active. Do not interpret a local test as proof of a merchant's live connection.

## Features
- Five community channels; posts, replies, reactions, pinning, removal.
- Member profiles and opt-in revenue leaderboard, 15-second visible-tab refresh.
- Classroom editor, drafts, progress and private R2 resources (30 MB/file).
- Per-store revocable keys, hashed at rest, 90-day expiry, 120 events/min/key.
- Idempotent ZAR event ingestion and manual event log.
- Signed Shopify paid-order and successful-refund webhook receiver.
- Admin membership suspension, invitations, result review and audit trail.

## Integration
POST /api/v1/events with Authorization: Bearer <key>. JSON fields: event_id, kind (sale/refund), amount_cents (positive integer), currency (ZAR), occurred_at (ISO with timezone), optional note. The key owns the member/store mapping. 201 new, 200 duplicate, 409 conflicting reused ID. Do not put keys in browser JavaScript. Use one source per sale. Store integrations need their own retry queue.

For Shopify manual admin webhooks, save the myshopify.com domain and webhook signing secret in My store. Add Order payment, Refund create and Transaction creation JSON webhooks using API 2026-07 and the displayed URL. Store secrets are AES-GCM encrypted using DATA_ENCRYPTION_KEY. Raw webhook payloads and customer PII are not retained. Non-ZAR, test, unpaid and unsuccessful refund events are not counted. Historical backfill, order edit adjustments, chargebacks and automatic reconciliation are not implemented: review merchant records regularly and correct discrepancies. Pending refunds require a subsequent successful transaction delivery.

Shopify signatures establish possession of the configured store signing secret; they are not an independent earnings audit. All API/manual results are reported. Team reviewed requires manual evidence checking. Reviewed-board totals include all logged refunds to avoid overstating results.

Revenue is gross paid order amounts less logged refunds, including tax/shipping where present. It is not profit.

## Local work
npm install
npx wrangler d1 migrations apply DB --local --config wrangler.local.json
npm run dev -- --port 3210

Use ignored .dev.vars with ADMIN_EMAIL=seedy@sites.test and a local-only 64-hex DATA_ENCRYPTION_KEY. The Sites starter supplies localhost-only sign-in. Never deploy test identity data or local variables.

node tests/run.mjs
node tests/integration.mjs
npx tsc --noEmit
npm run build

Integration tests use ONLY localhost:3210 and the project-local Wrangler D1. They remove synthetic local activity at the end. Do not run against production.
Before running the HTTP integration suite, sign in locally once to create the test administrator, then set the local ADMIN_EMAIL to fixture-owner@sites.test and restart dev. This lets the suite test invitation redemption without the owner auto-bootstrap bypassing the invitation gate. Restore seedy@sites.test afterwards. The production ADMIN_EMAIL is never changed.

## Operations / boundaries
No imported Skool content or real member list. Three authored workspace orientation lessons ship by migration. No direct messages, voice/video calls, subscriptions/paywall syncing, email service, large-video transcoding or Shopify OAuth app. Invitations are shared manually after confirming paid membership. Community search is scoped to the current channel's latest 80 posts. Thread history is capped at 100 replies; directory and admin member views at 200 records. These limits are visible MVP scale boundaries, not archival deletion.

Uploaded assets persist even if detached from a lesson, but cannot be fetched by regular members without a published lesson referencing them. Privacy/deletion requests are handled by the owner; no self-service deletion workflow yet. Keep financial data private by default and enable only the desired audience before rollout.
