import { runtimeEnv } from "./runtime";

export interface InviteRecord {
  token_hash: string;
  label: string;
  intended_email_hash: string | null;
  created_at: string;
  expires_at: string;
  redeemed_at: string | null;
  user_id: string | null;
  session_id: string | null;
}

export interface McpTokenRecord {
  token_hash: string;
  session_id: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
}

export interface AgentConnectionRecord {
  id: string;
  request_id: string;
  user_id: string;
  installation_ref: string;
  agent_name: string;
  return_url: string | null;
  mcp_token_hash: string;
  claim_token_hash: string;
  browser_token_hash: string | null;
  browser_tab_token_hash: string | null;
  created_at: string;
  claim_expires_at: string;
  claim_opened_at: string | null;
  browser_token_expires_at: string | null;
  installed_at: string | null;
  authorization_started_at: string | null;
  session_id: string | null;
  connected_account_id: string | null;
  disclosure_version: string | null;
  consented_at: string | null;
  authorized_at: string | null;
  needs_reconnect_at: string | null;
  revoked_at: string | null;
  remote_cleanup_at: string | null;
  remote_cleanup_error: string | null;
  error_code: string | null;
}

export type McpAccess = {
  kind: "legacy" | "agent";
  connection_id: string | null;
  session_id: string | null;
  agent_name: string | null;
  authorized_at: string | null;
  needs_reconnect_at: string | null;
};

const AGENT_CONNECTION_COLUMNS = `
  id, request_id, user_id, installation_ref, agent_name, return_url,
  mcp_token_hash, claim_token_hash, browser_token_hash, browser_tab_token_hash, created_at,
  claim_expires_at, claim_opened_at, browser_token_expires_at, installed_at,
  authorization_started_at, session_id, disclosure_version, consented_at,
  connected_account_id, authorized_at, needs_reconnect_at, revoked_at,
  remote_cleanup_at, remote_cleanup_error,
  error_code
`;

export async function getInvite(tokenHash: string) {
  return runtimeEnv().DB.prepare(
    `SELECT token_hash, label, intended_email_hash, created_at, expires_at,
      redeemed_at, user_id, session_id
     FROM invites WHERE token_hash = ?`,
  )
    .bind(tokenHash)
    .first<InviteRecord>();
}

export async function reserveInvite(
  tokenHash: string,
  emailHash: string,
  userId: string,
) {
  const result = await runtimeEnv().DB.prepare(
    `UPDATE invites
     SET redeemed_at = 'pending', intended_email_hash = COALESCE(intended_email_hash, ?),
         user_id = ?
     WHERE token_hash = ? AND redeemed_at IS NULL AND expires_at > ?`,
  )
    .bind(emailHash, userId, tokenHash, new Date().toISOString())
    .run();
  return Number(result.meta.changes ?? 0) === 1;
}

export async function completeInvite(tokenHash: string, sessionId: string) {
  await runtimeEnv().DB.prepare(
    `UPDATE invites SET redeemed_at = ?, session_id = ?
     WHERE token_hash = ? AND redeemed_at = 'pending'`,
  )
    .bind(new Date().toISOString(), sessionId, tokenHash)
    .run();
}

export async function releaseInvite(tokenHash: string) {
  await runtimeEnv().DB.prepare(
    `UPDATE invites SET redeemed_at = NULL, user_id = NULL
     WHERE token_hash = ? AND redeemed_at = 'pending'`,
  )
    .bind(tokenHash)
    .run();
}

export async function recordOpenProvision(
  tokenHash: string,
  label: string,
  emailHash: string,
  userId: string,
  sessionId: string,
) {
  // Open-door (no-invite) provisions get a synthetic, already-redeemed
  // invites row so listAccess and revocation can see them. Without this,
  // self-serve users are invisible to the admin API.
  const now = new Date().toISOString();
  await runtimeEnv().DB.prepare(
    `INSERT INTO invites
      (token_hash, label, intended_email_hash, created_at, expires_at,
       redeemed_at, user_id, session_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(tokenHash, label, emailHash, now, now, now, userId, sessionId)
    .run();
}

export async function createMcpToken(
  tokenHash: string,
  sessionId: string,
  expiresAt: string,
) {
  await runtimeEnv().DB.prepare(
    `INSERT INTO mcp_tokens
      (token_hash, session_id, created_at, expires_at)
     VALUES (?, ?, ?, ?)`,
  )
    .bind(tokenHash, sessionId, new Date().toISOString(), expiresAt)
    .run();
}

export async function getMcpToken(tokenHash: string) {
  return runtimeEnv().DB.prepare(
    `SELECT token_hash, session_id, created_at, expires_at, revoked_at
     FROM mcp_tokens
     WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?`,
  )
    .bind(tokenHash, new Date().toISOString())
    .first<McpTokenRecord>();
}

export async function getMcpAccess(tokenHash: string): Promise<McpAccess | null> {
  const agent = await runtimeEnv().DB.prepare(
    `SELECT id, session_id, agent_name, authorized_at, needs_reconnect_at
     FROM agent_connections
     WHERE mcp_token_hash = ? AND revoked_at IS NULL`,
  )
    .bind(tokenHash)
    .first<{
      id: string;
      session_id: string | null;
      agent_name: string;
      authorized_at: string | null;
      needs_reconnect_at: string | null;
    }>();
  if (agent) {
    return {
      kind: "agent",
      connection_id: agent.id,
      session_id: agent.session_id,
      agent_name: agent.agent_name,
      authorized_at: agent.authorized_at,
      needs_reconnect_at: agent.needs_reconnect_at,
    };
  }

  const legacy = await getMcpToken(tokenHash);
  return legacy
    ? {
        kind: "legacy",
        connection_id: null,
        session_id: legacy.session_id,
        agent_name: null,
        authorized_at: legacy.created_at,
        needs_reconnect_at: null,
      }
    : null;
}

export async function getAgentConnectionByRequestId(requestId: string) {
  return runtimeEnv().DB.prepare(
    `SELECT ${AGENT_CONNECTION_COLUMNS}
     FROM agent_connections WHERE request_id = ?`,
  )
    .bind(requestId)
    .first<AgentConnectionRecord>();
}

export async function getAgentConnectionById(id: string) {
  return runtimeEnv().DB.prepare(
    `SELECT ${AGENT_CONNECTION_COLUMNS}
     FROM agent_connections WHERE id = ?`,
  )
    .bind(id)
    .first<AgentConnectionRecord>();
}

export async function getActiveAgentConnectionByInstallationRef(
  installationRef: string,
) {
  return runtimeEnv().DB.prepare(
    `SELECT ${AGENT_CONNECTION_COLUMNS}
     FROM agent_connections
     WHERE installation_ref = ? AND revoked_at IS NULL`,
  )
    .bind(installationRef)
    .first<AgentConnectionRecord>();
}

export async function getAgentConnectionByHandoffHash(handoffTokenHash: string) {
  return runtimeEnv().DB.prepare(
    `SELECT ${AGENT_CONNECTION_COLUMNS}
     FROM agent_connections WHERE claim_token_hash = ?`,
  )
    .bind(handoffTokenHash)
    .first<AgentConnectionRecord>();
}

export async function getAgentConnectionByBrowserHash(browserTokenHash: string) {
  return runtimeEnv().DB.prepare(
    `SELECT ${AGENT_CONNECTION_COLUMNS}
     FROM agent_connections
     WHERE browser_token_hash = ? AND browser_token_expires_at > ?
       AND revoked_at IS NULL`,
  )
    .bind(browserTokenHash, new Date().toISOString())
    .first<AgentConnectionRecord>();
}

export async function getAgentConnectionByBrowserIdentity(
  browserTokenHash: string,
  browserTabTokenHash: string,
) {
  return runtimeEnv().DB.prepare(
    `SELECT ${AGENT_CONNECTION_COLUMNS}
     FROM agent_connections
     WHERE browser_token_hash = ? AND browser_tab_token_hash = ?
       AND browser_token_expires_at > ? AND revoked_at IS NULL`,
  )
    .bind(browserTokenHash, browserTabTokenHash, new Date().toISOString())
    .first<AgentConnectionRecord>();
}

export async function createAgentConnection(record: {
  id: string;
  requestId: string;
  userId: string;
  installationRef: string;
  agentName: string;
  returnUrl: string | null;
  mcpTokenHash: string;
  handoffTokenHash: string;
  handoffExpiresAt: string;
}) {
  const createdAt = new Date().toISOString();
  await runtimeEnv().DB.prepare(
    `INSERT INTO agent_connections
      (id, request_id, user_id, installation_ref, agent_name, return_url,
       mcp_token_hash, claim_token_hash, created_at, claim_expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      record.id,
      record.requestId,
      record.userId,
      record.installationRef,
      record.agentName,
      record.returnUrl,
      record.mcpTokenHash,
      record.handoffTokenHash,
      createdAt,
      record.handoffExpiresAt,
    )
    .run();
}

export async function markAgentConnectionInstalled(id: string) {
  const result = await runtimeEnv().DB.prepare(
    `UPDATE agent_connections SET installed_at = COALESCE(installed_at, ?),
       error_code = NULL
     WHERE id = ? AND revoked_at IS NULL`,
  )
    .bind(new Date().toISOString(), id)
    .run();
  return Number(result.meta.changes ?? 0) === 1;
}

export async function issueAgentConnectionHandoff(
  id: string,
  handoffTokenHash: string,
  handoffExpiresAt: string,
  issuedAt: string,
) {
  const result = await runtimeEnv().DB.prepare(
    `UPDATE agent_connections
     SET claim_token_hash = ?, claim_expires_at = ?, claim_opened_at = NULL,
       browser_token_hash = NULL, browser_tab_token_hash = NULL,
       browser_token_expires_at = NULL,
       error_code = NULL
     WHERE id = ? AND (
         (claim_opened_at IS NULL AND claim_expires_at <= ?)
         OR (claim_opened_at IS NOT NULL AND browser_token_expires_at IS NOT NULL
           AND browser_token_expires_at <= ?)
       )
       AND installed_at IS NOT NULL AND session_id IS NULL
       AND authorization_started_at IS NULL AND authorized_at IS NULL
       AND revoked_at IS NULL`,
  )
    .bind(handoffTokenHash, handoffExpiresAt, id, issuedAt, issuedAt)
    .run();
  return Number(result.meta.changes ?? 0) === 1;
}

export async function openAgentConnectionHandoff(
  handoffTokenHash: string,
  browserTokenHash: string,
  browserTabTokenHash: string,
  browserTokenExpiresAt: string,
) {
  const now = new Date().toISOString();
  const result = await runtimeEnv().DB.prepare(
    `UPDATE agent_connections
     SET claim_opened_at = ?, browser_token_hash = ?, browser_tab_token_hash = ?,
       browser_token_expires_at = ?,
       error_code = NULL
     WHERE claim_token_hash = ? AND claim_opened_at IS NULL
       AND claim_expires_at > ? AND installed_at IS NOT NULL
       AND revoked_at IS NULL`,
  )
    .bind(
      now,
      browserTokenHash,
      browserTabTokenHash,
      browserTokenExpiresAt,
      handoffTokenHash,
      now,
    )
    .run();
  return Number(result.meta.changes ?? 0) === 1;
}

export async function reserveAgentConnectionAuthorization(
  id: string,
  disclosureVersion: string,
  attemptStartedAt: string,
  browserTokenHash: string,
  browserTabTokenHash: string,
) {
  const staleBefore = new Date(
    new Date(attemptStartedAt).getTime() - 5 * 60_000,
  ).toISOString();
  const result = await runtimeEnv().DB.prepare(
    `UPDATE agent_connections
     SET authorization_started_at = ?, disclosure_version = ?, consented_at = ?,
       error_code = NULL
     WHERE id = ? AND session_id IS NULL
       AND (authorization_started_at IS NULL OR authorization_started_at < ?)
       AND browser_token_hash = ? AND browser_tab_token_hash = ?
       AND browser_token_expires_at > ? AND installed_at IS NOT NULL
       AND revoked_at IS NULL`,
  )
    .bind(
      attemptStartedAt,
      disclosureVersion,
      attemptStartedAt,
      id,
      staleBefore,
      browserTokenHash,
      browserTabTokenHash,
      attemptStartedAt,
    )
    .run();
  return Number(result.meta.changes ?? 0) === 1;
}

export async function completeAgentConnectionAuthorizationStart(
  id: string,
  sessionId: string,
  attemptStartedAt: string,
) {
  const result = await runtimeEnv().DB.prepare(
    `UPDATE agent_connections SET session_id = ?, error_code = NULL
     WHERE id = ? AND authorization_started_at = ?
       AND session_id IS NULL AND revoked_at IS NULL`,
  )
    .bind(sessionId, id, attemptStartedAt)
    .run();
  return Number(result.meta.changes ?? 0) === 1;
}

export async function releaseAgentConnectionAuthorization(
  id: string,
  errorCode: string,
  attemptStartedAt: string,
) {
  await runtimeEnv().DB.prepare(
    `UPDATE agent_connections SET authorization_started_at = NULL,
       disclosure_version = NULL, consented_at = NULL, error_code = ?
     WHERE id = ? AND authorization_started_at = ?
       AND session_id IS NULL AND revoked_at IS NULL`,
  )
    .bind(errorCode, id, attemptStartedAt)
    .run();
}

export async function markAgentConnectionAuthorized(
  id: string,
  connectedAccountId: string,
) {
  const result = await runtimeEnv().DB.prepare(
    `UPDATE agent_connections SET authorized_at = COALESCE(authorized_at, ?),
       connected_account_id = COALESCE(connected_account_id, ?),
       error_code = NULL
     WHERE id = ? AND session_id IS NOT NULL AND revoked_at IS NULL
       AND (connected_account_id IS NULL OR connected_account_id = ?)`,
  )
    .bind(
      new Date().toISOString(),
      connectedAccountId,
      id,
      connectedAccountId,
    )
    .run();
  return Number(result.meta.changes ?? 0) === 1;
}

export async function markAgentConnectionNeedsReconnect(id: string) {
  const result = await runtimeEnv().DB.prepare(
    `UPDATE agent_connections
     SET needs_reconnect_at = COALESCE(needs_reconnect_at, ?),
       error_code = 'gmail_reconnect_required'
     WHERE id = ? AND authorized_at IS NOT NULL AND revoked_at IS NULL`,
  )
    .bind(new Date().toISOString(), id)
    .run();
  return Number(result.meta.changes ?? 0) === 1;
}

export async function recordAgentConnectionConnectedAccount(
  id: string,
  connectedAccountId: string,
) {
  const result = await runtimeEnv().DB.prepare(
    `UPDATE agent_connections
     SET connected_account_id = COALESCE(connected_account_id, ?),
       remote_cleanup_at = NULL,
       remote_cleanup_error = CASE
         WHEN revoked_at IS NOT NULL THEN 'connected_account_cleanup_required'
         ELSE remote_cleanup_error
       END
     WHERE id = ?
       AND (connected_account_id IS NULL OR connected_account_id = ?)`,
  )
    .bind(connectedAccountId, id, connectedAccountId)
    .run();
  return Number(result.meta.changes ?? 0) === 1;
}

export async function recordAgentConnectionRemoteCleanup(
  id: string,
  errorCode: string | null,
) {
  await runtimeEnv().DB.prepare(
    `UPDATE agent_connections
     SET remote_cleanup_at = CASE WHEN ? IS NULL THEN ? ELSE NULL END,
       remote_cleanup_error = ?
     WHERE id = ? AND revoked_at IS NOT NULL`,
  )
    .bind(errorCode, new Date().toISOString(), errorCode, id)
    .run();
}

export async function revokeAgentConnection(id: string) {
  const result = await runtimeEnv().DB.prepare(
    `UPDATE agent_connections SET revoked_at = COALESCE(revoked_at, ?)
     WHERE id = ? AND revoked_at IS NULL`,
  )
    .bind(new Date().toISOString(), id)
    .run();
  return Number(result.meta.changes ?? 0) === 1;
}

export async function revokeMcpToken(sessionId: string) {
  const result = await runtimeEnv().DB.prepare(
    `UPDATE mcp_tokens SET revoked_at = ?
     WHERE session_id = ? AND revoked_at IS NULL`,
  )
    .bind(new Date().toISOString(), sessionId)
    .run();
  return Number(result.meta.changes ?? 0) === 1;
}

export async function listAccess() {
  return runtimeEnv().DB.prepare(
    `SELECT i.label, i.created_at, i.expires_at AS invite_expires_at,
      i.redeemed_at, i.session_id, t.created_at AS access_created_at,
      t.expires_at AS access_expires_at, t.revoked_at
     FROM invites i
     LEFT JOIN mcp_tokens t ON t.session_id = i.session_id
     ORDER BY i.created_at DESC
     LIMIT 100`,
  ).all<{
    label: string;
    created_at: string;
    invite_expires_at: string;
    redeemed_at: string | null;
    session_id: string | null;
    access_created_at: string | null;
    access_expires_at: string | null;
    revoked_at: string | null;
  }>();
}

export async function listAgentConnections() {
  return runtimeEnv().DB.prepare(
    `SELECT id, request_id, installation_ref, agent_name, created_at,
      claim_expires_at, claim_opened_at, installed_at, consented_at,
      authorized_at, needs_reconnect_at, revoked_at,
      remote_cleanup_at, remote_cleanup_error, error_code
     FROM agent_connections
     ORDER BY created_at DESC
     LIMIT 100`,
  ).all<{
    id: string;
    request_id: string;
    installation_ref: string;
    agent_name: string;
    created_at: string;
    claim_expires_at: string;
    claim_opened_at: string | null;
    installed_at: string | null;
    consented_at: string | null;
    authorized_at: string | null;
    needs_reconnect_at: string | null;
    revoked_at: string | null;
    remote_cleanup_at: string | null;
    remote_cleanup_error: string | null;
    error_code: string | null;
  }>();
}

export async function checkRateLimit(
  key: string,
  limit = 8,
  windowMs = 15 * 60_000,
  cost = 1,
) {
  const now = Date.now();
  const safeCost = Math.max(1, Math.floor(cost));
  const current = await runtimeEnv().DB.prepare(
    `INSERT INTO rate_limits (key, window_started_at, attempts)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       window_started_at = CASE
         WHEN ? - window_started_at >= ? THEN ?
         ELSE window_started_at
       END,
       attempts = CASE
         WHEN ? - window_started_at >= ? THEN ?
         ELSE attempts + ?
       END
     RETURNING window_started_at, attempts`,
  )
    .bind(
      key,
      now,
      safeCost,
      now,
      windowMs,
      now,
      now,
      windowMs,
      safeCost,
      safeCost,
    )
    .first<{ window_started_at: number; attempts: number }>();
  if (!current) return { allowed: false, retryAfter: 1 };
  return {
    allowed: current.attempts <= limit,
    retryAfter:
      current.attempts <= limit
        ? 0
        : Math.max(
            1,
            Math.ceil((windowMs - (now - current.window_started_at)) / 1000),
          ),
  };
}
