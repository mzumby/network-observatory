import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// The handshake script is a self-contained IIFE, so it can be run directly
// against a fake tab. Composio has returned the browser here with two
// different query shapes; both must be accepted, and neither is trusted as
// identity, which is why the server re-reads the account from its own session.
async function runHandshake(search, storage = {
  agentmarkit_gmail_flow: "tab_abc",
  agentmarkit_gmail_connection_id: "acn_0123456789abcdef01234567",
}) {
  const source = await readFile(new URL("../app/api/connections/verify/route.ts", import.meta.url), "utf8");
  const script = source.match(/const script = `([\s\S]*?)`;\n/)[1];
  const redirects = [];
  const posts = [];
  const location = { search, replace: (url) => redirects.push(url) };
  const sessionStorage = { getItem: (key) => (key in storage ? storage[key] : null) };
  const fetch = async (path, init) => {
    posts.push({ path, headers: init.headers, body: JSON.parse(init.body) });
    return { json: async () => ({ redirect: "/gmail/complete" }) };
  };
  new Function("location", "sessionStorage", "fetch", script)(location, sessionStorage, fetch);
  await new Promise((resolve) => setImmediate(resolve));
  return { redirects, posts };
}

test("the newer Composio callback finishes the connection instead of failing the identity check", async () => {
  const { redirects, posts } = await runHandshake("?connected_account_id=ca_live_example&status=success");
  assert.deepEqual(redirects, ["/gmail/complete"]);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].path, "/api/connections/verify");
  assert.equal(posts[0].body.sessionUri, null);
  assert.equal(posts[0].body.callbackStatus, "success");
  assert.equal(posts[0].headers["x-agentmarkit-flow"], "tab_abc");
});

test("the older session_uri callback still completes the same way", async () => {
  const { redirects, posts } = await runHandshake("?session_uri=https%3A%2F%2Fbackend.composio.dev%2Fx");
  assert.deepEqual(redirects, ["/gmail/complete"]);
  assert.equal(posts[0].body.sessionUri, "https://backend.composio.dev/x");
});

test("a callback naming its own failure is reported, never swallowed as success", async () => {
  const { posts } = await runHandshake("?connected_account_id=ca_x&status=failed");
  assert.equal(posts[0].body.callbackStatus, "failed");
});

test("a callback carrying neither handle, or a foreign tab, is refused", async () => {
  for (const search of ["", "?status=success"]) {
    const { redirects, posts } = await runHandshake(search);
    assert.deepEqual(redirects, ["/gmail/authorize?problem=identity-check"], `search=${search}`);
    assert.equal(posts.length, 0);
  }
  const foreign = await runHandshake("?connected_account_id=ca_x&status=success", {});
  assert.deepEqual(foreign.redirects, ["/gmail/authorize?problem=identity-check"]);
  assert.equal(foreign.posts.length, 0);
});
