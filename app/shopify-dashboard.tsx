'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Store,
  Lock,
  ArrowUpRight,
  RefreshCw,
  Link2,
  ShieldCheck,
  Wallet,
  ReceiptText,
  RotateCcw,
  CircleHelp,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Checkbox } from '../components/ui/checkbox';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '../components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../components/ui/dialog';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '../components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import type { StoreSnapshot } from '../lib/shopify-admin';
type Connection = {
  store_id: string;
  domain: string;
  status: string;
  snapshot: string | null;
  snapshot_at: number | null;
  last_error: string | null;
  importing: number;
};
type Data = { available: boolean; connections: Connection[]; admin: boolean };
const money = (n: number, currency: string) =>
  new Intl.NumberFormat('en-ZA', { style: 'currency', currency }).format(
    n / 1000000,
  );
const human = (s: string) => s.toLowerCase().replaceAll('_', ' ');
export default function ShopifyDashboard({
  stores,
  addStore,
}: {
  stores: { id: string; name: string }[];
  addStore: () => void;
}) {
  const [data, setData] = useState<Data | null>(null),
    [selected, setSelected] = useState(''),
    [error, setError] = useState(''),
    [note, setNote] = useState('');
  const [connecting, setConnecting] = useState(false),
    [disconnecting, setDisconnecting] = useState(false),
    [busy, setBusy] = useState(false);
  const [domain, setDomain] = useState(''),
    [consent, setConsent] = useState(false),
    [search, setSearch] = useState('');
  const running = useRef(false),
    alive = useRef(true);
  const storeId = stores.some((s) => s.id === selected)
    ? selected
    : stores[0]?.id || '';
  const connection = data?.connections.find((c) => c.store_id === storeId);
  let snapshot: StoreSnapshot | null = null;
  try {
    if (connection?.snapshot) snapshot = JSON.parse(connection.snapshot);
  } catch {
    /* An unreadable snapshot is not a zero-sales result. */
  }
  const load = useCallback(async () => {
    const r = await fetch('/api/shopify', { cache: 'no-store' });
    const v = (await r.json()) as Data & { error?: string };
    if (!r.ok)
      throw Error(v.error || 'Your Shopify connections could not load.');
    if (alive.current) setData(v);
    return v;
  }, []);
  useEffect(() => {
    alive.current = true;
    load().catch((e) => alive.current && setError(e.message));
    return () => {
      alive.current = false;
    };
  }, [load]);
  const action = async (body: Record<string, unknown>) => {
    const r = await fetch('/api/shopify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const v = (await r.json()) as {
      error?: string;
      url?: string;
      complete?: boolean;
      orders?: number;
      message?: string;
    };
    if (!r.ok) throw Error(v.error || 'Please try again.');
    return v;
  };
  const sync = useCallback(
    async (id: string) => {
      if (running.current) return;
      running.current = true;
      setBusy(true);
      setError('');
      setNote('Reading your orders from Shopify…');
      try {
        for (let page = 0; page < 250; page++) {
          if (!alive.current) break;
          const v = await action({ action: 'sync', store_id: id });
          if (!alive.current) break;
          setNote(
            (v.orders || 0) +
              ' orders read' +
              (v.complete ? '. Your dashboard is up to date.' : '…'),
          );
          if (v.complete) {
            await load();
            break;
          }
        }
      } catch (e) {
        if (alive.current) {
          setError((e as Error).message);
          setNote('');
          await load().catch(() => {});
        }
      } finally {
        running.current = false;
        if (alive.current) setBusy(false);
      }
    },
    [load],
  );
  useEffect(() => {
    if (!data?.available || connection?.status !== 'connected' || !storeId)
      return;
    const refreshIfStale = () => {
      if (
        document.visibilityState === 'visible' &&
        !running.current &&
        (!connection.snapshot_at ||
          Date.now() - connection.snapshot_at > 300000)
      )
        void sync(storeId);
    };
    refreshIfStale();
    const timer = setInterval(refreshIfStale, 300000);
    return () => clearInterval(timer);
  }, [
    data?.available,
    connection?.status,
    connection?.snapshot_at,
    storeId,
    sync,
  ]);
  const visibleOrders =
    snapshot?.orders.filter((o) =>
      (
        o.name +
        ' ' +
        o.financial +
        ' ' +
        o.fulfillment +
        ' ' +
        o.gateways.join(' ')
      )
        .toLowerCase()
        .includes(search.toLowerCase()),
    ) || [];
  return (
    <section className="shopify-workspace">
      <div className="shopify-heading">
        <div>
          <span className="eyebrow">YOUR STORE, IN ONE PLACE</span>
          <h2>What came in. What is still due.</h2>
          <p>Read-only Shopify access. Your orders stay private.</p>
        </div>
        <ShieldCheck size={30} className="text-primary" />
      </div>
      {error && (
        <div className="notice error mb-4" role="alert">
          {error}
        </div>
      )}
      {note && (
        <p className="notice mb-4" role="status">
          {note}
        </p>
      )}
      {!data ? (
        <p>Loading store connections…</p>
      ) : (
        <>
          {!data.available && (
            <div className="connection-banner">
              <Link2 />
              <div>
                <strong>Shopify Connect is being set up.</strong>
                <p>
                  {data.admin
                    ? 'The Shopify app must be registered and approved for member stores before this can go live. Connection buttons stay off until setup is complete.'
                    : 'The team is finishing the Shopify connection. You will approve access in Shopify when it is ready.'}
                </p>
              </div>
            </div>
          )}
          <div className="shopify-toolbar">
            {stores.length > 0 && (
              <Select
                value={storeId}
                onValueChange={(v) => {
                  if (v) {
                    setSelected(v);
                    setError('');
                    setNote('');
                  }
                }}
                disabled={busy}
              >
                <SelectTrigger aria-label="Choose your store">
                  <SelectValue>
                    {stores.find((s) => s.id === storeId)?.name}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {stores.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button variant="outline" onClick={addStore} disabled={busy}>
              Add a store
            </Button>
            {connection?.status === 'connected' ? (
              <>
                <span className="shopify-status">
                  <i /> Connected · read only
                </span>
                <Button
                  className="ml-auto"
                  disabled={busy || !data.available}
                  onClick={() => sync(storeId)}
                >
                  <RefreshCw className={busy ? 'animate-spin' : ''} />
                  {busy ? 'Refreshing…' : 'Refresh orders'}
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setDisconnecting(true)}
                >
                  Disconnect
                </Button>
              </>
            ) : (
              <Button
                disabled={!data.available || !storeId || busy}
                className="ml-auto"
                onClick={() => {
                  setDomain(connection?.domain || '');
                  setConsent(false);
                  setConnecting(true);
                }}
              >
                <Link2 />
                {connection?.status === 'reconnect'
                  ? 'Reconnect Shopify'
                  : 'Connect Shopify'}
              </Button>
            )}
          </div>
          {connection?.last_error && (
            <p className="notice error mb-4">{connection.last_error}</p>
          )}
          {snapshot ? (
            <>
              <div className="shopify-range">
                <strong>Orders created in the last 30 days</strong>
                <span>
                  {new Date(snapshot.since).toLocaleDateString('en-ZA')} –{' '}
                  {new Date(snapshot.until).toLocaleDateString('en-ZA')}
                </span>
                <small>
                  Last complete refresh:{' '}
                  {connection?.snapshot_at
                    ? new Date(connection.snapshot_at).toLocaleString('en-ZA', {
                        timeZone: 'Africa/Johannesburg',
                      })
                    : 'Unknown'}{' '}
                  SAST
                </small>
              </div>
              {snapshot.totals.map((t) => (
                <div key={t.currency}>
                  <div className="shopify-currency">
                    {t.currency} · {t.orders} non-test orders
                  </div>
                  <div className="shopify-metrics">
                    {[
                      ['Received', t.received, Wallet],
                      ['Refunded', t.refunded, RotateCcw],
                      [
                        'Received less refunds',
                        t.received - t.refunded,
                        ReceiptText,
                      ],
                      ['Still due from customers', t.awaiting, CircleHelp],
                    ].map(([label, value, Icon]) => {
                      const I = Icon as typeof Wallet;
                      return (
                        <div
                          className="panel shopify-metric"
                          key={String(label)}
                        >
                          <span>
                            {String(label)}
                            <I size={17} />
                          </span>
                          <strong>{money(value as number, t.currency)}</strong>
                        </div>
                      );
                    })}
                  </div>
                  {t.owed > 0 && (
                    <p className="notice mb-4">
                      {money(t.owed, t.currency)} is outstanding in customers’
                      favour. This is shown separately, not offset against money
                      still due from other orders.
                    </p>
                  )}
                </div>
              ))}
              <div className="shopify-money-note">
                <Wallet />
                <div>
                  <strong>Received does not mean paid into your bank.</strong>
                  <p>
                    These are Shopify’s order payment totals, including any tax
                    and shipping. Payment-provider fees, ad spend and product
                    costs are not deducted. Profit and provider payout balances
                    are not connected.
                  </p>
                </div>
              </div>
              <section className="panel">
                <div className="shopify-table-head">
                  <div>
                    <h3>Recent orders</h3>
                    <p>
                      {snapshot.count} non-test orders included in the totals ·
                      showing the newest {snapshot.orders.length}
                    </p>
                  </div>
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Find an order or status"
                    aria-label="Find an order or status"
                  />
                </div>
                {visibleOrders.length ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order</TableHead>
                        <TableHead>Payment</TableHead>
                        <TableHead>Fulfilment</TableHead>
                        <TableHead>Provider</TableHead>
                        <TableHead className="text-right">
                          Received less refunds
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleOrders.map((o) => (
                        <TableRow key={o.id}>
                          <TableCell>
                            <a
                              className="shopify-order-link"
                              href={
                                'https://' +
                                connection!.domain +
                                '/admin/orders/' +
                                o.id.split('/').at(-1)
                              }
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {o.name}
                              <ArrowUpRight size={13} />
                            </a>
                            <small className="block text-muted-foreground mt-1">
                              {new Date(o.createdAt).toLocaleDateString(
                                'en-ZA',
                              )}
                            </small>
                          </TableCell>
                          <TableCell>
                            <span
                              className={
                                'order-status ' +
                                (o.financial === 'PAID' ? 'paid' : '')
                              }
                            >
                              {human(o.financial)}
                            </span>
                          </TableCell>
                          <TableCell>{human(o.fulfillment)}</TableCell>
                          <TableCell>
                            {o.gateways.join(', ') || 'Not reported'}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {money(o.received - o.refunded, o.currency)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="panel-pad">
                    <p>
                      {search
                        ? 'No orders match that search.'
                        : 'No non-test orders were found in this 30-day window.'}
                    </p>
                  </div>
                )}
              </section>
            </>
          ) : (
            <section className="panel shopify-empty">
              <Store size={35} className="text-primary" />
              <h3>
                {connection?.status === 'connected'
                  ? 'Your first refresh is next.'
                  : 'Connect once. Keep your store in view.'}
              </h3>
              <p>
                {connection?.status === 'connected'
                  ? 'Your order totals appear after every page has been read successfully.'
                  : 'Add your store, approve read-only access in Shopify, then see your orders and payment totals here.'}
              </p>
              <div className="connection-steps">
                <span>
                  <b>1</b>Choose your store
                </span>
                <span>
                  <b>2</b>Approve in Shopify
                </span>
                <span>
                  <b>3</b>See your numbers
                </span>
              </div>
              <p className="text-sm">
                No passwords. No collaborator codes. No permission to change
                your products, orders or payouts.
              </p>
            </section>
          )}
          <p className="shopify-footnote">
            <Lock size={14} />
            Refreshes about every five minutes while this view is open and
            visible. Totals cover orders created in the displayed window—not a
            payout-period statement. Older orders, profit and external-provider
            balances are outside this connection. Existing event/API leaderboard
            totals below are separate and are not added to these totals.
          </p>
        </>
      )}
      <Dialog open={connecting} onOpenChange={(v) => !busy && setConnecting(v)}>
        <DialogContent className="modal">
          <DialogHeader>
            <DialogTitle>Connect your Shopify store</DialogTitle>
            <DialogDescription>
              Shopify will show exactly what Ecom SA can read. You can revoke
              access at any time.
            </DialogDescription>
          </DialogHeader>
          <form
            className="form"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError('');
              try {
                const v = await action({
                  action: 'connect',
                  store_id: storeId,
                  domain,
                  consent,
                });
                if (v.url) window.location.assign(v.url);
              } catch (e) {
                setError((e as Error).message);
                setBusy(false);
                setConnecting(false);
              }
            }}
          >
            <label htmlFor="shopify-domain">
              Your original Shopify address
            </label>
            <Input
              id="shopify-domain"
              required
              maxLength={80}
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="your-store.myshopify.com"
              autoComplete="off"
            />
            <div className="notice">
              Read orders, payment totals, refunds and fulfilment status. We do
              not request customer names, contact details or addresses. A
              collaborator request code does not grant this API access.
            </div>
            <label className="check" htmlFor="shopify-consent">
              <Checkbox
                id="shopify-consent"
                checked={consent}
                onCheckedChange={(v) => setConsent(v === true)}
              />
              <span>
                I am authorised to connect this store and want Ecom SA to read
                its order data for my private dashboard.
              </span>
            </label>
            <Button type="submit" disabled={busy || !consent}>
              {busy ? 'Opening Shopify…' : 'Continue to Shopify'}
              <ArrowUpRight />
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog open={disconnecting} onOpenChange={setDisconnecting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect this Shopify store?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the dashboard’s saved connection credentials and
              imported order summary. It does not delete Shopify orders or your
              manually logged results. Uninstall the Ecom SA app in Shopify as
              well to revoke its grant.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>
              Keep connected
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const v = await action({
                    action: 'disconnect',
                    store_id: storeId,
                  });
                  await load();
                  setNote(v.message || 'Disconnected.');
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                  setDisconnecting(false);
                }
              }}
            >
              Disconnect and clear imported data
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
