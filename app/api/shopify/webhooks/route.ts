import {
  bindings,
  db,
  statement,
  limitedBody,
  json,
  safely,
} from '../../../../lib/server';
import { HttpError, verifyHmac } from '../../../../lib/security';
import { shopDomain } from '../../../../lib/shopify-admin';
export async function POST(request: Request) {
  return safely(async () => {
    const signingSecret = bindings().SHOPIFY_CLIENT_SECRET;
    if (!signingSecret)
      throw new HttpError(503, 'Shopify app is not configured.');
    const raw = await limitedBody(request, 2 * 1024 * 1024);
    if (
      !(await verifyHmac(
        raw,
        request.headers.get('x-shopify-hmac-sha256') || '',
        signingSecret,
      ))
    )
      throw new HttpError(401, 'Invalid signature.');
    const domain = shopDomain(request.headers.get('x-shopify-shop-domain'));
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(raw);
      if (!payload || typeof payload !== 'object' || Array.isArray(payload))
        throw Error();
    } catch {
      throw new HttpError(400, 'Invalid webhook.');
    }
    const topic = request.headers.get('x-shopify-topic');
    if (topic === 'app/uninstalled' || topic === 'shop/redact') {
      const bodyDomain =
        topic === 'app/uninstalled'
          ? payload.myshopify_domain
          : payload.shop_domain;
      if (bodyDomain !== domain)
        throw new HttpError(401, 'Store does not match payload.');
      // Stale uninstall deliveries must not revoke a later reinstall.
      const triggered = Date.parse(
        request.headers.get('x-shopify-triggered-at') || '',
      );
      if (topic === 'app/uninstalled' && !Number.isFinite(triggered))
        throw new HttpError(400, 'Missing event time.');
      await db().batch([
        statement(
          "UPDATE shopify_connections SET tokens=NULL,status='disconnected',snapshot=NULL,snapshot_at=NULL,pending=NULL,lock_id=NULL,lock_until=0,last_error=NULL WHERE domain=? AND (?='shop/redact' OR connected_at<=?)",
          domain,
          topic,
          Number.isFinite(triggered) ? triggered : Date.now(),
        ),
        statement('DELETE FROM shopify_states WHERE domain=?', domain),
        statement(
          "DELETE FROM shopify_connections WHERE domain=? AND ?='shop/redact'",
          domain,
          topic,
        ),
      ]);
      return json({ ok: true });
    }
    if (topic === 'customers/data_request' || topic === 'customers/redact') {
      if (payload.shop_domain !== domain)
        throw new HttpError(401, 'Store does not match payload.');
      if (topic === 'customers/redact') {
        // We cannot map a customer to orders because customer identifiers are never requested.
        // Clear the entire private order cache rather than risk retaining a matching order summary.
        await statement(
          'UPDATE shopify_connections SET snapshot=NULL,snapshot_at=NULL,pending=NULL,lock_id=NULL,lock_until=0 WHERE domain=?',
          domain,
        ).run();
      }
      // No customer IDs, names, contacts, addresses or customer-level records are requested or persisted.
      return json({ ok: true, customer_records_stored: false });
    }
    return json({ ignored: true });
  });
}
