import {
  bindings,
  member,
  rows,
  statement,
  db,
  json,
  safely,
  jsonBody,
  checkOrigin,
  log,
} from '../../../lib/server';
import { HttpError, requiredText, hash, secret } from '../../../lib/security';
import {
  shopDomain,
  emptySnapshot,
  orderPage,
  type StoreSnapshot,
} from '../../../lib/shopify-admin';
import {
  shopifyConfig,
  shopifyAvailable,
  ownedStore,
  accessForSync,
} from '../../../lib/shopify-connection';
export async function GET() {
  return safely(async () => {
    const me = await member();
    const connections = await rows(
      'SELECT c.store_id,c.domain,c.status,c.snapshot,c.snapshot_at,c.last_error,c.connected_at,CASE WHEN c.pending IS NOT NULL THEN 1 ELSE 0 END importing FROM shopify_connections c JOIN stores s ON s.id=c.store_id WHERE s.member_id=?',
      me.id,
    );
    return json({
      available: shopifyAvailable(),
      connections,
      admin: me.role === 'admin',
    });
  });
}
export async function POST(request: Request) {
  return safely(async () => {
    checkOrigin(request);
    const b = await jsonBody(request);
    const storeId = requiredText(b.store_id, 80),
      me = await ownedStore(storeId);
    const now = Date.now();
    if (b.action === 'connect') {
      const c = shopifyConfig();
      if (new URL(request.url).origin !== c.origin)
        throw new HttpError(
          400,
          'Open the dashboard on its configured Shopify connection address.',
        );
      if (b.consent !== true)
        throw new HttpError(400, 'Confirm read-only access before connecting.');
      const domain = shopDomain(b.domain);
      const existing = await statement(
        'SELECT store_id FROM shopify_connections WHERE domain=? AND store_id<>?',
        domain,
        storeId,
      ).first();
      if (existing)
        throw new HttpError(
          409,
          'This Shopify store is already assigned to a member. Contact the team to transfer it.',
        );
      const own = await statement(
        'SELECT domain,status FROM shopify_connections WHERE store_id=?',
        storeId,
      ).first<{ domain: string; status: string }>();
      if (own && own.domain !== domain && own.status !== 'disconnected')
        throw new HttpError(
          409,
          'Disconnect the current Shopify store before changing the address.',
        );
      const recent = await statement(
        'SELECT COUNT(*) n FROM shopify_states WHERE member_id=? AND created_at>?',
        me.id,
        now - 60000,
      ).first<{ n: number }>();
      if ((recent?.n || 0) >= 5)
        throw new HttpError(429, 'Please wait a minute before trying again.');
      const state = secret(''),
        stateHash = await hash(state);
      await db().batch([
        statement('DELETE FROM shopify_states WHERE expires_at<?', now),
        statement(
          'INSERT INTO shopify_states(state_hash,store_id,member_id,domain,created_at,expires_at) VALUES(?,?,?,?,?,?)',
          stateHash,
          storeId,
          me.id,
          domain,
          now,
          now + 600000,
        ),
      ]);
      const url =
        'https://' +
        domain +
        '/admin/oauth/authorize?' +
        new URLSearchParams({
          client_id: c.clientId,
          scope: 'read_orders',
          redirect_uri: c.origin + '/api/shopify/callback',
          state,
        });
      const r = json({ url });
      r.headers.set(
        'Set-Cookie',
        'esa_shopify_state=' +
          state +
          '; Path=/api/shopify; HttpOnly; Secure; SameSite=Lax; Max-Age=600',
      );
      return r;
    }
    if (b.action === 'disconnect') {
      await db().batch([
        statement(
          "UPDATE shopify_connections SET tokens=NULL,status='disconnected',snapshot=NULL,snapshot_at=NULL,pending=NULL,lock_id=NULL,lock_until=0,last_error=NULL WHERE store_id=?",
          storeId,
        ),
        statement('DELETE FROM shopify_states WHERE store_id=?', storeId),
      ]);
      await log(me.id, 'disconnect-shopify-read', storeId);
      return json({
        ok: true,
        message:
          'Connection credentials and imported dashboard data removed. To revoke the Shopify grant too, uninstall Ecom SA in Shopify.',
      });
    }
    if (b.action !== 'sync') throw new HttpError(400, 'Unknown action.');
    shopifyConfig();
    const lockId = crypto.randomUUID();
    const claim = await statement(
      "UPDATE shopify_connections SET lock_id=?,lock_until=?,last_attempt=? WHERE store_id=? AND status='connected' AND tokens IS NOT NULL AND lock_until<? AND (pending IS NOT NULL OR last_attempt<?)",
      lockId,
      now + 90000,
      now,
      storeId,
      now,
      now - 60000,
    ).run();
    if (!claim.meta.changes)
      throw new HttpError(
        409,
        'A refresh is already running, the store needs reconnecting, or it was refreshed less than a minute ago.',
      );
    try {
      const conn = await statement(
        'SELECT domain,tokens,pending FROM shopify_connections WHERE store_id=? AND lock_id=?',
        storeId,
        lockId,
      ).first<{ domain: string; tokens: string; pending: string | null }>();
      if (!conn) throw new HttpError(409, 'Connection changed.');
      const access = await accessForSync(
        conn.tokens,
        conn.domain,
        storeId,
        lockId,
      );
      let snapshot: StoreSnapshot = conn.pending
        ? JSON.parse(conn.pending)
        : emptySnapshot();
      // Discard stale in-progress imports, never publish a half-complete total.
      if (Date.now() - Date.parse(snapshot.until) > 3600000)
        snapshot = emptySnapshot();
      const next = await orderPage(conn.domain, access, snapshot);
      const complete = next.cursor === null;
      const saved = await statement(
        "UPDATE shopify_connections SET pending=?,snapshot=CASE WHEN ?=1 THEN ? ELSE snapshot END,snapshot_at=CASE WHEN ?=1 THEN ? ELSE snapshot_at END,lock_id=NULL,lock_until=0,last_error=NULL WHERE store_id=? AND lock_id=? AND status='connected'",
        complete ? null : JSON.stringify(next),
        complete ? 1 : 0,
        JSON.stringify(next),
        complete ? 1 : 0,
        Date.now(),
        storeId,
        lockId,
      ).run();
      if (!saved.meta.changes)
        throw new HttpError(
          409,
          'The connection changed. This update was not saved.',
        );
      return json({
        ok: true,
        complete,
        orders: next.count,
        pages: next.pages,
      });
    } catch (e) {
      const message =
        e instanceof HttpError
          ? e.message
          : 'Shopify could not refresh. The last complete dashboard is kept.';
      await statement(
        "UPDATE shopify_connections SET lock_id=NULL,lock_until=0,last_error=?,status=CASE WHEN ?=1 THEN 'reconnect' ELSE status END WHERE store_id=? AND lock_id=?",
        message,
        e instanceof HttpError && e.status === 401 ? 1 : 0,
        storeId,
        lockId,
      ).run();
      throw e instanceof HttpError ? e : new HttpError(502, message);
    }
  });
}
