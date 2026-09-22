import assert from "node:assert/strict";
import test from "node:test";
import { checkLiveGmail } from "../lib/preflight-gmail.mjs";

test("a database failure rejects the preflight instead of becoming a safe skip", async () => {
  const databaseFailure = new Error("D1 unavailable");
  await assert.rejects(
    checkLiveGmail(
      "api-key",
      async () => {
        throw databaseFailure;
      },
      async () => ({ active: true, connectedAccountId: "ca_live" }),
      async () => ({ ok: true }),
    ),
    databaseFailure,
  );
});

test("only a successful empty database query skips the live Gmail call", async () => {
  let probes = 0;
  const result = await checkLiveGmail(
    "api-key",
    async () => null,
    async () => ({ active: true, connectedAccountId: "ca_live" }),
    async () => {
      probes += 1;
      return { ok: true };
    },
  );

  assert.deepEqual(result, {
    skipped: "No authorized Gmail connection to test with yet.",
  });
  assert.equal(probes, 0);
});

test("a malformed database row fails closed instead of becoming a safe skip", async () => {
  for (const session of [
    undefined,
    {},
    { session_id: "" },
    { session_id: "   " },
    { session_id: "session-live" },
    { session_id: "session-live", connected_account_id: "" },
    { session_id: "session-live", connected_account_id: "ca_" },
    { session_id: "session-live", connected_account_id: "trs_wrong" },
  ]) {
    let probes = 0;
    await assert.rejects(
      checkLiveGmail(
        "api-key",
        async () => session,
        async () => ({ active: true, connectedAccountId: "ca_live" }),
        async () => {
          probes += 1;
          return { ok: true };
        },
      ),
      /invalid database session|invalid connected account/,
    );
    assert.equal(probes, 0);
  }
});

test("an available connection must pass the real Gmail metadata probe", async () => {
  const result = await checkLiveGmail(
    "api-key",
    async () => ({
      session_id: "session-live",
      connected_account_id: "ca_live",
    }),
    async (apiKey, sessionId) => {
      assert.equal(apiKey, "api-key");
      assert.equal(sessionId, "session-live");
      return { active: true, connectedAccountId: "ca_live" };
    },
    async (apiKey, connectedAccountId) => {
      assert.equal(apiKey, "api-key");
      assert.equal(connectedAccountId, "ca_live");
      return { ok: false, status: 403, reason: "SERVICE_DISABLED" };
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.equal(result.reason, "SERVICE_DISABLED");
  assert.doesNotMatch(JSON.stringify(result), /ca_live/);
});

test("an inactive or differently pinned session fails before the direct proxy", async () => {
  for (const status of [
    { active: false, connectedAccountId: "ca_live" },
    { active: true, connectedAccountId: "ca_other" },
    { active: true, connectedAccountId: null },
  ]) {
    let probes = 0;
    await assert.rejects(
      checkLiveGmail(
        "api-key",
        async () => ({
          session_id: "session-live",
          connected_account_id: "ca_live",
        }),
        async () => status,
        async () => {
          probes += 1;
          return { ok: true };
        },
      ),
      /invalid session binding/,
    );
    assert.equal(probes, 0);
  }
});
