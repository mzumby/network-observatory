import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const invites = sqliteTable(
  "invites",
  {
    tokenHash: text("token_hash").primaryKey(),
    label: text("label").notNull(),
    intendedEmailHash: text("intended_email_hash"),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
    redeemedAt: text("redeemed_at"),
    userId: text("user_id"),
    sessionId: text("session_id"),
  },
  (table) => [
    index("invites_expires_at_idx").on(table.expiresAt),
    index("invites_session_id_idx").on(table.sessionId),
  ],
);

export const rateLimits = sqliteTable(
  "rate_limits",
  {
    key: text("key").primaryKey(),
    windowStartedAt: integer("window_started_at").notNull(),
    attempts: integer("attempts").notNull().default(0),
  },
  (table) => [index("rate_limits_window_idx").on(table.windowStartedAt)],
);

export const mcpTokens = sqliteTable(
  "mcp_tokens",
  {
    tokenHash: text("token_hash").primaryKey(),
    sessionId: text("session_id").notNull().unique(),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
    revokedAt: text("revoked_at"),
  },
  (table) => [
    index("mcp_tokens_session_id_idx").on(table.sessionId),
    index("mcp_tokens_expires_at_idx").on(table.expiresAt),
  ],
);

export const agentConnections = sqliteTable(
  "agent_connections",
  {
    id: text("id").primaryKey(),
    requestId: text("request_id").notNull().unique(),
    userId: text("user_id").notNull(),
    installationRef: text("installation_ref").notNull(),
    agentName: text("agent_name").notNull(),
    returnUrl: text("return_url"),
    mcpTokenHash: text("mcp_token_hash").notNull().unique(),
    claimTokenHash: text("claim_token_hash").notNull().unique(),
    browserTokenHash: text("browser_token_hash").unique(),
    browserTabTokenHash: text("browser_tab_token_hash").unique(),
    createdAt: text("created_at").notNull(),
    claimExpiresAt: text("claim_expires_at").notNull(),
    claimOpenedAt: text("claim_opened_at"),
    browserTokenExpiresAt: text("browser_token_expires_at"),
    installedAt: text("installed_at"),
    authorizationStartedAt: text("authorization_started_at"),
    sessionId: text("session_id").unique(),
    connectedAccountId: text("connected_account_id"),
    disclosureVersion: text("disclosure_version"),
    consentedAt: text("consented_at"),
    authorizedAt: text("authorized_at"),
    needsReconnectAt: text("needs_reconnect_at"),
    revokedAt: text("revoked_at"),
    connectedAccountRevokedAt: text("connected_account_revoked_at"),
    remoteCleanupAt: text("remote_cleanup_at"),
    remoteCleanupError: text("remote_cleanup_error"),
    errorCode: text("error_code"),
  },
  (table) => [
    index("agent_connections_claim_expires_at_idx").on(table.claimExpiresAt),
    index("agent_connections_installation_ref_idx").on(table.installationRef),
    uniqueIndex("agent_connections_active_installation_unique")
      .on(table.installationRef)
      .where(sql`${table.revokedAt} IS NULL`),
  ],
);
