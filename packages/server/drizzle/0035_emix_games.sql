CREATE TABLE `game_daily` (
	`user_id` text NOT NULL,
	`day` text NOT NULL,
	`guesses` text NOT NULL,
	`status` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `day`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `game_results` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`game_id` text NOT NULL,
	`user_id` text NOT NULL,
	`outcome` text NOT NULL,
	`opponents` text NOT NULL,
	`finished_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_game_results_user` ON `game_results` (`user_id`,`finished_at`);--> statement-breakpoint
CREATE TABLE `game_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`host_id` text NOT NULL,
	`context` text NOT NULL,
	`status` text NOT NULL,
	`data` text NOT NULL,
	`seq` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`host_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_game_sessions_status` ON `game_sessions` (`status`);--> statement-breakpoint
ALTER TABLE `users` ADD `show_game_stats` integer DEFAULT 1 NOT NULL;