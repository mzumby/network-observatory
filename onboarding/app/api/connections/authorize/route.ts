import {
  DISCLOSURE_VERSION,
  browserTabTokenFromRequest,
  browserTokenFromRequest,
} from "@/lib/agent-connections";
import {
  createGmailLink,
  createGmailSession,
  deleteSession,
  inspectGmailAuthConfig,
} from "@/lib/composio";
import { sha256 } from "@/lib/crypto";
import {
  checkRateLimit,
  completeAgentConnectionAuthorizationStart,
  getAgentConnectionByBrowserIdentity,
  releaseAgentConnectionAuthorization,
  reserveAgentConnectionAuthorization,
} from "@/lib/database";
import { requireRuntimeConfig } from "@/lib/runtime";

export const dynamic = "force-dynamic";

function reply(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export async function POST(request: Request) {
  const runtime = requireRuntimeConfig();
  const browserToken = browserTokenFromRequest(request);
  const browserTabToken = browserTabTokenFromRequest(request);
  if (
    !browserToken.startsWith("flow_") ||
    browserToken.length > 128 ||
    !browserTabToken.startsWith("tab_") ||
    browserTabToken.length > 128
  ) {
    return reply({ error: "Start again from your agent's Connections page." }, 401);
  }
  const browserTokenHash = await sha256(browserToken);
  const browserTabTokenHash = await sha256(browserTabToken);
  let record = await getAgentConnectionByBrowserIdentity(
    browserTokenHash,
    browserTabTokenHash,
  );
  if (!record) return reply({ error: "This setup session has expired. Start again from your agent." }, 401);
  if (!record.installed_at) return reply({ error: "Your agent is still being set up. Try again shortly." }, 409);
  if (record.revoked_at) return reply({ error: "This Gmail connection has been turned off." }, 410);
  if (record.authorized_at) return reply({ error: `Gmail is already connected to ${record.agent_name}.` }, 409);

  const body = (await request.json().catch(() => null)) as
    | { connectionId?: string; accepted?: boolean; disclosureVersion?: string }
    | null;
  if (body?.connectionId !== record.id) {
    return reply({ error: "This browser tab belongs to a different Gmail setup." }, 409);
  }
  if (body.accepted !== true || body.disclosureVersion !== DISCLOSURE_VERSION) {
    return reply({ error: "Review what this connection can access before continuing." }, 400);
  }

  const rate = await checkRateLimit(`connect:${browserTokenHash}`, 6);
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

  const callbackUrl = `${new URL(request.url).origin}/api/connections/verify`;
  let authorizationAttempt: string | null = null;
  try {
    const authConfig = await inspectGmailAuthConfig(
      runtime.COMPOSIO_API_KEY,
      runtime.COMPOSIO_GMAIL_AUTH_CONFIG_ID,
    );
    if (!authConfig.verified) {
      console.error("Gmail authorization is blocked by the auth config check", {
        checks: authConfig.checks,
      });
      return reply({ error: "Gmail setup is unavailable while we check its permissions." }, 503);
    }
    if (record.session_id) {
      return reply({
        agentName: record.agent_name,
        connectUrl: await createGmailLink(
          runtime.COMPOSIO_API_KEY,
          record.session_id,
          callbackUrl,
        ),
      });
    }

    authorizationAttempt = new Date().toISOString();
    if (
      !(await reserveAgentConnectionAuthorization(
        record.id,
        DISCLOSURE_VERSION,
        authorizationAttempt,
        browserTokenHash,
        browserTabTokenHash,
      ))
    ) {
      record = await getAgentConnectionByBrowserIdentity(
        browserTokenHash,
        browserTabTokenHash,
      );
      if (record?.session_id) {
        return reply({
          agentName: record.agent_name,
          connectUrl: await createGmailLink(
            runtime.COMPOSIO_API_KEY,
            record.session_id,
            callbackUrl,
          ),
        });
      }
      return reply({ error: "This connection is already being started. Try again shortly." }, 409);
    }

    const sessionId = await createGmailSession(
      runtime.COMPOSIO_API_KEY,
      runtime.COMPOSIO_GMAIL_AUTH_CONFIG_ID,
      record.user_id,
      callbackUrl,
    );
    if (
      !(await completeAgentConnectionAuthorizationStart(
        record.id,
        sessionId,
        authorizationAttempt,
      ))
    ) {
      await deleteSession(runtime.COMPOSIO_API_KEY, sessionId);
      await releaseAgentConnectionAuthorization(
        record.id,
        "session_not_saved",
        authorizationAttempt,
      );
      return reply({ error: "The connection could not be saved. Try again." }, 502);
    }
    return reply({
      agentName: record.agent_name,
      connectUrl: await createGmailLink(
        runtime.COMPOSIO_API_KEY,
        sessionId,
        callbackUrl,
      ),
    });
  } catch (cause) {
    if (authorizationAttempt) {
      await releaseAgentConnectionAuthorization(
        record.id,
        "composio_start_failed",
        authorizationAttempt,
      );
    }
    console.error("Gmail authorization could not start", {
      message: cause instanceof Error ? cause.message : "unknown error",
    });
    return reply({ error: "Google could not be opened. Try again shortly." }, 502);
  }
}
