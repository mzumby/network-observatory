import {
  browserTokenFromRequest,
  browserTabTokenFromRequest,
  connectionState,
  safeAgentReturnUrl,
} from "@/lib/agent-connections";
import { sha256 } from "@/lib/crypto";
import { getAgentConnectionByBrowserIdentity } from "@/lib/database";

export const dynamic = "force-dynamic";

function reply(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

export async function GET(request: Request) {
  const browserToken = browserTokenFromRequest(request);
  const browserTabToken = browserTabTokenFromRequest(request);
  if (
    !browserToken.startsWith("flow_") ||
    browserToken.length > 128 ||
    !browserTabToken.startsWith("tab_") ||
    browserTabToken.length > 128
  ) {
    return reply({ error: "This setup session has expired. Start again from your agent." }, 401);
  }
  const record = await getAgentConnectionByBrowserIdentity(
    await sha256(browserToken),
    await sha256(browserTabToken),
  );
  if (!record) {
    return reply({ error: "This setup session has expired. Start again from your agent." }, 401);
  }

  const state = connectionState(record);

  return reply({
    connectionId: record.id,
    agentName: record.agent_name,
    state,
    returnUrl: safeAgentReturnUrl(record.return_url),
    checking: state === "authorizing",
  });
}
