import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../app/chatgpt-auth';
import { HttpError } from './security';
export type Member = {
  id: string;
  name: string;
  bio: string;
  email: string;
  role: string;
  status: string;
  leaderboard: number;
  joined_at: number;
};
export const bindings = () =>
  env as unknown as {
    DB: D1Database;
    FILES: R2Bucket;
    ADMIN_EMAIL?: string;
    DATA_ENCRYPTION_KEY?: string;
  };
export const db = () => bindings().DB;
export const statement = (sql: string, ...values: (string | number | null)[]) =>
  db()
    .prepare(sql)
    .bind(...values);
export async function rows<T = Record<string, unknown>>(
  sql: string,
  ...values: (string | number | null)[]
) {
  return (await statement(sql, ...values).all<T>()).results;
}
export async function currentMember(): Promise<Member | null> {
  const identity = await getChatGPTUser();
  if (!identity) return null;
  const adminEmail = bindings().ADMIN_EMAIL?.toLowerCase();
  if (adminEmail && identity.email.toLowerCase() === adminEmail) {
    await statement(
      "INSERT INTO members(id,email,name,role,status,joined_at) VALUES(?,?,?,'admin','active',?) ON CONFLICT(id) DO NOTHING",
      identity.userId,
      identity.email.toLowerCase(),
      identity.fullName || 'Joshua',
      Date.now(),
    ).run();
  }
  return statement(
    'SELECT * FROM members WHERE id=?',
    identity.userId,
  ).first<Member>();
}
export async function member(admin = false) {
  const m = await currentMember();
  if (!m)
    throw new HttpError(401, 'Sign in with your invited account to continue.');
  if (m.status !== 'active')
    throw new HttpError(403, 'Your membership is not active. Contact Ecom SA.');
  if (admin && m.role !== 'admin')
    throw new HttpError(403, 'Administrator access required.');
  return m;
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(request.url).origin)
    throw new HttpError(
      403,
      'This action must be sent from the member dashboard.',
    );
}
export async function limitedBody(request: Request, maxBytes: number) {
  if (Number(request.headers.get('content-length') || 0) > maxBytes)
    throw new HttpError(413, 'Request is too large.');
  const reader = request.body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder();
  let size = 0,
    result = '';
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new HttpError(413, 'Request is too large.');
    }
    result += decoder.decode(part.value, { stream: true });
  }
  return result + decoder.decode();
}
export async function jsonBody(request: Request) {
  const raw = await limitedBody(request, 16_384);
  try {
    const b = JSON.parse(raw);
    if (!b || typeof b !== 'object' || Array.isArray(b)) throw Error();
    return b;
  } catch {
    throw new HttpError(400, 'Send a JSON object.');
  }
}
export function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
export async function safely(fn: () => Promise<Response>) {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(
      'Member hub request failed',
      e instanceof Error ? e.name : 'unknown',
    );
    return json(
      {
        error:
          'Something did not save. Please try again. If it persists, contact Ecom SA.',
      },
      500,
    );
  }
}
export async function log(actor: string, action: string, target: string) {
  await statement(
    'INSERT INTO audit(id,actor,action,target,created_at) VALUES(?,?,?,?,?)',
    crypto.randomUUID(),
    actor,
    action,
    target,
    Date.now(),
  ).run();
}
