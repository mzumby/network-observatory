import {
  agentConnectionTokens,
  connectionState,
  HANDOFF_SESSION_MS,
  safeAgentReturnUrl,
  userIdForGrant,
} from "@/lib/agent-connections";
import {
  deleteConnectedAccount,
  deleteSession,
  findGmailConnectedAccount,
  getGmailConnectionStatus,
} from "@/lib/composio";
import { randomToken, secretMatches } from "@/lib/crypto";
import {
  createAgentConnection,
  getActiveAgentConnectionByInstallationRef,
  getAgentConnectionById,
  getAgentConnectionByRequestId,
  markAgentConnectionInstalled,
  recordAgentConnectionConnectedAccount,
  recordAgentConnectionRemoteCleanup,
  issueAgentConnectionHandoff,
  revokeAgentConnection,
} from "@/lib/database";
import { requireRuntimeConfig } from "@/lib/runtime";

export const dynamic = "force-dynamic";

const REF_RE = /^[A-Za-z0-9._:@/-]{3,180}$/;
const REQUEST_RE = /^[A-Za-z0-9._:-]{8,180}$/;
const CONNECTION_ID_RE = /^acn_[a-f0-9]{24}$/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

function textField(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function authorized(request: Request, expected: string) {
  const authorization = request.headers.get("authorization") || "";
  const supplied = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  return Boolean(supplied) && secretMatches(supplied, expected);
}

function reply(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

async function publicRecord(
  request: Request,
  record: NonNullable<Awaited<ReturnType<typeof getAgentConnectionById>>>,
  reveal: { mcpBearer?: boolean; handoff?: boolean } = {},
) {
  const runtime = requireRuntimeConfig();
  const origin = new URL(request.url).origin;
  const handoffAvailable =
    Boolean(record.installed_at) &&
    !record.claim_opened_at &&
    !record.revoked_at &&
    record.claim_expires_at > new Date().toISOString();
  const tokens =
    reveal.mcpBearer || reveal.handoff
      ? await agentConnectionTokens(
          runtime.IDENTITY_PEPPER,
          record.id,
          record.claim_expires_at,
        )
      : null;

  return {
    connectionId: record.id,
    agentName: record.agent_name,
    state: connectionState(record),
    installed: Boolean(record.installed_at),
    mcpUrl: `${origin}/api/mcp`,
    ...(reveal.mcpBearer && tokens ? { mcpBearerToken: tokens.mcpToken } : {}),
    ...(reveal.handoff
      ? {
          connectUrl: handoffAvailable
            ? `${origin}/#connection=${encodeURIComponent(record.id)}`
            : null,
          handoffToken: handoffAvailable && tokens ? tokens.handoffToken : null,
        }
      : {}),
    handoffExpiresAt: handoffAvailable ? record.claim_expires_at : null,
  };
}

export async function GET(request: Request) {
  const runtime = requireRuntimeConfig();
  if (!(await authorized(request, runtime.INVITE_ADMIN_TOKEN))) {
    return reply({ error: "Unauthorized" }, 401);
  }
  const connectionId = textField(new URL(request.url).searchParams.get("connectionId"));
  if (!CONNECTION_ID_RE.test(connectionId)) {
    return reply({ error: "Provide a valid connection ID." }, 400);
  }
  const record = await getAgentConnectionById(connectionId);
  return record
    ? reply({
        connectionId: record.id,
        agentName: record.agent_name,
        state: connectionState(record),
        installed: Boolean(record.installed_at),
        handoffExpiresAt:
          record.installed_at &&
          !record.claim_opened_at &&
          !record.revoked_at &&
          record.claim_expires_at > new Date().toISOString()
            ? record.claim_expires_at
            : null,
      })
    : reply({ error: "Connection not found." }, 404);
}

function matchesProvisioningRequest(
  record: NonNullable<Awaited<ReturnType<typeof getAgentConnectionById>>>,
  expected: {
    userId: string;
    installationRef: string;
    agentName: string;
    returnUrl: string | null;
  },
) {
  return (
    record.user_id === expected.userId &&
    record.installation_ref === expected.installationRef &&
    record.agent_name === expected.agentName &&
    record.return_url === expected.returnUrl
  );
}

export async function POST(request: Request) {
  const runtime = requireRuntimeConfig();
  if (!(await authorized(request, runtime.INVITE_ADMIN_TOKEN))) {
    return reply({ error: "Unauthorized" }, 401);
  }

  const body = (await request.json().catch(() => null)) as
    | {
        requestId?: string;
        ownerRef?: string;
        installationRef?: string;
        agentName?: string;
        returnUrl?: string;
      }
    | null;
  const requestId = textField(body?.requestId);
  const ownerRef = textField(body?.ownerRef);
  const installationRef = textField(body?.installationRef);
  const agentName = textField(body?.agentName);
  const returnUrl = safeAgentReturnUrl(body?.returnUrl);

  if (
    !REQUEST_RE.test(requestId) ||
    !REF_RE.test(ownerRef) ||
    !REF_RE.test(installationRef) ||
    !agentName ||
    agentName.length > 80 ||
    CONTROL_CHARACTERS.test(agentName) ||
    (body?.returnUrl && !returnUrl)
  ) {
    return reply({ error: "Provide a valid request, owner, installation, and agent name." }, 400);
  }

  const existing = await getAgentConnectionByRequestId(requestId);
  if (existing) {
    const userId = await userIdForGrant(
      runtime.IDENTITY_PEPPER,
      ownerRef,
      installationRef,
      existing.id,
    );
    const expected = { userId, installationRef, agentName, returnUrl };
    if (!matchesProvisioningRequest(existing, expected)) {
      return reply({ error: "That request ID was already used for a different connection." }, 409);
    }
    return reply(await publicRecord(request, existing, { mcpBearer: true }));
  }

  if (await getActiveAgentConnectionByInstallationRef(installationRef)) {
    return reply({ error: "That agent already has an active Gmail connection." }, 409);
  }

  const id = `acn_${randomToken(12)}`;
  const userId = await userIdForGrant(
    runtime.IDENTITY_PEPPER,
    ownerRef,
    installationRef,
    id,
  );
  const expected = { userId, installationRef, agentName, returnUrl };
  // A new grant is dormant. A five-minute handoff is issued only after
  // AgentMarkit rechecks the signed-in owner and exact installation.
  const handoffExpiresAt = new Date(0).toISOString();
  const tokens = await agentConnectionTokens(runtime.IDENTITY_PEPPER, id, handoffExpiresAt);
  try {
    await createAgentConnection({
      id,
      requestId,
      userId,
      installationRef,
      agentName,
      returnUrl,
      mcpTokenHash: tokens.mcpTokenHash,
      handoffTokenHash: tokens.handoffTokenHash,
      handoffExpiresAt,
    });
  } catch {
    const raced = await getAgentConnectionByRequestId(requestId);
    if (!raced) {
      if (await getActiveAgentConnectionByInstallationRef(installationRef)) {
        return reply({ error: "That agent already has an active Gmail connection." }, 409);
      }
      return reply({ error: "The connection could not be created." }, 500);
    }
    expected.userId = await userIdForGrant(
      runtime.IDENTITY_PEPPER,
      ownerRef,
      installationRef,
      raced.id,
    );
    if (!matchesProvisioningRequest(raced, expected)) {
      return reply({ error: "That request ID was already used for a different connection." }, 409);
    }
    return reply(await publicRecord(request, raced, { mcpBearer: true }));
  }

  const created = await getAgentConnectionById(id);
  if (!created) return reply({ error: "The connection could not be created." }, 500);
  return reply(await publicRecord(request, created, { mcpBearer: true }), 201);
}

export async function PATCH(request: Request) {
  const runtime = requireRuntimeConfig();
  if (!(await authorized(request, runtime.INVITE_ADMIN_TOKEN))) {
    return reply({ error: "Unauthorized" }, 401);
  }
  const body = (await request.json().catch(() => null)) as
    | {
        connectionId?: string;
        installed?: boolean;
        issueHandoff?: boolean;
        ownerRef?: string;
        installationRef?: string;
      }
    | null;
  const connectionId = textField(body?.connectionId);
  const installing = body?.installed === true;
  const issuingHandoff = body?.issueHandoff === true;
  if (!CONNECTION_ID_RE.test(connectionId) || installing === issuingHandoff) {
    return reply({ error: "Choose either installed or issueHandoff for this connection." }, 400);
  }

  if (installing) {
    if (!(await markAgentConnectionInstalled(connectionId))) {
      return reply({ error: "Connection not found." }, 404);
    }
  } else {
    const ownerRef = textField(body?.ownerRef);
    const installationRef = textField(body?.installationRef);
    if (!REF_RE.test(ownerRef) || !REF_RE.test(installationRef)) {
      return reply({ error: "Provide the verified owner and installation." }, 400);
    }
    const record = await getAgentConnectionById(connectionId);
    if (!record || record.revoked_at) {
      return reply({ error: "Connection not found." }, 404);
    }
    const expectedUserId = await userIdForGrant(
      runtime.IDENTITY_PEPPER,
      ownerRef,
      installationRef,
      connectionId,
    );
    if (
      record.installation_ref !== installationRef ||
      record.user_id !== expectedUserId
    ) {
      return reply({ error: "Connection not found." }, 404);
    }
    if (!record.installed_at) {
      return reply({ error: "Your agent is still being set up." }, 409);
    }
    if (record.authorized_at) {
      return reply({ error: "Gmail is already connected." }, 409);
    }
    if (record.authorization_started_at || record.session_id) {
      return reply(
        { error: "Google authorization has already started. Revoke this connection and create a new one." },
        409,
      );
    }
    const issuedAt = new Date().toISOString();
    if (
      record.claim_opened_at &&
      (!record.browser_token_expires_at ||
        record.browser_token_expires_at > issuedAt)
    ) {
      return reply(
        { error: "Finish the Gmail connection already open in this browser." },
        409,
      );
    }
    if (record.claim_opened_at || record.claim_expires_at <= issuedAt) {
      const handoffExpiresAt = new Date(
        new Date(issuedAt).getTime() + HANDOFF_SESSION_MS,
      ).toISOString();
      const tokens = await agentConnectionTokens(
        runtime.IDENTITY_PEPPER,
        connectionId,
        handoffExpiresAt,
      );
      await issueAgentConnectionHandoff(
        connectionId,
        tokens.handoffTokenHash,
        handoffExpiresAt,
        issuedAt,
      );
    }
  }
  const record = await getAgentConnectionById(connectionId);
  if (!record) return reply({ error: "Connection not found." }, 404);
  if (
    issuingHandoff &&
    (!record.installed_at ||
      record.claim_opened_at ||
      record.revoked_at ||
      record.claim_expires_at <= new Date().toISOString())
  ) {
    return reply({ error: "A Gmail connection handoff could not be created." }, 409);
  }
  return reply(await publicRecord(request, record, { handoff: issuingHandoff }));
}

export async function DELETE(request: Request) {
  const runtime = requireRuntimeConfig();
  if (!(await authorized(request, runtime.INVITE_ADMIN_TOKEN))) {
    return reply({ error: "Unauthorized" }, 401);
  }
  const body = (await request.json().catch(() => null)) as
    | { connectionId?: string }
    | null;
  const connectionId = textField(body?.connectionId);
  if (!CONNECTION_ID_RE.test(connectionId)) {
    return reply({ error: "Provide a valid connection ID." }, 400);
  }
  let record = await getAgentConnectionById(connectionId);
  if (!record) return reply({ error: "Connection not found." }, 404);
  if (record.remote_cleanup_at) {
    return reply({ revoked: true, connectionId, remoteCleanup: "complete" });
  }
  if (!record.revoked_at && !(await revokeAgentConnection(connectionId))) {
    const current = await getAgentConnectionById(connectionId);
    if (!current?.revoked_at) {
      return reply({ error: "Active connection not found." }, 404);
    }
    record = current;
  }

  record = (await getAgentConnectionById(connectionId)) || record;
  let connectedAccountId = record.connected_account_id;
  if (!connectedAccountId && record.session_id) {
    try {
      const gmail = await getGmailConnectionStatus(
        runtime.COMPOSIO_API_KEY,
        record.session_id,
      );
      connectedAccountId = gmail.connectedAccountId;
      if (connectedAccountId) {
        await recordAgentConnectionConnectedAccount(
          connectionId,
          connectedAccountId,
        );
      }
    } catch {
      // Fall through to the grant-specific account lookup below.
    }
  }
  if (!connectedAccountId) {
    try {
      connectedAccountId = await findGmailConnectedAccount(
        runtime.COMPOSIO_API_KEY,
        record.user_id,
        runtime.COMPOSIO_GMAIL_AUTH_CONFIG_ID,
      );
      if (connectedAccountId) {
        await recordAgentConnectionConnectedAccount(
          connectionId,
          connectedAccountId,
        );
      }
    } catch {
      await recordAgentConnectionRemoteCleanup(
        connectionId,
        "connected_account_lookup_failed",
      );
      return reply(
        { revoked: true, connectionId, remoteCleanup: "pending" },
        202,
      );
    }
  }

  const cleanupErrors: string[] = [];
  if (record.session_id) {
    try {
      if (!(await deleteSession(runtime.COMPOSIO_API_KEY, record.session_id))) {
        cleanupErrors.push("session_delete_failed");
      }
    } catch {
      cleanupErrors.push("session_delete_failed");
    }
  }
  if (connectedAccountId) {
    try {
      if (
        !(await deleteConnectedAccount(
          runtime.COMPOSIO_API_KEY,
          connectedAccountId,
        ))
      ) {
        cleanupErrors.push("connected_account_delete_failed");
      }
    } catch {
      cleanupErrors.push("connected_account_delete_failed");
    }
  }

  const cleanupError = cleanupErrors.join(",") || null;
  await recordAgentConnectionRemoteCleanup(connectionId, cleanupError);
  return reply(
    {
      revoked: true,
      connectionId,
      remoteCleanup: cleanupError ? "pending" : "complete",
    },
    cleanupError ? 202 : 200,
  );
}
