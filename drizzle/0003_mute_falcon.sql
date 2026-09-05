CREATE TABLE `shopify_connections` (
	`store_id` text PRIMARY KEY NOT NULL,
	`domain` text NOT NULL,
	`tokens` text,
	`status` text DEFAULT 'disconnected' NOT NULL,
	`connected_at` integer,
	`snapshot` text,
	`snapshot_at` integer,
	`pending` text,
	`lock_id` text,
	`lock_until` integer DEFAULT 0 NOT NULL,
	`last_attempt` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shopify_domain_owner` ON `shopify_connections` (`domain`);--> statement-breakpoint
CREATE TABLE `shopify_states` (
	`state_hash` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`member_id` text NOT NULL,
	`domain` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
