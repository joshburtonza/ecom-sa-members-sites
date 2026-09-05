import {
  bindings,
  db,
  statement,
  json,
  safely,
  limitedBody,
} from '../../../../../lib/server';
import { HttpError, crypt, verifyHmac } from '../../../../../lib/security';
import { shopifyEvents } from '../../../../../lib/shopify';
export async function POST(
  request: Request,
  { params }: { params: Promise<{ storeId: string }> },
) {
  return safely(async () => {
    const { storeId } = await params;
    const store = await statement(
      "SELECT s.id,s.domain,s.webhook_secret FROM stores s JOIN members m ON m.id=s.member_id WHERE s.id=? AND m.status='active'",
      storeId,
    ).first<{ id: string; domain: string; webhook_secret: string }>();
    if (!store?.webhook_secret)
      throw new HttpError(401, 'Webhook connection not available.');
    if (
      request.headers.get('x-shopify-shop-domain')?.toLowerCase() !==
      store.domain
    )
      throw new HttpError(401, 'Store does not match this connection.');
    const raw = await limitedBody(request, 2 * 1024 * 1024);
    if (
      !(await verifyHmac(
        raw,
        request.headers.get('x-shopify-hmac-sha256') || '',
        await crypt(
          store.webhook_secret,
          bindings().DATA_ENCRYPTION_KEY || '',
          true,
        ),
      ))
    )
      throw new HttpError(401, 'Invalid webhook signature.');
    const topic = request.headers.get('x-shopify-topic') || '';
    if (
      !['orders/paid', 'refunds/create', 'order_transactions/create'].includes(
        topic,
      )
    )
      return json({ ignored: true, reason: 'Topic not supported' });
    let payload;
    try {
      payload = JSON.parse(raw);
      if (!payload || typeof payload !== 'object') throw Error();
    } catch {
      throw new HttpError(400, 'Invalid JSON.');
    }
    const entries = shopifyEvents(topic, payload);
    if (!entries.length)
      return json({
        accepted: true,
        recorded: 0,
        reason:
          'No supported real ZAR paid sale or successful refund in this event.',
      });
    const results = await db().batch(
      entries.map((e) =>
        statement(
          "INSERT OR IGNORE INTO events(id,store_id,external_id,kind,amount,currency,source,note,occurred_at,received_at) VALUES(?,?,?,?,?,?,'shopify','',?,?)",
          crypto.randomUUID(),
          store.id,
          e.external_id,
          e.kind,
          e.amount,
          e.currency,
          e.occurred_at,
          Date.now(),
        ),
      ),
    );
    return json({
      accepted: true,
      recorded: results.reduce((n, r) => n + (r.meta.changes || 0), 0),
    });
  });
}
