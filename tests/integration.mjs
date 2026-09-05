import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync } from 'node:fs';
import { createHash, randomBytes, createHmac } from 'node:crypto';
const origin = 'http://localhost:3210';
const dir = '.wrangler/state/v3/d1/miniflare-D1DatabaseObject';
const file = readdirSync(dir).find((x) => /^[a-f0-9]{64}\.sqlite$/.test(x));
assert.ok(file, 'Start local dev and apply migrations first');
const sql = new DatabaseSync(dir + '/' + file);
sql.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON');
const hash = (s) => createHash('sha256').update(s).digest('hex');
let count = 0;
function ok(label) {
  count++;
  console.log('PASS ' + label);
}
async function req(path, body, { auth = true, headers = {} } = {}) {
  const r = await fetch(origin + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      ...(auth ? { Cookie: '__sites_local_auth=1' } : {}),
      ...(body ? { 'Content-Type': 'application/json', Origin: origin } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await r.text();
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    value = { error: text };
  }
  return { status: r.status, value };
}
const act = (action, rest = {}) => req('/api/hub', { action, ...rest });
function cleanup() {
  sql.exec(
    "DELETE FROM posts WHERE body IN ('Integration fixture post','Fixture reply'); DELETE FROM completions WHERE member_id='local_seedy'; DELETE FROM events WHERE store_id IN(SELECT id FROM stores WHERE name='Fixture store' AND member_id='local_seedy'); DELETE FROM api_keys WHERE store_id IN(SELECT id FROM stores WHERE name='Fixture store' AND member_id='local_seedy'); DELETE FROM stores WHERE (name='Fixture store' AND member_id='local_seedy') OR id='fixture-other-store'; DELETE FROM invites WHERE id='fixture-invite' OR email='future@example.test'; DELETE FROM lessons WHERE id='fixture-resource'; DELETE FROM members WHERE id='fixture-other'; UPDATE members SET role='admin',status='active',name='Seedy',bio='',leaderboard=0 WHERE id='local_seedy';",
  );
}
try {
  assert.equal((await req('/api/hub', null, { auth: false })).value.me, null);
  ok('Anonymous visitors cannot read member data');
  let state = (await req('/api/hub')).value;
  assert.equal(state.me.role, 'admin');
  assert.equal(state.lessons.length, 3);
  ok('Owner bootstrap and persisted starter lessons');
  assert.equal(
    state.stores.length,
    0,
    'Run only against an unused local development database',
  );
  assert.equal(
    state.posts.length,
    0,
    'Preserve existing local community activity',
  );
  assert.equal(
    state.counts.completed,
    0,
    'Preserve existing local lesson progress',
  );
  assert.equal(
    (
      await req(
        '/api/hub',
        { action: 'store', name: 'Bad' },
        { headers: { Origin: 'https://evil.example' } },
      )
    ).status,
    403,
  );
  ok('Cross-site browser writes rejected');
  const invite = await act('invite', { email: 'future@example.test' });
  assert.equal(invite.status, 200);
  assert.ok(invite.value.inviteUrl.includes('invite_'));
  ok('Admin can create an email-bound invite');
  const token = 'invite_' + randomBytes(32).toString('hex');
  sql
    .prepare(
      "INSERT INTO invites(id,email,token_hash,expires_at,created_at) VALUES('fixture-invite','seedy@sites.test',?,?,?)",
    )
    .run(hash(token), Date.now() + 60000, Date.now());
  sql.exec("DELETE FROM members WHERE id='local_seedy'");
  assert.equal(
    (await act('redeem', { token: 'wrong', name: 'Fixture' })).status,
    400,
  );
  assert.equal((await act('redeem', { token, name: 'Fixture' })).status, 200);
  assert.equal((await act('redeem', { token, name: 'Fixture' })).status, 409);
  ok('Invite redemption requires the right token and is single-use');
  assert.equal(
    (await act('invite', { email: 'blocked@example.test' })).status,
    403,
  );
  ok('Members cannot invoke admin actions');
  sql.exec("UPDATE members SET role='admin' WHERE id='local_seedy'");
  assert.equal((await act('store', { name: 'Fixture store' })).status, 200);
  state = (await req('/api/hub')).value;
  const store = state.stores[0];
  sql
    .prepare(
      "INSERT INTO members(id,email,name,joined_at) VALUES('fixture-other','other@example.test','Other fixture',?)",
    )
    .run(Date.now());
  sql
    .prepare(
      "INSERT INTO stores(id,member_id,name,created_at) VALUES('fixture-other-store','fixture-other','Private other store',?)",
    )
    .run(Date.now());
  assert.equal(
    (await act('key', { store_id: 'fixture-other-store', name: 'Bad' })).status,
    404,
  );
  ok('Cross-member store key creation rejected');
  const key = (await act('key', { store_id: store.id, name: 'Fixture key' }))
    .value.token;
  assert.ok(key.startsWith('esa_live_'));
  state = (await req('/api/hub')).value;
  assert.equal(JSON.stringify(state).includes(key), false);
  assert.equal(state.stores.length, 1);
  ok('Keys shown once; other members’ store data stays private');
  const send = (body) =>
    req('/api/v1/events', body, {
      auth: false,
      headers: { Authorization: 'Bearer ' + key },
    });
  const event = {
    event_id: 'fixture-order',
    kind: 'sale',
    amount_cents: 10000,
    currency: 'ZAR',
    occurred_at: new Date().toISOString(),
    store_id: 'fixture-other-store',
    member_id: 'fixture-other',
  };
  assert.equal((await send(event)).status, 201);
  assert.equal((await send(event)).value.duplicate, true);
  assert.equal((await send({ ...event, amount_cents: 11000 })).status, 409);
  ok('Event ingestion, exact retry dedupe and conflicting ID rejection');
  assert.equal(
    sql
      .prepare(
        "SELECT COUNT(*) n FROM events WHERE store_id='fixture-other-store'",
      )
      .get().n,
    0,
  );
  ok('Payload cannot override the key’s store owner');
  assert.equal(
    (
      await send({
        ...event,
        event_id: 'fixture-refund',
        kind: 'refund',
        amount_cents: 2500,
      })
    ).status,
    201,
  );
  state = (await req('/api/hub')).value;
  assert.equal(state.counts.revenue, 7500);
  assert.equal(state.leaderboard.length, 0);
  ok('Refund deductions and opt-out privacy');
  await act('profile', {
    name: 'Fixture',
    bio: 'Test fixture',
    leaderboard: true,
  });
  state = (await req('/api/hub')).value;
  assert.equal(state.leaderboard[0].revenue, 7500);
  ok('Opt-in leaderboard reads real database totals');
  assert.equal(
    (
      await act('post', {
        channel: 'general',
        body: 'Integration fixture post',
      })
    ).status,
    200,
  );
  state = (await req('/api/hub')).value;
  const post = state.posts[0];
  await act('react', { id: post.id, active: true });
  await act('react', { id: post.id, active: true });
  state = (await req('/api/hub')).value;
  assert.equal(state.posts[0].reactions, 1);
  ok('Community posts and idempotent reactions persist');
  sql
    .prepare('UPDATE posts SET created_at=? WHERE id=?')
    .run(Date.now() - 5000, post.id);
  await act('post', {
    channel: 'general',
    parent_id: post.id,
    body: 'Fixture reply',
  });
  assert.equal(
    (await req('/api/hub?thread=' + post.id)).value.replies.length,
    1,
  );
  ok('Thread replies persist');
  await act('complete', { id: state.lessons[0].id, completed: true });
  await act('complete', { id: state.lessons[0].id, completed: true });
  state = (await req('/api/hub')).value;
  assert.equal(state.counts.completed, 1);
  ok('Lesson completion is persistent and idempotent');
  const fileData = new FormData();
  fileData.append(
    'file',
    new Blob(['%PDF-1.4\n% test fixture'], { type: 'application/pdf' }),
    'fixture.pdf',
  );
  const upload = await fetch(origin + '/api/files', {
    method: 'POST',
    headers: { Cookie: '__sites_local_auth=1', Origin: origin },
    body: fileData,
  });
  const asset = await upload.json();
  assert.equal(upload.status, 201);
  assert.equal((await fetch(origin + '/api/files?id=' + asset.id)).status, 401);
  await act('lesson', {
    id: 'fixture-resource',
    title: 'Fixture lesson',
    category: 'Fixture',
    body: 'Fixture body',
    duration: 5,
    published: true,
    asset_id: asset.id,
  });
  const download = await fetch(origin + '/api/files?id=' + asset.id, {
    headers: { Cookie: '__sites_local_auth=1' },
  });
  assert.equal(download.status, 200);
  assert.ok((await download.text()).startsWith('%PDF'));
  ok('R2 resource upload, gated download and published lesson binding');
  await act('shopify', {
    store_id: store.id,
    domain: 'fixture.myshopify.com',
    signing_secret: 'fixture-signing-secret',
  });
  const payload = {
    id: '123',
    admin_graphql_api_id: 'gid://shopify/Order/123',
    test: false,
    financial_status: 'paid',
    total_price: '399.00',
    currency: 'ZAR',
    updated_at: new Date().toISOString(),
  };
  async function hook(
    p,
    domain = 'fixture.myshopify.com',
    signature = true,
    topic = 'orders/paid',
  ) {
    const raw = JSON.stringify(p);
    const res = await fetch(origin + '/api/webhooks/shopify/' + store.id, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-shopify-shop-domain': domain,
        'x-shopify-topic': topic,
        'x-shopify-hmac-sha256': signature
          ? createHmac('sha256', 'fixture-signing-secret')
              .update(raw)
              .digest('base64')
          : 'bad',
      },
      body: raw,
    });
    return { status: res.status, value: await res.json() };
  }
  assert.equal((await hook(payload, undefined, false)).status, 401);
  assert.equal((await hook(payload, 'other.myshopify.com')).status, 401);
  assert.equal((await hook({ ...payload, test: true })).value.recorded, 0);
  assert.equal((await hook(payload)).value.recorded, 1);
  assert.equal((await hook(payload)).value.recorded, 0);
  ok(
    'Shopify signature/domain validation, test exclusion and paid-order dedupe',
  );
  const tx = {
    id: 'tx1',
    kind: 'refund',
    status: 'success',
    test: false,
    currency: 'ZAR',
    amount: '99.00',
    created_at: new Date().toISOString(),
  };
  assert.equal(
    (await hook({ transactions: [tx] }, undefined, true, 'refunds/create'))
      .value.recorded,
    1,
  );
  assert.equal(
    (await hook(tx, undefined, true, 'order_transactions/create')).value
      .recorded,
    0,
  );
  ok('Refund webhook and transaction webhook cannot double-count');
  state = (await req('/api/hub')).value;
  await act('review-event', {
    id: state.events.find((e) => e.source === 'api' && e.kind === 'sale').id,
    voided: false,
  });
  const reviewed = (await req('/api/hub?ranking=reviewed')).value;
  assert.equal(reviewed.leaderboard[0].revenue, -2400);
  ok('Unreviewed refunds still reduce the reviewed board');
  sql
    .prepare('UPDATE api_keys SET requests=120,bucket=? WHERE store_id=?')
    .run(Math.floor(Date.now() / 60000), store.id);
  assert.equal((await send({ ...event, event_id: 'rate-limit' })).status, 429);
  ok('Per-key rate limit enforced');
  await act('revoke-key', { id: state.keys[0].id });
  assert.equal((await send({ ...event, event_id: 'revoked' })).status, 401);
  ok('Revocation takes effect immediately');
  const key2 = (
    await act('key', { store_id: store.id, name: 'Before suspension' })
  ).value.token;
  sql.exec("UPDATE members SET status='suspended' WHERE id='local_seedy'");
  assert.equal((await req('/api/hub')).status, 403);
  assert.equal(
    (
      await req('/api/v1/events', event, {
        auth: false,
        headers: { Authorization: 'Bearer ' + key2 },
      })
    ).status,
    401,
  );
  ok('Suspension blocks browser and integration access');
  console.log('PASS ' + count + ' HTTP/database integration checks');
} finally {
  cleanup();
  sql.close();
}
