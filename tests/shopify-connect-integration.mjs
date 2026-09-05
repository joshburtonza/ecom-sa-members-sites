import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
const origin = 'http://localhost:3210',
  dir = '.wrangler/state/v3/d1/miniflare-D1DatabaseObject';
const sql = new DatabaseSync(
  dir + '/' + readdirSync(dir).find((s) => /^[a-f0-9]{64}\.sqlite$/.test(s)),
);
sql.exec('PRAGMA busy_timeout=5000;PRAGMA foreign_keys=ON');
const prefix = 'shopify-test-' + randomUUID(),
  storeId = prefix + '-store',
  otherId = prefix + '-other',
  otherStore = prefix + '-other-store';
async function req(path, body, auth = true, originHeader = origin) {
  const r = await fetch(origin + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      ...(auth ? { Cookie: '__sites_local_auth=1' } : {}),
      ...(body
        ? { Origin: originHeader, 'Content-Type': 'application/json' }
        : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const t = await r.text();
  let data;
  try {
    data = JSON.parse(t);
  } catch {
    data = { error: t };
  }
  return { status: r.status, data };
}
const me = (await req('/api/hub')).data.me;
assert.equal(me?.id, 'local_seedy');
assert.equal(me.status, 'active');
let checks = 0;
const pass = (s) => {
  checks++;
  console.log('PASS ' + s);
};
try {
  assert.equal((await req('/api/shopify', null, false)).status, 401);
  assert.equal(
    (
      await req(
        '/api/shopify',
        { action: 'connect', store_id: storeId },
        true,
        'https://evil.test',
      )
    ).status,
    403,
  );
  pass(
    'Shopify connection endpoints require membership and same-origin writes',
  );
  sql
    .prepare('INSERT INTO stores(id,member_id,name,created_at) VALUES(?,?,?,?)')
    .run(storeId, me.id, 'Fixture store', Date.now());
  sql
    .prepare('INSERT INTO members(id,email,name,joined_at) VALUES(?,?,?,?)')
    .run(otherId, otherId + '@example.test', 'Other fixture', Date.now());
  sql
    .prepare('INSERT INTO stores(id,member_id,name,created_at) VALUES(?,?,?,?)')
    .run(otherStore, otherId, 'Other fixture store', Date.now());
  sql
    .prepare(
      "INSERT INTO shopify_connections(store_id,domain,status,tokens,snapshot,snapshot_at) VALUES(?,?,'connected','fixture-ciphertext',?,?)",
    )
    .run(
      otherStore,
      prefix + '-other.myshopify.com',
      '{"private":"fixture"}',
      Date.now(),
    );
  assert.equal(
    (await req('/api/shopify')).data.connections.some(
      (c) => c.store_id === otherStore,
    ),
    false,
  );
  assert.equal(
    (await req('/api/shopify', { action: 'disconnect', store_id: otherStore }))
      .status,
    404,
  );
  assert.equal(
    (await req('/api/shopify', { action: 'sync', store_id: otherStore }))
      .status,
    404,
  );
  pass('Members cannot read, sync or disconnect someone else’s store');
  sql
    .prepare(
      "INSERT INTO shopify_connections(store_id,domain,status,tokens,snapshot,snapshot_at) VALUES(?,?,'connected','fixture-ciphertext','{}',?)",
    )
    .run(storeId, prefix + '.myshopify.com', Date.now());
  const state = (await req('/api/shopify')).data;
  assert.equal(JSON.stringify(state).includes('fixture-ciphertext'), false);
  assert.equal(
    state.available,
    false,
    'Do not run this suite with a live Shopify app enabled',
  );
  assert.equal(
    (
      await req('/api/shopify', {
        action: 'connect',
        store_id: storeId,
        domain: 'fixture.myshopify.com',
        consent: true,
      })
    ).status,
    503,
  );
  assert.equal(
    (await req('/api/shopify', { action: 'sync', store_id: storeId })).status,
    503,
  );
  pass(
    'Credentials never reach the browser and an unconfigured app cannot attempt a connection',
  );
  assert.equal(
    (await req('/api/shopify', { action: 'disconnect', store_id: storeId }))
      .status,
    200,
  );
  const conn = sql
    .prepare(
      'SELECT tokens,status,snapshot,pending FROM shopify_connections WHERE store_id=?',
    )
    .get(storeId);
  assert.deepEqual(
    { ...conn },
    { tokens: null, status: 'disconnected', snapshot: null, pending: null },
  );
  assert.ok(sql.prepare('SELECT id FROM stores WHERE id=?').get(storeId));
  pass(
    'Disconnect clears credentials and cached imports but preserves the member’s store and existing logs',
  );
  sql.prepare("UPDATE members SET status='suspended' WHERE id=?").run(me.id);
  assert.equal((await req('/api/shopify')).status, 403);
  assert.equal(
    (await req('/api/shopify', { action: 'disconnect', store_id: storeId }))
      .status,
    403,
  );
  pass('Suspended members cannot read or mutate Shopify connections');
} finally {
  sql.prepare('UPDATE members SET status=? WHERE id=?').run(me.status, me.id);
  sql
    .prepare('DELETE FROM shopify_states WHERE store_id IN (?,?)')
    .run(storeId, otherStore);
  sql
    .prepare('DELETE FROM shopify_connections WHERE store_id IN (?,?)')
    .run(storeId, otherStore);
  sql.prepare('DELETE FROM stores WHERE id IN (?,?)').run(storeId, otherStore);
  sql.prepare('DELETE FROM members WHERE id=?').run(otherId);
  sql.close();
}
console.log(
  checks + ' Shopify HTTP checks passed. Exact local fixtures removed.',
);
