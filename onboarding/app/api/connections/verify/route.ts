import {
  browserTabTokenFromRequest,
  browserTokenFromRequest,
  connectionIdFromRequest,
} from "@/lib/agent-connections";
import {
  completeGmailAuth,
  deleteConnectedAccount,
  deleteSession,
  findGmailConnectedAccount,
  getGmailConnectionStatus,
  inspectGmailAuthConfig,
  pinGmailConnectedAccount,
} from "@/lib/composio";
import { randomToken, sha256 } from "@/lib/crypto";
import {
  getAgentConnectionByBrowserIdentity,
  markAgentConnectionAuthorized,
  recordAgentConnectionConnectedAccount,
  recordAgentConnectionRemoteCleanup,
  revokeAgentConnection,
} from "@/lib/database";
import { requireRuntimeConfig } from "@/lib/runtime";

export const dynamic = "force-dynamic";

function destination(request: Request, problem?: string) {
  const target = new URL(problem ? "/" : "/connected", request.url);
  if (problem) target.searchParams.set("problem", problem);
  return target.href;
}

function reply(request: Request, problem?: string) {
  return Response.json(
    { redirect: destination(request, problem) },
    {
      headers: {
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
        "x-content-type-options": "nosniff",
      },
    },
  );
}

export async function GET() {
  const nonce = randomToken(18);
  const script = `
    (() => {
      const fail = () => location.replace('/?problem=identity-check');
      const sessionUri = new URLSearchParams(location.search).get('session_uri');
      const tabToken = sessionStorage.getItem('agentmarkit_gmail_flow');
      const connectionId = sessionStorage.getItem('agentmarkit_gmail_connection_id');
      if (!sessionUri || !tabToken || !connectionId) return fail();
      fetch('/api/connections/verify', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-agentmarkit-flow': tabToken,
          'x-agentmarkit-connection': connectionId,
        },
        body: JSON.stringify({ sessionUri }),
      })
        .then((response) => response.json())
        .then((result) => {
          if (typeof result.redirect !== 'string') return fail();
          location.replace(result.redirect);
        })
        .catch(fail);
    })();
  `;
  const html = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
  <body><p>Finishing your Gmail connection...</p><script nonce="${nonce}">${script}</script></body>
</html>`;
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": `default-src 'none'; script-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'`,
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    },
  });
}

export async function POST(request: Request) {
  const runtime = requireRuntimeConfig();
  const body = (await request.json().catch(() => null)) as
    | { sessionUri?: unknown }
    | null;
  const sessionUri =
    typeof body?.sessionUri === "string" ? body.sessionUri.trim() : "";
  const connectionId = connectionIdFromRequest(request);
  const browserToken = browserTokenFromRequest(request, connectionId);
  const browserTabToken = browserTabTokenFromRequest(request);
  if (
    !sessionUri ||
    sessionUri.length > 2048 ||
    !browserToken.startsWith("flow_") ||
    browserToken.length > 128 ||
    !browserTabToken.startsWith("tab_") ||
    browserTabToken.length > 128
  ) {
    return reply(request, "identity-check");
  }

  const record = await getAgentConnectionByBrowserIdentity(
    await sha256(browserToken),
    await sha256(browserTabToken),
  );
  if (!record || record.id !== connectionId || record.revoked_at || !record.session_id) {
    return reply(request, "identity-check");
  }

  let connectedAccountId: string | null = null;
  let authCompletionAttempted = false;
  async function finish(accountId: string) {
    if (!(await recordAgentConnectionConnectedAccount(record.id, accountId))) {
      throw new Error("The verified account could not be recorded.");
    }
    await pinGmailConnectedAccount(
      runtime.COMPOSIO_API_KEY,
      record.session_id!,
      accountId,
    );
    if (!(await markAgentConnectionAuthorized(record.id, accountId))) {
      throw new Error("The verified account could not be saved.");
    }
  }

  async function stopFailedConnection(accountId: string | null) {
    await revokeAgentConnection(record.id);
    if (accountId?.startsWith("ca_")) {
      await recordAgentConnectionConnectedAccount(record.id, accountId);
    }
    const cleanupErrors: string[] = [];
    try {
      if (!(await deleteSession(runtime.COMPOSIO_API_KEY, record.session_id!))) {
        cleanupErrors.push("session_delete_failed");
      }
    } catch {
      cleanupErrors.push("session_delete_failed");
    }
    if (accountId?.startsWith("ca_")) {
      try {
        if (!(await deleteConnectedAccount(runtime.COMPOSIO_API_KEY, accountId))) {
          cleanupErrors.push("connected_account_delete_failed");
        }
      } catch {
        cleanupErrors.push("connected_account_delete_failed");
      }
    } else {
      cleanupErrors.push("connected_account_reconciliation_required");
    }
    await recordAgentConnectionRemoteCleanup(
      record.id,
      cleanupErrors.join(",") || null,
    );
  }

  try {
    const authConfig = await inspectGmailAuthConfig(
      runtime.COMPOSIO_API_KEY,
      runtime.COMPOSIO_GMAIL_AUTH_CONFIG_ID,
    );
    if (!authConfig.verified) {
      return reply(request, "verification-failed");
    }
    authCompletionAttempted = true;
    const result = await completeGmailAuth(
      runtime.COMPOSIO_API_KEY,
      sessionUri,
      record.user_id,
    );
    connectedAccountId = result.connected_account_id;
    if (
      result.toolkit_slug.toLowerCase() !== "gmail" ||
      !connectedAccountId.startsWith("ca_")
    ) {
      throw new Error("Composio returned the wrong connected account.");
    }
    await finish(connectedAccountId);
    return reply(request);
  } catch {
    if (authCompletionAttempted && !connectedAccountId) {
      try {
        const status = await getGmailConnectionStatus(
          runtime.COMPOSIO_API_KEY,
          record.session_id,
        );
        connectedAccountId = status.connectedAccountId;
        if (status.active && connectedAccountId?.startsWith("ca_")) {
          await finish(connectedAccountId);
          return reply(request);
        }
      } catch {
        // The connection is stopped below and left visible to the cleanup retry.
      }
      if (!connectedAccountId) {
        try {
          connectedAccountId = await findGmailConnectedAccount(
            runtime.COMPOSIO_API_KEY,
            record.user_id,
            runtime.COMPOSIO_GMAIL_AUTH_CONFIG_ID,
          );
          if (connectedAccountId?.startsWith("ca_")) {
            await finish(connectedAccountId);
            return reply(request);
          }
        } catch {
          // The connection is stopped below and left visible to the cleanup retry.
        }
      }
    }
    if (authCompletionAttempted) {
      await stopFailedConnection(connectedAccountId);
    }
    return reply(request, "verification-failed");
  }
}
