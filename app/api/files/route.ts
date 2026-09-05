import {
  member,
  bindings,
  statement,
  checkOrigin,
  json,
  safely,
} from '../../../lib/server';
import { HttpError } from '../../../lib/security';
const types = [
  'application/pdf',
  'video/mp4',
  'video/webm',
  'image/jpeg',
  'image/png',
  'image/webp',
];
export async function POST(request: Request) {
  return safely(async () => {
    checkOrigin(request);
    await member(true);
    if (Number(request.headers.get('content-length') || 0) > 30 * 1024 * 1024)
      throw new HttpError(413, 'Maximum upload size is 30 MB.');
    const form = await request.formData();
    const file = form.get('file');
    if (
      !(file instanceof File) ||
      file.size > 30 * 1024 * 1024 ||
      file.size === 0
    )
      throw new HttpError(400, 'Choose a file between 1 byte and 30 MB.');
    if (!types.includes(file.type))
      throw new HttpError(400, 'Use PDF, MP4, WebM, JPG, PNG or WebP.');
    const id = crypto.randomUUID();
    const name = file.name.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 120);
    await bindings().FILES.put(id, file.stream(), {
      httpMetadata: { contentType: file.type },
    });
    try {
      await statement(
        'INSERT INTO assets(id,name,mime,size,created_at) VALUES(?,?,?,?,?)',
        id,
        name,
        file.type,
        file.size,
        Date.now(),
      ).run();
    } catch (e) {
      await bindings().FILES.delete(id);
      throw e;
    }
    return json({ id, name, mime: file.type }, 201);
  });
}
export async function GET(request: Request) {
  return safely(async () => {
    const me = await member();
    const id = new URL(request.url).searchParams.get('id') || '';
    const asset = await statement(
      "SELECT a.* FROM assets a WHERE a.id=? AND (?='admin' OR EXISTS(SELECT 1 FROM lessons l WHERE l.asset_id=a.id AND l.published=1))",
      id,
      me.role,
    ).first<{ id: string; name: string; mime: string; size: number }>();
    if (!asset) throw new HttpError(404, 'File not found.');
    const object = await bindings().FILES.get(id, { range: request.headers });
    if (!object) throw new HttpError(404, 'File not found.');
    const headers = new Headers({
      'Content-Type': asset.mime,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition':
        (asset.mime === 'application/pdf' ? 'attachment' : 'inline') +
        '; filename="' +
        asset.name +
        '"',
      'Accept-Ranges': 'bytes',
    });
    let status = 200;
    if (
      request.headers.has('range') &&
      object.range &&
      'offset' in object.range
    ) {
      const offset = object.range.offset || 0;
      const length = object.range.length || asset.size;
      headers.set(
        'Content-Range',
        `bytes ${offset}-${offset + length - 1}/${asset.size}`,
      );
      headers.set('Content-Length', String(length));
      status = 206;
    }
    return new Response(object.body, { status, headers });
  });
}
