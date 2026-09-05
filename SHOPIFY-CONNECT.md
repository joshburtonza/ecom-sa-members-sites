# Shopify Connect: setup and release gates

This is the read-only member-store integration, separate from the existing write-only event API and merchant-configured webhooks. It is **disabled until configured**. No live Shopify authorization or order import has been verified.

## One app for members

Create or reuse an Ecom SA standalone app in Shopify's Dev Dashboard. For unrelated members' stores, use Shopify's public distribution route and obtain approval; a custom-distribution app covers one store or eligible stores in one Plus organisation, not the community at large. Choose distribution deliberately; Shopify documents this as an irreversible choice.

Request only **read_orders**. Do not request write scopes, customer contacts, addresses, payment credentials, or collaborator codes. Obtain the applicable protected customer/order-data approval. This implementation reads orders created in a rolling 30-day window. Historical access beyond Shopify's standard 60-day allowance requires a separate read_all_orders approval and implementation; it is not part of this release.

Configure a standalone (non-embedded) app with the desired final dashboard origin. Its redirect URL must be exactly:

https://ecom-sa-members.joshuaza.chatgpt.site/api/shopify/callback

If moving to dashboard.ecomsa.store, activate DNS/TLS first, then update both the app redirect URL and SHOPIFY_APP_ORIGIN together. Do not use the reserved /callback path; Sites owns it for member sign-in.

## Runtime settings

Use Sites secrets/settings, never source control or member forms:

- SHOPIFY_CLIENT_ID: app client ID
- SHOPIFY_CLIENT_SECRET: secret
- SHOPIFY_APP_ORIGIN: exact HTTPS origin, no trailing slash
- DATA_ENCRYPTION_KEY: preserve the existing 64-hex encryption key
- SHOPIFY_CONNECT_ENABLED: set to true only after the app, scopes, callback, webhook routing and access are verified

Keep the existing member authentication and explicit active-membership checks. The Site is currently owner-private. Shopify server callbacks/webhooks and member access need an approved externally reachable gateway before community rollout. Do not silently widen the Site audience.

## Webhooks to register in the Shopify app

Point these mandatory privacy / lifecycle topics to /api/shopify/webhooks on the configured origin:

- app/uninstalled
- customers/data_request
- customers/redact
- shop/redact

Use Shopify's app-level subscriptions and compliance configuration. This code verifies raw-body HMAC before processing, clears credentials on uninstall and removes imports on shop redaction. No customer IDs, customer names, emails or addresses are requested or stored. Complete a privacy/compliance review before app submission; these handlers are not proof of Shopify approval.

## Data and refresh semantics

- Members select their dashboard store and approve access on Shopify.
- State is random, hashed in D1, member/store/domain bound, single-use, and expires after 10 minutes. The callback also requires an HttpOnly SameSite cookie, a fresh HMAC and active membership.
- Only canonical myshopify.com hosts are fetched. Redirect following is disabled for token/API calls.
- Expiring offline access and refresh tokens are encrypted server-side with AES-GCM. A per-store lock serializes refresh/import work. Write scopes are rejected. Tokens are never returned to clients.
- GraphQL Admin API 2026-07 reads pages of 100 orders. A full rolling 30-day import is completed before replacing the visible summary. Orders are selected by creation date, while payment/refund amounts are their current totals. This is not cash flow grouped by payment date.
- Money is stored as integer millionths to avoid floating-point accumulation. Currencies remain separate. Refunds, customer amounts due and amounts owed to customers are separate. Test orders are excluded.
- All pages contribute to aggregates; only the 100 newest order summaries are retained. There is a 25,000-order per-refresh safety boundary; larger stores need a bulk importer. No incomplete aggregate is published. This is not an atomic Shopify database snapshot: an order may change while pagination runs.
- Refresh begins when this view is opened with a stale connection and runs about every five minutes while visible. Imports resume page-by-page. Closing the page stops further requests; there is no unattended background scheduler.
- Existing event/API revenue and leaderboard calculations are kept separate to prevent double counting. These imports do not automatically generate win posts or alter the reported/team-reviewed leaderboard.
- Received less refunded includes tax/shipping where present. It is **not profit or money available in a payment-provider balance**. No Yoco, PayFast, Shopify Payments payout, inventory or product-cost connection is implemented.
- Disconnect removes tokens and cached imports but preserves the local store record and existing event logs. Merchants should also uninstall the app in Shopify to revoke its grant. Domain assignment is retained until owner-assisted transfer.

## Verification before activation

1. Register the app and configure the final origin, read-only scopes and all required webhooks.
2. Approve external gateway access without exposing member data.
3. Test on an authorised Shopify development store: connect, deny, retry, wrong-account callback, token refresh, paginated import, failed-page recovery and disconnect.
4. Reconcile totals and representative order statuses against that store's Shopify admin. Check refunds, unpaid/part-paid orders, cancelled orders, test orders and currencies.
5. Test signed uninstall and compliance deliveries; verify disconnected stores stop reading.
6. Complete Shopify distribution / protected-data approval, then enable member installs.

Local checks:

node tests/run-shopify-connect.mjs
node tests/shopify-connect-integration.mjs

The first suite mocks Shopify. The second only tests the isolated local fixture identity with Shopify disabled. Neither proves a live connection.

References:
- https://shopify.dev/docs/apps/launch/distribution
- https://shopify.dev/docs/apps/build/authentication-authorization/authenticate-standalone-apps
- https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens
- https://shopify.dev/docs/api/admin-graphql/2026-07/objects/Order
- https://help.shopify.com/en/manual/your-account/staff-accounts/collaborator-accounts
