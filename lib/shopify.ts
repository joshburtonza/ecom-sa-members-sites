import { HttpError, validateEvent } from './security';
type Payload = Record<string, any>;
function cents(value: unknown) {
  const s = String(value);
  if (!/^\d+(\.\d{1,2})?$/.test(s))
    throw new HttpError(400, 'Invalid Shopify money amount.');
  const [whole, decimal = ''] = s.split('.');
  return Number(whole) * 100 + Number(decimal.padEnd(2, '0'));
}
function identifier(payload: Payload) {
  if (typeof payload.admin_graphql_api_id === 'string')
    return payload.admin_graphql_api_id;
  if (typeof payload.id === 'string' || Number.isSafeInteger(payload.id))
    return String(payload.id);
  throw new HttpError(400, 'Missing lossless Shopify event identifier.');
}
export function shopifyEvents(topic: string, p: Payload, now = Date.now()) {
  if (p.test === true) return [];
  if (topic === 'orders/paid') {
    if (p.financial_status !== 'paid' || p.cancelled_at) return [];
    const money = p.total_price_set?.shop_money || {
      amount: p.total_price,
      currency_code: p.currency,
    };
    if (money.currency_code !== 'ZAR') return [];
    const amount = cents(money.amount);
    if (!amount) return [];
    return [
      validateEvent(
        {
          event_id: 'shopify:order:' + identifier(p),
          kind: 'sale',
          amount_cents: amount,
          currency: 'ZAR',
          occurred_at: p.updated_at || p.processed_at || p.created_at,
        },
        now,
      ),
    ];
  }
  const transactions =
    topic === 'refunds/create'
      ? p.transactions
      : topic === 'order_transactions/create'
        ? [p]
        : [];
  if (!Array.isArray(transactions)) return [];
  return transactions
    .filter(
      (t) =>
        t.kind === 'refund' &&
        t.status === 'success' &&
        t.test !== true &&
        t.currency === 'ZAR',
    )
    .map((t) =>
      validateEvent(
        {
          event_id: 'shopify:refund-transaction:' + identifier(t),
          kind: 'refund',
          amount_cents: cents(t.amount),
          currency: 'ZAR',
          occurred_at: t.processed_at || t.created_at,
        },
        now,
      ),
    );
}
