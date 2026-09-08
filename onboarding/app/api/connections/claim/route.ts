import {
  BROWSER_SESSION_MS,
  browserCookie,
  browserTokenFromRequest,
} from "@/lib/agent-connections";
import { randomToken, sha256 } from "@/lib/crypto";
import {
  getAgentConnectionByClaimHash,
  getAgentConnectionByBrowserHash,
  openAgentConnectionClaim,
} from "@/lib/database";

export const dynamic = "force-dynamic";

function reply(body: unknown, status = 200, cookie?: string) {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      ...(cookie ? { "set-cookie": cookie } : {}),
    },
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { token?: string }
    | null;
  const token = typeof body?.token === "string" ? body.token : "";
  if (!token.startsWith("claim_acn_") || token.length > 128) {
    return reply({ error: "This setup link is not valid." }, 400);
  }

  const existingFlowToken = browserTokenFromRequest(request);
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

  const record = await getAgentConnectionByClaimHash(await sha256(token));
  const now = new Date().toISOString();
  if (!record || record.revoked_at) {
    return reply({ error: "This setup link is not valid." }, 404);
  }
  if (!record.installed_at) {
    return reply({ error: "Your agent is still being set up." }, 409);
  }
  if (record.claim_expires_at <= now) {
    return reply({ error: "This setup link has expired." }, 410);
  }
  if (record.claim_opened_at) {
    return reply({ error: "This setup link has already been used." }, 409);
  }

  const flowToken = `flow_${randomToken(24)}`;
  const tabToken = `tab_${randomToken(24)}`;
  const flowTokenHash = await sha256(flowToken);
  const tabTokenHash = await sha256(tabToken);
  const flowExpiresAt = new Date(Date.now() + BROWSER_SESSION_MS).toISOString();
  if (
    !(await openAgentConnectionClaim(
      await sha256(token),
      flowTokenHash,
      tabTokenHash,
      flowExpiresAt,
    ))
  ) {
    return reply({ error: "This setup link has already been used." }, 409);
  }

  // The token arrives in a URL fragment, which is not sent in HTTP requests or
  // link previews. This short exchange consumes it and returns the browser-only
  // session cookie before any call to Composio begins.
  return reply(
    { ready: true, tabToken },
    200,
    browserCookie(flowToken, request.url),
  );
}
