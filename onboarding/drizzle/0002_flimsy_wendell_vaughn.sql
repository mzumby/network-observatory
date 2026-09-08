CREATE TABLE `agent_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`user_id` text NOT NULL,
	`installation_ref` text NOT NULL,
	`agent_name` text NOT NULL,
	`return_url` text,
	`mcp_token_hash` text NOT NULL,
	`claim_token_hash` text NOT NULL,
	`browser_token_hash` text,
	`created_at` text NOT NULL,
	`claim_expires_at` text NOT NULL,
	`claim_opened_at` text,
	`browser_token_expires_at` text,
	`installed_at` text,
	`authorization_started_at` text,
	`session_id` text,
	`disclosure_version` text,
	`consented_at` text,
	`authorized_at` text,
	`revoked_at` text,
	`error_code` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_connections_request_id_unique` ON `agent_connections` (`request_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_connections_mcp_token_hash_unique` ON `agent_connections` (`mcp_token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_connections_claim_token_hash_unique` ON `agent_connections` (`claim_token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_connections_browser_token_hash_unique` ON `agent_connections` (`browser_token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_connections_session_id_unique` ON `agent_connections` (`session_id`);--> statement-breakpoint
CREATE INDEX `agent_connections_claim_expires_at_idx` ON `agent_connections` (`claim_expires_at`);--> statement-breakpoint
CREATE INDEX `agent_connections_installation_ref_idx` ON `agent_connections` (`installation_ref`);