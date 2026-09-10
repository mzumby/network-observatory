import {
  browserTokenFromRequest,
  browserTabTokenFromRequest,
  connectionIdFromRequest,
  connectionState,
  safeAgentReturnUrl,
} from "@/lib/agent-connections";
import { sha256 } from "@/lib/crypto";
import { getAgentConnectionByBrowserIdentity } from "@/lib/database";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const connectionId = connectionIdFromRequest(request);
  const browserToken = browserTokenFromRequest(request, connectionId);
  const browserTabToken = browserTabTokenFromRequest(request);
  if (
    !browserToken.startsWith("flow_") ||
    browserToken.length > 128 ||
    !browserTabToken.startsWith("tab_") ||
    browserTabToken.length > 128
  ) {
    return Response.json(
      { error: "Open this page from your agent's Connections page." },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }
  const record = await getAgentConnectionByBrowserIdentity(
    await sha256(browserToken),
    await sha256(browserTabToken),
  );
  if (!record || record.id !== connectionId) {
    return Response.json(
      { error: "This Gmail session has expired. Start again from your agent." },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }
  if (record.revoked_at || !record.installed_at) {
    return Response.json(
      { error: "This Gmail connection is no longer available. Start again from your agent." },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }
  return Response.json(
    {
      connectionId: record.id,
      agentName: record.agent_name,
      state: connectionState(record),
      expiresAt: record.browser_token_expires_at,
      returnUrl: safeAgentReturnUrl(record.return_url),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
