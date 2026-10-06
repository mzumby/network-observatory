import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { afterEach, test } from "node:test";
import ts from "typescript";
import { getGmailAccountEmail } from "../lib/composio.ts";

const originalFetch = globalThis.fetch;

// Run the actual admin GET with stubbed services, keeping its authorization,
// provider-binding, and response branches under test without a live grant.
const source = await readFile(
  new URL("../app/api/admin/agent-connections/route.ts", import.meta.url),
  "utf8",
);
let route = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const imports = {
  "@/lib/agent-connections": [
    "agentConnectionTokens", "connectionState", "safeAgentReturnUrl", "userIdForGrant",
  ],
  "@/lib/composio": [
    "deleteConnectedAccount", "deleteSession", "findGmailConnectedAccount",
    "getGmailAccountEmail", "getGmailConnectionStatus", "probeGmailMetadata",
  ],
  "@/lib/crypto": ["randomToken", "secretMatches"],
  "@/lib/database": [
    "createAgentConnection", "getActiveAgentConnectionByInstallationRef",
    "getAgentConnectionById", "getAgentConnectionByRequestId",
    "markAgentConnectionInstalled", "recordAgentConnectionConnectedAccount",
    "recordAgentConnectionRemoteCleanup", "issueAgentConnectionHandoff",
    "markAgentConnectionNeedsReconnect", "revokeAgentConnection",
  ],
  "@/lib/runtime": ["requireRuntimeConfig"],
};
for (const [specifier, names] of Object.entries(imports)) {
  const stub = [
    ...names.map(
      (name) =>
        `export const ${name} = (...args) => globalThis.__gmailAdminMocks.${name}(...args);`,
    ),
    ...(specifier === "@/lib/agent-connections"
      ? ["export const HANDOFF_SESSION_MS = 300000;"]
      : []),
  ].join("\n");
  route = route.replace(
    JSON.stringify(specifier),
    JSON.stringify(`data:text/javascript,${encodeURIComponent(stub)}`),
  );
}
route = route.replace(
  JSON.stringify("@/lib/gmail-connection-status.mjs"),
  JSON.stringify(new URL("../lib/gmail-connection-status.mjs", import.meta.url).href),
);
const { GET } = await import(`data:text/javascript,${encodeURIComponent(route)}`);

const connectionId = "acn_0123456789abcdef01234567";
const baseRecord = {
  id: connectionId,
  agent_name: "Day",
  installed_at: "2026-10-01T00:00:00.000Z",
  authorized_at: "2026-10-01T00:00:00.000Z",
  needs_reconnect_at: null,
  revoked_at: null,
  session_id: "session-day",
  connected_account_id: "ca_expected",
  claim_opened_at: null,
  claim_expires_at: "2099-01-01T00:00:00.000Z",
};

function request(includeAccountEmail) {
  const url = new URL("https://connect.agentmarkit.com/api/admin/agent-connections");
  url.searchParams.set("connectionId", connectionId);
  if (includeAccountEmail) url.searchParams.set("includeAccountEmail", "1");
  return new Request(url, { headers: { authorization: "Bearer admin-secret" } });
}

function mockServices({ record = baseRecord, status, probe, profile } = {}) {
  const calls = { status: 0, probe: 0, profile: 0, reconnect: 0 };
  globalThis.__gmailAdminMocks = {
    requireRuntimeConfig: () => ({
      INVITE_ADMIN_TOKEN: "admin-secret",
      COMPOSIO_API_KEY: "project-key",
    }),
    secretMatches: (supplied, expected) => supplied === expected,
    getAgentConnectionById: async () => record,
    connectionState: (current) =>
      current.revoked_at
        ? "revoked"
        : current.needs_reconnect_at
          ? "needs_reconnect"
          : current.authorized_at
            ? "connected"
            : "waiting",
    getGmailConnectionStatus: async () => {
      calls.status += 1;
      return status || { active: true, connectedAccountId: "ca_expected" };
    },
    probeGmailMetadata: async () => {
      calls.probe += 1;
      return probe ? probe() : { ok: true, status: 200, reason: "" };
    },
    getGmailAccountEmail: async (...args) => {
      calls.profile += 1;
      return profile ? profile(...args) : "owner@example.com";
    },
    markAgentConnectionNeedsReconnect: async () => {
      calls.reconnect += 1;
      return true;
    },
  };
  return calls;
}

afterEach(() => {
  delete globalThis.__gmailAdminMocks;
  globalThis.fetch = originalFetch;
});

test("admin GET resolves profile and metadata concurrently only when requested", async () => {
  let finishProbe;
  let finishProfile;
  const calls = mockServices({
    probe: () => new Promise((resolve) => { finishProbe = resolve; }),
    profile: () => new Promise((resolve) => { finishProfile = resolve; }),
  });
  const pending = GET(request(true));
  await new Promise(setImmediate);
  assert.equal(calls.probe, 1);
  assert.equal(calls.profile, 1);
  finishProbe({ ok: true, status: 200, reason: "" });
  finishProfile("owner@example.com");
  const response = await pending;
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  assert.deepEqual(
    { state: body.state, accountEmail: body.accountEmail },
    { state: "connected", accountEmail: "owner@example.com" },
  );
  assert.equal(calls.reconnect, 0);
});

test("routine status polling does not request or return a profile", async () => {
  const calls = mockServices();
  const response = await GET(request(false));
  const body = await response.json();
  assert.equal(body.state, "connected");
  assert.equal(Object.hasOwn(body, "accountEmail"), false);
  assert.equal(calls.probe, 1);
  assert.equal(calls.profile, 0);
});

test("a mismatched, inactive, or revoked grant never exposes an account email", async () => {
  for (const options of [
    { status: { active: true, connectedAccountId: "ca_other" } },
    { status: { active: false, connectedAccountId: "ca_expected" } },
    { record: { ...baseRecord, revoked_at: "2026-10-02T00:00:00.000Z" } },
  ]) {
    const calls = mockServices(options);
    const response = await GET(request(true));
    const body = await response.json();
    assert.equal(body.accountEmail, null);
    assert.equal(calls.profile, 0);
    assert.equal(calls.probe, 0);
    assert.notEqual(body.state, "connected");
  }
});

test("a failed Gmail probe suppresses identity without changing connection health", async () => {
  const calls = mockServices({
    probe: () => ({ ok: false, status: 503, reason: "provider unavailable" }),
  });
  const response = await GET(request(true));
  const body = await response.json();
  assert.equal(body.state, "connected");
  assert.equal(body.accountEmail, null);
  assert.equal(calls.profile, 1);
  assert.equal(calls.reconnect, 0);
});

test("a Gmail 401 never returns identity, even if the profile call succeeds", async () => {
  const calls = mockServices({
    probe: () => ({ ok: false, status: 401, reason: "authorization rejected" }),
  });
  const body = await (await GET(request(true))).json();
  assert.equal(body.state, "needs_reconnect");
  assert.equal(body.accountEmail, null);
  assert.equal(calls.profile, 1);
  assert.equal(calls.reconnect, 1);
});

test("a profile failure leaves the confirmed connection state alone", async () => {
  const calls = mockServices({
    profile: () => Promise.reject(new Error("provider unavailable")),
  });
  const body = await (await GET(request(true))).json();
  assert.equal(body.state, "connected");
  assert.equal(body.accountEmail, null);
  assert.equal(calls.reconnect, 0);
});

test("a slow profile proxy is aborted while healthy Gmail stays connected", async () => {
  let aborted = false;
  const calls = mockServices({ profile: getGmailAccountEmail });
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "https://backend.composio.dev/api/v3.1/tools/execute/proxy");
    const body = JSON.parse(String(init?.body || "{}"));
    assert.equal(body.connected_account_id, "ca_expected");
    assert.equal(body.endpoint, "https://gmail.googleapis.com/gmail/v1/users/me/profile");
    const signal = init?.signal;
    assert.ok(signal instanceof AbortSignal);
    return new Promise((_, reject) => {
      // AbortSignal.timeout() does not keep Node's event loop alive. Keep this
      // mocked request pending with a ref'd watchdog so CI observes the abort.
      const watchdog = setTimeout(() => {
        signal.removeEventListener("abort", onAbort);
        reject(new Error("The Gmail profile request did not abort."));
      }, 7_000);
      const onAbort = () => {
        clearTimeout(watchdog);
        aborted = true;
        reject(signal.reason);
      };
      if (signal.aborted) {
        onAbort();
      } else {
        signal.addEventListener("abort", onAbort, { once: true });
      }
    });
  };

  const started = Date.now();
  const body = await (await GET(request(true))).json();
  assert.equal(body.state, "connected");
  assert.equal(body.accountEmail, null);
  assert.equal(calls.profile, 1);
  assert.equal(calls.reconnect, 0);
  assert.equal(aborted, true);
  assert.ok(Date.now() - started < 8_000);
});
