export async function checkLiveGmail(
  apiKey,
  getLiveGmailSession,
  getGmailConnectionStatus,
  probeGmailMetadata,
) {
  // A database error must reject this function so the route fails closed with
  // HTTP 503. Only a successful query with no row is a safe skip.
  const session = await getLiveGmailSession();
  if (session === null) {
    return { skipped: "No authorized Gmail connection to test with yet." };
  }
  const sessionId =
    typeof session?.session_id === "string" ? session.session_id.trim() : "";
  if (!sessionId) {
    throw new Error("The Gmail preflight found an invalid database session.");
  }
  const connectedAccountId =
    typeof session?.connected_account_id === "string"
      ? session.connected_account_id
      : "";
  if (!/^ca_[A-Za-z0-9_-]{1,124}$/.test(connectedAccountId)) {
    throw new Error("The Gmail preflight found an invalid connected account.");
  }
  const status = await getGmailConnectionStatus(apiKey, sessionId);
  if (!status?.active || status.connectedAccountId !== connectedAccountId) {
    throw new Error("The Gmail preflight found an invalid session binding.");
  }

  const result = await probeGmailMetadata(apiKey, connectedAccountId);
  return result.ok
    ? { ok: true }
    : {
        ok: false,
        status: result.status,
        reason: result.reason,
        check:
          "A 403 naming the project means the Gmail API is not enabled for the Google project behind this auth config. Reconnecting will not fix it.",
      };
}
