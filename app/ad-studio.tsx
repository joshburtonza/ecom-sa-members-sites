'use client';
import { useState, useEffect, useCallback, type FormEvent } from 'react';
import {
  Sparkles,
  ArrowUpRight,
  ArrowLeft,
  Plus,
  Lock,
  Upload,
  CheckCircle2,
  Copy,
  RefreshCw,
  FileText,
  X,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Progress } from '../components/ui/progress';
import { Checkbox } from '../components/ui/checkbox';
import type { ReviewResult } from '../lib/ad-review';
type Review = {
  id: string;
  title: string;
  kind: string;
  audience: string;
  offer: string;
  copy: string;
  asset_id: string | null;
  parent_id: string | null;
  status: string;
  score: number | null;
  result: string | null;
  error: string | null;
  created_at: number;
};
type Draft = Partial<Review>;
type State = {
  reviews: Review[];
  available: boolean;
  remaining: number;
  admin: boolean;
};
const labels: Record<string, string> = {
  ad: 'Ad creative',
  landing: 'Landing page',
  offer: 'Offer',
  clarity: 'Easy to understand',
  hook: 'Gets attention',
  proof: 'Reason to believe',
  action: 'Clear next step',
};
const date = (n: number) =>
  new Date(n).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
const blank = (): Draft => ({
  kind: 'ad',
  title: '',
  audience: '',
  offer: '',
  copy: '',
  asset_id: null,
});
export default function AdStudio() {
  const [state, setState] = useState<State | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [selected, setSelected] = useState('');
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [consent, setConsent] = useState(false);
  const load = useCallback(async () => {
    const r = await fetch('/api/reviews', { cache: 'no-store' });
    const data = (await r.json()) as State & { error?: string };
    if (!r.ok) {
      if (r.status === 401 || r.status === 403) setState(null);
      throw Error(data.error || 'Your workspace could not load.');
    }
    setState(data);
    return data as State;
  }, []);
  useEffect(() => {
    let active = true;
    load().catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [load]);
  const item = state?.reviews.find((r) => r.id === selected);
  const previous = state?.reviews.find((r) => r.id === item?.parent_id);
  let result: ReviewResult | null = null;
  if (item?.result) {
    try {
      result = JSON.parse(item.result);
    } catch {
      /* Show original draft if saved result cannot be read. */
    }
  }
  const update = (key: keyof Draft, value: unknown) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  function create(value?: Draft) {
    setDraft(value || blank());
    setSelected('');
    setConsent(false);
    setError('');
    setNote('');
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setBusy(true);
    setError('');
    setNote('');
    try {
      const r = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...draft, action: 'save' }),
      });
      const value = (await r.json()) as { id: string; error?: string };
      if (!r.ok) throw Error(value.error);
      await load();
      setDraft(null);
      setSelected(value.id);
      setConsent(false);
      setNote('Draft saved. Only you can see it.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function analyze() {
    if (!item || !consent) return;
    setBusy(true);
    setError('');
    setNote('Reviewing your creative. This may take up to a minute…');
    try {
      const r = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'analyze', id: item.id, consent: true }),
      });
      const value = (await r.json()) as { error?: string };
      if (!r.ok) throw Error(value.error);
      await load();
      setNote('Your review is ready. Start with the first fix.');
    } catch (e) {
      setError((e as Error).message);
      setNote('');
      await load().catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNote('Copied. Check every claim before you publish.');
    } catch {
      setError('Copy was blocked. Select the text and copy it manually.');
    }
  }
  const visible =
    state?.reviews.filter(
      (r) =>
        filter === 'all' ||
        (filter === 'complete'
          ? r.status === 'complete'
          : r.status !== 'complete'),
    ) || [];
  return (
    <div className="studio">
      <div className="feature-heading">
        <div>
          <span className="eyebrow">A SECOND PAIR OF EYES</span>
          <h2>Before you spend on ads.</h2>
          <p>
            Find what is confusing. Fix what matters. Test a clearer version.
          </p>
        </div>
        <span className="private-tag">
          <Lock size={14} />
          Private workspace
        </span>
      </div>
      {error && (
        <div className="notice error mb-4" role="alert">
          {error}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setError('');
              load().catch((e) => setError(e.message));
            }}
          >
            Refresh
          </Button>
        </div>
      )}
      {note && (
        <p className="notice mb-4" role="status">
          {note}
        </p>
      )}
      {state && !state.available && (
        <div className="connection-banner">
          <Sparkles />
          <div>
            <strong>Drafts are ready. AI reviews are not connected yet.</strong>
            <p>
              {state.admin
                ? 'Connect an OpenAI API key securely in the site environment to enable reviews. Never paste a key into a member form.'
                : 'The team is setting up AI reviews. Save your ad here in the meantime.'}
            </p>
          </div>
        </div>
      )}
      {!state ? (
        <p role="status">
          {error
            ? 'Your review workspace is unavailable. Refresh to try again.'
            : 'Loading your review workspace…'}
        </p>
      ) : draft ? (
        <section className="panel panel-pad">
          <Button
            variant="ghost"
            onClick={() => {
              setDraft(null);
              setError('');
            }}
            disabled={busy || uploading}
          >
            <ArrowLeft /> Back to workspace
          </Button>
          <form className="form studio-form" onSubmit={save}>
            <Tabs
              value={draft.kind}
              onValueChange={(v) => update('kind', String(v))}
            >
              <TabsList>
                <TabsTrigger value="ad">Ad creative</TabsTrigger>
                <TabsTrigger value="landing">Landing page</TabsTrigger>
                <TabsTrigger value="offer">Offer</TabsTrigger>
              </TabsList>
            </Tabs>
            <label className="form-label" htmlFor="review-title">
              Give this version a name
              <Input
                required
                maxLength={100}
                id="review-title"
                value={draft.title || ''}
                onChange={(e) => update('title', e.target.value)}
                placeholder="Summer offer · version 1"
              />
            </label>
            <div className="studio-fields">
              <label className="form-label" htmlFor="review-audience">
                Who is this for?
                <Textarea
                  required
                  maxLength={600}
                  id="review-audience"
                  value={draft.audience || ''}
                  onChange={(e) => update('audience', e.target.value)}
                  placeholder="Who are they? What are they struggling with?"
                />
              </label>
              <label className="form-label" htmlFor="review-offer">
                What are you selling?
                <Textarea
                  required
                  maxLength={1000}
                  id="review-offer"
                  value={draft.offer || ''}
                  onChange={(e) => update('offer', e.target.value)}
                  placeholder="The product, price and why someone would want it."
                />
              </label>
            </div>
            <label className="form-label" htmlFor="review-copy">
              {draft.kind === 'landing'
                ? 'Paste the page copy'
                : draft.kind === 'offer'
                  ? 'Paste your offer and call to action'
                  : 'Paste your ad copy'}
              <Textarea
                required
                minLength={1}
                maxLength={6000}
                id="review-copy"
                className="min-h-[180px]"
                value={draft.copy || ''}
                onChange={(e) => update('copy', e.target.value)}
                placeholder="Headline, main text, button. Use what your customer will actually see."
              />
            </label>
            <div className="upload-zone">
              <Upload className="text-primary" />
              <div>
                <strong>Add the creative or a page screenshot</strong>
                <p>
                  Optional · PNG, JPG or WebP · up to 2 MB. Text-only reviews
                  cannot judge the design.
                </p>
                <Input
                  aria-label="Upload a private screenshot"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={uploading || busy}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setUploading(true);
                    setError('');
                    try {
                      if (file.size > 2 * 1024 * 1024)
                        throw Error('Use an image under 2 MB.');
                      const r = await fetch('/api/review-assets', {
                        method: 'POST',
                        headers: { 'Content-Type': file.type },
                        body: file,
                      });
                      const data = (await r.json()) as {
                        id: string;
                        error?: string;
                      };
                      if (!r.ok) throw Error(data.error);
                      update('asset_id', data.id);
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setUploading(false);
                    }
                  }}
                />
                {uploading && <p role="status">Uploading privately…</p>}
              </div>
            </div>
            {draft.asset_id && (
              <div className="creative-thumbnail">
                <img
                  src={
                    '/api/review-assets?id=' +
                    encodeURIComponent(draft.asset_id)
                  }
                  alt="Your uploaded creative"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => update('asset_id', null)}
                >
                  <X /> Remove from draft
                </Button>
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              Leave out customer details, passwords and API keys. Saving a draft
              does not send it to OpenAI.
            </p>
            <Button type="submit" disabled={busy || uploading}>
              {busy ? 'Saving…' : 'Save my draft'} <CheckCircle2 />
            </Button>
          </form>
        </section>
      ) : item ? (
        <>
          <div className="filters">
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setSelected('');
                setNote('');
                setError('');
              }}
            >
              <ArrowLeft /> All drafts & reviews
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              className="ml-auto"
              onClick={() =>
                create({
                  ...item,
                  id: undefined,
                  parent_id: item.id,
                  title: item.title.slice(0, 85) + ' · next version',
                  status: 'draft',
                  score: null,
                  result: null,
                })
              }
            >
              <Plus /> Make a new version
            </Button>
          </div>
          <div className="studio-detail">
            <section className="panel panel-pad">
              <span className="eyebrow">
                {labels[item.kind]} · {item.status}
              </span>
              <h3 className="text-2xl mt-3">{item.title}</h3>
              {item.asset_id && (
                <img
                  className="review-image"
                  src={
                    '/api/review-assets?id=' + encodeURIComponent(item.asset_id)
                  }
                  alt="Creative submitted for this review"
                />
              )}
              <dl className="draft-summary">
                <dt>Who it is for</dt>
                <dd>{item.audience}</dd>
                <dt>The offer</dt>
                <dd>{item.offer}</dd>
                <dt>Your copy</dt>
                <dd className="whitespace-pre-wrap">{item.copy}</dd>
              </dl>
              {item.status === 'draft' && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => create(item)}
                >
                  <FileText /> Edit draft
                </Button>
              )}
              {item.status !== 'complete' && (
                <div className="review-run">
                  <label className="check" htmlFor="review-consent">
                    <Checkbox
                      checked={consent}
                      id="review-consent"
                      onCheckedChange={(v) => setConsent(v === true)}
                      disabled={busy || !state.available}
                    />
                    <span>
                      Send this copy and screenshot to OpenAI for feedback. I
                      have removed private customer data.
                    </span>
                  </label>
                  <Button
                    disabled={
                      busy ||
                      !state.available ||
                      !consent ||
                      state.remaining < 1
                    }
                    onClick={analyze}
                  >
                    {busy ? (
                      <RefreshCw className="animate-spin" />
                    ) : (
                      <Sparkles />
                    )}
                    {busy
                      ? 'Reviewing…'
                      : item.status === 'failed' || item.status === 'running'
                        ? 'Retry review'
                        : 'Review my creative'}
                  </Button>
                  <p className="text-sm text-muted-foreground">
                    {state.available
                      ? state.remaining +
                        ' of 3 review attempts left in a rolling 24 hours.'
                      : 'AI connection required. No score has been generated.'}{' '}
                    Failed attempts count toward the limit.
                  </p>
                  {item.error && <p className="notice error">{item.error}</p>}
                </div>
              )}
            </section>
            <div className="stack">
              {result ? (
                <>
                  <section className="panel panel-pad">
                    <div className="score-heading">
                      <div>
                        <span className="eyebrow">CREATIVE SCORECARD</span>
                        <h3>Here is what stands out.</h3>
                      </div>
                      <strong className="review-score">
                        {item.score}
                        <small>/100</small>
                      </strong>
                    </div>
                    <p>{result.summary}</p>
                    {previous?.score != null && item.score != null && (
                      <p className="score-delta">
                        {item.score - previous.score >= 0 ? '+' : ''}
                        {item.score - previous.score} points from your previous
                        version. AI ratings can vary.
                      </p>
                    )}
                    <div className="score-dimensions">
                      {result.dimensions.map((d) => (
                        <div key={d.criterion}>
                          <div className="flex justify-between">
                            <strong>
                              {labels[d.criterion] || 'The offer'}
                            </strong>
                            <span>{d.score}/10</span>
                          </div>
                          <Progress
                            value={d.score * 10}
                            aria-label={d.criterion + ' score'}
                          />
                          <p>{d.reason}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                  <section className="panel panel-pad">
                    <span className="eyebrow">FIX THESE FIRST</span>
                    <ol className="fix-list">
                      {result.fixes.map((s, i) => (
                        <li key={i}>
                          <span>{i + 1}</span>
                          <p>{s}</p>
                        </li>
                      ))}
                    </ol>
                  </section>
                  <section className="panel panel-pad">
                    <div className="flex justify-between items-center">
                      <h3>A clearer version to test</h3>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          copy(
                            result!.headline +
                              '\n\n' +
                              result!.primary_text +
                              '\n\n' +
                              result!.cta,
                          )
                        }
                      >
                        <Copy /> Copy
                      </Button>
                    </div>
                    <h4 className="text-xl mt-5">{result.headline}</h4>
                    <p className="whitespace-pre-wrap my-4">
                      {result.primary_text}
                    </p>
                    <span className="suggested-cta">{result.cta}</span>
                    <p className="text-sm text-muted-foreground mt-4">
                      Suggested copy, not verified facts. Check every claim
                      before publishing.
                    </p>
                  </section>
                  <section className="panel panel-pad">
                    <h3>Your next test</h3>
                    <p>{result.test}</p>
                    <h4 className="mt-5 mb-3">Things to watch</h4>
                    {result.cautions.map((s, i) => (
                      <p className="notice mb-2" key={i}>
                        {s}
                      </p>
                    ))}
                  </section>
                </>
              ) : (
                <section className="panel panel-pad review-explainer">
                  <Sparkles size={36} className="text-primary" />
                  <h3>Five checks. Clear next steps.</h3>
                  <p>Your review will look at:</p>
                  {[
                    'Can people understand it quickly?',
                    'Does the opening get their attention?',
                    'Is the offer worth a second look?',
                    'Is there a reason to believe you?',
                    'Is the next step obvious?',
                  ].map((s, i) => (
                    <div className="review-check" key={s}>
                      <span>0{i + 1}</span>
                      {s}
                    </div>
                  ))}
                  <p>
                    No made-up scores. Your results appear after a successful AI
                    review.
                  </p>
                </section>
              )}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="studio-start">
            <div>
              <Sparkles size={30} />
              <h3>Good ads start with a clear message.</h3>
              <p>
                Bring your ad, landing page or offer. Leave with one thing to
                fix first.
              </p>
            </div>
            <Button onClick={() => create()}>
              Add my first draft <ArrowUpRight />
            </Button>
          </div>
          <div className="filters">
            <Tabs value={filter} onValueChange={(v) => setFilter(String(v))}>
              <TabsList>
                <TabsTrigger value="all">All work</TabsTrigger>
                <TabsTrigger value="draft">Drafts</TabsTrigger>
                <TabsTrigger value="complete">Reviewed</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button
              variant="outline"
              className="ml-auto"
              onClick={() => create()}
            >
              <Plus /> New draft
            </Button>
          </div>
          {visible.length ? (
            <div className="review-grid">
              {visible.map((r) => (
                <button
                  className="panel review-card"
                  key={r.id}
                  onClick={() => {
                    setSelected(r.id);
                    setConsent(false);
                    setError('');
                    setNote('');
                  }}
                >
                  <div className="flex justify-between items-center">
                    <span className="eyebrow">{labels[r.kind]}</span>
                    {r.score == null ? (
                      <FileText size={22} />
                    ) : (
                      <strong className="review-mini-score">
                        {r.score}
                        <small>/100</small>
                      </strong>
                    )}
                  </div>
                  <h3>{r.title}</h3>
                  <p>
                    {r.copy.slice(0, 130)}
                    {r.copy.length > 130 ? '…' : ''}
                  </p>
                  <div className="flex justify-between text-sm">
                    <span>
                      {r.status === 'complete'
                        ? 'Review ready'
                        : r.status === 'failed'
                          ? 'Try again'
                          : r.status === 'running'
                            ? 'In progress'
                            : 'Draft saved'}
                    </span>
                    <span>{date(r.created_at)}</span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <section className="panel panel-pad">
              <h3>
                {filter === 'complete'
                  ? 'No reviews yet.'
                  : 'Your next ad starts here.'}
              </h3>
              <p>
                Add a draft to keep your work and its improvements together.
              </p>
            </section>
          )}
        </>
      )}
      <p className="studio-disclaimer">
        <Lock size={14} />
        Reviews are private to your account. AI feedback is subjective—not a
        sales forecast, a guarantee, or Meta approval. Review attempts are
        capped to control usage.
      </p>
    </div>
  );
}
