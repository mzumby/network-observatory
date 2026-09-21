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
  for (const session of [undefined, {}, { session_id: "" }, { session_id: "   " }]) {
    let probes = 0;
    await assert.rejects(
      checkLiveGmail(
        "api-key",
        async () => session,
        async () => {
          probes += 1;
          return { ok: true };
        },
      ),
      /invalid database session/,
    );
    assert.equal(probes, 0);
  }
});

test("an available connection must pass the real Gmail metadata probe", async () => {
  const result = await checkLiveGmail(
    "api-key",
    async () => ({ session_id: "session-live" }),
    async (apiKey, sessionId) => {
      assert.equal(apiKey, "api-key");
      assert.equal(sessionId, "session-live");
      return { ok: false, status: 403, reason: "SERVICE_DISABLED" };
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.equal(result.reason, "SERVICE_DISABLED");
});
