import { hmacSha256, sha256 } from "./crypto";
import type { AgentConnectionRecord } from "./database";
import {
  agentMarkitFlowCookie,
  agentMarkitFlowTokenFromCookie,
} from "./browser-flow-cookie.mjs";
import { agentMarkitHandoffTokenFromCookie } from "./handoff-cookie.mjs";

export {
  AGENTMARKIT_FLOW_COOKIE_PATH,
  AGENTMARKIT_FLOW_COOKIE_PREFIX,
  agentMarkitFlowCookieName,
  clearAgentMarkitFlowCookie,
} from "./browser-flow-cookie.mjs";
export {
  AGENTMARKIT_HANDOFF_COOKIE_PREFIX,
  AGENTMARKIT_HANDOFF_PATH,
  agentMarkitHandoffCookieName,
  clearAgentMarkitHandoffCookie,
  trustedHandoffRequest,
} from "./handoff-cookie.mjs";

export const CONNECTION_TAB_HEADER = "x-agentmarkit-flow";
export const CONNECTION_ID_HEADER = "x-agentmarkit-connection";
export const DISCLOSURE_VERSION = "gmail-metadata-v1";
export const BROWSER_SESSION_MS = 2 * 60 * 60_000;
export const HANDOFF_SESSION_MS = 5 * 60_000;

export function connectionState(record: AgentConnectionRecord) {
  if (record.revoked_at) return "revoked" as const;
  if (record.needs_reconnect_at) return "needs_reconnect" as const;
  if (record.authorized_at) return "connected" as const;
  if (
    record.session_id ||
    record.authorization_started_at ||
    (record.claim_opened_at &&
      record.browser_token_expires_at &&
      record.browser_token_expires_at > new Date().toISOString())
  ) {
    return "authorizing" as const;
  }
  return "waiting" as const;
}

export async function agentConnectionTokens(
  identityPepper: string,
  connectionId: string,
  handoffExpiresAt: string,
) {
  const [mcpSignature, handoffSignature] = await Promise.all([
    hmacSha256(identityPepper, `agent-mcp:${connectionId}`),
    hmacSha256(identityPepper, `agent-handoff:${connectionId}:${handoffExpiresAt}`),
  ]);
  const mcpToken = `nobs_${connectionId}_${mcpSignature.slice(0, 32)}`;
  const handoffToken = `handoff_${connectionId}_${handoffSignature.slice(0, 32)}`;
  return {
    mcpToken,
    handoffToken,
    mcpTokenHash: await sha256(mcpToken),
    handoffTokenHash: await sha256(handoffToken),
  };
}

export async function userIdForGrant(
  identityPepper: string,
  ownerRef: string,
  installationRef: string,
  connectionId: string,
) {
  const digest = await hmacSha256(
    identityPepper,
    `agentmarkit-grant:${JSON.stringify([
      ownerRef,
      installationRef,
      connectionId,
    ])}`,
  );
  return `netobs_${digest.slice(0, 32)}`;
}

export function connectionIdFromRequest(request: Request) {
  const connectionId = request.headers.get(CONNECTION_ID_HEADER)?.trim() || "";
  return /^acn_[a-f0-9]{24}$/.test(connectionId) ? connectionId : "";
}

export function browserTokenFromRequest(
  request: Request,
  connectionId = connectionIdFromRequest(request),
) {
  return agentMarkitFlowTokenFromCookie(
    request.headers.get("cookie") || "",
    connectionId,
  );
}

export function agentMarkitHandoffTokenFromRequest(
  request: Request,
  connectionId: string,
) {
  return agentMarkitHandoffTokenFromCookie(
    request.headers.get("cookie") || "",
    connectionId,
  );
}

export function browserTabTokenFromRequest(request: Request) {
  return request.headers.get(CONNECTION_TAB_HEADER)?.trim() || "";
}

export function browserCookie(
  token: string,
  requestUrl: string,
  connectionId: string,
) {
  return agentMarkitFlowCookie(
    token,
    requestUrl,
    connectionId,
    BROWSER_SESSION_MS / 1000,
  );
}

export function clearBrowserCookie(requestUrl: string, connectionId: string) {
  return agentMarkitFlowCookie("", requestUrl, connectionId, 0);
}

export function safeAgentReturnUrl(value: unknown) {
  if (typeof value !== "string" || !value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "agentmarkit.com"
      ? url.href
      : null;
  } catch {
    return null;
  }
}
