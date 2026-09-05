CREATE TABLE `ad_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL,
	`title` text NOT NULL,
	`kind` text NOT NULL,
	`audience` text NOT NULL,
	`offer` text NOT NULL,
	`copy` text NOT NULL,
	`asset_id` text,
	`parent_id` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`result` text,
	`score` integer,
	`model` text,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`asset_id`) REFERENCES `review_assets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `reviews_member_time` ON `ad_reviews` (`member_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `course_modules` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`title` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `courses` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`level` text DEFAULT 'Start here' NOT NULL,
	`published` integer DEFAULT 0 NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `review_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `review_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `review_usage_time` ON `review_usage` (`created_at`);--> statement-breakpoint
ALTER TABLE `lessons` ADD `course_id` text REFERENCES courses(id);--> statement-breakpoint
ALTER TABLE `lessons` ADD `module_id` text REFERENCES course_modules(id);--> statement-breakpoint
ALTER TABLE `members` ADD `activity_leaderboard` integer DEFAULT 0 NOT NULL;