import {
  member,
  bindings,
  statement,
  checkOrigin,
  safely,
  json,
} from '../../../lib/server';
import { HttpError } from '../../../lib/security';
import { imageMime } from '../../../lib/ad-review';
export async function POST(request: Request) {
  return safely(async () => {
    checkOrigin(request);
    const me = await member();
    // Read a raw file with a streaming cap, rather than buffering unbounded multipart data.
    const reader = request.body?.getReader();
    if (!reader) throw new HttpError(400, 'Choose an image.');
    let size = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2 * 1024 * 1024) {
        await reader.cancel();
        throw new HttpError(413, 'Keep screenshots under 2 MB.');
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const c of chunks) {
      bytes.set(c, offset);
      offset += c.length;
    }
    const mime = imageMime(bytes);
    if (!mime) throw new HttpError(400, 'Upload a PNG, JPG or WebP image.');
    const id = crypto.randomUUID();
    const reserved = await statement(
      'INSERT INTO review_assets(id,member_id,mime,size,created_at) SELECT ?,?,?,?,? WHERE (SELECT COUNT(*) FROM review_assets WHERE member_id=?)<120',
      id,
      me.id,
      mime,
      size,
      Date.now(),
      me.id,
    ).run();
    if (!reserved.meta.changes)
      throw new HttpError(
        429,
        'Screenshot storage limit reached. Contact the team.',
      );
    try {
      await bindings().FILES.put('reviews/' + id, bytes, {
        httpMetadata: { contentType: mime },
      });
    } catch (e) {
      await statement(
        'DELETE FROM review_assets WHERE id=? AND member_id=?',
        id,
        me.id,
      ).run();
      throw e;
    }
    return json({ id }, 201);
  });
}
export async function GET(request: Request) {
  return safely(async () => {
    const me = await member();
    const id = new URL(request.url).searchParams.get('id') || '';
    const asset = await statement(
      'SELECT mime FROM review_assets WHERE id=? AND member_id=?',
      id,
      me.id,
    ).first<{ mime: string }>();
    if (!asset) throw new HttpError(404, 'Screenshot not found.');
    const object = await bindings().FILES.get('reviews/' + id);
    if (!object) throw new HttpError(404, 'Screenshot not found.');
    return new Response(object.body, {
      headers: {
        'Content-Type': asset.mime,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': 'inline',
      },
    });
  });
}
