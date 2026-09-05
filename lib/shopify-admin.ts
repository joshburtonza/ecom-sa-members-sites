import { HttpError, verifyHmac } from './security';
export const SHOPIFY_API_VERSION = '2026-07';
export const ORDERS_QUERY = `query MemberStoreOrders($after: String, $query: String!) {
  orders(first: 100, after: $after, query: $query, sortKey: CREATED_AT, reverse: true) {
    nodes {
      id name createdAt test displayFinancialStatus displayFulfillmentStatus paymentGatewayNames
      totalReceivedSet { shopMoney { amount currencyCode } }
      totalRefundedSet { shopMoney { amount currencyCode } }
      totalOutstandingSet { shopMoney { amount currencyCode } }
    }
    pageInfo { hasNextPage endCursor }
  }
}`;
export function shopDomain(value: unknown) {
  if (typeof value !== 'string')
    throw new HttpError(400, 'Enter your store.myshopify.com address.');
  const domain = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,62}\.myshopify\.com$/.test(domain))
    throw new HttpError(
      400,
      'Use the original store.myshopify.com address, without https:// or a path.',
    );
  return domain;
}
export async function verifyShopifyCallback(
  query: URLSearchParams,
  clientSecret: string,
  now = Date.now(),
) {
  if ([...new Set(query.keys())].some((k) => query.getAll(k).length !== 1))
    return false;
  if (!/^\d+$/.test(query.get('timestamp') || '')) return false;
  if (Math.abs(now - Number(query.get('timestamp')) * 1000) > 600000)
    return false;
  const signature = query.get('hmac') || '';
  if (!/^[a-f0-9]{64}$/.test(signature)) return false;
  const message = [...query.entries()]
    .filter(([k]) => k !== 'hmac')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => k + '=' + v)
    .join('&');
  const bytes = signature.match(/../g)!.map((s) => parseInt(s, 16));
  return verifyHmac(message, btoa(String.fromCharCode(...bytes)), clientSecret);
}
export type TokenSet = {
  access_token: string;
  refresh_token: string;
  scope: string;
  expires_at: number;
  refresh_expires_at: number;
};
export function tokenSet(value: unknown, now = Date.now()): TokenSet {
  const v = value as Record<string, unknown>;
  if (
    !v ||
    typeof v.access_token !== 'string' ||
    !v.access_token ||
    typeof v.refresh_token !== 'string' ||
    !v.refresh_token ||
    !Number.isSafeInteger(v.expires_in) ||
    Number(v.expires_in) <= 0 ||
    Number(v.expires_in) > 86400 ||
    !Number.isSafeInteger(v.refresh_token_expires_in) ||
    Number(v.refresh_token_expires_in) <= 0 ||
    typeof v.scope !== 'string' ||
    !v.scope.split(',').includes('read_orders') ||
    v.scope.split(',').some((s) => s.startsWith('write_'))
  )
    throw new HttpError(
      502,
      'Shopify did not return the required read-only, expiring connection. Check the app configuration.',
    );
  return {
    access_token: v.access_token,
    refresh_token: v.refresh_token,
    scope: v.scope,
    expires_at: now + Number(v.expires_in) * 1000,
    refresh_expires_at: now + Number(v.refresh_token_expires_in) * 1000,
  };
}
export async function tokenRequest(
  domain: string,
  body: Record<string, string>,
  fetcher: typeof fetch = fetch,
) {
  const r = await fetcher(
    'https://' + shopDomain(domain) + '/admin/oauth/access_token',
    {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(20000),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams(body),
    },
  );
  if (r.status === 401 || r.status === 403)
    throw new HttpError(
      401,
      'Shopify access has expired or been revoked. Reconnect your store.',
    );
  if (!r.ok)
    throw new HttpError(
      502,
      'Shopify could not finish the connection. Try again later.',
    );
  return r.json() as Promise<Record<string, unknown>>;
}
type Money = { shopMoney: { amount: string; currencyCode: string } };
export type ShopifyOrder = {
  id: string;
  name: string;
  createdAt: string;
  test: boolean;
  displayFinancialStatus: string | null;
  displayFulfillmentStatus: string;
  paymentGatewayNames: string[];
  totalReceivedSet: Money;
  totalRefundedSet: Money;
  totalOutstandingSet: Money;
};
export type OrderCard = {
  id: string;
  name: string;
  createdAt: string;
  financial: string;
  fulfillment: string;
  gateways: string[];
  currency: string;
  received: number;
  refunded: number;
  outstanding: number;
};
export type MoneyTotals = {
  currency: string;
  orders: number;
  received: number;
  refunded: number;
  awaiting: number;
  owed: number;
};
export type StoreSnapshot = {
  since: string;
  until: string;
  count: number;
  totals: MoneyTotals[];
  orders: OrderCard[];
  cursor: string | null;
  pages: number;
};
export function emptySnapshot(now = Date.now()): StoreSnapshot {
  return {
    since: new Date(now - 30 * 86400000).toISOString(),
    until: new Date(now).toISOString(),
    count: 0,
    totals: [],
    orders: [],
    cursor: null,
    pages: 0,
  };
}
export function moneyMicros(s: string) {
  if (!/^-?\d+(\.\d{1,6})?$/.test(s))
    throw new HttpError(502, 'Shopify returned an unsupported money format.');
  const negative = s.startsWith('-');
  const [whole, fraction = ''] = s.replace('-', '').split('.');
  const n = Number(whole) * 1000000 + Number(fraction.padEnd(6, '0'));
  if (!Number.isSafeInteger(n))
    throw new HttpError(502, 'Money amount is outside the safe range.');
  return negative ? -n : n;
}
export function addOrders(
  snapshot: StoreSnapshot,
  input: ShopifyOrder[],
): StoreSnapshot {
  const result: StoreSnapshot = structuredClone(snapshot);
  for (const o of input) {
    if (o.test) continue;
    if (
      !/^gid:\/\/shopify\/Order\/\d+$/.test(o.id) ||
      !Number.isFinite(Date.parse(o.createdAt))
    )
      throw new HttpError(502, 'Shopify returned an invalid order.');
    const currency = o.totalReceivedSet.shopMoney.currencyCode;
    if (
      !/^[A-Z]{3}$/.test(currency) ||
      [o.totalRefundedSet, o.totalOutstandingSet].some(
        (m) => m.shopMoney.currencyCode !== currency,
      )
    )
      throw new HttpError(502, 'Shopify returned mismatched currencies.');
    const received = moneyMicros(o.totalReceivedSet.shopMoney.amount),
      refunded = moneyMicros(o.totalRefundedSet.shopMoney.amount),
      outstanding = moneyMicros(o.totalOutstandingSet.shopMoney.amount);
    if (received < 0 || refunded < 0)
      throw new HttpError(502, 'Invalid payment total.');
    let total = result.totals.find((t) => t.currency === currency);
    if (!total) {
      total = {
        currency,
        orders: 0,
        received: 0,
        refunded: 0,
        awaiting: 0,
        owed: 0,
      };
      result.totals.push(total);
    }
    total.orders++;
    total.received += received;
    total.refunded += refunded;
    total.awaiting += Math.max(0, outstanding);
    total.owed += Math.max(0, -outstanding);
    if (
      ![total.received, total.refunded, total.awaiting, total.owed].every(
        Number.isSafeInteger,
      )
    )
      throw new HttpError(502, 'Total is outside the safe range.');
    result.count++;
    if (result.orders.length < 100)
      result.orders.push({
        id: o.id,
        name: String(o.name).slice(0, 80),
        createdAt: o.createdAt,
        financial: o.displayFinancialStatus || 'UNKNOWN',
        fulfillment: o.displayFulfillmentStatus,
        gateways: o.paymentGatewayNames.map((s) => s.slice(0, 80)).slice(0, 10),
        currency,
        received,
        refunded,
        outstanding,
      });
  }
  result.pages++;
  return result;
}
export async function orderPage(
  domain: string,
  accessToken: string,
  snapshot: StoreSnapshot,
  fetcher: typeof fetch = fetch,
) {
  const r = await fetcher(
    'https://' +
      shopDomain(domain) +
      '/admin/api/' +
      SHOPIFY_API_VERSION +
      '/graphql.json',
    {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(20000),
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify({
        query: ORDERS_QUERY,
        variables: {
          after: snapshot.cursor,
          query: `created_at:>=${snapshot.since} created_at:<=${snapshot.until} test:false`,
        },
      }),
    },
  );
  if (r.status === 401 || r.status === 403)
    throw new HttpError(
      401,
      'Shopify access is unavailable. Reconnect, or check the app’s order-data approval.',
    );
  if (!r.ok)
    throw new HttpError(
      502,
      'Shopify could not refresh your orders. Your last complete update is kept.',
    );
  const v = (await r.json()) as {
    errors?: unknown[];
    data?: {
      orders?: {
        nodes: ShopifyOrder[];
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    };
  };
  const page = v.data?.orders;
  if (
    v.errors?.length ||
    !page ||
    !Array.isArray(page.nodes) ||
    page.nodes.length > 100 ||
    typeof page.pageInfo?.hasNextPage !== 'boolean'
  )
    throw new HttpError(
      502,
      'Shopify did not return a complete page. Check order-data permissions and try again.',
    );
  if (
    page.pageInfo.hasNextPage &&
    (!page.pageInfo.endCursor || page.pageInfo.endCursor === snapshot.cursor)
  )
    throw new HttpError(502, 'Shopify pagination did not advance.');
  const next = addOrders(snapshot, page.nodes);
  next.cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  if (next.pages >= 250 && next.cursor)
    throw new HttpError(
      413,
      'This store needs a bulk import. The last complete dashboard remains visible.',
    );
  return next;
}
