import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateEvent,
  monthStart,
  hash,
  secret,
  verifyHmac,
  crypt,
} from '../lib/security';
import { shopifyEvents } from '../lib/shopify';
const now = Date.parse('2026-09-05T12:00:00Z');
const good = {
  event_id: 'one',
  kind: 'sale',
  amount_cents: 39900,
  currency: 'ZAR',
  occurred_at: '2026-09-05T13:00:00+02:00',
};
test('ZAR cents and timezone dates are accepted', () =>
  assert.equal(validateEvent(good, now).amount, 39900));
test('refunds always subtract positive supplied cents', () =>
  assert.equal(validateEvent({ ...good, kind: 'refund' }, now).amount, -39900));
test('invalid, fractional, future and unsupported currency data is rejected', () => {
  for (const bad of [
    { amount_cents: -1 },
    { amount_cents: 1.1 },
    { amount_cents: 1e15 },
    { currency: 'USD' },
    { occurred_at: '2026-09-05T13:00:00' },
    { occurred_at: '2027-01-01T00:00:00Z' },
    { kind: 'profit' },
    { event_id: '' },
  ])
    assert.throws(() => validateEvent({ ...good, ...bad }, now));
});
test('SAST month boundary is UTC+2, including year boundary', () => {
  assert.equal(
    monthStart(new Date('2026-08-31T22:00:00Z')),
    Date.parse('2026-08-31T22:00:00Z'),
  );
  assert.equal(
    monthStart(new Date('2026-08-31T21:59:59Z')),
    Date.parse('2026-07-31T22:00:00Z'),
  );
  assert.equal(
    monthStart(new Date('2026-12-31T22:00:00Z')),
    Date.parse('2026-12-31T22:00:00Z'),
  );
});
test('API tokens are unique and only their hashes are persisted', async () => {
  const a = secret('esa_live_'),
    b = secret('esa_live_');
  assert.notEqual(a, b);
  assert.equal((await hash(a)).length, 64);
  assert.notEqual(await hash(a), a);
});
test('AES-GCM secrets roundtrip; wrong key or tampering fails', async () => {
  const encrypted = await crypt('fixture-secret', 'a'.repeat(64));
  assert.equal(await crypt(encrypted, 'a'.repeat(64), true), 'fixture-secret');
  assert.notEqual(encrypted, 'fixture-secret');
  await assert.rejects(() => crypt(encrypted, 'b'.repeat(64), true));
  await assert.rejects(() => crypt('invalid', 'a'.repeat(64), true));
});
test('HMAC verifies raw bytes and rejects wrong signatures', async () => {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode('fixture'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const raw = '{"real":true}';
  const signature = btoa(
    String.fromCharCode(
      ...new Uint8Array(
        await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)),
      ),
    ),
  );
  assert.ok(await verifyHmac(raw, signature, 'fixture'));
  assert.equal(await verifyHmac(raw + ' ', signature, 'fixture'), false);
  assert.equal(await verifyHmac(raw, 'garbage', 'fixture'), false);
});
const order = {
  id: '123',
  admin_graphql_api_id: 'gid://shopify/Order/123',
  test: false,
  financial_status: 'paid',
  currency: 'ZAR',
  total_price: '399.01',
  updated_at: good.occurred_at,
};
test('Shopify maps cents without floating-point loss and excludes test/unpaid/foreign currency', () => {
  assert.equal(shopifyEvents('orders/paid', order, now)[0].amount, 39901);
  for (const changed of [
    { test: true },
    { financial_status: 'pending' },
    { currency: 'USD' },
    { cancelled_at: good.occurred_at },
  ])
    assert.deepEqual(
      shopifyEvents('orders/paid', { ...order, ...changed }, now),
      [],
    );
});
test('refund create and transaction create use the same dedupe identifier', () => {
  const t = {
    id: 't1',
    kind: 'refund',
    status: 'success',
    test: false,
    currency: 'ZAR',
    amount: '99.00',
    created_at: good.occurred_at,
  };
  const a = shopifyEvents('refunds/create', { transactions: [t] }, now)[0];
  const b = shopifyEvents('order_transactions/create', t, now)[0];
  assert.equal(a.external_id, b.external_id);
  assert.equal(a.amount, -9900);
  assert.deepEqual(
    shopifyEvents(
      'refunds/create',
      {
        transactions: [
          { ...t, status: 'pending' },
          { ...t, test: true },
        ],
      },
      now,
    ),
    [],
  );
});
test('unsafe numeric Shopify IDs are rejected instead of rounded', () =>
  assert.throws(() =>
    shopifyEvents(
      'orders/paid',
      { ...order, id: 820982911946154508, admin_graphql_api_id: undefined },
      now,
    ),
  ));
