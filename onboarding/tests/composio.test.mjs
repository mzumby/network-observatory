import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  getGmailMessageMetadata,
  sweepGmailMetadata,
} from "../lib/composio.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function jsonResponse(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

test("Gmail proxy uses the project endpoint with an explicit connected account", async () => {
  globalThis.fetch = async (url, init) => {
    assert.equal(
      url,
      "https://backend.composio.dev/api/v3.1/tools/execute/proxy",
    );
    assert.ok(init?.signal instanceof AbortSignal);
    assert.equal(init?.method, "POST");
    const body = JSON.parse(String(init?.body || "{}"));
    assert.equal(body.connected_account_id, "ca_test");
    assert.equal(body.method, "GET");
    assert.match(body.endpoint, /users\/me\/messages\/message-1/);
    assert.deepEqual(Object.keys(body).sort(), [
      "connected_account_id",
      "endpoint",
      "method",
    ]);
    return jsonResponse({ data: {}, status: "200" });
  };

  await assert.rejects(
    getGmailMessageMetadata("test-key", "ca_test", "message-1"),
    /invalid Gmail status/,
  );
});

test("Gmail proxy rejects a missing or malformed connected account before fetch", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return jsonResponse({ data: {}, status: 200 });
  };

  for (const connectedAccountId of ["", "ca_", "trs_test", " ca_test", "ca_bad!"]) {
    await assert.rejects(
      getGmailMessageMetadata("test-key", connectedAccountId, "message-1"),
      /missing a valid connected account/,
    );
  }
  assert.equal(calls, 0);
});

test("Gmail proxy errors redact connected account IDs and email addresses", async () => {
  globalThis.fetch = async () =>
    jsonResponse({
      status: 403,
      data: {
        error: {
          errors: [{ reason: "forbidden" }],
          message: "ca_private belongs to owner@example.com",
        },
      },
    });

  await assert.rejects(
    getGmailMessageMetadata("test-key", "ca_private", "message-1"),
    (error) => {
      assert.doesNotMatch(error.message, /ca_private|owner@example\.com/);
      assert.match(error.message, /\[connected account\]|\[address\]/);
      return true;
    },
  );
});

test("a sweep deduplicates, clamps, and skips messages deleted after listing", async () => {
  const requestedEndpoints = [];
  globalThis.fetch = async (url, init) => {
    assert.equal(
      url,
      "https://backend.composio.dev/api/v3.1/tools/execute/proxy",
    );
    const body = JSON.parse(String(init?.body || "{}"));
    assert.equal(body.connected_account_id, "ca_test");
    requestedEndpoints.push(body.endpoint);
    if (body.endpoint.includes("/messages?")) {
      return jsonResponse({
        status: 200,
        data: {
          messages: [
            { id: "message-1" },
            { id: "message-1" },
            { id: "message-2" },
            { id: "message-3" },
          ],
          nextPageToken: "next-page",
          resultSizeEstimate: 999,
        },
      });
    }
    if (body.endpoint.includes("/messages/message-2?")) {
      return jsonResponse({ status: 404, data: { error: "not found" } });
    }
    return jsonResponse({
      status: 200,
      data: {
        id: "message-1",
        threadId: "thread-1",
        internalDate: "1788912000000",
        labelIds: ["INBOX"],
        payload: { headers: [{ name: "From", value: "person@example.com" }] },
      },
    });
  };

  const result = await sweepGmailMetadata("test-key", "ca_test", {
    maxResults: 2,
  });

  assert.equal(requestedEndpoints.length, 3);
  assert.deepEqual(result, {
    messages: [
      {
        id: "message-1",
        threadId: "thread-1",
        labelIds: ["INBOX"],
        internalDate: "1788912000000",
        headers: { from: "person@example.com" },
      },
    ],
    nextPageToken: "next-page",
  });
  assert.doesNotMatch(JSON.stringify(result), /ca_test/);
});
