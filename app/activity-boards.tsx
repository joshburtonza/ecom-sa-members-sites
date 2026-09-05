'use client';
import { useState } from 'react';
import { BookOpen, Heart, Trophy } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Button } from '../components/ui/button';
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableCell,
  TableRow,
} from '../components/ui/table';
type Entry = { id: string; name: string; points: number };
export default function ActivityBoards({
  learning,
  helpful,
  me,
  period,
  setPeriod,
  profile,
}: {
  learning: Entry[];
  helpful: Entry[];
  me: { id: string; activity_leaderboard: number };
  period: string;
  setPeriod: (v: string) => void;
  profile: () => void;
}) {
  const [tab, setTab] = useState('learning');
  const entries = tab === 'learning' ? learning : helpful;
  const mine = entries.findIndex((e) => e.id === me.id);
  return (
    <section className="panel activity-boards">
      <div className="panel-pad">
        <div className="feature-heading">
          <div>
            <span className="eyebrow">PROGRESS COUNTS, TOO</span>
            <h2>More than a sales number.</h2>
            <p>Keep learning. Help someone get unstuck.</p>
          </div>
          <Trophy className="text-primary" size={36} />
        </div>
        <div className="filters">
          <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
            <TabsList>
              <TabsTrigger value="learning">
                <BookOpen size={14} />
                Learning
              </TabsTrigger>
              <TabsTrigger value="helpful">
                <Heart size={14} />
                Helpful members
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Tabs value={period} onValueChange={(v) => setPeriod(String(v))}>
            <TabsList>
              <TabsTrigger value="month">This month</TabsTrigger>
              <TabsTrigger value="all">All time</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <p className="text-sm text-muted-foreground">
          {tab === 'learning'
            ? 'Published lessons completed in this period. Each lesson counts once.'
            : 'Different active members who liked your posts or replies written in this period. Your own likes do not count.'}
        </p>
        {mine >= 0 && (
          <div className="rank-strip">
            Your place <strong>#{mine + 1}</strong>
            <span>
              {entries[mine].points}{' '}
              {tab === 'learning' ? 'lessons completed' : 'members helped'}
            </span>
          </div>
        )}
      </div>
      {entries.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rank</TableHead>
              <TableHead>Member</TableHead>
              <TableHead className="text-right">
                {tab === 'learning' ? 'Lessons' : 'Members helped'}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((e, i) => (
              <TableRow
                key={e.id}
                className={e.id === me.id ? 'my-ranking' : ''}
              >
                <TableCell>
                  <span className={'rank-number rank-' + i}>{i + 1}</span>
                </TableCell>
                <TableCell>
                  {e.name}
                  {e.id === me.id ? ' · You' : ''}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {e.points}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <div className="panel-pad">
          <h3>The first place is still open.</h3>
          <p>
            Opt in, then{' '}
            {tab === 'learning'
              ? 'complete a lesson'
              : 'share something useful in the community'}
            .
          </p>
        </div>
      )}
      {!me.activity_leaderboard && (
        <div className="panel-pad flex gap-3 items-center flex-wrap">
          <p className="text-sm text-muted-foreground">
            You are not listed. Join without sharing store revenue.
          </p>
          <Button variant="outline" onClick={profile}>
            Choose my privacy settings
          </Button>
        </div>
      )}
      <p className="panel-pad text-xs text-muted-foreground">
        Refreshes every 15 seconds while this tab is visible. Equal scores use
        join date as a tiebreaker. Sales rankings below have a separate privacy
        setting.
      </p>
    </section>
  );
}
