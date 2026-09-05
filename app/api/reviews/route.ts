import {
  bindings,
  member,
  rows,
  statement,
  db,
  checkOrigin,
  jsonBody,
  json,
  safely,
} from '../../../lib/server';
import { HttpError, requiredText } from '../../../lib/security';
import {
  generateReview,
  reviewScore,
  validateDraft,
} from '../../../lib/ad-review';
export async function GET() {
  return safely(async () => {
    const me = await member();
    const reviews = await rows(
      'SELECT * FROM ad_reviews WHERE member_id=? ORDER BY created_at DESC LIMIT 100',
      me.id,
    );
    const used = await statement(
      'SELECT COUNT(*) n FROM review_usage WHERE member_id=? AND created_at>=?',
      me.id,
      Date.now() - 86400000,
    ).first<{ n: number }>();
    return json({
      reviews,
      available: !!bindings().OPENAI_API_KEY,
      remaining: Math.max(0, 3 - (used?.n || 0)),
      admin: me.role === 'admin',
    });
  });
}
export async function POST(request: Request) {
  return safely(async () => {
    checkOrigin(request);
    const me = await member();
    const b = await jsonBody(request);
    const now = Date.now();
    if (b.action === 'save') {
      const v = validateDraft(b);
      if (
        v.asset_id &&
        !(await statement(
          'SELECT id FROM review_assets WHERE id=? AND member_id=?',
          v.asset_id,
          me.id,
        ).first())
      )
        throw new HttpError(404, 'Screenshot not found.');
      if (
        v.parent_id &&
        !(await statement(
          'SELECT id FROM ad_reviews WHERE id=? AND member_id=?',
          v.parent_id,
          me.id,
        ).first())
      )
        throw new HttpError(404, 'Original review not found.');
      const id = b.id ? requiredText(b.id, 80) : crypto.randomUUID();
      if (b.id) {
        const result = await statement(
          "UPDATE ad_reviews SET title=?,kind=?,audience=?,offer=?,copy=?,asset_id=?,updated_at=? WHERE id=? AND member_id=? AND status='draft'",
          v.title,
          v.kind,
          v.audience,
          v.offer,
          v.copy,
          v.asset_id,
          now,
          id,
          me.id,
        ).run();
        if (!result.meta.changes)
          throw new HttpError(
            409,
            'Only your unreviewed drafts can be edited. Make a new version instead.',
          );
      } else {
        const result = await statement(
          'INSERT INTO ad_reviews(id,member_id,title,kind,audience,offer,copy,asset_id,parent_id,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM ad_reviews WHERE member_id=?)<100',
          id,
          me.id,
          v.title,
          v.kind,
          v.audience,
          v.offer,
          v.copy,
          v.asset_id,
          v.parent_id,
          now,
          now,
          me.id,
        ).run();
        if (!result.meta.changes)
          throw new HttpError(
            429,
            'Your workspace holds up to 100 drafts and reviews. Contact the team for more space.',
          );
      }
      return json({ id, ok: true });
    }
    if (b.action !== 'analyze') throw new HttpError(400, 'Unknown action.');
    const apiKey = bindings().OPENAI_API_KEY;
    if (!apiKey)
      throw new HttpError(
        503,
        'AI reviews are not connected yet. Your draft is safely saved.',
      );
    if (b.consent !== true)
      throw new HttpError(
        400,
        'Confirm that this material can be sent to OpenAI.',
      );
    const id = requiredText(b.id, 80);
    let draft = await statement(
      'SELECT * FROM ad_reviews WHERE id=? AND member_id=?',
      id,
      me.id,
    ).first<Record<string, unknown>>();
    if (!draft) throw new HttpError(404, 'Draft not found.');
    // Recover interrupted work after two minutes. Never automatically retry a billed request.
    await statement(
      "UPDATE ad_reviews SET status='failed',error='The last review was interrupted. You can retry.',updated_at=? WHERE id=? AND member_id=? AND status='running' AND updated_at<?",
      now,
      id,
      me.id,
      now - 120000,
    ).run();
    const usageId = crypto.randomUUID();
    const model = bindings().OPENAI_REVIEW_MODEL || 'gpt-4.1-mini';
    // D1 batch serializes the reservation and status claim. A duplicate cannot spend twice.
    const claimed = await db().batch([
      statement(
        "INSERT INTO review_usage(id,member_id,created_at) SELECT ?,?,? WHERE (SELECT COUNT(*) FROM review_usage WHERE member_id=? AND created_at>=?)<3 AND (SELECT COUNT(*) FROM review_usage WHERE created_at>=?)<60 AND EXISTS(SELECT 1 FROM ad_reviews WHERE id=? AND member_id=? AND status IN ('draft','failed'))",
        usageId,
        me.id,
        now,
        me.id,
        now - 86400000,
        now - 86400000,
        id,
        me.id,
      ),
      statement(
        "UPDATE ad_reviews SET status='running',model=?,error=NULL,updated_at=? WHERE id=? AND member_id=? AND status IN ('draft','failed') AND EXISTS(SELECT 1 FROM review_usage WHERE id=?)",
        model,
        now,
        id,
        me.id,
        usageId,
      ),
    ]);
    if (!claimed[1].meta.changes)
      throw new HttpError(
        429,
        'This review is already running or complete, or the review limit has been reached. Limits: 3 per member and 60 for the community in 24 hours.',
      );
    try {
      // Read the immutable claimed version, not a draft that could have changed before reservation.
      draft = await statement(
        'SELECT * FROM ad_reviews WHERE id=? AND member_id=?',
        id,
        me.id,
      ).first<Record<string, unknown>>();
      if (!draft) throw Error('Draft missing');
      const validatedDraft = validateDraft(draft);
      let image: { mime: string; bytes: Uint8Array } | undefined;
      if (validatedDraft.asset_id) {
        const asset = await statement(
          'SELECT mime FROM review_assets WHERE id=? AND member_id=?',
          validatedDraft.asset_id,
          me.id,
        ).first<{ mime: string }>();
        const object = asset
          ? await bindings().FILES.get('reviews/' + validatedDraft.asset_id)
          : null;
        if (!asset || !object) throw Error('Missing image');
        image = {
          mime: asset.mime,
          bytes: new Uint8Array(await object.arrayBuffer()),
        };
      }
      const result = await generateReview(
        { apiKey, model },
        validatedDraft,
        image,
      );
      await statement(
        "UPDATE ad_reviews SET status='complete',result=?,score=?,updated_at=? WHERE id=? AND member_id=? AND status='running'",
        JSON.stringify(result),
        reviewScore(result),
        Date.now(),
        id,
        me.id,
      ).run();
      return json({ ok: true, id });
    } catch {
      await statement(
        "UPDATE ad_reviews SET status='failed',error=?,updated_at=? WHERE id=? AND member_id=?",
        'The AI could not finish this review. Your draft is safe. The attempt counts toward your daily limit; retry later.',
        Date.now(),
        id,
        me.id,
      ).run();
      throw new HttpError(
        502,
        'The AI could not finish. Your draft is safe. Please try later.',
      );
    }
  });
}
