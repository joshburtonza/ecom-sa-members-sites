import { statement, jsonBody, json, safely } from '../../../../lib/server';
import { HttpError, hash, validateEvent } from '../../../../lib/security';
export async function POST(request: Request) {
  return safely(async () => {
    const token = request.headers.get('authorization')?.replace(/^Bearer /, '');
    if (!token || !token.startsWith('esa_live_'))
      throw new HttpError(401, 'A member API key is required.');
    const key = await statement(
      "SELECT k.id,k.store_id FROM api_keys k JOIN stores s ON s.id=k.store_id JOIN members m ON m.id=s.member_id WHERE k.token_hash=? AND k.revoked=0 AND k.expires_at>? AND m.status='active'",
      await hash(token),
      Date.now(),
    ).first<{ id: string; store_id: string }>();
    if (!key)
      throw new HttpError(401, 'This key is invalid, expired or revoked.');
    const bucket = Math.floor(Date.now() / 60000);
    const limit = await statement(
      'UPDATE api_keys SET requests=CASE WHEN bucket=? THEN requests+1 ELSE 1 END,bucket=?,last_used=? WHERE id=? AND (bucket!=? OR requests<120)',
      bucket,
      bucket,
      Date.now(),
      key.id,
      bucket,
    ).run();
    if (!limit.meta.changes)
      throw new HttpError(
        429,
        'Limit: 120 requests per minute. Retry after one minute.',
      );
    const e = validateEvent(await jsonBody(request));
    const old = await statement(
      'SELECT id,kind,amount,currency,occurred_at,source FROM events WHERE store_id=? AND external_id=?',
      key.store_id,
      'api:' + e.external_id,
    ).first<{
      id: string;
      kind: string;
      amount: number;
      currency: string;
      occurred_at: number;
      source: string;
    }>();
    if (old) {
      if (
        old.kind !== e.kind ||
        old.amount !== e.amount ||
        old.currency !== e.currency ||
        old.occurred_at !== e.occurred_at
      )
        throw new HttpError(
          409,
          'This event_id already exists with different data. Use a new event_id for a correction and contact the admin to void the original.',
        );
      return json({ id: old.id, duplicate: true });
    }
    const id = crypto.randomUUID();
    const result = await statement(
      "INSERT OR IGNORE INTO events(id,store_id,external_id,kind,amount,currency,source,note,occurred_at,received_at) VALUES(?,?,?,?,?,?,'api',?,?,?)",
      id,
      key.store_id,
      'api:' + e.external_id,
      e.kind,
      e.amount,
      e.currency,
      e.note,
      e.occurred_at,
      Date.now(),
    ).run();
    if (!result.meta.changes) {
      const raced = await statement(
        'SELECT id,kind,amount,currency,occurred_at FROM events WHERE store_id=? AND external_id=?',
        key.store_id,
        'api:' + e.external_id,
      ).first<{
        id: string;
        kind: string;
        amount: number;
        currency: string;
        occurred_at: number;
      }>();
      if (
        !raced ||
        raced.kind !== e.kind ||
        raced.amount !== e.amount ||
        raced.currency !== e.currency ||
        raced.occurred_at !== e.occurred_at
      )
        throw new HttpError(
          409,
          'This event_id already exists with different data.',
        );
      return json({ id: raced.id, duplicate: true });
    }
    return json(
      {
        id: result.meta.changes
          ? id
          : (
              await statement(
                'SELECT id FROM events WHERE store_id=? AND external_id=?',
                key.store_id,
                'api:' + e.external_id,
              ).first<{ id: string }>()
            )?.id,
        duplicate: !result.meta.changes,
      },
      result.meta.changes ? 201 : 200,
    );
  });
}
