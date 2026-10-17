CREATE TABLE `ringtones` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`duration_ms` integer NOT NULL,
	`size` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_ringtones_owner` ON `ringtones` (`owner_id`);--> statement-breakpoint
ALTER TABLE `users` ADD `username_changed_at` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `ringtone_settings` text;