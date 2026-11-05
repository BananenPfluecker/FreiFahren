CREATE TABLE `report_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`report_id` text,
	`actor_key` text NOT NULL,
	`kind` text NOT NULL,
	`created_at` integer NOT NULL,
	`body_key` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `actions_actor_created_idx` ON `report_actions` (`actor_key`,`created_at`);--> statement-breakpoint
CREATE TABLE `report_votes` (
	`report_id` text NOT NULL,
	`actor_key` text NOT NULL,
	`kind` text NOT NULL,
	`updated_at` integer NOT NULL,
	`seen_at` integer,
	PRIMARY KEY(`report_id`, `actor_key`)
);
--> statement-breakpoint
CREATE INDEX `votes_report_idx` ON `report_votes` (`report_id`);--> statement-breakpoint
ALTER TABLE `reports` ADD `group_key` text;--> statement-breakpoint
ALTER TABLE `reports` ADD `updated_at` integer;--> statement-breakpoint
ALTER TABLE `reports` ADD `opened_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `reports_group_key_idx` ON `reports` (`group_key`);