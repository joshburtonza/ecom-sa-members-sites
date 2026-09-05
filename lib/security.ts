export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function requiredText(value: unknown, max = 200, min = 1): string {
  if (
    typeof value !== 'string' ||
    value.trim().length < min ||
    value.trim().length > max
  )
    throw new HttpError(400, `Use between ${min} and ${max} characters.`);
  return value.trim();
}
export async function hash(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
    ),
  )
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
}
export function secret(prefix: string) {
  return (
    prefix +
    Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map((x) => x.toString(16).padStart(2, '0'))
      .join('')
  );
}
export function validateEvent(
  input: Record<string, unknown>,
  now = Date.now(),
) {
  const external_id = requiredText(input.event_id, 128);
  if (input.kind !== 'sale' && input.kind !== 'refund')
    throw new HttpError(400, 'kind must be sale or refund.');
  if (
    !Number.isSafeInteger(input.amount_cents) ||
    Number(input.amount_cents) <= 0 ||
    Number(input.amount_cents) > 100_000_000
  )
    throw new HttpError(
      400,
      'amount_cents must be a positive integer, at most 100000000.',
    );
  if (input.currency !== 'ZAR')
    throw new HttpError(400, 'Only ZAR is supported.');
  if (
    typeof input.occurred_at !== 'string' ||
    !/(Z|[+-]\d{2}:\d{2})$/.test(input.occurred_at)
  )
    throw new HttpError(
      400,
      'occurred_at must be an ISO timestamp with a timezone.',
    );
  const occurred_at = Date.parse(input.occurred_at);
  if (
    !Number.isFinite(occurred_at) ||
    occurred_at > now + 300_000 ||
    occurred_at < Date.UTC(2020, 0, 1)
  )
    throw new HttpError(400, 'Invalid event date.');
  return {
    external_id,
    kind: input.kind,
    amount: Number(input.amount_cents) * (input.kind === 'refund' ? -1 : 1),
    currency: 'ZAR',
    occurred_at,
    note: input.note ? requiredText(input.note, 200) : '',
  };
}
export function monthStart(now = new Date()) {
  const sa = new Date(now.getTime() + 2 * 3600_000);
  return Date.UTC(sa.getUTCFullYear(), sa.getUTCMonth(), 1) - 2 * 3600_000;
}
export async function verifyHmac(
  body: string,
  signature: string,
  signingSecret: string,
) {
  try {
    const signatureBytes = Uint8Array.from(atob(signature), (x) =>
      x.charCodeAt(0),
    );
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(signingSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    return await crypto.subtle.verify(
      'HMAC',
      key,
      signatureBytes,
      new TextEncoder().encode(body),
    );
  } catch {
    return false;
  }
}
export async function crypt(
  value: string,
  encryptionKey: string,
  decrypt = false,
) {
  if (!/^[a-f0-9]{64}$/.test(encryptionKey))
    throw new HttpError(
      503,
      'Store connections are not configured by the administrator yet.',
    );
  const key = await crypto.subtle.importKey(
    'raw',
    Uint8Array.from(encryptionKey.match(/../g)!, (x) => parseInt(x, 16)),
    'AES-GCM',
    false,
    ['encrypt', 'decrypt'],
  );
  if (decrypt) {
    const bytes = Uint8Array.from(atob(value), (x) => x.charCodeAt(0));
    return new TextDecoder().decode(
      await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: bytes.slice(0, 12) },
        key,
        bytes.slice(12),
      ),
    );
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(value),
    ),
  );
  return btoa(String.fromCharCode(...iv, ...encrypted));
}
