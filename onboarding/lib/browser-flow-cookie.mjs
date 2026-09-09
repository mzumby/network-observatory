export const AGENTMARKIT_FLOW_COOKIE_PREFIX = "agentmarkit_gmail_connection_";
export const AGENTMARKIT_FLOW_COOKIE_PATH = "/api/connections";
const CONNECTION_ID_RE = /^acn_[a-f0-9]{24}$/;

/** @param {string} connectionId */
export function agentMarkitFlowCookieName(connectionId) {
  return CONNECTION_ID_RE.test(connectionId)
    ? `${AGENTMARKIT_FLOW_COOKIE_PREFIX}${connectionId}`
    : "";
}

/**
 * @param {string} cookieHeader
 * @param {string} connectionId
 */
export function agentMarkitFlowTokenFromCookie(cookieHeader, connectionId) {
  const expectedName = agentMarkitFlowCookieName(connectionId);
  if (!expectedName) return "";
  for (const part of String(cookieHeader || "").split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === expectedName) {
      try {
        return decodeURIComponent(value.join("="));
      } catch {
        return "";
      }
    }
  }
  return "";
}

/**
 * @param {string} token
 * @param {string} requestUrl
 * @param {string} connectionId
 * @param {number} maxAgeSeconds
 */
export function agentMarkitFlowCookie(
  token,
  requestUrl,
  connectionId,
  maxAgeSeconds,
) {
  const cookieName = agentMarkitFlowCookieName(connectionId);
  if (!cookieName) return "";
  const secure = new URL(requestUrl).protocol === "https:" ? "; Secure" : "";
  return `${cookieName}=${encodeURIComponent(token)}; Path=${AGENTMARKIT_FLOW_COOKIE_PATH}; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

/** @param {string} requestUrl @param {string} connectionId */
export function clearAgentMarkitFlowCookie(requestUrl, connectionId) {
  return agentMarkitFlowCookie("", requestUrl, connectionId, 0);
}
