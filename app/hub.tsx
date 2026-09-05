'use client';
import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useId,
  Children,
  isValidElement,
  cloneElement,
  lazy,
  Suspense,
  type FormEvent,
  type ReactNode,
} from 'react';
import {
  Home,
  Hash,
  BookOpen,
  Trophy,
  Store,
  Users,
  Settings,
  ArrowUpRight,
  ArrowRight,
  Plus,
  Search,
  ChevronRight,
  Check,
  MessageCircle,
  Heart,
  Pin,
  Trash2,
  ShieldCheck,
  KeyRound,
  Copy,
  RefreshCw,
  LogOut,
  TrendingUp,
  Package,
  CheckCircle2,
  Lock,
  FileText,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
  useSidebar,
} from '../components/ui/sidebar';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Checkbox } from '../components/ui/checkbox';
import { Textarea } from '../components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../components/ui/dialog';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '../components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
const MyCourses = lazy(() => import('./my-courses'));
const ActivityBoards = lazy(() => import('./activity-boards'));
const AdStudio = lazy(() => import('./ad-studio'));
const RevenueChart = lazy(() => import('./revenue-chart'));
type Row = Record<string, any>;
type Data = {
  me: Row | null;
  signedIn?: boolean;
  suspended?: boolean;
  invitedEmail?: string;
  posts: Row[];
  lessons: Row[];
  stores: Row[];
  keys: Row[];
  events: Row[];
  leaderboard: Row[];
  members: Row[];
  counts: Row;
  chart: Row[];
  admin: Row | null;
  updatedAt: number;
  connectionsAvailable: boolean;
  courses: Row[];
  modules: Row[];
  learningBoard: Row[];
  helpfulBoard: Row[];
};
const channels = [
  ['general', 'The conversation'],
  ['wins', 'Small wins. Big moves.'],
  ['store-feedback', 'A fresh pair of eyes'],
  ['help-desk', 'Get unstuck'],
  ['announcements', 'From the Ecom SA team'],
];
const nav = [
  ['overview', 'Overview', Home],
  ['community', 'Community', MessageCircle],
  ['classroom', 'My Courses', BookOpen],
  ['studio', 'Ad Review', Sparkles],
  ['leaderboard', 'Leaderboards', Trophy],
  ['store', 'My store', Store],
  ['members', 'Members', Users],
] as const;
const money = (value: number) =>
  new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format((value || 0) / 100);
const when = (v: number) =>
  new Date(v).toLocaleDateString('en-ZA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Africa/Johannesburg',
  });
const timeAgo = (v: number) => {
  const m = Math.max(0, Math.floor((Date.now() - v) / 60000));
  return m < 1
    ? 'Just now'
    : m < 60
      ? m + 'm ago'
      : m < 1440
        ? Math.floor(m / 60) + 'h ago'
        : when(v);
};
function Avatar({ name = '', size = '' }: { name?: string; size?: string }) {
  return (
    <span className={'avatar ' + size}>
      {name
        .split(' ')
        .map((n) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase() || 'SA'}
    </span>
  );
}
function Empty({
  icon: Icon = MessageCircle,
  title,
  children,
  action,
  compact = false,
}: {
  icon?: any;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={'empty ' + (compact ? 'compact' : '')}>
      <Icon />
      <strong>{title}</strong>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}
function Pick({
  value,
  onChange,
  items,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  items: string[][];
  label: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => v && onChange(v)}>
      <SelectTrigger aria-label={label}>
        <SelectValue>
          {items.find((x) => x[0] === value)?.[1] || label}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {items.map(([v, t]) => (
          <SelectItem key={v} value={v}>
            {t}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
function MenuItem({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  const { setOpenMobile } = useSidebar();
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={active}
        onClick={() => {
          onClick();
          setOpenMobile(false);
        }}
      >
        {children}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
function PanelHead({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="panel-head">
      <h2>{title}</h2>
      {children}
    </div>
  );
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      {Children.map(children, (child, i) =>
        i === 0 && isValidElement(child)
          ? cloneElement(child as React.ReactElement<Record<string, unknown>>, {
              id,
              'aria-label': label,
            })
          : child,
      )}
    </div>
  );
}
function Source({ event }: { event: Row }) {
  return (
    <span
      className={
        'pill ' +
        (event.reviewed_by
          ? ''
          : event.source === 'manual'
            ? 'orange'
            : 'muted')
      }
    >
      {event.voided
        ? 'Voided'
        : event.reviewed_by
          ? 'Team reviewed'
          : event.source === 'shopify'
            ? 'Shopify signed'
            : event.source === 'api'
              ? 'API reported'
              : 'Self-reported'}
    </span>
  );
}
export default function Hub() {
  const [data, setData] = useState<Data | null>(null),
    [view, setView] = useState('overview'),
    [channel, setChannel] = useState('general'),
    [period, setPeriod] = useState('month'),
    [ranking, setRanking] = useState('all'),
    [search, setSearch] = useState(''),
    [modal, setModal] = useState<{ type: string; item?: Row } | null>(null);
  const [error, setError] = useState(''),
    [success, setSuccess] = useState(''),
    [busy, setBusy] = useState(false),
    [post, setPost] = useState(''),
    [reply, setReply] = useState(''),
    [replies, setReplies] = useState<Row[]>([]),
    [revealed, setRevealed] = useState(''),
    [invite, setInvite] = useState('');
  const [draft, setDraft] = useState<Row>({}),
    [failed, setFailed] = useState(false);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const gen = ++generation.current;
    try {
      const r = await fetch(
        '/api/hub?' + new URLSearchParams({ channel, period, ranking }),
        { cache: 'no-store' },
      );
      const d = (await r.json()) as Data & Row;
      if (r.status === 401 || r.status === 403) {
        setData({
          ...d,
          me: null,
          signedIn: true,
          suspended: r.status === 403,
        });
        setFailed(false);
        setError(d.error || 'Membership access is unavailable.');
        return;
      }
      if (!r.ok) throw Error(d.error || 'Membership access is unavailable.');
      if (gen === generation.current) {
        setData(d);
        setFailed(false);
      }
    } catch (e) {
      if (gen === generation.current) {
        setError((e as Error).message);
        setFailed(true);
      }
    }
  }, [channel, period, ranking]);
  useEffect(() => {
    refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, 15000);
    return () => clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setInvite(params.get('invite') || '');
    const selected = location.hash.slice(1);
    if (
      [
        'overview',
        'community',
        'classroom',
        'studio',
        'leaderboard',
        'store',
        'members',
        'profile',
        'admin',
      ].includes(selected)
    )
      setView(selected);
  }, []);
  useEffect(() => {
    if (data?.me) history.replaceState(null, '', '#' + view);
  }, [view, data?.me]);
  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(''), 5000);
    return () => clearTimeout(t);
  }, [success]);
  const go = (v: string) => {
    setView(v);
    setSearch('');
    window.scrollTo({ top: 0 });
  };
  const open = (type: string, item?: Row) => {
    setError('');
    setRevealed('');
    setDraft(item ? { ...item, published: !!item.published } : {});
    setModal({ type, item });
  };
  const act = async (action: string, payload: Row = {}, message = 'Saved') => {
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/hub', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload }),
      });
      const d = (await r.json()) as Data & Row;
      if (!r.ok) throw Error(d.error || 'Please try again.');
      await refresh();
      if (message) setSuccess(message);
      return d;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  };
  const submit = async (e: FormEvent, action: string, payload: Row) => {
    e.preventDefault();
    const result = await act(action, payload);
    if (result) setModal(null);
    return result;
  };
  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setSuccess('Copied');
    } catch {
      setError('Copy was blocked. Select the text and copy it manually.');
    }
  };
  const loadThread = async (item: Row) => {
    open('thread', item);
    setReplies([]);
    setReply('');
    try {
      const r = await fetch('/api/hub?thread=' + encodeURIComponent(item.id));
      const d = (await r.json()) as Data & Row;
      if (!r.ok) throw Error(d.error);
      setReplies(d.replies);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const d = (key: string, value: any) =>
    setDraft((old) => ({ ...old, [key]: value }));
  const errors = (
    <>
      {error && (
        <div role="alert" className="notice error">
          {error}
          <button aria-label="Dismiss error" onClick={() => setError('')}>
            ×
          </button>
        </div>
      )}
      {success && (
        <div role="status" className="notice">
          {success}
        </div>
      )}
    </>
  );
  if (!data && !failed)
    return (
      <div className="loading">
        <div>
          <div className="brand">
            ECOM <span>SA↗</span>
          </div>
          <p>Opening your workspace…</p>
        </div>
      </div>
    );
  if (!data?.me)
    return (
      <div className="gate">
        <section className="gate-story">
          <div className="brand">
            ECOM <span>SA↗</span>
            <small>THE MEMBER WORKSPACE</small>
          </div>
          <div>
            <h1>
              Building alone?
              <br />
              Not anymore.
            </h1>
            <p>
              Your next step. Someone to ask. A place to share the win when it
              finally clicks.
            </p>
          </div>
          <div className="gate-bottom">
            <span>01 &nbsp; LEARN</span>
            <span>02 &nbsp; BUILD</span>
            <span>03 &nbsp; GROW TOGETHER</span>
          </div>
        </section>
        <section className="gate-form">
          <div className="gate-inner">
            <span className="eyebrow">WELCOME TO THE INSIDE</span>
            <h2>
              {data?.signedIn ? 'One last step.' : 'Your people are here.'}
            </h2>
            <p>
              {data?.signedIn
                ? 'Use your member invitation to join the workspace.'
                : 'Sign in to pick up where you left off. This space is for invited Ecom SA members.'}
            </p>
            {errors}
            {data?.suspended ? (
              <div className="notice">
                Your membership is paused. Contact the Ecom SA team to restore
                access.
              </div>
            ) : failed ? (
              <Button onClick={refresh}>
                <RefreshCw />
                Try again
              </Button>
            ) : data?.signedIn ? (
              <form
                className="form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  await act(
                    'redeem',
                    { token: invite, name: draft.name },
                    'Welcome to Ecom SA',
                  );
                }}
              >
                <Field label="Your display name">
                  <Input
                    required
                    maxLength={50}
                    value={draft.name || ''}
                    onChange={(e) => d('name', e.target.value)}
                    placeholder="What should we call you?"
                  />
                </Field>
                <Field label="Invitation code">
                  <Input
                    required
                    value={invite}
                    onChange={(e) => setInvite(e.target.value)}
                    placeholder="Paste your invitation code"
                  />
                </Field>
                <p>
                  Sign-in email: {data.invitedEmail}. Invitations are tied to
                  this address.
                </p>
                <Button type="submit" disabled={busy}>
                  Join the workspace <ArrowRight />
                </Button>
                <a
                  className="text-link"
                  href="/signout-with-chatgpt?return_to=/"
                  target="_top"
                >
                  Use a different account
                </a>
              </form>
            ) : (
              <a
                className="signin"
                target="_top"
                href={
                  '/signin-with-chatgpt?return_to=' +
                  encodeURIComponent('/' + (invite ? '?invite=' + invite : ''))
                }
              >
                <Lock size={16} />
                Sign in with ChatGPT <ArrowRight size={16} />
              </a>
            )}
            <div className="gate-note">
              Have a membership but no invitation?{' '}
              <a
                href="https://www.skool.com/ecomsa"
                target="_blank"
                rel="noreferrer"
              >
                Ask the Ecom SA team
              </a>
              .<br />
              Your store data stays private unless you choose to share it.
            </div>
          </div>
        </section>
      </div>
    );
  const me = data.me,
    admin = me.role === 'admin',
    published = data.lessons.filter((l) => l.published),
    complete = published.filter((l) => l.completed).length;
  const nextLesson = published.find((l) => !l.completed);
  const title =
    nav.find((n) => n[0] === view)?.[1] ||
    (view === 'profile' ? 'My profile' : 'Admin');
  const matches = (value: string) =>
    value.toLowerCase().includes(search.toLowerCase());
  const postCard = (p: Row) => (
    <article key={p.id} className="post">
      <div className="post-top">
        <Avatar name={p.name} />
        <div>
          <h3>
            {p.name} {p.role === 'admin' && <span className="pill">TEAM</span>}
          </h3>
          <small>
            {timeAgo(p.created_at)} · #{p.channel}
          </small>
        </div>
        {p.pinned > 0 && <Pin size={15} className="ml-auto text-primary" />}
      </div>
      <p className="post-text">{p.body}</p>
      <div className="post-actions">
        <button
          disabled={busy}
          className={p.reacted ? 'active' : ''}
          onClick={() => act('react', { id: p.id, active: !p.reacted }, '')}
        >
          <Heart />
          {p.reactions || 0}
        </button>
        <button onClick={() => loadThread(p)}>
          <MessageCircle />
          {p.replies || 0} replies
        </button>
        {admin && (
          <button
            aria-label={p.pinned ? 'Unpin post' : 'Pin post'}
            onClick={() => act('pin', { id: p.id, pinned: !p.pinned }, '')}
          >
            <Pin />
          </button>
        )}
        {(admin || p.member_id === me.id) && (
          <button
            className="ml-auto"
            aria-label="Delete post"
            onClick={() => open('delete-post', p)}
          >
            <Trash2 />
          </button>
        )}
      </div>
    </article>
  );
  const lessonRow = (l: Row, i: number) => (
    <button key={l.id} className="lesson-row" onClick={() => open('lesson', l)}>
      <span className="lesson-icon">
        {l.completed ? <CheckCircle2 size={21} /> : <BookOpen size={21} />}
      </span>
      <div>
        <h3>
          {l.title} {!l.published && <span className="pill orange">Draft</span>}
        </h3>
        <p>
          {l.category} · {l.duration} min{' '}
          {l.asset_id ? '· Resource included' : ''}
        </p>
      </div>
      <span className="lesson-action">
        {l.completed ? <Check size={18} /> : <ChevronRight size={18} />}
      </span>
    </button>
  );
  const composer = (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (await act('post', { channel, body: post }, 'Posted')) setPost('');
      }}
      className="composer"
    >
      <Avatar name={me.name} />
      <div className="composer-inner">
        <Textarea
          aria-label="Write a community post"
          required
          maxLength={4000}
          value={post}
          onChange={(e) => setPost(e.target.value)}
          placeholder={
            channel === 'wins'
              ? 'Got your first order? Fixed something tricky? Share it.'
              : channel === 'help-desk'
                ? 'What are you stuck on? Tell us what you have tried.'
                : 'What are you working on today?'
          }
        />
        <div className="composer-footer">
          <small>Keep it helpful. Keep it human.</small>
          <Button type="submit" disabled={busy || !post.trim()}>
            Post <ArrowUpRight size={15} />
          </Button>
        </div>
      </div>
    </form>
  );
  const eventTable = (events: Row[], review = false) => (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Date / event</th>
            <th>{review ? 'Member' : 'Source'}</th>
            <th>Amount</th>
            {review && <th>Review</th>}
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.id}>
              <td>
                {when(e.occurred_at)}
                <div className="text-xs text-muted-foreground">
                  {e.kind} {e.note ? '· ' + e.note : ''}
                </div>
              </td>
              <td>{review ? e.name : <Source event={e} />}</td>
              <td className="number">{money(e.amount)}</td>
              {review && (
                <td>
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() => open('review', e)}
                  >
                    Review
                  </Button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <SidebarProvider
      style={{ '--sidebar-width': '238px' } as React.CSSProperties}
    >
      <Sidebar collapsible="offcanvas">
        <SidebarHeader className="side-top">
          <a href="#overview" onClick={() => go('overview')} className="brand">
            ECOM <span>SA↗</span>
            <small>MEMBER WORKSPACE</small>
          </a>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup className="side-group">
            <SidebarMenu>
              {nav.map(([key, label, Icon]) => (
                <MenuItem
                  key={key}
                  active={view === key}
                  onClick={() => go(key)}
                >
                  <Icon />
                  <span>{label}</span>
                </MenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
          <div className="side-label">YOUR CHANNELS</div>
          <SidebarGroup className="side-group pt-0">
            <SidebarMenu>
              {channels.map(([key]) => (
                <MenuItem
                  key={key}
                  active={view === 'community' && channel === key}
                  onClick={() => {
                    setChannel(key);
                    go('community');
                  }}
                >
                  <Hash />
                  <span>{key}</span>
                </MenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
          <div className="side-progress">
            <div className="flex justify-between">
              <BookOpen size={17} />
              <span>
                {complete}/{published.length}
              </span>
            </div>
            <strong className="block mt-3 font-medium">
              One step at a time.
            </strong>
            <p>Keep moving. Your next lesson is ready when you are.</p>
            <Button
              variant="secondary"
              className="w-full"
              onClick={() =>
                nextLesson ? open('lesson', nextLesson) : go('classroom')
              }
            >
              Continue learning <ArrowRight />
            </Button>
          </div>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            {admin && (
              <MenuItem active={view === 'admin'} onClick={() => go('admin')}>
                <ShieldCheck />
                <span>Manage workspace</span>
              </MenuItem>
            )}
            <MenuItem active={view === 'profile'} onClick={() => go('profile')}>
              <Settings />
              <span>My profile & privacy</span>
            </MenuItem>
          </SidebarMenu>
          <button className="account" onClick={() => go('profile')}>
            <Avatar name={me.name} />
            <div className="text-left">
              {me.name}
              <small>{admin ? 'Ecom SA team' : 'Ecom SA member'}</small>
            </div>
          </button>
        </SidebarFooter>
      </Sidebar>
      <main className="main">
        <header className="topbar">
          <SidebarTrigger className="mobile-trigger" />
          <div className="breadcrumb">
            <span>Workspace</span>
            <ChevronRight size={13} />
            {title}
          </div>
          <div className="top-spacer" />
          <div className="search">
            <Search />
            <Input
              aria-label="Search your workspace"
              placeholder="Search the workspace"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Avatar name={me.name} size="small" />
        </header>
        <div className="content">
          {!modal && errors}
          {search ? (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">FIND YOUR NEXT STEP</span>
                  <h1>Search results</h1>
                  <p>Lessons, members and posts in #{channel}.</p>
                </div>
                <Button variant="outline" onClick={() => setSearch('')}>
                  Clear
                </Button>
              </div>
              <div className="stack">
                <section className="panel">
                  <PanelHead title="Classroom" />
                  {data.lessons
                    .filter((l) => matches(l.title + ' ' + l.body))
                    .map(lessonRow)}
                  {!data.lessons.some((l) =>
                    matches(l.title + ' ' + l.body),
                  ) && <Empty title="No matching lessons" compact />}
                </section>
                <section className="panel">
                  <PanelHead title="People" />
                  <div className="panel-pad">
                    {data.members
                      .filter((m) => matches(m.name + ' ' + m.bio))
                      .map((m) => (
                        <div className="member-row" key={m.id}>
                          <Avatar name={m.name} />
                          <div>
                            {m.name}
                            <small>{m.bio || 'Building with Ecom SA'}</small>
                          </div>
                        </div>
                      ))}
                  </div>
                </section>
                <section className="panel">
                  <PanelHead title={'Posts in #' + channel} />
                  {data.posts
                    .filter((p) => matches(p.body + ' ' + p.name))
                    .map(postCard)}
                  {!data.posts.some((p) => matches(p.body + ' ' + p.name)) && (
                    <Empty title="No matching posts" compact />
                  )}
                </section>
              </div>
            </>
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">
                    {view === 'overview'
                      ? 'YOUR NEXT CHAPTER STARTS HERE'
                      : 'THE ECOM SA WORKSPACE'}
                  </span>
                  <h1>
                    {view === 'overview'
                      ? 'Good to have you here, ' + me.name.split(' ')[0] + '.'
                      : view === 'community'
                        ? '# ' + channel
                        : title}
                  </h1>
                  <p>
                    {
                      (
                        {
                          overview:
                            'A little progress today. A different business tomorrow.',
                          community: channels.find(
                            (c) => c[0] === channel,
                          )?.[1],
                          classroom:
                            'Less guessing. More doing. Take your next step.',
                          studio:
                            'Clear feedback. Stronger creative. One change at a time.',
                          leaderboard:
                            'Real progress. Shared by the people building it.',
                          store: 'Your store. Your numbers. Your story.',
                          members: 'You do not have to figure this out alone.',
                          profile:
                            'Make yourself at home. Keep control of your data.',
                          admin: 'Keep the community useful, safe and moving.',
                        } as Row
                      )[view]
                    }
                  </p>
                </div>
                {view === 'community' ? (
                  <span className="live">
                    <i />
                    Refreshes every 15s
                  </span>
                ) : view === 'store' ? (
                  <Button onClick={() => open('store')}>
                    <Plus />
                    Add store
                  </Button>
                ) : view === 'admin' ? (
                  <Button onClick={() => open('invite')}>
                    <Plus />
                    Invite a member
                  </Button>
                ) : (
                  <span className="live">
                    <i />
                    {failed
                      ? 'Update failed'
                      : 'Updated ' +
                        new Date(data.updatedAt).toLocaleTimeString('en-ZA', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                  </span>
                )}
              </div>
              {view === 'overview' && (
                <>
                  <div className="workspace-launcher">
                    <button onClick={() => go('classroom')}>
                      <BookOpen />
                      <span>
                        <strong>My Courses</strong>
                        <small>Pick up your next lesson</small>
                      </span>
                    </button>
                    <button onClick={() => go('studio')}>
                      <Sparkles />
                      <span>
                        <strong>Ad Review</strong>
                        <small>Make your message clearer</small>
                      </span>
                    </button>
                    <button onClick={() => go('leaderboard')}>
                      <Trophy />
                      <span>
                        <strong>Leaderboards</strong>
                        <small>See the progress being made</small>
                      </span>
                    </button>
                  </div>
                  <section className="hero-panel">
                    <div className="hero-copy">
                      <span className="eyebrow">YOUR NEXT MOVE</span>
                      <h2>
                        {nextLesson
                          ? 'Stop guessing. Start here.'
                          : 'Keep the momentum going.'}
                      </h2>
                      <p>
                        {nextLesson
                          ? 'A clear first step beats another hour of scrolling. Pick up a lesson and put it to work.'
                          : 'You have finished the available lessons. Bring your next challenge to the community.'}
                      </p>
                      <Button
                        onClick={() =>
                          nextLesson
                            ? open('lesson', nextLesson)
                            : go('community')
                        }
                      >
                        {nextLesson ? 'Take my next step' : 'Ask the community'}{' '}
                        <ArrowUpRight />
                      </Button>
                    </div>
                    <div className="hero-steps">
                      {[
                        [!!complete, 'Learn one useful thing'],
                        [!!data.stores.length, 'Add your store'],
                        [!!data.counts.posts, 'Bring the community with you'],
                      ].map(([done, label], i) => (
                        <div className="hero-step" key={String(label)}>
                          <span
                            className={'step-number ' + (done ? 'done' : '')}
                          >
                            {done ? <Check size={13} /> : i + 1}
                          </span>
                          {label}
                        </div>
                      ))}
                    </div>
                  </section>
                  <section className="stats">
                    {[
                      [
                        BookOpen,
                        'Lessons completed',
                        complete + '/' + published.length,
                        'Your pace. Your progress.',
                      ],
                      [
                        TrendingUp,
                        'Sales less refunds',
                        money(data.counts.revenue),
                        'Logged amounts · not profit',
                      ],
                      [
                        Package,
                        'Orders logged',
                        data.counts.orders || 0,
                        'API, Shopify and manual',
                      ],
                      [
                        MessageCircle,
                        'Community posts',
                        data.counts.posts || 0,
                        'Every question counts',
                      ],
                    ].map(([Icon, label, value, note]: any) => (
                      <div className="stat" key={label}>
                        <div className="stat-label">
                          {label}
                          <Icon />
                        </div>
                        <strong>{value}</strong>
                        <small>{note}</small>
                      </div>
                    ))}
                  </section>
                  <div className="columns">
                    <div className="stack">
                      <section className="panel">
                        <PanelHead title="Pick up where you left off">
                          <button
                            className="text-link"
                            onClick={() => go('classroom')}
                          >
                            All lessons <ArrowUpRight />
                          </button>
                        </PanelHead>
                        {published.slice(0, 3).map(lessonRow)}
                        {!published.length && (
                          <Empty
                            icon={BookOpen}
                            title="Your classroom is ready"
                            action={
                              admin ? (
                                <Button onClick={() => open('edit-lesson')}>
                                  Add the first lesson
                                </Button>
                              ) : null
                            }
                          >
                            The team will publish your lessons here.
                          </Empty>
                        )}
                      </section>
                      <section className="panel">
                        <PanelHead title="Around the community">
                          <button
                            className="text-link"
                            onClick={() => go('community')}
                          >
                            Join in <ArrowUpRight />
                          </button>
                        </PanelHead>
                        {data.posts.slice(0, 2).map(postCard)}
                        {!data.posts.length && (
                          <Empty
                            title="Someone has to go first."
                            action={
                              <Button
                                variant="secondary"
                                onClick={() => go('community')}
                              >
                                Introduce yourself <ArrowRight />
                              </Button>
                            }
                          >
                            Tell us what you are building, and the one thing you
                            need help with.
                          </Empty>
                        )}
                      </section>
                    </div>
                    <aside className="stack right-rail">
                      <section className="event-card">
                        <span className="eyebrow">BUILD TOGETHER</span>
                        <h3>Stuck is a starting point.</h3>
                        <p>
                          A screenshot. A question. A second opinion. Bring it
                          to the help desk.
                        </p>
                        <Button
                          variant="secondary"
                          className="w-full"
                          onClick={() => {
                            setChannel('help-desk');
                            go('community');
                          }}
                        >
                          Help me get unstuck <ArrowUpRight />
                        </Button>
                      </section>
                      <section className="panel">
                        <PanelHead title="People in your corner">
                          <Users size={16} />
                        </PanelHead>
                        <div className="panel-pad pt-0">
                          {data.members.slice(0, 4).map((m) => (
                            <div className="member-row" key={m.id}>
                              <Avatar name={m.name} />
                              <div>
                                {m.name}
                                <small>
                                  {m.role === 'admin'
                                    ? 'Ecom SA team'
                                    : 'Member · building alongside you'}
                                </small>
                              </div>
                            </div>
                          ))}
                          <button
                            className="text-link mt-4"
                            onClick={() => go('members')}
                          >
                            Meet the members <ArrowUpRight />
                          </button>
                        </div>
                      </section>
                      <div className="panel panel-pad">
                        <div className="flex gap-3 items-center">
                          <ShieldCheck size={21} className="text-primary" />
                          <strong className="text-sm font-medium">
                            Your numbers are yours.
                          </strong>
                        </div>
                        <p className="text-xs text-muted-foreground mt-3">
                          Store details stay private. Choose whether to share
                          your totals on the leaderboard.
                        </p>
                        <button
                          className="text-link mt-3"
                          onClick={() => go('profile')}
                        >
                          My privacy settings <ArrowUpRight />
                        </button>
                      </div>
                    </aside>
                  </div>
                </>
              )}
              {view === 'community' && (
                <>
                  <div className="channel-tabs">
                    {channels.map(([c]) => (
                      <button
                        className={channel === c ? 'active' : ''}
                        key={c}
                        onClick={() => setChannel(c)}
                      >
                        # {c}
                      </button>
                    ))}
                  </div>
                  <div className="columns">
                    <section className="panel">
                      {channel !== 'announcements' || admin ? (
                        composer
                      ) : (
                        <div className="notice m-4">
                          Announcements from the Ecom SA team. Ask questions in
                          #help-desk.
                        </div>
                      )}
                      {data.posts.map(postCard)}
                      {!data.posts.length && (
                        <Empty title="Make yourself heard.">
                          There are no posts in this channel yet. Start the
                          conversation.
                        </Empty>
                      )}
                    </section>
                    <aside className="stack right-rail">
                      <section className="panel panel-pad">
                        <span className="eyebrow">A GOOD PLACE TO BUILD</span>
                        <h2 className="text-lg mt-3 mb-3">
                          Be the member you needed.
                        </h2>
                        <p className="text-sm text-muted-foreground">
                          Ask clearly. Help generously. Celebrate the small
                          stuff.
                        </p>
                        <div className="leader-note">
                          No spam, unsolicited pitches or customer details.
                          Share results honestly. The team can remove posts and
                          suspend access.
                        </div>
                      </section>
                      <section className="event-card">
                        <Hash size={24} />
                        <h3>Give your question context.</h3>
                        <p>
                          What are you trying to do?
                          <br />
                          What have you tried?
                          <br />
                          Where did you get stuck?
                        </p>
                      </section>
                    </aside>
                  </div>
                </>
              )}
              {view === 'classroom' && (
                <Suspense fallback={<p>Loading your courses…</p>}>
                  <MyCourses
                    courses={data.courses || []}
                    modules={data.modules || []}
                    lessons={data.lessons}
                    admin={admin}
                    search={search}
                    refresh={refresh}
                    openLesson={(l) => open('lesson', l)}
                    editLesson={(l) => open('edit-lesson', l)}
                  />
                </Suspense>
              )}
              {view === 'studio' && (
                <Suspense fallback={<p>Opening Ad Review…</p>}>
                  <AdStudio />
                </Suspense>
              )}
              {view === 'leaderboard' && (
                <>
                  <Suspense fallback={<p>Loading rankings…</p>}>
                    <ActivityBoards
                      learning={(data.learningBoard as any) || []}
                      helpful={(data.helpfulBoard as any) || []}
                      me={me as any}
                      period={period}
                      setPeriod={setPeriod}
                      profile={() => go('profile')}
                    />
                  </Suspense>
                  <div className="feature-heading mt-8">
                    <div>
                      <span className="eyebrow">STORE RESULTS</span>
                      <h2>Put your progress on the board.</h2>
                    </div>
                  </div>
                  <div className="filters">
                    <Tabs
                      value={ranking}
                      onValueChange={(v) => setRanking(String(v))}
                    >
                      <TabsList>
                        <TabsTrigger value="all">
                          All reported results
                        </TabsTrigger>
                        <TabsTrigger value="reviewed">
                          Team reviewed
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                    <Pick
                      label="Leaderboard period"
                      value={period}
                      onChange={setPeriod}
                      items={[
                        ['month', 'This month · SAST'],
                        ['all', 'All time'],
                      ]}
                    />
                  </div>
                  {!me.leaderboard && (
                    <div className="notice">
                      You are watching from the sidelines.{' '}
                      <button
                        className="text-link"
                        onClick={() => go('profile')}
                      >
                        Join the leaderboard →
                      </button>
                    </div>
                  )}
                  <section className="panel">
                    <PanelHead
                      title={
                        ranking === 'reviewed'
                          ? 'Reviewed store results'
                          : 'The builders’ board'
                      }
                    >
                      <span className="live">
                        <i />
                        15-second refresh
                      </span>
                    </PanelHead>
                    {data.leaderboard.length ? (
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Rank</th>
                              <th>Member</th>
                              <th>Orders</th>
                              <th className="text-right">Sales less refunds</th>
                            </tr>
                          </thead>
                          <tbody>
                            {data.leaderboard.map((m, i) => (
                              <tr key={m.id}>
                                <td>
                                  <span
                                    className={
                                      'rank ' + (i === 0 ? 'first' : '')
                                    }
                                  >
                                    {i === 0
                                      ? '↗'
                                      : String(i + 1).padStart(2, '0')}
                                  </span>
                                </td>
                                <td>
                                  <div className="flex items-center gap-3">
                                    <Avatar name={m.name} />
                                    <div>
                                      {m.name}{' '}
                                      {m.id === me.id && (
                                        <span className="pill">YOU</span>
                                      )}
                                      <div className="text-xs text-muted-foreground">
                                        {ranking === 'reviewed'
                                          ? 'Reviewed by the team'
                                          : 'Member-shared results'}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                <td>{m.orders}</td>
                                <td className="number">{money(m.revenue)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <Empty
                        icon={Trophy}
                        title="The next name could be yours."
                        action={
                          <Button
                            variant="secondary"
                            onClick={() => go('store')}
                          >
                            Set up my store <ArrowRight />
                          </Button>
                        }
                      >
                        No {ranking === 'reviewed' ? 'reviewed ' : ''}results
                        have been shared for this period. We never fill this
                        board with example earnings.
                      </Empty>
                    )}
                  </section>
                  <p className="leader-note">
                    ZAR paid order totals less logged refunds, including any tax
                    and shipping in the order amount. Not profit, not a promise
                    of earnings. API and manual results are self-reported;
                    signed Shopify events are source-labelled. “Team reviewed”
                    means a team member checked evidence, not an independent
                    audit. Rankings include only members who opted in. This
                    month starts at midnight SAST on the 1st.
                  </p>
                </>
              )}
              {view === 'store' && (
                <>
                  <div className="stats">
                    {[
                      [
                        TrendingUp,
                        'Sales less refunds',
                        money(data.counts.revenue),
                        'All logged events',
                      ],
                      [
                        Package,
                        'Orders logged',
                        data.counts.orders || 0,
                        'Excludes voided events',
                      ],
                      [
                        Store,
                        'Your stores',
                        data.stores.length,
                        'Private to you and the team',
                      ],
                      [
                        KeyRound,
                        'Active API keys',
                        data.keys.filter(
                          (k) => !k.revoked && k.expires_at > Date.now(),
                        ).length,
                        'Revocable · 90-day expiry',
                      ],
                    ].map(([Icon, label, value, note]: any) => (
                      <div className="stat" key={label}>
                        <div className="stat-label">
                          {label}
                          <Icon />
                        </div>
                        <strong>{value}</strong>
                        <small>{note}</small>
                      </div>
                    ))}
                  </div>
                  {!data.stores.length ? (
                    <section className="panel">
                      <Empty
                        icon={Store}
                        title="Let your progress speak."
                        action={
                          <Button onClick={() => open('store')}>
                            <Plus />
                            Add my first store
                          </Button>
                        }
                      >
                        Add a store, then connect signed Shopify webhooks or
                        send events using your own API key. Your store name
                        stays off the public board.
                      </Empty>
                    </section>
                  ) : (
                    <div className="stack">
                      <section className="panel">
                        <PanelHead title="Your stores">
                          <button
                            className="text-link"
                            onClick={() => open('api-docs')}
                          >
                            API guide <ArrowUpRight />
                          </button>
                        </PanelHead>
                        {data.stores.map((s) => (
                          <div className="key-row" key={s.id}>
                            <div>
                              <h3>{s.name}</h3>
                              <small>
                                {s.connected
                                  ? s.domain + ' · signing secret saved'
                                  : 'No Shopify webhook connected'}
                              </small>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                variant="secondary"
                                onClick={() => open('key', s)}
                              >
                                <KeyRound />
                                API key
                              </Button>
                              <Button
                                variant="outline"
                                onClick={() => open('shopify', s)}
                              >
                                Shopify
                              </Button>
                              <Button
                                variant="ghost"
                                onClick={() => open('manual', s)}
                              >
                                <Plus />
                                Log a result
                              </Button>
                            </div>
                          </div>
                        ))}
                      </section>
                      <section className="panel">
                        <PanelHead title="This month, one step at a time">
                          <span className="text-xs text-muted-foreground">
                            SAST · ZAR
                          </span>
                        </PanelHead>
                        {data.chart.length ? (
                          <div className="px-3 pb-5 h-[230px]">
                            <Suspense
                              fallback={
                                <p className="text-sm text-muted-foreground">
                                  Loading your graph…
                                </p>
                              }
                            >
                              <RevenueChart
                                data={
                                  data.chart as {
                                    day: string;
                                    revenue: number;
                                  }[]
                                }
                              />
                            </Suspense>
                          </div>
                        ) : (
                          <Empty
                            icon={TrendingUp}
                            title="Your graph starts with your first event."
                            compact
                          >
                            No invented numbers. Connect a source and the log
                            will update automatically.
                          </Empty>
                        )}
                      </section>
                      <section className="panel">
                        <PanelHead title="Store event log">
                          <span className="text-xs text-muted-foreground">
                            Latest 100 events
                          </span>
                        </PanelHead>
                        {data.events.length ? (
                          eventTable(data.events)
                        ) : (
                          <Empty
                            icon={Package}
                            title="Waiting for the first result."
                            compact
                          />
                        )}
                      </section>
                      <section className="panel">
                        <PanelHead title="API keys">
                          <span className="text-xs text-muted-foreground">
                            Never share these in the community
                          </span>
                        </PanelHead>
                        {data.keys.map((k) => (
                          <div className="key-row" key={k.id}>
                            <div>
                              <h3>
                                {k.name}{' '}
                                <span className="pill muted">
                                  {k.revoked
                                    ? 'Revoked'
                                    : k.expires_at < Date.now()
                                      ? 'Expired'
                                      : 'Active'}
                                </span>
                              </h3>
                              <small>
                                <code>{k.prefix}…</code> · Expires{' '}
                                {when(k.expires_at)}
                                <br />
                                {k.last_used
                                  ? 'Last used ' + timeAgo(k.last_used)
                                  : 'Not used yet'}
                              </small>
                            </div>
                            {!k.revoked && (
                              <Button
                                variant="outline"
                                onClick={() => open('revoke-key', k)}
                              >
                                Revoke
                              </Button>
                            )}
                          </div>
                        ))}
                        {!data.keys.length && (
                          <Empty icon={KeyRound} title="No keys yet." compact>
                            Create a key next to your store above.
                          </Empty>
                        )}
                      </section>
                    </div>
                  )}
                </>
              )}
              {view === 'members' && (
                <div className="member-grid">
                  {data.members.map((m) => (
                    <section className="panel member-card" key={m.id}>
                      <div className="flex justify-between items-center">
                        <Avatar name={m.name} size="large" />
                        {m.role === 'admin' && (
                          <span className="pill">ECOM SA TEAM</span>
                        )}
                      </div>
                      <h3>{m.name}</h3>
                      <p>
                        {m.bio ||
                          'Learning, building and figuring it out. Just like you.'}
                      </p>
                      <div className="text-xs text-muted-foreground mt-5">
                        Joined {when(m.joined_at)}
                      </div>
                    </section>
                  ))}
                </div>
              )}
              {view === 'profile' && (
                <div className="columns">
                  <section className="panel panel-pad">
                    <div className="flex items-center gap-4 mb-6">
                      <Avatar name={me.name} size="large" />
                      <div>
                        <h2 className="text-xl">{me.name}</h2>
                        <span className="text-sm text-muted-foreground">
                          {me.email}
                        </span>
                      </div>
                    </div>
                    <form
                      className="form"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        await act('profile', {
                          name: f.get('name'),
                          bio: f.get('bio'),
                          leaderboard: f.get('leaderboard') === 'on',
                          activity_leaderboard:
                            f.get('activity_leaderboard') === 'on',
                        });
                      }}
                    >
                      <Field label="Display name">
                        <Input
                          aria-label="Display name"
                          name="name"
                          defaultValue={me.name}
                          required
                          maxLength={50}
                        />
                      </Field>
                      <Field label="A little about you">
                        <Textarea
                          aria-label="A little about you"
                          name="bio"
                          defaultValue={me.bio}
                          maxLength={240}
                          placeholder="What are you building? What would you love help with?"
                        />
                      </Field>
                      <div className="check">
                        <input
                          type="checkbox"
                          id="optin"
                          name="leaderboard"
                          defaultChecked={!!me.leaderboard}
                        />
                        <label htmlFor="optin">
                          Show my display name and store totals on the member
                          leaderboard.
                          <p>
                            Your store name, email and API keys are not shared.
                            Switch this off at any time.
                          </p>
                        </label>
                      </div>
                      <label className="check" htmlFor="activity-optin">
                        <Checkbox
                          name="activity_leaderboard"
                          id="activity-optin"
                          value="on"
                          defaultChecked={!!me.activity_leaderboard}
                        />
                        <span>
                          Show my display name and progress on the learning and
                          helpful-member leaderboards. No store totals are
                          shared by this setting.
                        </span>
                      </label>
                      <Button type="submit" disabled={busy}>
                        Save my profile <Check />
                      </Button>
                    </form>
                  </section>
                  <aside className="stack">
                    <section className="panel panel-pad">
                      <ShieldCheck size={25} className="text-primary" />
                      <h3 className="text-lg mt-4">Private by default.</h3>
                      <p className="text-sm text-muted-foreground my-3">
                        Members see your name, bio and community posts. The team
                        can access your account and event records to help you
                        and moderate the leaderboard.
                      </p>
                      <p className="text-sm text-muted-foreground">
                        We store order amounts and event identifiers—not your
                        customers’ names, emails or addresses. For account or
                        data deletion, contact the team.
                      </p>
                      <a
                        className="text-link mt-5"
                        href="https://www.skool.com/ecomsa"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Contact the team <ArrowUpRight />
                      </a>
                    </section>
                    <a
                      className="text-link"
                      target="_top"
                      href="/signout-with-chatgpt?return_to=/"
                    >
                      <LogOut size={16} />
                      Sign out
                    </a>
                  </aside>
                </div>
              )}
              {view === 'admin' && admin && (
                <div className="stack">
                  <div className="notice">
                    Invitations are email-bound, single-use and expire after 7
                    days. Send the invitation link yourself; this dashboard does
                    not send emails or charge members.
                  </div>
                  <section className="panel">
                    <PanelHead title="Members" />
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Member</th>
                            <th>Status</th>
                            <th>Access</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.admin?.members.map((m: Row) => (
                            <tr key={m.id}>
                              <td>
                                {m.name}
                                <div className="text-xs text-muted-foreground">
                                  {m.email}
                                </div>
                              </td>
                              <td>
                                <span className="pill">{m.status}</span>
                              </td>
                              <td>
                                {m.role === 'admin' ? (
                                  'Owner'
                                ) : (
                                  <Button
                                    variant="outline"
                                    onClick={() => open('member-status', m)}
                                  >
                                    {m.status === 'active'
                                      ? 'Suspend'
                                      : 'Restore'}
                                  </Button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                  <section className="panel">
                    <PanelHead title="Invitations" />
                    {data.admin?.invites.length ? (
                      data.admin.invites.map((i: Row) => (
                        <div className="key-row" key={i.id}>
                          <div>
                            <h3>{i.email}</h3>
                            <small>
                              {i.used_by
                                ? 'Accepted'
                                : i.revoked
                                  ? 'Revoked'
                                  : i.expires_at < Date.now()
                                    ? 'Expired'
                                    : 'Expires ' + when(i.expires_at)}
                            </small>
                          </div>
                          {!i.used_by && !i.revoked && (
                            <Button
                              variant="ghost"
                              disabled={busy}
                              onClick={() => act('revoke-invite', { id: i.id })}
                            >
                              Revoke
                            </Button>
                          )}
                        </div>
                      ))
                    ) : (
                      <Empty
                        icon={Users}
                        title="Bring your members in."
                        compact
                      />
                    )}
                  </section>
                  <section className="panel">
                    <PanelHead title="Classroom">
                      <Button onClick={() => open('edit-lesson')}>
                        <Plus />
                        Create lesson
                      </Button>
                    </PanelHead>
                    {data.lessons.map((l) => (
                      <div className="key-row" key={l.id}>
                        <div>
                          <h3>{l.title}</h3>
                          <small>
                            {l.category} · {l.published ? 'Published' : 'Draft'}
                          </small>
                        </div>
                        <Button
                          variant="outline"
                          onClick={() => open('edit-lesson', l)}
                        >
                          Edit
                        </Button>
                      </div>
                    ))}
                  </section>
                  <section className="panel">
                    <PanelHead title="Results awaiting review">
                      <span className="text-xs text-muted-foreground">
                        Review evidence before approving
                      </span>
                    </PanelHead>
                    {data.admin?.events.length ? (
                      eventTable(data.admin.events, true)
                    ) : (
                      <Empty
                        icon={ShieldCheck}
                        title="Nothing waiting for review."
                        compact
                      />
                    )}
                  </section>
                  <section className="panel">
                    <PanelHead title="Admin activity" />
                    {data.admin?.audit.map((a: Row, i: number) => (
                      <div className="key-row" key={i}>
                        <h3>{a.action}</h3>
                        <small>{timeAgo(a.created_at)}</small>
                      </div>
                    ))}
                  </section>
                </div>
              )}
            </>
          )}
          <footer className="footer-note">
            BUILT FOR THE BUILDERS. &nbsp; ECOM SA.
          </footer>
        </div>
      </main>
      <Dialog
        open={!!modal}
        onOpenChange={(v) => {
          if (!v) {
            setModal(null);
            setRevealed('');
            setError('');
          }
        }}
      >
        <DialogContent
          className={
            'modal ' +
            (['lesson', 'thread', 'api-docs'].includes(modal?.type || '')
              ? 'wide'
              : '')
          }
        >
          <DialogHeader>
            <DialogTitle>
              {(
                {
                  store: 'Add your store',
                  key: 'Create a store API key',
                  shopify: 'Connect Shopify webhooks',
                  manual: 'Log a store result',
                  invite: 'Invite a member',
                  'edit-lesson': draft.id ? 'Edit lesson' : 'Create a lesson',
                  lesson: modal?.item?.title,
                  thread: 'Keep the conversation going',
                  'delete-post': 'Delete this post?',
                  'revoke-key': 'Revoke this key?',
                  'member-status': 'Change member access',
                  review: 'Review this result',
                  'api-docs': 'Your store → your profile',
                } as Row
              )[modal?.type || ''] || 'Workspace'}
            </DialogTitle>
            <DialogDescription>
              {
                (
                  {
                    store: 'Only you and the team can see your store details.',
                    key: 'A server-to-server key scoped to this store. It expires in 90 days.',
                    shopify:
                      'New paid orders and refunds can update your log automatically.',
                    manual:
                      'Manual amounts are self-reported. They are not marked as verified.',
                    invite:
                      'Create a private, email-bound invitation. Send it yourself.',
                    'edit-lesson':
                      'Keep it practical. Give members something they can do.',
                    lesson: modal?.item?.category,
                    thread: 'Be helpful. Give context.',
                    'delete-post':
                      'This also deletes the replies. This cannot be undone.',
                    'revoke-key':
                      'Integrations using this key will stop immediately. Create a replacement first if needed.',
                    'member-status':
                      'Suspension blocks dashboard access and all store API keys.',
                    review:
                      'Check the underlying store evidence before approving.',
                    'api-docs':
                      'Send real events from your backend. Never put a key in a storefront or browser.',
                  } as Row
                )[modal?.type || '']
              }
            </DialogDescription>
          </DialogHeader>
          <div className="modal-body">
            {modal && errors}
            {modal?.type === 'store' && (
              <form
                className="form"
                onSubmit={(e) => submit(e, 'store', { name: draft.name })}
              >
                <Field label="Private store name">
                  <Input
                    required
                    maxLength={80}
                    placeholder="My store"
                    value={draft.name || ''}
                    onChange={(e) => d('name', e.target.value)}
                  />
                </Field>
                <Button disabled={busy} type="submit">
                  Add store <Plus />
                </Button>
              </form>
            )}
            {modal?.type === 'key' &&
              (revealed ? (
                <div className="form">
                  <div className="notice">
                    Copy this now. The full key is shown only once.
                  </div>
                  <code className="secret-box">{revealed}</code>
                  <Button onClick={() => copy(revealed)}>
                    <Copy />
                    Copy key
                  </Button>
                  <Button variant="outline" onClick={() => open('api-docs')}>
                    Open integration guide
                  </Button>
                </div>
              ) : (
                <form
                  className="form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const r = await act(
                      'key',
                      { store_id: modal.item!.id, name: draft.key_name },
                      '',
                    );
                    if (r) setRevealed(r.token);
                  }}
                >
                  <Field label="Key label">
                    <Input
                      required
                      maxLength={60}
                      placeholder="Order webhook integration"
                      value={draft.key_name || ''}
                      onChange={(e) => d('key_name', e.target.value)}
                    />
                  </Field>
                  <div className="notice">
                    This key can only add events to {modal.item?.name}. It
                    cannot read member data, manage posts or access another
                    store.
                  </div>
                  <Button disabled={busy} type="submit">
                    Generate key <KeyRound />
                  </Button>
                </form>
              ))}
            {modal?.type === 'manual' && (
              <form
                className="form"
                onSubmit={(e) =>
                  submit(e, 'manual-event', {
                    store_id: modal.item!.id,
                    kind: draft.kind || 'sale',
                    amount_cents: Math.round(Number(draft.amount) * 100),
                    currency: 'ZAR',
                    occurred_at: new Date().toISOString(),
                    note: draft.note || '',
                  })
                }
              >
                <Field label="Event type">
                  <Pick
                    value={draft.kind || 'sale'}
                    onChange={(v) => d('kind', v)}
                    label="Event type"
                    items={[
                      ['sale', 'Sale'],
                      ['refund', 'Refund'],
                    ]}
                  />
                </Field>
                <Field label="Amount in rand (ZAR)">
                  <Input
                    required
                    type="number"
                    step=".01"
                    min=".01"
                    max="1000000"
                    value={draft.amount || ''}
                    onChange={(e) => d('amount', e.target.value)}
                    placeholder="399.00"
                  />
                </Field>
                <Field label="Short note (no customer details)">
                  <Input
                    maxLength={200}
                    value={draft.note || ''}
                    onChange={(e) => d('note', e.target.value)}
                    placeholder="First order from my new product"
                  />
                </Field>
                <p>
                  Logged with today’s date. Refunds subtract from your total.
                  Sales amounts are not profit.
                </p>
                <Button disabled={busy} type="submit">
                  Add to my log
                </Button>
              </form>
            )}
            {modal?.type === 'shopify' && (
              <form
                className="form"
                onSubmit={(e) =>
                  submit(e, 'shopify', {
                    store_id: modal.item!.id,
                    domain: draft.domain,
                    signing_secret: draft.signing_secret,
                  })
                }
              >
                <div className="notice">
                  Advanced setup: create JSON webhooks in Shopify → Settings →
                  Notifications → Webhooks for <strong>Order payment</strong>{' '}
                  <strong>Refund create</strong> and{' '}
                  <strong>Transaction creation</strong>. Use the same URL below
                  for all three. Select API version 2026-07.
                </div>
                <code className="secret-box">
                  {typeof location !== 'undefined' ? location.origin : ''}
                  /api/webhooks/shopify/{modal.item!.id}
                </code>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    copy(
                      location.origin +
                        '/api/webhooks/shopify/' +
                        modal.item!.id,
                    )
                  }
                >
                  <Copy />
                  Copy webhook URL
                </Button>
                <Field label="Shopify domain">
                  <Input
                    required
                    placeholder="your-store.myshopify.com"
                    value={draft.domain || ''}
                    onChange={(e) => d('domain', e.target.value)}
                  />
                </Field>
                <Field label="Webhook signing secret">
                  <Input
                    required
                    type="password"
                    autoComplete="new-password"
                    value={draft.signing_secret || ''}
                    onChange={(e) => d('signing_secret', e.target.value)}
                    placeholder="The signing secret shown under your webhooks"
                  />
                </Field>
                <p>
                  Stored encrypted. Not your Admin API access token. Send a
                  Shopify test to check delivery, then a real paid order to
                  start the log. Historical orders are not imported.
                  Shopify-signed results still need team review for the reviewed
                  board.
                </p>
                <Button
                  disabled={busy || !data.connectionsAvailable}
                  type="submit"
                >
                  Save Shopify connection
                </Button>
                {modal.item!.connected > 0 && (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={async () => {
                      if (
                        await act('shopify', {
                          store_id: modal.item!.id,
                          disconnect: true,
                        })
                      )
                        setModal(null);
                    }}
                  >
                    Disconnect webhook
                  </Button>
                )}
                <a
                  className="text-link"
                  href="https://help.shopify.com/en/manual/fulfillment/setup/notifications/webhooks"
                  target="_blank"
                  rel="noreferrer"
                >
                  Shopify webhook setup guide <ExternalLink size={14} />
                </a>
              </form>
            )}
            {modal?.type === 'invite' &&
              (revealed ? (
                <div className="form">
                  <div className="notice">
                    Created. Only the invited email can redeem this link.
                  </div>
                  <code className="secret-box">{revealed}</code>
                  <Button onClick={() => copy(revealed)}>
                    <Copy />
                    Copy invitation
                  </Button>
                  <p>Share privately with the member. Expires in 7 days.</p>
                </div>
              ) : (
                <form
                  className="form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const r = await act('invite', { email: draft.email }, '');
                    if (r) setRevealed(r.inviteUrl);
                  }}
                >
                  <Field label="Member’s sign-in email">
                    <Input
                      required
                      type="email"
                      value={draft.email || ''}
                      onChange={(e) => d('email', e.target.value)}
                      placeholder="member@example.com"
                    />
                  </Field>
                  <p>
                    Use the email they use to sign in with ChatGPT. Confirm
                    their membership first.
                  </p>
                  <Button disabled={busy} type="submit">
                    Create invitation <ArrowRight />
                  </Button>
                </form>
              ))}
            {modal?.type === 'edit-lesson' && (
              <form
                className="form"
                onSubmit={(e) =>
                  submit(e, 'lesson', {
                    ...draft,
                    duration: Number(draft.duration || 5),
                    published: !!draft.published,
                  })
                }
              >
                <Field label="Lesson title">
                  <Input
                    required
                    maxLength={120}
                    value={draft.title || ''}
                    onChange={(e) => d('title', e.target.value)}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Course / category">
                    <Input
                      required
                      maxLength={60}
                      value={draft.category || ''}
                      onChange={(e) => d('category', e.target.value)}
                      placeholder="Start here"
                    />
                  </Field>
                  <Field label="Minutes">
                    <Input
                      required
                      type="number"
                      min={1}
                      max={600}
                      value={draft.duration || 5}
                      onChange={(e) => d('duration', e.target.value)}
                    />
                  </Field>
                </div>
                <Field label="Course">
                  <Pick
                    label="Course"
                    value={draft.course_id || 'none'}
                    onChange={(v) => {
                      d('course_id', v === 'none' ? null : v);
                      d('module_id', null);
                    }}
                    items={[
                      ['none', 'Original category (no course)'],
                      ...(data.courses || []).map((c) => [c.id, c.title]),
                    ]}
                  />
                </Field>
                {draft.course_id && (
                  <Field label="Module">
                    <Pick
                      label="Module"
                      value={draft.module_id || 'none'}
                      onChange={(v) => d('module_id', v === 'none' ? null : v)}
                      items={[
                        ['none', 'Ungrouped lessons'],
                        ...(data.modules || [])
                          .filter((m) => m.course_id === draft.course_id)
                          .map((m) => [m.id, m.title]),
                      ]}
                    />
                  </Field>
                )}
                <Field label="Lesson order (lowest first)">
                  <Input
                    type="number"
                    min={0}
                    max={999}
                    value={draft.position || 0}
                    onChange={(e) => d('position', Number(e.target.value))}
                  />
                </Field>
                <Field label="Lesson content">
                  <Textarea
                    required
                    maxLength={10000}
                    className="min-h-[200px]"
                    value={draft.body || ''}
                    onChange={(e) => d('body', e.target.value)}
                    placeholder="Explain it simply. End with one clear action."
                  />
                </Field>
                <Field label="Hosted resource (optional, up to 30 MB)">
                  <Input
                    type="file"
                    accept=".pdf,.mp4,.webm,.jpg,.jpeg,.png,.webp"
                    disabled={busy}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setBusy(true);
                      try {
                        if (file.size > 30 * 1024 * 1024)
                          throw Error('Use a file smaller than 30 MB.');
                        const f = new FormData();
                        f.set('file', file);
                        const r = await fetch('/api/files', {
                          method: 'POST',
                          body: f,
                        });
                        const v = (await r.json()) as Row;
                        if (!r.ok) throw Error(v.error);
                        d('asset_id', v.id);
                        d('asset_name', v.name);
                        setSuccess('Resource uploaded');
                      } catch (err) {
                        setError((err as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  />
                  {draft.asset_id && (
                    <p>
                      Attached: {draft.asset_name || 'Saved resource'}{' '}
                      <button
                        type="button"
                        className="text-link"
                        onClick={() => {
                          d('asset_id', null);
                          d('asset_name', '');
                        }}
                      >
                        Remove from lesson
                      </button>
                    </p>
                  )}
                </Field>
                <div className="check">
                  <input
                    id="published"
                    type="checkbox"
                    checked={!!draft.published}
                    onChange={(e) => d('published', e.target.checked)}
                  />
                  <label htmlFor="published">
                    Publish this lesson for members
                  </label>
                </div>
                <Button disabled={busy} type="submit">
                  {busy ? 'Saving…' : 'Save lesson'}
                </Button>
              </form>
            )}
            {modal?.type === 'lesson' && (
              <>
                <div className="flex items-center gap-3">
                  <span className="pill">{modal.item!.duration} MIN</span>
                  {modal.item!.completed > 0 && (
                    <span className="pill">
                      <Check size={12} className="inline" /> COMPLETED
                    </span>
                  )}
                  {admin && (
                    <button
                      className="text-link ml-auto"
                      onClick={() => open('edit-lesson', modal.item)}
                    >
                      Edit lesson
                    </button>
                  )}
                </div>
                {modal.item!.asset_id &&
                  (modal.item!.mime?.startsWith('video/') ? (
                    <video
                      className="lesson-video mt-5"
                      controls
                      preload="metadata"
                      src={'/api/files?id=' + modal.item!.asset_id}
                    />
                  ) : modal.item!.mime?.startsWith('image/') ? (
                    <img
                      className="lesson-photo mt-5"
                      alt={modal.item!.asset_name || 'Lesson resource'}
                      src={'/api/files?id=' + modal.item!.asset_id}
                    />
                  ) : (
                    <a
                      className="text-link mt-5"
                      href={'/api/files?id=' + modal.item!.asset_id}
                    >
                      <FileText size={17} />
                      Download {modal.item!.asset_name || 'resource'}
                    </a>
                  ))}
                <div className="lesson-body">{modal.item!.body}</div>
                {modal.item!.published > 0 && (
                  <Button
                    disabled={busy}
                    className="w-full"
                    onClick={async () => {
                      const completed = !modal.item!.completed;
                      if (
                        await act(
                          'complete',
                          { id: modal.item!.id, completed },
                          completed
                            ? 'Progress saved. Keep going.'
                            : 'Marked as not completed',
                        )
                      )
                        setModal((old) =>
                          old
                            ? {
                                ...old,
                                item: {
                                  ...old.item,
                                  completed: completed ? 1 : 0,
                                },
                              }
                            : null,
                        );
                    }}
                  >
                    {modal.item!.completed
                      ? 'Mark as not completed'
                      : 'Mark complete'}{' '}
                    <CheckCircle2 />
                  </Button>
                )}
              </>
            )}
            {modal?.type === 'thread' && (
              <>
                <article className="post px-0 border-0">
                  <div className="post-top">
                    <Avatar name={modal.item!.name} />
                    <strong className="text-sm">{modal.item!.name}</strong>
                  </div>
                  <p className="post-text">{modal.item!.body}</p>
                </article>
                {replies.map((r) => (
                  <article className="post px-0" key={r.id}>
                    <div className="post-top">
                      <Avatar name={r.name} size="small" />
                      <span className="text-sm">{r.name}</span>
                      <small>{timeAgo(r.created_at)}</small>
                    </div>
                    <p className="post-text">{r.body}</p>
                  </article>
                ))}
                <form
                  className="form mt-4"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const result = await act(
                      'post',
                      {
                        channel: modal.item!.channel,
                        parent_id: modal.item!.id,
                        body: reply,
                      },
                      'Reply posted',
                    );
                    if (result) {
                      const r = await fetch(
                        '/api/hub?thread=' + modal.item!.id,
                      );
                      const v = (await r.json()) as Row;
                      setReplies(v.replies || []);
                      setReply('');
                    }
                  }}
                >
                  <Textarea
                    aria-label="Your reply"
                    required
                    maxLength={4000}
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder="Add something helpful…"
                  />
                  <Button type="submit" disabled={busy}>
                    Post reply <ArrowRight />
                  </Button>
                </form>
              </>
            )}
            {modal?.type === 'api-docs' && (
              <div className="form">
                <div className="notice">
                  The key chooses the store and student. Do not send a member
                  ID. Retries with the same event ID do not create duplicate
                  revenue.
                </div>
                <pre>{`POST ${typeof location !== 'undefined' ? location.origin : ''}/api/v1/events
Authorization: Bearer YOUR_STORE_API_KEY
Content-Type: application/json

{
  "event_id": "order-123-paid",
  "kind": "sale",
  "amount_cents": 39900,
  "currency": "ZAR",
  "occurred_at": "2026-09-05T12:00:00+02:00",
  "note": "Paid order"
}`}</pre>
                <p>
                  Use a unique event_id per sale or refund. kind: sale or
                  refund. Send positive amounts in cents; refunds are subtracted
                  automatically. Use the actual payment timestamp. Only ZAR is
                  supported.
                </p>
                <p>
                  201 = recorded · 200 = duplicate ignored · 400 = invalid data
                  · 401 = invalid / expired key · 409 = reused ID with changed
                  data · 429 = rate limit (retry in a minute).
                </p>
                <p>
                  Limit: 120 requests/minute/key. Keys expire in 90 days and can
                  be revoked immediately. Keep retries in your integration until
                  you receive a successful response. Use one source per sale—do
                  not send the same Shopify order through this API and the
                  Shopify webhook.
                </p>
                <p>
                  API-reported results are not independently verified. There is
                  no customer information in this payload. Include all refunds
                  to keep your totals honest.
                </p>
              </div>
            )}
            {modal?.type === 'delete-post' && (
              <Button
                variant="destructive"
                disabled={busy}
                onClick={async () => {
                  if (
                    await act(
                      'delete-post',
                      { id: modal.item!.id },
                      'Post deleted',
                    )
                  )
                    setModal(null);
                }}
              >
                Delete post and replies
              </Button>
            )}
            {modal?.type === 'revoke-key' && (
              <Button
                variant="destructive"
                disabled={busy}
                onClick={async () => {
                  if (
                    await act(
                      'revoke-key',
                      { id: modal.item!.id },
                      'Key revoked',
                    )
                  )
                    setModal(null);
                }}
              >
                Revoke key now
              </Button>
            )}
            {modal?.type === 'member-status' && (
              <div className="form">
                <p>
                  {modal.item!.name} · {modal.item!.email}
                </p>
                <Button
                  variant={
                    modal.item!.status === 'active' ? 'destructive' : 'default'
                  }
                  disabled={busy}
                  onClick={async () => {
                    if (
                      await act('member-status', {
                        id: modal.item!.id,
                        status:
                          modal.item!.status === 'active'
                            ? 'suspended'
                            : 'active',
                      })
                    )
                      setModal(null);
                  }}
                >
                  {modal.item!.status === 'active'
                    ? 'Suspend member'
                    : 'Restore member'}
                </Button>
              </div>
            )}
            {modal?.type === 'review' && (
              <div className="form">
                <p>
                  {modal.item!.name} · {money(modal.item!.amount)} ·{' '}
                  {when(modal.item!.occurred_at)}
                </p>
                <Source event={modal.item!} />
                <p>
                  Approval affects the reviewed leaderboard. Confirm the amount
                  and event against the member’s underlying store evidence. If
                  it is wrong, void it; do not approve it.
                </p>
                <Button
                  disabled={busy}
                  onClick={async () => {
                    if (
                      await act(
                        'review-event',
                        { id: modal.item!.id, voided: false },
                        'Result marked as team reviewed',
                      )
                    )
                      setModal(null);
                  }}
                >
                  I checked the evidence — approve
                </Button>
                <Button
                  variant="destructive"
                  disabled={busy}
                  onClick={async () => {
                    if (
                      await act(
                        'review-event',
                        { id: modal.item!.id, voided: true },
                        'Result voided',
                      )
                    )
                      setModal(null);
                  }}
                >
                  Void this result
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
