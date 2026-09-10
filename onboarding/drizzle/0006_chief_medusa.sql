ALTER TABLE `agent_connections` ADD `browser_tab_token_hash` text;--> statement-breakpoint
ALTER TABLE `agent_connections` ADD `needs_reconnect_at` text;--> statement-breakpoint
CREATE UNIQUE INDEX `agent_connections_browser_tab_token_hash_unique` ON `agent_connections` (`browser_tab_token_hash`);