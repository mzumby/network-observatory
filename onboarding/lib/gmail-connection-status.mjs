// This helper only receives a status returned successfully by Composio. A
// timeout, transport failure, or provider error never reaches it, so those
// failures cannot silently turn a working local connection into reconnect.
export function confirmedGmailReconnectReason(record, status, probe = null) {
  if (!record?.authorized_at || record?.needs_reconnect_at) return null;
  if (status?.active !== true) return "inactive";
  if (
    typeof record.connected_account_id !== "string" ||
    !record.connected_account_id.startsWith("ca_") ||
    status.connectedAccountId !== record.connected_account_id
  ) {
    return "account_mismatch";
  }
  if (probe?.ok === false && probe?.status === 401) {
    return "authorization_rejected";
  }
  return null;
}
