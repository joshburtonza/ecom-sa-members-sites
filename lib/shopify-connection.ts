import { bindings, statement, member } from './server';
import { HttpError, crypt } from './security';
import { tokenRequest, tokenSet, type TokenSet } from './shopify-admin';
export function shopifyConfig() {
  const e = bindings();
  if (
    e.SHOPIFY_CONNECT_ENABLED !== 'true' ||
    !e.SHOPIFY_CLIENT_ID ||
    !e.SHOPIFY_CLIENT_SECRET ||
    !e.SHOPIFY_APP_ORIGIN ||
    !e.DATA_ENCRYPTION_KEY
  )
    throw new HttpError(
      503,
      'Shopify Connect is not enabled yet. The Ecom SA team needs to finish the Shopify app setup.',
    );
  const origin = new URL(e.SHOPIFY_APP_ORIGIN);
  if (
    origin.protocol !== 'https:' ||
    origin.origin !== e.SHOPIFY_APP_ORIGIN ||
    origin.username ||
    origin.password
  )
    throw new HttpError(
      503,
      'The Shopify app address is not configured correctly.',
    );
  return {
    clientId: e.SHOPIFY_CLIENT_ID,
    clientSecret: e.SHOPIFY_CLIENT_SECRET,
    origin: origin.origin,
    encryptionKey: e.DATA_ENCRYPTION_KEY,
  };
}
export function shopifyAvailable() {
  try {
    shopifyConfig();
    return true;
  } catch {
    return false;
  }
}
export async function ownedStore(id: string) {
  const me = await member();
  if (
    !(await statement(
      'SELECT id FROM stores WHERE id=? AND member_id=?',
      id,
      me.id,
    ).first())
  )
    throw new HttpError(404, 'Store not found.');
  return me;
}
export async function accessForSync(
  encrypted: string,
  domain: string,
  storeId: string,
  lockId: string,
) {
  const c = shopifyConfig();
  let t = JSON.parse(await crypt(encrypted, c.encryptionKey, true)) as TokenSet;
  if (t.expires_at > Date.now() + 120000) return t.access_token;
  if (!t.refresh_token || t.refresh_expires_at <= Date.now())
    throw new HttpError(401, 'Reconnect your store to renew Shopify access.');
  const response = await tokenRequest(domain, {
    client_id: c.clientId,
    client_secret: c.clientSecret,
    grant_type: 'refresh_token',
    refresh_token: t.refresh_token,
  });
  t = tokenSet({ ...response, scope: response.scope || t.scope });
  const encryptedNew = await crypt(JSON.stringify(t), c.encryptionKey);
  const saved = await statement(
    "UPDATE shopify_connections SET tokens=? WHERE store_id=? AND lock_id=? AND status='connected'",
    encryptedNew,
    storeId,
    lockId,
  ).run();
  if (!saved.meta.changes)
    throw new HttpError(
      409,
      'This connection changed while refreshing. Try again.',
    );
  return t.access_token;
}
