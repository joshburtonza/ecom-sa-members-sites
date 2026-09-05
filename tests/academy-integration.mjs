import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
const origin = 'http://localhost:3210';
const directory = '.wrangler/state/v3/d1/miniflare-D1DatabaseObject';
const sql = new DatabaseSync(
  directory +
    '/' +
    readdirSync(directory).find((s) => /^[a-f0-9]{64}\.sqlite$/.test(s)),
);
sql.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON');
const prefix = 'academy-test-' + randomUUID();
const ids = {
  course: prefix + '-c',
  module: prefix + '-m',
  lesson: prefix + '-l',
  other: prefix + '-other',
  otherReview: prefix + '-review',
  post: prefix + '-post',
};
let courseId, moduleId, draftId;
let count = 0;
const pass = (s) => {
  count++;
  console.log('PASS ' + s);
};
async function req(path, body, auth = true, customOrigin = origin) {
  const r = await fetch(origin + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      ...(auth ? { Cookie: '__sites_local_auth=1' } : {}),
      ...(body
        ? { 'Content-Type': 'application/json', Origin: customOrigin }
        : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await r.text();
  let bodyValue;
  try {
    bodyValue = JSON.parse(text);
  } catch {
    bodyValue = { error: text };
  }
  return { status: r.status, body: bodyValue };
}
const initial = (await req('/api/hub')).body;
assert.equal(initial.me?.id, 'local_seedy', 'Local fixture identity only');
assert.equal(initial.me?.role, 'admin', 'Run as local fixture admin');
const original = { ...initial.me };
const draft = {
  action: 'save',
  title: 'Integration fixture',
  kind: 'ad',
  audience: 'Fixture audience',
  offer: 'Fixture offer',
  copy: 'Fixture ad copy',
};
try {
  assert.equal((await req('/api/reviews', null, false)).status, 401);
  assert.equal(
    (await req('/api/courses', { action: 'course', title: 'Bad' }, false))
      .status,
    401,
  );
  assert.equal(
    (await req('/api/reviews', draft, true, 'https://evil.example')).status,
    403,
  );
  pass('Anonymous access and cross-origin writes are blocked');
  let r = await req('/api/courses', {
    action: 'course',
    title: 'Fixture course',
    summary: 'Fixture',
    level: 'Test',
    published: false,
  });
  assert.equal(r.status, 200);
  courseId = r.body.id;
  r = await req('/api/courses', {
    action: 'module',
    course_id: courseId,
    title: 'Fixture module',
  });
  assert.equal(r.status, 200);
  moduleId = r.body.id;
  r = await req('/api/hub', {
    action: 'lesson',
    id: ids.lesson,
    title: 'Fixture lesson',
    category: 'Fixture',
    body: 'Fixture content',
    duration: 5,
    published: true,
    course_id: courseId,
    module_id: moduleId,
  });
  assert.equal(r.status, 200);
  pass('Admin can create course, module and assigned lesson');
  r = await req('/api/hub', {
    action: 'lesson',
    title: 'Bad',
    category: 'Fixture',
    body: 'Fixture',
    duration: 5,
    published: true,
    module_id: moduleId,
  });
  assert.equal(r.status, 400);
  pass('A lesson cannot use a module outside its course');
  sql.prepare("UPDATE members SET role='member' WHERE id=?").run(original.id);
  r = await req('/api/hub');
  assert.equal(
    r.body.lessons.some((l) => l.id === ids.lesson),
    false,
  );
  assert.equal(
    r.body.courses.some((c) => c.id === courseId),
    false,
  );
  assert.equal(
    r.body.modules.some((m) => m.id === moduleId),
    false,
  );
  assert.equal(
    (
      await req('/api/hub', {
        action: 'complete',
        id: ids.lesson,
        completed: true,
      })
    ).status,
    404,
  );
  assert.equal(
    (await req('/api/courses', { action: 'course', title: 'Bad' })).status,
    403,
  );
  pass(
    'Draft parent course hides lessons, modules and completion actions from members',
  );
  sql.prepare('UPDATE courses SET published=1 WHERE id=?').run(courseId);
  assert.equal(
    (await req('/api/hub')).body.lessons.some((l) => l.id === ids.lesson),
    true,
  );
  assert.equal(
    (
      await req('/api/hub', {
        action: 'complete',
        id: ids.lesson,
        completed: true,
      })
    ).status,
    200,
  );
  await req('/api/hub', {
    action: 'complete',
    id: ids.lesson,
    completed: true,
  });
  assert.equal(
    sql
      .prepare(
        'SELECT COUNT(*) n FROM completions WHERE member_id=? AND lesson_id=?',
      )
      .get(original.id, ids.lesson).n,
    1,
  );
  pass('Published lessons open and completion is persisted without duplicates');
  await req('/api/hub', {
    action: 'profile',
    name: original.name,
    bio: original.bio,
    leaderboard: !!original.leaderboard,
    activity_leaderboard: false,
  });
  assert.equal(
    (await req('/api/hub?period=all')).body.learningBoard.some(
      (m) => m.id === original.id,
    ),
    false,
  );
  await req('/api/hub', {
    action: 'profile',
    name: original.name,
    bio: original.bio,
    leaderboard: !!original.leaderboard,
    activity_leaderboard: true,
  });
  assert.ok(
    (await req('/api/hub?period=all')).body.learningBoard.find(
      (m) => m.id === original.id,
    )?.points >= 1,
  );
  pass('Learning leaderboard is opt-in and uses completed lessons');
  sql
    .prepare('INSERT INTO members(id,email,name,joined_at) VALUES(?,?,?,?)')
    .run(ids.other, ids.other + '@example.test', 'Other fixture', Date.now());
  sql
    .prepare(
      "INSERT INTO posts(id,member_id,channel,body,created_at) VALUES(?,?,'general','Fixture only',?)",
    )
    .run(ids.post, original.id, Date.now());
  const before =
    (await req('/api/hub?period=all')).body.helpfulBoard.find(
      (m) => m.id === original.id,
    )?.points || 0;
  sql
    .prepare('INSERT INTO reactions(post_id,member_id) VALUES(?,?)')
    .run(ids.post, original.id);
  assert.equal(
    (await req('/api/hub?period=all')).body.helpfulBoard.find(
      (m) => m.id === original.id,
    )?.points || 0,
    before,
  );
  sql
    .prepare('INSERT INTO reactions(post_id,member_id) VALUES(?,?)')
    .run(ids.post, ids.other);
  assert.equal(
    (await req('/api/hub?period=all')).body.helpfulBoard.find(
      (m) => m.id === original.id,
    )?.points,
    before + 1,
  );
  pass('Helpful rankings count distinct other members, never self-likes');
  r = await req('/api/reviews', draft);
  assert.equal(r.status, 200);
  draftId = r.body.id;
  assert.ok(
    (await req('/api/reviews')).body.reviews.some((r) => r.id === draftId),
  );
  assert.equal(
    (
      await req('/api/reviews', {
        ...draft,
        id: draftId,
        copy: 'Updated fixture copy',
      })
    ).status,
    200,
  );
  assert.equal(
    sql.prepare('SELECT copy FROM ad_reviews WHERE id=?').get(draftId).copy,
    'Updated fixture copy',
  );
  pass('Private ad drafts save, reload and update durably');
  sql
    .prepare(
      "INSERT INTO ad_reviews(id,member_id,title,kind,audience,offer,copy,created_at,updated_at) VALUES(?,?,'Other fixture','ad','Fixture','Fixture','Private fixture',?,?)",
    )
    .run(ids.otherReview, ids.other, Date.now(), Date.now());
  assert.equal(
    (await req('/api/reviews')).body.reviews.some(
      (r) => r.id === ids.otherReview,
    ),
    false,
  );
  assert.equal(
    (await req('/api/reviews', { ...draft, id: ids.otherReview })).status,
    409,
  );
  assert.equal(
    (await req('/api/reviews', { ...draft, parent_id: ids.otherReview }))
      .status,
    404,
  );
  assert.equal(
    (await req('/api/review-assets?id=' + ids.otherReview)).status,
    404,
  );
  pass('Other members cannot read, overwrite or fork private work');
  const availability = (await req('/api/reviews')).body.available;
  assert.equal(
    availability,
    false,
    'This integration suite must not use a live AI key',
  );
  assert.equal(
    (
      await req('/api/reviews', {
        action: 'analyze',
        id: draftId,
        consent: true,
      })
    ).status,
    503,
  );
  assert.equal(
    sql
      .prepare('SELECT status,score,result FROM ad_reviews WHERE id=?')
      .get(draftId).score,
    null,
  );
  assert.equal(
    sql.prepare('SELECT status FROM ad_reviews WHERE id=?').get(draftId).status,
    'draft',
  );
  pass('Disconnected AI returns a clear blocker and never fabricates a score');
  sql
    .prepare("UPDATE members SET status='suspended' WHERE id=?")
    .run(original.id);
  assert.equal((await req('/api/reviews')).status, 403);
  assert.equal((await req('/api/reviews', draft)).status, 403);
  pass('Suspension revokes access to saved reviews and new writes');
} finally {
  // Remove only this run's exact fixture records; never wipe member data.
  sql.prepare('DELETE FROM reactions WHERE post_id=?').run(ids.post);
  sql.prepare('DELETE FROM posts WHERE id=?').run(ids.post);
  sql.prepare('DELETE FROM completions WHERE lesson_id=?').run(ids.lesson);
  sql.prepare('DELETE FROM lessons WHERE id=?').run(ids.lesson);
  if (moduleId)
    sql.prepare('DELETE FROM course_modules WHERE id=?').run(moduleId);
  if (courseId) sql.prepare('DELETE FROM courses WHERE id=?').run(courseId);
  if (draftId) sql.prepare('DELETE FROM ad_reviews WHERE id=?').run(draftId);
  sql.prepare('DELETE FROM ad_reviews WHERE id=?').run(ids.otherReview);
  sql.prepare('DELETE FROM members WHERE id=?').run(ids.other);
  sql
    .prepare(
      'UPDATE members SET role=?,status=?,name=?,bio=?,leaderboard=?,activity_leaderboard=? WHERE id=?',
    )
    .run(
      original.role,
      original.status,
      original.name,
      original.bio,
      original.leaderboard,
      original.activity_leaderboard,
      original.id,
    );
  sql.close();
}
console.log(
  count +
    ' academy integration checks passed. Test records removed; original local profile restored.',
);
