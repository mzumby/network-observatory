import { hmacSha256, sha256 } from "./crypto";
import type { AgentConnectionRecord } from "./database";

export const CONNECTION_COOKIE = "agentmarkit_gmail_connection";
export const CONNECTION_TAB_HEADER = "x-agentmarkit-flow";
export const DISCLOSURE_VERSION = "gmail-metadata-v1";
export const BROWSER_SESSION_MS = 2 * 60 * 60_000;

export function connectionState(record: AgentConnectionRecord) {
  if (record.revoked_at) return "revoked" as const;
  if (record.needs_reconnect_at) return "needs_reconnect" as const;
  if (record.authorized_at) return "connected" as const;
  if (record.session_id || record.authorization_started_at) return "authorizing" as const;
  return "waiting" as const;
}

export async function agentConnectionTokens(
  identityPepper: string,
  connectionId: string,
  claimExpiresAt: string,
) {
  const [mcpSignature, claimSignature] = await Promise.all([
    hmacSha256(identityPepper, `agent-mcp:${connectionId}`),
    hmacSha256(identityPepper, `agent-claim:${connectionId}:${claimExpiresAt}`),
  ]);
  const mcpToken = `nobs_${connectionId}_${mcpSignature.slice(0, 32)}`;
  const claimToken = `claim_${connectionId}_${claimSignature.slice(0, 32)}`;
  return {
    mcpToken,
    claimToken,
    mcpTokenHash: await sha256(mcpToken),
    claimTokenHash: await sha256(claimToken),
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

export function browserTokenFromRequest(request: Request) {
  const cookie = request.headers.get("cookie") || "";
  for (const part of cookie.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === CONNECTION_COOKIE) {
      try {
        return decodeURIComponent(value.join("="));
      } catch {
        return "";
      }
    }
  }
  return "";
}

export function browserTabTokenFromRequest(request: Request) {
  return request.headers.get(CONNECTION_TAB_HEADER)?.trim() || "";
}

export function browserCookie(token: string, requestUrl: string) {
  const secure = new URL(requestUrl).protocol === "https:" ? "; Secure" : "";
  return `${CONNECTION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${
    BROWSER_SESSION_MS / 1000
  }${secure}`;
}

export function clearBrowserCookie(requestUrl: string) {
  const secure = new URL(requestUrl).protocol === "https:" ? "; Secure" : "";
  return `${CONNECTION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
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
