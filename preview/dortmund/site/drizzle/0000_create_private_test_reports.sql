CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`station_id` text NOT NULL,
	`line_name` text,
	`direction_id` text,
	`created_at` integer NOT NULL,
	`actor_key` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `reports_created_at_idx` ON `reports` (`created_at`);--> statement-breakpoint
CREATE INDEX `reports_actor_created_idx` ON `reports` (`actor_key`,`created_at`);