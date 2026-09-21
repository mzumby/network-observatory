export async function checkLiveGmail(apiKey, getLiveGmailSession, probeGmailMetadata) {
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

  const result = await probeGmailMetadata(apiKey, sessionId);
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
