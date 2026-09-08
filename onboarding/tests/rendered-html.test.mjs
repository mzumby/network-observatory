import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("the customer flow starts from an agent and never asks for copy and paste", async () => {
  const [page, connected, layout, styles] = await Promise.all([
    read("../app/page.tsx"),
    read("../app/connected/page.tsx"),
    read("../app/layout.tsx"),
    read("../app/globals.css"),
  ]);

  assert.match(layout, /Connect Gmail \| AgentMarkit/);
  assert.match(page, /Connect Gmail to \{page\.connection\.agentName\}/);
  assert.match(page, /Continue to Google/);
  assert.match(page, /cannot\s+read what your messages say/);
  assert.match(page, /\/api\/connections\/current/);
  assert.match(page, /\/api\/connections\/claim/);
  assert.match(page, /\/api\/connections\/authorize/);
  assert.match(page, /window\.history\.replaceState/);
  assert.match(page, /window\.location\.assign\(data\.connectUrl\)/);
  assert.match(page, /sessionStorage\.setItem\(FLOW_TAB_KEY, data\.tabToken\)/);
  assert.match(page, /"x-agentmarkit-flow"/);
  assert.match(page, /including Cc and Bcc recipients/);
  assert.match(page, /stable message and thread IDs/);
  assert.doesNotMatch(page, /type="email"|clipboard|hermesCommand|mcpUrl/i);
  assert.doesNotMatch(page, /copy this|paste it|private endpoint|enrichment setup/i);
  assert.doesNotMatch(page, /target="_blank"/);

  assert.match(connected, /\/api\/connections\/status/);
  assert.match(connected, /"x-agentmarkit-flow"/);
  assert.match(connected, /status\?\.state === "connected"/);
  assert.match(connected, /Gmail is connected to/);
  assert.doesNotMatch(connected, /Google approved|one more step|setup command/i);

  assert.match(styles, /--canvas:\s*#eef0ea/);
  assert.match(styles, /--blue:\s*#284ee8/);
  assert.match(styles, /--lime:\s*#d7f46d/);
  assert.match(styles, /"Avenir Next"/);
  assert.match(styles, /"SFMono-Regular"/);
  assert.doesNotMatch(styles, /#d94717|radial-gradient|prefers-color-scheme:\s*dark/i);
});

test("browser routes never return the private agent connection", async () => {
  const sources = await Promise.all([
    read("../app/page.tsx"),
    read("../app/connected/page.tsx"),
    read("../app/api/connections/authorize/route.ts"),
    read("../app/api/connections/current/route.ts"),
    read("../app/api/connections/status/route.ts"),
  ]);
  const browserSurface = sources.join("\n");

  assert.doesNotMatch(browserSurface, /hermesCommand|mcpUrl|\/api\/mcp\/|nobs_/i);
  assert.match(browserSurface, /connectUrl/);
  assert.match(browserSurface, /SameSite=Lax|browserTokenFromRequest/);
});

test("agent claims are server-created, one-time, and stored as hashes", async () => {
  const [admin, claim, identity, database, schema, migrationBase, migrationIndex, migrationCleanup, migrationRevokeState, migrationBrowserIdentity, retiredProvision, retiredInvites] = await Promise.all([
    read("../app/api/admin/agent-connections/route.ts"),
    read("../app/api/connections/claim/route.ts"),
    read("../lib/agent-connections.ts"),
    read("../lib/database.ts"),
    read("../db/schema.ts"),
    read("../drizzle/0002_flimsy_wendell_vaughn.sql"),
    read("../drizzle/0003_young_wither.sql"),
    read("../drizzle/0004_shallow_black_panther.sql"),
    read("../drizzle/0005_acoustic_ulik.sql"),
    read("../drizzle/0006_chief_medusa.sql"),
    read("../app/api/provision/route.ts"),
    read("../app/api/admin/invites/route.ts"),
  ]);
  const migration = `${migrationBase}\n${migrationIndex}\n${migrationCleanup}\n${migrationRevokeState}\n${migrationBrowserIdentity}`;

  assert.match(admin, /authorization\.startsWith\("Bearer "\)/);
  assert.match(admin, /userIdForGrant/);
  assert.match(admin, /ownerRef,\s*installationRef,\s*(?:existing|raced)?\.?id/);
  assert.match(identity, /JSON\.stringify\(\[\s*ownerRef,\s*installationRef,\s*connectionId/);
  assert.match(admin, /requestId/);
  assert.match(admin, /claimUrl/);
  assert.match(admin, /mcpUrl/);
  assert.match(admin, /mcpBearerToken/);
  assert.match(
    admin,
    /publicRecord\(request, existing, \{ mcpBearer: true \}\)/,
  );
  assert.match(
    admin,
    /publicRecord\(request, raced, \{ mcpBearer: true \}\)/,
  );
  assert.match(admin, /mcpUrl:\s*`\$\{origin\}\/api\/mcp`/);
  assert.doesNotMatch(admin, /\/api\/mcp\/\$\{tokens\.mcpToken\}/);
  assert.doesNotMatch(admin, /console\.(?:log|info|debug)/);

  assert.match(claim, /sha256\(token\)/);
  assert.match(claim, /set-cookie/);
  assert.match(claim, /tabToken/);
  assert.match(claim, /openAgentConnectionClaim/);
  assert.match(claim, /URL fragment/);
  assert.match(claim, /before any call to Composio begins/);
  assert.doesNotMatch(claim, /\/claim\/\$\{tokens\.claimToken\}/);
  assert.match(admin, /#claim=\$\{encodeURIComponent\(tokens\.claimToken\)\}/);
  assert.match(admin, /matchesProvisioningRequest\(raced, expected\)/);
  assert.match(database, /claim_opened_at IS NULL/);
  assert.match(database, /installed_at IS NOT NULL/);
  assert.match(database, /WHERE mcp_token_hash = \? AND revoked_at IS NULL/);
  assert.doesNotMatch(
    database,
    /WHERE mcp_token_hash = \? AND installed_at IS NOT NULL/,
  );
  assert.match(database, /rotateAgentConnectionClaim/);
  assert.match(database, /authorization_started_at = \?/);
  assert.match(database, /browser_token_hash = \? AND browser_tab_token_hash = \?/);
  assert.match(database, /browser_token_expires_at > \?/);
  assert.match(database, /attemptStartedAt/);
  assert.match(admin, /Boolean\(record\.installed_at\)/);
  assert.match(admin, /rotateClaim/);
  assert.match(admin, /deleteConnectedAccount/);
  assert.doesNotMatch(admin, /revokeConnectedAccount/);
  assert.match(admin, /recordAgentConnectionRemoteCleanup/);
  assert.match(admin, /remoteCleanup: "pending"/);
  assert.match(admin, /cleanupError \? 202 : 200/);
  assert.match(schema, /"agent_connections"/);
  assert.match(migration, /CREATE TABLE `agent_connections`/);
  assert.match(migration, /agent_connections_active_installation_unique/);
  assert.match(migration, /connected_account_id/);
  assert.match(migration, /remote_cleanup_error/);
  assert.match(migration, /browser_tab_token_hash/);
  assert.match(migration, /needs_reconnect_at/);
  assert.doesNotMatch(migration, /owner_email|gmail_email|owner_ref/);

  assert.match(retiredProvision, /status:\s*410/);
  assert.doesNotMatch(retiredProvision, /createGmailSession|hermes mcp add|mcpUrl/);
  assert.match(retiredInvites, /status:\s*410/);
  assert.doesNotMatch(retiredInvites, /randomToken|INSERT INTO invites/);
});

test("a dormant agent connection lists the same two safe tools", async () => {
  const [mcp, retiredPathMcp, composio, wrangler] = await Promise.all([
    read("../app/api/mcp/route.ts"),
    read("../app/api/mcp/[token]/route.ts"),
    read("../lib/composio.ts"),
    read("../wrangler.jsonc"),
  ]);

  assert.match(mcp, /getMcpAccess/);
  assert.match(mcp, /Gmail is not connected yet/);
  assert.match(mcp, /network_observatory_sweep_email_metadata/);
  assert.match(mcp, /network_observatory_get_message_metadata/);
  assert.match(mcp, /Browser-origin requests are not accepted/);
  assert.match(mcp, /request\.headers\.get\("authorization"\)/);
  assert.match(mcp, /access\.authorized_at && !needsReconnect/);
  assert.match(mcp, /markAgentConnectionNeedsReconnect/);
  assert.match(mcp, /Batch requests are not supported/);
  assert.match(mcp, /mcpRequestCost/);
  assert.match(mcp, /`mcp:\$\{tokenHash\}`,[\s\S]*300,[\s\S]*requestCost/);
  assert.match(mcp, /resultIfStillAuthorized/);
  assert.match(mcp, /access\.kind !== "agent"/);
  assert.match(retiredPathMcp, /status:\s*410/);
  assert.doesNotMatch(retiredPathMcp, /getMcpAccess|sha256|params\.token/);
  assert.match(wrangler, /"invocation_logs": false/);
  assert.doesNotMatch(mcp, /createGmailLink|reconnectUrl/);
  assert.match(composio, /GMAIL_FETCH_EMAILS/);
  assert.match(composio, /GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID/);
  assert.match(composio, /getGmailConnectionStatus/);
  assert.match(composio, /connected_account\?\.status/);
  assert.match(composio, /response\.status < 200 \|\| response\.status >= 300/);
  assert.match(composio, /AbortSignal\.timeout\(COMPOSIO_TIMEOUT_MS\)/);
  assert.match(composio, /cause instanceof GmailProxyError && cause\.status === 404/);
  assert.match(composio, /slice\(index, index \+ 5\)/);
  assert.match(composio, /new Set\([\s\S]*\.slice\(0, requestedCount\)/);
  assert.doesNotMatch(composio, /resultSizeEstimate/);
  assert.doesNotMatch(composio, /function revokeConnectedAccount/);
  assert.doesNotMatch(composio, /SEND_EMAIL|CREATE_DRAFT|DELETE_MESSAGE/);
});

test("health is local-only and the protected preflight verifies permissions", async () => {
  const [health, preflight, composio, authorize] = await Promise.all([
    read("../app/api/health/route.ts"),
    read("../app/api/admin/preflight/route.ts"),
    read("../lib/composio.ts"),
    read("../app/api/connections/authorize/route.ts"),
  ]);

  assert.match(health, /mode:\s*"agent-claim"/);
  assert.match(health, /declared:\s*GMAIL_METADATA_SCOPE/);
  assert.match(health, /protected admin preflight/);
  assert.match(health, /COMPOSIO_API_KEY/);
  assert.match(health, /COMPOSIO_GMAIL_AUTH_CONFIG_ID/);
  assert.doesNotMatch(health, /apiKey:\s*|adminToken:\s*|pepper:\s*/i);
  assert.match(preflight, /secretMatches/);
  assert.match(preflight, /inspectGmailAuthConfig/);
  assert.match(preflight, /authConfig\.verified \? 200 : 503/);
  assert.match(preflight, /requiredCallbackVerifier/);
  assert.match(preflight, /Settings > General > Configuration/);
  assert.match(authorize, /\/api\/connections\/verify/);
  assert.doesNotMatch(authorize, /origin\}\/connected/);
  assert.match(composio, /https:\/\/mail\.google\.com/);
  assert.match(composio, /metadataOnly/);
});

test("the operator CLI keeps credentials out of terminal output", async () => {
  const script = await read("../scripts/provision_agent_connection.py");

  assert.match(script, /parsed\.scheme != "https"/);
  assert.match(script, /CONNECT_ORIGIN = "https:\/\/connect\.agentmarkit\.com"/);
  assert.match(script, /class NoRedirect/);
  assert.match(script, /os\.O_EXCL/);
  assert.match(script, /0o600/);
  assert.match(script, /print_redacted/);
  assert.match(script, /"mcpBearerToken", "claimUrl"/);
  assert.match(script, /--secret-file/);
  const reserve = script.indexOf(
    "secret_file, descriptor = reserve_secret_file(args.secret_file)",
  );
  const createRequest = script.indexOf(
    'result = call(args.url, token, "POST", payload)',
    reserve,
  );
  assert.ok(reserve >= 0 && createRequest > reserve);
  assert.match(script, /os\.unlink\(secret_file\)/);
});
