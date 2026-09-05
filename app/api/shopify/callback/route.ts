import { member, statement, db } from '../../../../lib/server';
import { hash, crypt } from '../../../../lib/security';
import {
  shopDomain,
  verifyShopifyCallback,
  tokenRequest,
  tokenSet,
} from '../../../../lib/shopify-admin';
import { shopifyConfig } from '../../../../lib/shopify-connection';
export async function GET(request: Request) {
  let origin: string;
  try {
    origin = shopifyConfig().origin;
  } catch {
    return new Response('Shopify Connect is not configured.', { status: 503 });
  }
  const redirect = (outcome: string) =>
    new Response(null, {
      status: 303,
      headers: {
        Location: origin + '/?shopify=' + outcome + '#store',
        'Cache-Control': 'private, no-store',
        'Set-Cookie':
          'esa_shopify_state=; Path=/api/shopify; HttpOnly; Secure; SameSite=Lax; Max-Age=0',
        'Referrer-Policy': 'no-referrer',
      },
    });
  try {
    const c = shopifyConfig(),
      me = await member(),
      url = new URL(request.url),
      q = url.searchParams;
    if (
      url.origin !== origin ||
      !(await verifyShopifyCallback(q, c.clientSecret))
    )
      return redirect('invalid');
    const state = q.get('state') || '',
      cookie = request.headers
        .get('cookie')
        ?.split(';')
        .map((s) => s.trim())
        .find((s) => s.startsWith('esa_shopify_state='))
        ?.slice('esa_shopify_state='.length);
    if (!/^[a-f0-9]{64}$/.test(state) || cookie !== state)
      return redirect('invalid');
    const domain = shopDomain(q.get('shop')),
      code = q.get('code');
    if (!code || code.length > 500) return redirect('invalid');
    const claim = await statement(
      'DELETE FROM shopify_states WHERE state_hash=? AND member_id=? AND domain=? AND expires_at>? RETURNING store_id',
      await hash(state),
      me.id,
      domain,
      Date.now(),
    ).first<{ store_id: string }>();
    if (
      !claim ||
      !(await statement(
        'SELECT id FROM stores WHERE id=? AND member_id=?',
        claim.store_id,
        me.id,
      ).first())
    )
      return redirect('invalid');
    const occupied = await statement(
      'SELECT store_id FROM shopify_connections WHERE domain=? AND store_id<>?',
      domain,
      claim.store_id,
    ).first();
    if (occupied) return redirect('assigned');
    // Reserve ownership before token exchange. A domain cannot belong to two member profiles.
    const reserved = await statement(
      "INSERT INTO shopify_connections(store_id,domain,status,lock_id,lock_until) VALUES(?,?,'connecting',?,?) ON CONFLICT(store_id) DO UPDATE SET domain=excluded.domain,status='connecting',lock_id=excluded.lock_id,lock_until=excluded.lock_until WHERE shopify_connections.lock_until<?",
      claim.store_id,
      domain,
      state,
      Date.now() + 90000,
      Date.now(),
    ).run();
    if (!reserved.meta.changes) return redirect('busy');
    try {
      const tokens = tokenSet(
        await tokenRequest(domain, {
          client_id: c.clientId,
          client_secret: c.clientSecret,
          code,
          expiring: '1',
        }),
      );
      const saved = await statement(
        "UPDATE shopify_connections SET tokens=?,status='connected',connected_at=?,snapshot=NULL,snapshot_at=NULL,pending=NULL,last_attempt=0,last_error=NULL,lock_id=NULL,lock_until=0 WHERE store_id=? AND lock_id=? AND EXISTS(SELECT 1 FROM members WHERE id=? AND status='active')",
        await crypt(JSON.stringify(tokens), c.encryptionKey),
        Date.now(),
        claim.store_id,
        state,
        me.id,
      ).run();
      if (!saved.meta.changes) return redirect('invalid');
      return redirect('connected');
    } catch {
      await statement(
        "UPDATE shopify_connections SET tokens=NULL,status='reconnect',last_error='Shopify authorization could not finish. Please reconnect.',lock_id=NULL,lock_until=0 WHERE store_id=? AND lock_id=?",
        claim.store_id,
        state,
      ).run();
      return redirect('failed');
    }
  } catch {
    return redirect('failed');
  }
}
