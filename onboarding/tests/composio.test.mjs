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

test("Gmail proxy rejects a malformed nested status", async () => {
  globalThis.fetch = async (_url, init) => {
    assert.ok(init?.signal instanceof AbortSignal);
    return jsonResponse({ data: {}, status: "200" });
  };

  await assert.rejects(
    getGmailMessageMetadata("test-key", "trs_test", "message-1"),
    /invalid Gmail status/,
  );
});

test("a sweep deduplicates, clamps, and skips messages deleted after listing", async () => {
  const requestedEndpoints = [];
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body || "{}"));
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

  const result = await sweepGmailMetadata("test-key", "trs_test", {
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
});
