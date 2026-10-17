CREATE TABLE `theme_likes` (
	`theme_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`theme_id`, `user_id`),
	FOREIGN KEY (`theme_id`) REFERENCES `themes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `themes` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`category` text DEFAULT 'other' NOT NULL,
	`visibility` text DEFAULT 'private' NOT NULL,
	`share_code` text NOT NULL,
	`data` text NOT NULL,
	`based_on_name` text,
	`based_on_creator` text,
	`likes` integer DEFAULT 0 NOT NULL,
	`installs` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `themes_share_code_unique` ON `themes` (`share_code`);--> statement-breakpoint
CREATE INDEX `idx_themes_owner` ON `themes` (`owner_id`);--> statement-breakpoint
CREATE INDEX `idx_themes_visibility_updated` ON `themes` (`visibility`,`updated_at`);--> statement-breakpoint
ALTER TABLE `users` ADD `app_theme` text;