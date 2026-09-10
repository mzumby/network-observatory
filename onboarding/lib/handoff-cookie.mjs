export const AGENTMARKIT_HANDOFF_COOKIE_PREFIX = "agentmarkit_gmail_handoff_";
export const AGENTMARKIT_HANDOFF_PATH = "/api/connections/handoff";
const CONNECTION_ID_RE = /^acn_[a-f0-9]{24}$/;

/** @param {string} connectionId */
export function agentMarkitHandoffCookieName(connectionId) {
  return CONNECTION_ID_RE.test(connectionId)
    ? `${AGENTMARKIT_HANDOFF_COOKIE_PREFIX}${connectionId}`
    : "";
}

/**
 * @param {string} cookieHeader
 * @param {string} connectionId
 */
export function agentMarkitHandoffTokenFromCookie(cookieHeader, connectionId) {
  const expectedName = agentMarkitHandoffCookieName(connectionId);
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

/** @param {string} requestUrl @param {string} connectionId */
export function clearAgentMarkitHandoffCookie(requestUrl, connectionId) {
  const cookieName = agentMarkitHandoffCookieName(connectionId);
  if (!cookieName) return "";
  const url = new URL(requestUrl);
  const secure = url.protocol === "https:" ? "; Secure" : "";
  const domain =
    url.hostname === "agentmarkit.com" || url.hostname.endsWith(".agentmarkit.com")
      ? "; Domain=agentmarkit.com"
      : "";
  return `${cookieName}=; Path=${AGENTMARKIT_HANDOFF_PATH}; HttpOnly; SameSite=Strict; Max-Age=0${domain}${secure}`;
}

/**
 * @param {string} requestUrl
 * @param {string} origin
 * @param {string} contentType
 * @param {string} fetchSite
 */
export function trustedHandoffRequest(requestUrl, origin, contentType, fetchSite) {
  const mediaType = String(contentType || "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  return (
    origin === new URL(requestUrl).origin &&
    mediaType === "application/json" &&
    (!fetchSite || fetchSite === "same-origin")
  );
}
