import assert from "node:assert/strict";
import test from "node:test";

import { readBoundedJson } from "../lib/bounded-json.mjs";

test("the handoff JSON reader accepts a small object", async () => {
  const request = new Request("https://connect.agentmarkit.com/api/connections/handoff", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ connectionId: "acn_111111111111111111111111" }),
  });

  assert.deepEqual(await readBoundedJson(request), {
    connectionId: "acn_111111111111111111111111",
  });
});

test("the handoff JSON reader stops an oversized body", async () => {
  const request = new Request("https://connect.agentmarkit.com/api/connections/handoff", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ connectionId: "x".repeat(600) }),
  });

  assert.equal(await readBoundedJson(request), null);
});
