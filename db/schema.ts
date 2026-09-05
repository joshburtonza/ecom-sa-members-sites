import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/sqlite-core';
export const members = sqliteTable(
  'members',
  {
    id: text().primaryKey(),
    email: text().notNull(),
    name: text().notNull(),
    bio: text().notNull().default(''),
    role: text().notNull().default('member'),
    status: text().notNull().default('active'),
    leaderboard: integer().notNull().default(0),
    activity_leaderboard: integer().notNull().default(0),
    joined_at: integer().notNull(),
  },
  (t) => [uniqueIndex('members_email').on(t.email)],
);
export const invites = sqliteTable(
  'invites',
  {
    id: text().primaryKey(),
    email: text().notNull(),
    token_hash: text().notNull(),
    expires_at: integer().notNull(),
    created_at: integer().notNull(),
    used_by: text(),
    revoked: integer().notNull().default(0),
  },
  (t) => [uniqueIndex('invite_token').on(t.token_hash)],
);
export const posts = sqliteTable(
  'posts',
  {
    id: text().primaryKey(),
    member_id: text()
      .notNull()
      .references(() => members.id),
    channel: text().notNull(),
    parent_id: text(),
    body: text().notNull(),
    pinned: integer().notNull().default(0),
    created_at: integer().notNull(),
  },
  (t) => [
    index('posts_channel_time').on(t.channel, t.created_at),
    index('posts_parent').on(t.parent_id),
  ],
);
export const reactions = sqliteTable(
  'reactions',
  {
    post_id: text()
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    member_id: text()
      .notNull()
      .references(() => members.id),
  },
  (t) => [primaryKey({ columns: [t.post_id, t.member_id] })],
);
export const courses = sqliteTable('courses', {
  id: text().primaryKey(),
  title: text().notNull(),
  summary: text().notNull().default(''),
  level: text().notNull().default('Start here'),
  published: integer().notNull().default(0),
  position: integer().notNull().default(0),
  created_at: integer().notNull(),
});
export const courseModules = sqliteTable('course_modules', {
  id: text().primaryKey(),
  course_id: text()
    .notNull()
    .references(() => courses.id),
  title: text().notNull(),
  position: integer().notNull().default(0),
});
export const lessons = sqliteTable('lessons', {
  id: text().primaryKey(),
  title: text().notNull(),
  category: text().notNull(),
  body: text().notNull(),
  duration: integer().notNull().default(5),
  position: integer().notNull().default(0),
  published: integer().notNull().default(0),
  asset_id: text(),
  course_id: text().references(() => courses.id),
  module_id: text().references(() => courseModules.id),
  created_at: integer().notNull(),
});
export const completions = sqliteTable(
  'completions',
  {
    member_id: text()
      .notNull()
      .references(() => members.id),
    lesson_id: text()
      .notNull()
      .references(() => lessons.id, { onDelete: 'cascade' }),
    completed_at: integer().notNull(),
  },
  (t) => [primaryKey({ columns: [t.member_id, t.lesson_id] })],
);
export const assets = sqliteTable('assets', {
  id: text().primaryKey(),
  name: text().notNull(),
  mime: text().notNull(),
  size: integer().notNull(),
  created_at: integer().notNull(),
});
export const stores = sqliteTable(
  'stores',
  {
    id: text().primaryKey(),
    member_id: text()
      .notNull()
      .references(() => members.id),
    name: text().notNull(),
    domain: text(),
    webhook_secret: text(),
    created_at: integer().notNull(),
  },
  (t) => [index('stores_member').on(t.member_id)],
);
export const apiKeys = sqliteTable(
  'api_keys',
  {
    id: text().primaryKey(),
    store_id: text()
      .notNull()
      .references(() => stores.id),
    token_hash: text().notNull(),
    prefix: text().notNull(),
    name: text().notNull(),
    created_at: integer().notNull(),
    expires_at: integer().notNull(),
    revoked: integer().notNull().default(0),
    last_used: integer(),
    bucket: integer().notNull().default(0),
    requests: integer().notNull().default(0),
  },
  (t) => [
    uniqueIndex('key_token').on(t.token_hash),
    index('keys_store').on(t.store_id),
  ],
);
export const events = sqliteTable(
  'events',
  {
    id: text().primaryKey(),
    store_id: text()
      .notNull()
      .references(() => stores.id),
    external_id: text().notNull(),
    kind: text().notNull(),
    amount: integer().notNull(),
    currency: text().notNull().default('ZAR'),
    source: text().notNull(),
    note: text().notNull().default(''),
    occurred_at: integer().notNull(),
    received_at: integer().notNull(),
    reviewed_by: text(),
    voided: integer().notNull().default(0),
  },
  (t) => [
    uniqueIndex('events_dedupe').on(t.store_id, t.external_id),
    index('events_store_time').on(t.store_id, t.occurred_at),
  ],
);
export const audit = sqliteTable('audit', {
  id: text().primaryKey(),
  actor: text().notNull(),
  action: text().notNull(),
  target: text().notNull(),
  created_at: integer().notNull(),
});
export const reviewAssets = sqliteTable('review_assets', {
  id: text().primaryKey(),
  member_id: text()
    .notNull()
    .references(() => members.id),
  mime: text().notNull(),
  size: integer().notNull(),
  created_at: integer().notNull(),
});
export const adReviews = sqliteTable(
  'ad_reviews',
  {
    id: text().primaryKey(),
    member_id: text()
      .notNull()
      .references(() => members.id),
    title: text().notNull(),
    kind: text().notNull(),
    audience: text().notNull(),
    offer: text().notNull(),
    copy: text().notNull(),
    asset_id: text().references(() => reviewAssets.id),
    parent_id: text(),
    status: text().notNull().default('draft'),
    result: text(),
    score: integer(),
    model: text(),
    error: text(),
    created_at: integer().notNull(),
    updated_at: integer().notNull(),
  },
  (t) => [index('reviews_member_time').on(t.member_id, t.created_at)],
);
export const reviewUsage = sqliteTable(
  'review_usage',
  {
    id: text().primaryKey(),
    member_id: text()
      .notNull()
      .references(() => members.id),
    created_at: integer().notNull(),
  },
  (t) => [index('review_usage_time').on(t.created_at)],
);
