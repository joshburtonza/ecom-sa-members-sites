import { getChatGPTUser } from '../../chatgpt-auth';
import {
  bindings,
  db,
  statement,
  rows,
  currentMember,
  member,
  checkOrigin,
  jsonBody,
  json,
  safely,
  log,
} from '../../../lib/server';
import {
  HttpError,
  requiredText,
  hash,
  secret,
  validateEvent,
  monthStart,
  crypt,
} from '../../../lib/security';
export const dynamic = 'force-dynamic';
const channels = [
  'general',
  'wins',
  'store-feedback',
  'help-desk',
  'announcements',
];
export async function GET(request: Request) {
  return safely(async () => {
    const identity = await getChatGPTUser();
    const me = await currentMember();
    if (!me)
      return json({
        me: null,
        signedIn: !!identity,
        invitedEmail: identity?.email || null,
      });
    if (me.status !== 'active')
      return json({ me: null, signedIn: true, suspended: true }, 403);
    const query = new URL(request.url).searchParams;
    if (query.get('thread')) {
      const id = query.get('thread')!;
      return json({
        replies: await rows(
          'SELECT p.id,p.body,p.created_at,p.member_id,m.name,m.role FROM posts p JOIN members m ON m.id=p.member_id WHERE p.parent_id=? ORDER BY p.created_at LIMIT 100',
          id,
        ),
      });
    }
    const channel = channels.includes(query.get('channel') || '')
      ? query.get('channel')!
      : 'general';
    const since = query.get('period') === 'all' ? 0 : monthStart();
    const reviewed = query.get('ranking') === 'reviewed';
    const [
      posts,
      lessons,
      stores,
      keys,
      events,
      leaderboard,
      members,
      counts,
      chart,
    ] = await Promise.all([
      rows(
        'SELECT p.*,m.name,m.role,(SELECT COUNT(*) FROM reactions WHERE post_id=p.id) reactions,(SELECT COUNT(*) FROM reactions WHERE post_id=p.id AND member_id=?) reacted,(SELECT COUNT(*) FROM posts r WHERE r.parent_id=p.id) replies FROM posts p JOIN members m ON m.id=p.member_id WHERE p.channel=? AND p.parent_id IS NULL ORDER BY p.pinned DESC,p.created_at DESC LIMIT 80',
        me.id,
        channel,
      ),
      rows(
        "SELECT l.*,a.mime,a.name asset_name,(SELECT COUNT(*) FROM completions c WHERE c.lesson_id=l.id AND c.member_id=?) completed FROM lessons l LEFT JOIN assets a ON a.id=l.asset_id LEFT JOIN courses co ON co.id=l.course_id WHERE (l.published=1 AND (l.course_id IS NULL OR co.published=1)) OR ?='admin' ORDER BY l.position,l.created_at",
        me.id,
        me.role,
      ),
      rows(
        'SELECT id,name,domain,CASE WHEN webhook_secret IS NULL THEN 0 ELSE 1 END connected FROM stores WHERE member_id=? ORDER BY created_at',
        me.id,
      ),
      rows(
        'SELECT k.id,k.store_id,k.name,k.prefix,k.created_at,k.expires_at,k.revoked,k.last_used FROM api_keys k JOIN stores s ON s.id=k.store_id WHERE s.member_id=? ORDER BY k.created_at DESC',
        me.id,
      ),
      rows(
        'SELECT e.*,s.name store_name FROM events e JOIN stores s ON s.id=e.store_id WHERE s.member_id=? ORDER BY e.occurred_at DESC LIMIT 100',
        me.id,
      ),
      rows(
        "SELECT m.id,m.name,m.bio,COALESCE(SUM(e.amount),0) revenue,COUNT(CASE WHEN e.kind='sale' THEN 1 END) orders,COUNT(CASE WHEN e.reviewed_by IS NOT NULL THEN 1 END) reviewed FROM members m JOIN stores s ON s.member_id=m.id JOIN events e ON e.store_id=s.id WHERE m.status='active' AND m.leaderboard=1 AND e.voided=0 AND e.currency='ZAR' AND e.occurred_at>=? AND (?=0 OR e.reviewed_by IS NOT NULL OR e.kind='refund') GROUP BY m.id ORDER BY revenue DESC,m.joined_at ASC LIMIT 100",
        since,
        reviewed ? 1 : 0,
      ),
      rows(
        "SELECT id,name,bio,role,joined_at FROM members WHERE status='active' ORDER BY joined_at LIMIT 200",
      ),
      statement(
        "SELECT (SELECT COUNT(*) FROM posts WHERE member_id=? AND parent_id IS NULL) posts,(SELECT COUNT(*) FROM completions WHERE member_id=?) completed,(SELECT COUNT(*) FROM events e JOIN stores s ON s.id=e.store_id WHERE s.member_id=? AND e.voided=0 AND e.kind='sale') orders,(SELECT COALESCE(SUM(e.amount),0) FROM events e JOIN stores s ON s.id=e.store_id WHERE s.member_id=? AND e.voided=0) revenue",
        me.id,
        me.id,
        me.id,
        me.id,
      ).first(),
      rows(
        "SELECT strftime('%Y-%m-%d',(e.occurred_at/1000)+7200,'unixepoch') day,SUM(e.amount) revenue FROM events e JOIN stores s ON s.id=e.store_id WHERE s.member_id=? AND e.voided=0 AND e.occurred_at>=? GROUP BY day ORDER BY day",
        me.id,
        monthStart(),
      ),
    ]);
    const admin =
      me.role === 'admin'
        ? {
            invites: await rows(
              'SELECT id,email,expires_at,used_by,revoked FROM invites ORDER BY created_at DESC LIMIT 100',
            ),
            members: await rows(
              'SELECT id,name,email,role,status,joined_at FROM members ORDER BY joined_at DESC LIMIT 200',
            ),
            events: await rows(
              'SELECT e.*,m.name FROM events e JOIN stores s ON s.id=e.store_id JOIN members m ON m.id=s.member_id WHERE e.reviewed_by IS NULL AND e.voided=0 ORDER BY e.received_at DESC LIMIT 100',
            ),
            audit: await rows(
              'SELECT action,target,created_at FROM audit ORDER BY created_at DESC LIMIT 30',
            ),
          }
        : null;
    return json({
      me,
      posts,
      lessons,
      stores,
      keys,
      events,
      leaderboard,
      members,
      counts,
      chart,
      admin,
      updatedAt: Date.now(),
      connectionsAvailable: !!bindings().DATA_ENCRYPTION_KEY,
      courses: await rows(
        "SELECT * FROM courses WHERE published=1 OR ?='admin' ORDER BY position,created_at",
        me.role,
      ),
      modules: await rows(
        "SELECT cm.* FROM course_modules cm JOIN courses co ON co.id=cm.course_id WHERE co.published=1 OR ?='admin' ORDER BY cm.position,cm.title",
        me.role,
      ),
      learningBoard: await rows(
        "SELECT m.id,m.name,COUNT(c.lesson_id) points FROM members m JOIN completions c ON c.member_id=m.id JOIN lessons l ON l.id=c.lesson_id LEFT JOIN courses co ON co.id=l.course_id WHERE m.status='active' AND m.activity_leaderboard=1 AND l.published=1 AND (l.course_id IS NULL OR co.published=1) AND c.completed_at>=? GROUP BY m.id ORDER BY points DESC,m.joined_at LIMIT 100",
        since,
      ),
      helpfulBoard: await rows(
        "SELECT m.id,m.name,COUNT(DISTINCT r.member_id) points FROM members m JOIN posts p ON p.member_id=m.id JOIN reactions r ON r.post_id=p.id JOIN members voter ON voter.id=r.member_id WHERE m.status='active' AND m.activity_leaderboard=1 AND voter.status='active' AND r.member_id<>m.id AND p.created_at>=? GROUP BY m.id ORDER BY points DESC,m.joined_at LIMIT 100",
        since,
      ),
    });
  });
}
export async function POST(request: Request) {
  return safely(async () => {
    checkOrigin(request);
    const b = await jsonBody(request);
    const action = requiredText(b.action, 50);
    const now = Date.now();
    if (action === 'redeem') {
      const identity = await getChatGPTUser();
      if (!identity) throw new HttpError(401, 'Sign in first.');
      const existing = await currentMember();
      if (existing)
        throw new HttpError(409, 'This account already has a membership.');
      const tokenHash = await hash(requiredText(b.token, 100));
      const invite = await statement(
        'SELECT id FROM invites WHERE token_hash=? AND email=? AND used_by IS NULL AND revoked=0 AND expires_at>?',
        tokenHash,
        identity.email.toLowerCase(),
        now,
      ).first<{ id: string }>();
      if (!invite)
        throw new HttpError(
          400,
          'This invitation is expired, used, or belongs to a different email address.',
        );
      await db().batch([
        statement(
          'INSERT INTO members(id,email,name,joined_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM invites WHERE id=? AND used_by IS NULL AND revoked=0 AND expires_at>?)',
          identity.userId,
          identity.email.toLowerCase(),
          requiredText(b.name, 50),
          now,
          invite.id,
          now,
        ),
        statement(
          'UPDATE invites SET used_by=? WHERE id=? AND used_by IS NULL',
          identity.userId,
          invite.id,
        ),
      ]);
      return json({ ok: true });
    }
    const me = await member();
    if (action === 'profile') {
      await statement(
        'UPDATE members SET name=?,bio=?,leaderboard=?,activity_leaderboard=? WHERE id=?',
        requiredText(b.name, 50),
        typeof b.bio === 'string' ? requiredText(b.bio, 240, 0) : '',
        b.leaderboard === true ? 1 : 0,
        b.activity_leaderboard === true ? 1 : 0,
        me.id,
      ).run();
    } else if (action === 'post') {
      const channel = requiredText(b.channel, 30);
      if (!channels.includes(channel))
        throw new HttpError(400, 'Unknown channel.');
      if (channel === 'announcements' && me.role !== 'admin')
        throw new HttpError(403, 'Only the team can post announcements.');
      const last = await statement(
        'SELECT created_at FROM posts WHERE member_id=? ORDER BY created_at DESC LIMIT 1',
        me.id,
      ).first<{ created_at: number }>();
      if (last && now - last.created_at < 3000)
        throw new HttpError(429, 'Give it a moment before posting again.');
      const parent = b.parent_id ? requiredText(b.parent_id, 80) : null;
      if (
        parent &&
        !(await statement(
          'SELECT id FROM posts WHERE id=? AND parent_id IS NULL AND channel=?',
          parent,
          channel,
        ).first())
      )
        throw new HttpError(404, 'Thread not found.');
      await statement(
        'INSERT INTO posts(id,member_id,channel,parent_id,body,created_at) VALUES(?,?,?,?,?,?)',
        crypto.randomUUID(),
        me.id,
        channel,
        parent,
        requiredText(b.body, 4000),
        now,
      ).run();
    } else if (action === 'react') {
      const id = requiredText(b.id, 80);
      if (!(await statement('SELECT id FROM posts WHERE id=?', id).first()))
        throw new HttpError(404, 'Post not found.');
      if (b.active === true)
        await statement(
          'INSERT OR IGNORE INTO reactions(post_id,member_id) VALUES(?,?)',
          id,
          me.id,
        ).run();
      else
        await statement(
          'DELETE FROM reactions WHERE post_id=? AND member_id=?',
          id,
          me.id,
        ).run();
    } else if (action === 'delete-post') {
      const id = requiredText(b.id, 80);
      const post = await statement(
        'SELECT member_id FROM posts WHERE id=?',
        id,
      ).first<{ member_id: string }>();
      if (!post || (post.member_id !== me.id && me.role !== 'admin'))
        throw new HttpError(403, 'You can only delete your own posts.');
      await db().batch([
        statement('DELETE FROM posts WHERE parent_id=?', id),
        statement('DELETE FROM posts WHERE id=?', id),
      ]);
      await log(me.id, action, id);
    } else if (action === 'complete') {
      const id = requiredText(b.id, 80);
      if (
        !(await statement(
          'SELECT l.id FROM lessons l LEFT JOIN courses co ON co.id=l.course_id WHERE l.id=? AND l.published=1 AND (l.course_id IS NULL OR co.published=1)',
          id,
        ).first())
      )
        throw new HttpError(404, 'Published lesson not found.');
      if (b.completed === true)
        await statement(
          'INSERT OR IGNORE INTO completions(member_id,lesson_id,completed_at) VALUES(?,?,?)',
          me.id,
          id,
          now,
        ).run();
      else
        await statement(
          'DELETE FROM completions WHERE member_id=? AND lesson_id=?',
          me.id,
          id,
        ).run();
    } else if (action === 'store') {
      const count = await statement(
        'SELECT COUNT(*) n FROM stores WHERE member_id=?',
        me.id,
      ).first<{ n: number }>();
      if ((count?.n || 0) >= 5)
        throw new HttpError(400, 'Each member can connect up to five stores.');
      await statement(
        'INSERT INTO stores(id,member_id,name,created_at) VALUES(?,?,?,?)',
        crypto.randomUUID(),
        me.id,
        requiredText(b.name, 80),
        now,
      ).run();
    } else if (['key', 'shopify', 'manual-event'].includes(action)) {
      const storeId = requiredText(b.store_id, 80);
      if (
        !(await statement(
          'SELECT id FROM stores WHERE id=? AND member_id=?',
          storeId,
          me.id,
        ).first())
      )
        throw new HttpError(404, 'Store not found.');
      if (action === 'key') {
        const count = await statement(
          'SELECT COUNT(*) n FROM api_keys WHERE store_id=? AND revoked=0 AND expires_at>?',
          storeId,
          now,
        ).first<{ n: number }>();
        if ((count?.n || 0) >= 5)
          throw new HttpError(
            400,
            'Revoke an old key first. Each store can have five active keys.',
          );
        const token = secret('esa_live_');
        await statement(
          'INSERT INTO api_keys(id,store_id,token_hash,prefix,name,created_at,expires_at) VALUES(?,?,?,?,?,?,?)',
          crypto.randomUUID(),
          storeId,
          await hash(token),
          token.slice(0, 17),
          requiredText(b.name, 60),
          now,
          now + 90 * 86400_000,
        ).run();
        await log(me.id, 'create-key', storeId);
        return json({ token });
      }
      if (action === 'shopify') {
        if (b.disconnect === true)
          await statement(
            'UPDATE stores SET domain=NULL,webhook_secret=NULL WHERE id=?',
            storeId,
          ).run();
        else {
          const domain = requiredText(b.domain, 120).toLowerCase();
          if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain))
            throw new HttpError(
              400,
              'Use your store-name.myshopify.com domain.',
            );
          const encrypted = await crypt(
            requiredText(b.signing_secret, 200),
            bindings().DATA_ENCRYPTION_KEY || '',
          );
          await statement(
            'UPDATE stores SET domain=?,webhook_secret=? WHERE id=?',
            domain,
            encrypted,
            storeId,
          ).run();
        }
        await log(me.id, 'shopify-connection', storeId);
      }
      if (action === 'manual-event') {
        const e = validateEvent({
          ...b,
          event_id: 'manual:' + crypto.randomUUID(),
        });
        await statement(
          'INSERT INTO events(id,store_id,external_id,kind,amount,currency,source,note,occurred_at,received_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
          crypto.randomUUID(),
          storeId,
          e.external_id,
          e.kind,
          e.amount,
          e.currency,
          'manual',
          e.note,
          e.occurred_at,
          now,
        ).run();
      }
    } else if (action === 'revoke-key') {
      const id = requiredText(b.id, 80);
      await statement(
        'UPDATE api_keys SET revoked=1 WHERE id=? AND store_id IN(SELECT id FROM stores WHERE member_id=?)',
        id,
        me.id,
      ).run();
      await log(me.id, action, id);
    } else {
      if (me.role !== 'admin')
        throw new HttpError(403, 'Administrator access required.');
      if (action === 'invite') {
        const email = requiredText(b.email, 254).toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
          throw new HttpError(400, 'Enter a valid email.');
        if (
          await statement('SELECT id FROM members WHERE email=?', email).first()
        )
          throw new HttpError(409, 'That email is already a member.');
        const token = secret('invite_');
        await statement(
          'INSERT INTO invites(id,email,token_hash,expires_at,created_at) VALUES(?,?,?,?,?)',
          crypto.randomUUID(),
          email,
          await hash(token),
          now + 7 * 86400_000,
          now,
        ).run();
        await log(me.id, 'invite', email);
        return json({
          inviteUrl: new URL('/?invite=' + token, request.url).href,
        });
      } else if (action === 'revoke-invite') {
        await statement(
          'UPDATE invites SET revoked=1 WHERE id=?',
          requiredText(b.id, 80),
        ).run();
      } else if (action === 'member-status') {
        const id = requiredText(b.id, 80);
        if (id === me.id)
          throw new HttpError(400, 'You cannot suspend yourself.');
        if (!['active', 'suspended'].includes(b.status))
          throw new HttpError(400, 'Invalid status.');
        await statement(
          "UPDATE members SET status=? WHERE id=? AND role!='admin'",
          b.status,
          id,
        ).run();
        await log(me.id, action, id);
      } else if (action === 'pin') {
        await statement(
          'UPDATE posts SET pinned=? WHERE id=?',
          b.pinned === true ? 1 : 0,
          requiredText(b.id, 80),
        ).run();
      } else if (action === 'lesson') {
        const id = b.id ? requiredText(b.id, 80) : crypto.randomUUID();
        const assetId = b.asset_id ? requiredText(b.asset_id, 80) : null;
        if (
          assetId &&
          !(await statement(
            'SELECT id FROM assets WHERE id=?',
            assetId,
          ).first())
        )
          throw new HttpError(400, 'Upload the file first.');
        const duration = Number(b.duration);
        const courseId = b.course_id ? requiredText(b.course_id, 80) : null;
        const moduleId = b.module_id ? requiredText(b.module_id, 80) : null;
        if (
          courseId &&
          !(await statement(
            'SELECT id FROM courses WHERE id=?',
            courseId,
          ).first())
        )
          throw new HttpError(400, 'Choose an existing course.');
        if (
          moduleId &&
          !(await statement(
            'SELECT id FROM course_modules WHERE id=? AND course_id=?',
            moduleId,
            courseId,
          ).first())
        )
          throw new HttpError(400, 'Choose a module in this course.');
        const position = Number(b.position || 0);
        if (!Number.isInteger(position) || position < 0 || position > 999)
          throw new HttpError(400, 'Position must be 0–999.');
        if (!Number.isInteger(duration) || duration < 1 || duration > 600)
          throw new HttpError(400, 'Lesson duration must be 1–600 minutes.');
        await statement(
          'INSERT INTO lessons(id,title,category,body,duration,position,published,asset_id,created_at,course_id,module_id) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,category=excluded.category,body=excluded.body,duration=excluded.duration,position=excluded.position,published=excluded.published,asset_id=excluded.asset_id,course_id=excluded.course_id,module_id=excluded.module_id',
          id,
          requiredText(b.title, 120),
          requiredText(b.category, 60),
          requiredText(b.body, 10000),
          duration,
          position,
          b.published === true ? 1 : 0,
          assetId,
          now,
          courseId,
          moduleId,
        ).run();
        await log(me.id, 'save-lesson', id);
      } else if (action === 'review-event') {
        const id = requiredText(b.id, 80);
        await statement(
          'UPDATE events SET reviewed_by=?,voided=? WHERE id=?',
          b.voided === true ? null : me.id,
          b.voided === true ? 1 : 0,
          id,
        ).run();
        await log(me.id, b.voided === true ? 'void-event' : 'review-event', id);
      } else throw new HttpError(400, 'Unknown action.');
    }
    return json({ ok: true });
  });
}
