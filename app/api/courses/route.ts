import {
  checkOrigin,
  member,
  jsonBody,
  statement,
  json,
  safely,
  log,
} from '../../../lib/server';
import { requiredText, HttpError } from '../../../lib/security';
export async function POST(request: Request) {
  return safely(async () => {
    checkOrigin(request);
    const me = await member(true);
    const b = await jsonBody(request);
    const id = b.id ? requiredText(b.id, 80) : crypto.randomUUID();
    const title = requiredText(b.title, 120);
    const position = Number(b.position || 0);
    if (!Number.isInteger(position) || position < 0 || position > 999)
      throw new HttpError(400, 'Position must be 0–999.');
    if (b.action === 'course') {
      if (
        b.id &&
        !(await statement('SELECT id FROM courses WHERE id=?', id).first())
      )
        throw new HttpError(404, 'Course not found.');
      await statement(
        'INSERT INTO courses(id,title,summary,level,published,position,created_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,summary=excluded.summary,level=excluded.level,published=excluded.published,position=excluded.position',
        id,
        title,
        requiredText(b.summary, 600, 0),
        requiredText(b.level, 40),
        b.published === true ? 1 : 0,
        position,
        Date.now(),
      ).run();
    } else if (b.action === 'module') {
      const courseId = requiredText(b.course_id, 80);
      if (
        !(await statement(
          'SELECT id FROM courses WHERE id=?',
          courseId,
        ).first())
      )
        throw new HttpError(404, 'Course not found.');
      if (
        b.id &&
        !(await statement(
          'SELECT id FROM course_modules WHERE id=? AND course_id=?',
          id,
          courseId,
        ).first())
      )
        throw new HttpError(404, 'Module not found in this course.');
      await statement(
        'INSERT INTO course_modules(id,course_id,title,position) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,position=excluded.position',
        id,
        courseId,
        title,
        position,
      ).run();
    } else throw new HttpError(400, 'Unknown action.');
    await log(me.id, 'save-' + b.action, id);
    return json({ ok: true, id });
  });
}
