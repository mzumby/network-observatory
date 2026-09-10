export const ISSUE_AGENT_CONNECTION_HANDOFF_SQL = `UPDATE agent_connections
  SET claim_token_hash = ?, claim_expires_at = ?, claim_opened_at = NULL,
    browser_token_hash = NULL, browser_tab_token_hash = NULL,
    browser_token_expires_at = NULL,
    error_code = NULL
  WHERE id = ? AND (claim_opened_at IS NOT NULL OR claim_expires_at <= ?)
    AND installed_at IS NOT NULL AND session_id IS NULL
    AND authorization_started_at IS NULL AND authorized_at IS NULL
    AND revoked_at IS NULL`;
