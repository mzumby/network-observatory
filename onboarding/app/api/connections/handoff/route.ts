import {
  agentMarkitHandoffTokenFromRequest,
  BROWSER_SESSION_MS,
  browserCookie,
  browserTokenFromRequest,
  clearAgentMarkitHandoffCookie,
  trustedHandoffRequest,
} from "@/lib/agent-connections";
import { readBoundedJson } from "@/lib/bounded-json.mjs";
import { randomToken, sha256 } from "@/lib/crypto";
import {
  checkRateLimit,
  getAgentConnectionByHandoffHash,
  getAgentConnectionByBrowserHash,
  openAgentConnectionHandoff,
} from "@/lib/database";

// This endpoint turns AgentMarkit's one-use browser handoff into the local flow.
export const dynamic = "force-dynamic";

const CONNECTION_ID_RE = /^acn_[a-f0-9]{24}$/;
const HANDOFF_TOKEN_RE = /^handoff_acn_[a-f0-9]{24}_[a-f0-9]{32}$/;

function reply(body: unknown, status = 200, cookies: string[] = []) {
  const headers = new Headers({
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
  });
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  return Response.json(body, {
    status,
    headers,
  });
}

export async function POST(request: Request) {
  if (
    !trustedHandoffRequest(
      request.url,
      request.headers.get("origin") || "",
      request.headers.get("content-type") || "",
      request.headers.get("sec-fetch-site") || "",
    )
  ) {
    return reply({ error: "Open Gmail from AgentMarkit and try again." }, 403);
  }
  const body = (await readBoundedJson(request)) as
    | { connectionId?: string }
    | null;
  const connectionId =
    typeof body?.connectionId === "string" ? body.connectionId.trim() : "";
  if (!CONNECTION_ID_RE.test(connectionId)) {
    return reply(
      { error: "Open Gmail from this agent's Connections page in AgentMarkit." },
      401,
    );
  }
  const clientAddress = request.headers.get("cf-connecting-ip")?.trim() || "local";
  const rate = await checkRateLimit(
    `handoff:${await sha256(clientAddress)}`,
    20,
    15 * 60_000,
  );
  if (!rate.allowed) {
    return Response.json(
      { error: "Too many attempts. Wait a few minutes and try again." },
      {
        status: 429,
        headers: {
          "cache-control": "no-store",
          "retry-after": String(rate.retryAfter),
        },
      },
    );
  }
  const clearHandoff = [clearAgentMarkitHandoffCookie(request.url, connectionId)];
  const token = agentMarkitHandoffTokenFromRequest(request, connectionId);
  if (!HANDOFF_TOKEN_RE.test(token)) {
    return reply(
      { error: "Open Gmail from this agent's Connections page in AgentMarkit." },
      401,
      clearHandoff,
    );
  }

  const existingFlowToken = browserTokenFromRequest(request, connectionId);
  if (existingFlowToken.startsWith("flow_") && existingFlowToken.length <= 128) {
    const existing = await getAgentConnectionByBrowserHash(
      await sha256(existingFlowToken),
    );
    if (existing && !existing.authorized_at) {
      return reply(
        { error: "Finish the Gmail setup already open in this browser, then try again." },
        409,
      );
    }
  }

  const record = await getAgentConnectionByHandoffHash(await sha256(token));
  const now = new Date().toISOString();
  if (!record || record.id !== connectionId || record.revoked_at) {
    return reply({ error: "This Gmail connection is not available." }, 404, clearHandoff);
  }
  if (!record.installed_at) {
    return reply({ error: "Your agent is still being set up." }, 409, clearHandoff);
  }
  if (record.claim_expires_at <= now) {
    return reply({ error: "This Gmail connection has expired. Start again from your agent." }, 410, clearHandoff);
  }
  if (record.claim_opened_at) {
    return reply({ error: "This Gmail connection is already open." }, 409, clearHandoff);
  }

  const flowToken = `flow_${randomToken(24)}`;
  const tabToken = `tab_${randomToken(24)}`;
  const flowTokenHash = await sha256(flowToken);
  const tabTokenHash = await sha256(tabToken);
  const flowExpiresAt = new Date(Date.now() + BROWSER_SESSION_MS).toISOString();
  if (
    !(await openAgentConnectionHandoff(
      await sha256(token),
      flowTokenHash,
      tabTokenHash,
      flowExpiresAt,
    ))
  ) {
    return reply({ error: "This Gmail connection is already open." }, 409, clearHandoff);
  }

  // AgentMarkit places the one-use token in an HttpOnly parent-domain cookie
  // only after authenticating the owner and checking the exact machine. The URL
  // carries only the non-secret connection ID. This exchange consumes the
  // handoff before any call to Composio begins.
  return reply(
    { ready: true, tabToken },
    200,
    [
      browserCookie(flowToken, request.url, connectionId),
      ...clearHandoff,
    ],
  );
}
