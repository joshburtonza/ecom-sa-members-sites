import assert from 'node:assert/strict';
import {
  validateDraft,
  validateReview,
  reviewScore,
  generateReview,
  imageMime,
  criteria,
} from '../lib/ad-review';
let checks = 0;
function pass(name: string) {
  console.log('PASS ' + name);
  checks++;
}
const draft = {
  title: 'Fixture ad',
  kind: 'ad',
  audience: 'New store owners',
  offer: 'A R99 guide',
  copy: 'Start your first product page.',
};
assert.equal(validateDraft(draft).asset_id, null);
assert.throws(() => validateDraft({ ...draft, kind: 'https://internal' }));
assert.throws(() => validateDraft({ ...draft, copy: 'x'.repeat(6001) }));
pass('Draft type and input length validation');
const result = {
  summary: 'Test fixture only.',
  dimensions: criteria.map((criterion) => ({
    criterion,
    score: 6,
    reason: 'Fixture reason',
  })),
  fixes: ['Fixture fix'],
  headline: 'Fixture headline',
  primary_text: 'Fixture text',
  cta: 'Fixture CTA',
  test: 'Fixture test',
  cautions: ['Fixture caveat'],
};
assert.equal(reviewScore(validateReview(result)), 60);
assert.throws(() =>
  validateReview({
    ...result,
    dimensions: result.dimensions.map((d) => ({ ...d, criterion: 'hook' })),
  }),
);
assert.throws(() =>
  validateReview({
    ...result,
    dimensions: result.dimensions.map((d) => ({ ...d, score: 11 })),
  }),
);
assert.throws(() => validateReview({ ...result, fixes: [] }));
pass('Strict dimensions, bounded scores and server-derived total');
assert.equal(
  imageMime(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0])),
  'image/png',
);
assert.equal(imageMime(new TextEncoder().encode('<svg>bad</svg>')), null);
pass('Image signatures reject active SVG content');
let sent: Record<string, any> = {};
const mock = async (url: string | URL | Request, init?: RequestInit) => {
  assert.equal(url, 'https://api.openai.com/v1/responses');
  sent = JSON.parse(String(init?.body));
  return Response.json({
    status: 'completed',
    output: [
      {
        type: 'message',
        content: [{ type: 'output_text', text: JSON.stringify(result) }],
      },
    ],
  });
};
const response = await generateReview(
  { apiKey: 'fixture-only-not-a-real-key', model: 'gpt-4.1-mini' },
  validateDraft(draft),
  undefined,
  mock as typeof fetch,
);
assert.equal(reviewScore(response), 60);
assert.equal(sent.store, false);
assert.equal(sent.text.format.strict, true);
assert.equal(sent.max_output_tokens, 3000);
assert.equal(sent.tools, undefined);
assert.equal(
  JSON.stringify(sent).includes('fixture-only-not-a-real-key'),
  false,
);
pass(
  'Mock provider contract: fixed endpoint, no stored response, strict JSON, no credential in payload',
);
await generateReview(
  { apiKey: 'fixture', model: 'fixture' },
  validateDraft(draft),
  { mime: 'image/png', bytes: new Uint8Array([137, 80, 78, 71]) },
  mock as typeof fetch,
);
assert.match(sent.input[0].content[1].image_url, /^data:image\/png;base64,/);
pass('Private image is supplied inline, never as a public bucket URL');
await assert.rejects(() =>
  generateReview(
    { apiKey: 'fixture', model: 'fixture' },
    validateDraft(draft),
    undefined,
    (async () =>
      Response.json({
        status: 'completed',
        output: [
          { type: 'message', content: [{ type: 'refusal', refusal: 'No' }] },
        ],
      })) as typeof fetch,
  ),
);
await assert.rejects(() =>
  generateReview(
    { apiKey: 'fixture', model: 'fixture' },
    validateDraft(draft),
    undefined,
    (async () =>
      Response.json({ status: 'incomplete', output: [] })) as typeof fetch,
  ),
);
await assert.rejects(() =>
  generateReview(
    { apiKey: 'fixture', model: 'fixture' },
    validateDraft(draft),
    undefined,
    (async () =>
      new Response('private provider detail', { status: 429 })) as typeof fetch,
  ),
);
pass(
  'Refusal, incomplete output and provider failures never turn into fake reviews',
);
console.log(
  checks + ' academy unit checks passed (mock AI only; no live provider call).',
);
