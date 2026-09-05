CREATE TABLE `api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`prefix` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked` integer DEFAULT 0 NOT NULL,
	`last_used` integer,
	`bucket` integer DEFAULT 0 NOT NULL,
	`requests` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `key_token` ON `api_keys` (`token_hash`);--> statement-breakpoint
CREATE INDEX `keys_store` ON `api_keys` (`store_id`);--> statement-breakpoint
CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `audit` (
	`id` text PRIMARY KEY NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`target` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `completions` (
	`member_id` text NOT NULL,
	`lesson_id` text NOT NULL,
	`completed_at` integer NOT NULL,
	PRIMARY KEY(`member_id`, `lesson_id`),
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`external_id` text NOT NULL,
	`kind` text NOT NULL,
	`amount` integer NOT NULL,
	`currency` text DEFAULT 'ZAR' NOT NULL,
	`source` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`occurred_at` integer NOT NULL,
	`received_at` integer NOT NULL,
	`reviewed_by` text,
	`voided` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `events_dedupe` ON `events` (`store_id`,`external_id`);--> statement-breakpoint
CREATE INDEX `events_store_time` ON `events` (`store_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `invites` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`used_by` text,
	`revoked` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invite_token` ON `invites` (`token_hash`);--> statement-breakpoint
CREATE TABLE `lessons` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`category` text NOT NULL,
	`body` text NOT NULL,
	`duration` integer DEFAULT 5 NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`published` integer DEFAULT 0 NOT NULL,
	`asset_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`bio` text DEFAULT '' NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`leaderboard` integer DEFAULT 0 NOT NULL,
	`joined_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `members_email` ON `members` (`email`);--> statement-breakpoint
CREATE TABLE `posts` (
	`id` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL,
	`channel` text NOT NULL,
	`parent_id` text,
	`body` text NOT NULL,
	`pinned` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `posts_channel_time` ON `posts` (`channel`,`created_at`);--> statement-breakpoint
CREATE INDEX `posts_parent` ON `posts` (`parent_id`);--> statement-breakpoint
CREATE TABLE `reactions` (
	`post_id` text NOT NULL,
	`member_id` text NOT NULL,
	PRIMARY KEY(`post_id`, `member_id`),
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `stores` (
	`id` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL,
	`name` text NOT NULL,
	`domain` text,
	`webhook_secret` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `stores_member` ON `stores` (`member_id`);