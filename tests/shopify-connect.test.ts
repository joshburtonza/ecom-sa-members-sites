import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  shopDomain,
  verifyShopifyCallback,
  tokenSet,
  tokenRequest,
  emptySnapshot,
  addOrders,
  moneyMicros,
  orderPage,
  type ShopifyOrder,
} from '../lib/shopify-admin';
let checks = 0;
const pass = (s: string) => {
  checks++;
  console.log('PASS ' + s);
};
assert.equal(
  shopDomain(' Example-Shop.myshopify.com '),
  'example-shop.myshopify.com',
);
for (const value of [
  'example.com',
  'https://store.myshopify.com',
  'evil.myshopify.com.evil.test',
  'store.myshopify.com/admin',
  'store.myshopify.com:443',
  'user@store.myshopify.com',
  '127.0.0.1',
  'store.myshopify.com\n.evil.test',
])
  assert.throws(() => shopDomain(value));
pass(
  'Only canonical Shopify hosts are allowed; URLs, credentials, ports and SSRF targets are rejected',
);
const now = Date.now(),
  params = new URLSearchParams({
    shop: 'fixture.myshopify.com',
    code: 'fixture-code',
    state: 'a'.repeat(64),
    timestamp: String(Math.floor(now / 1000)),
  });
const signed = [...params.entries()]
  .sort(([a], [b]) => (a < b ? -1 : 1))
  .map(([k, v]) => k + '=' + v)
  .join('&');
params.set(
  'hmac',
  createHmac('sha256', 'fixture-secret').update(signed).digest('hex'),
);
assert.equal(await verifyShopifyCallback(params, 'fixture-secret', now), true);
assert.equal(await verifyShopifyCallback(params, 'wrong-secret', now), false);
assert.equal(
  await verifyShopifyCallback(params, 'fixture-secret', now + 601000),
  false,
);
params.append('shop', 'other.myshopify.com');
assert.equal(await verifyShopifyCallback(params, 'fixture-secret', now), false);
pass(
  'OAuth callbacks require a fresh signature and reject duplicate/tampered parameters',
);
const tokens = {
  access_token: 'fixture-access',
  refresh_token: 'fixture-refresh',
  scope: 'read_orders',
  expires_in: 3600,
  refresh_token_expires_in: 7776000,
};
assert.equal(tokenSet(tokens, now).expires_at, now + 3600000);
assert.throws(() => tokenSet({ ...tokens, scope: 'write_orders' }));
assert.throws(() => tokenSet({ ...tokens, refresh_token: '' }));
assert.throws(() => tokenSet({ ...tokens, expires_in: 0 }));
pass('Expiring tokens are mandatory and write scopes are rejected');
let called = false;
await tokenRequest(
  'fixture.myshopify.com',
  { client_id: 'fixture', code: 'fixture', expiring: '1' },
  (async (url, init) => {
    called = true;
    assert.equal(url, 'https://fixture.myshopify.com/admin/oauth/access_token');
    assert.equal(init?.redirect, 'error');
    assert.equal(new URLSearchParams(String(init?.body)).get('expiring'), '1');
    return Response.json(tokens);
  }) as typeof fetch,
);
assert.equal(called, true);
pass(
  'Token exchange uses the fixed Shopify endpoint and does not follow redirects',
);
assert.equal(moneyMicros('399.99'), 399990000);
assert.equal(moneyMicros('-1.123456'), -1123456);
assert.throws(() => moneyMicros('9007199254740999'));
assert.throws(() => moneyMicros('3.3333333'));
pass('Money is aggregated with exact six-decimal integer arithmetic');
const order: ShopifyOrder = {
  id: 'gid://shopify/Order/123',
  name: '#123',
  createdAt: new Date(now).toISOString(),
  test: false,
  displayFinancialStatus: 'PARTIALLY_REFUNDED',
  displayFulfillmentStatus: 'UNFULFILLED',
  paymentGatewayNames: ['Fixture gateway'],
  totalReceivedSet: { shopMoney: { amount: '100.00', currencyCode: 'ZAR' } },
  totalRefundedSet: { shopMoney: { amount: '20.00', currencyCode: 'ZAR' } },
  totalOutstandingSet: { shopMoney: { amount: '-5.00', currencyCode: 'ZAR' } },
};
const first = addOrders(emptySnapshot(now), [
  order,
  { ...order, id: 'gid://shopify/Order/124', test: true },
]);
assert.equal(first.count, 1);
assert.equal(first.totals[0].received - first.totals[0].refunded, 80000000);
assert.equal(first.totals[0].awaiting, 0);
assert.equal(first.totals[0].owed, 5000000);
assert.deepEqual(
  Object.keys(first.orders[0]).sort(),
  [
    'id',
    'name',
    'createdAt',
    'financial',
    'fulfillment',
    'gateways',
    'currency',
    'received',
    'refunded',
    'outstanding',
  ].sort(),
);
pass(
  'Test orders are excluded; refunds and money owed to customers are shown separately; no customer fields persist',
);
const second = addOrders(first, [
  {
    ...order,
    id: 'gid://shopify/Order/125',
    totalReceivedSet: { shopMoney: { amount: '10', currencyCode: 'USD' } },
    totalRefundedSet: { shopMoney: { amount: '0', currencyCode: 'USD' } },
    totalOutstandingSet: { shopMoney: { amount: '0', currencyCode: 'USD' } },
  },
]);
assert.equal(second.totals.length, 2);
assert.equal(first.count, 1);
pass(
  'Currencies are not combined and published snapshots are not mutated while importing',
);
const many = addOrders(
  emptySnapshot(now),
  Array.from({ length: 130 }, (_, i) => ({
    ...order,
    id: 'gid://shopify/Order/' + (1000 + i),
  })),
);
assert.equal(many.count, 130);
assert.equal(many.orders.length, 100);
pass(
  'All imported orders contribute to totals; only the latest 100 order summaries are retained',
);
const next = await orderPage(
  'fixture.myshopify.com',
  'fixture-token',
  emptySnapshot(now),
  (async (url, init) => {
    assert.equal(
      url,
      'https://fixture.myshopify.com/admin/api/2026-07/graphql.json',
    );
    assert.equal(init?.redirect, 'error');
    const body = JSON.parse(String(init?.body));
    assert.match(body.query, /query MemberStoreOrders/);
    assert.doesNotMatch(body.query, /mutation|customer|email|shippingAddress/);
    return Response.json({
      data: {
        orders: {
          nodes: [order],
          pageInfo: { hasNextPage: true, endCursor: 'fixture-cursor' },
        },
      },
    });
  }) as typeof fetch,
);
assert.equal(next.cursor, 'fixture-cursor');
assert.equal(next.count, 1);
await assert.rejects(() =>
  orderPage('fixture.myshopify.com', 'fixture-token', next, (async () =>
    Response.json({
      data: {
        orders: {
          nodes: [order],
          pageInfo: { hasNextPage: true, endCursor: 'fixture-cursor' },
        },
      },
    })) as typeof fetch),
);
await assert.rejects(() =>
  orderPage('fixture.myshopify.com', 'fixture-token', next, (async () =>
    Response.json({
      errors: [{ message: 'fixture' }],
      data: {
        orders: {
          nodes: [],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    })) as typeof fetch),
);
pass(
  'GraphQL pagination advances and partial/error responses cannot publish misleading totals',
);
console.log(
  checks +
    ' Shopify connection unit checks passed. Shopify responses were mocked; no live store accessed.',
);
