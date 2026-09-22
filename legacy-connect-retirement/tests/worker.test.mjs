import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import worker from "../src/index.js";

const ORIGIN = "https://network-observatory-connect.example";
const EXPECTED_CSP = "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; connect-src 'none'; font-src 'none'; img-src 'none'; media-src 'none'; object-src 'none'; script-src 'none'; worker-src 'none'";

async function request(path = "/", init) {
  return worker.fetch(new Request(`${ORIGIN}${path}`, init));
}

function assertSecurityHeaders(response) {
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("content-security-policy"), EXPECTED_CSP);
  assert.equal(response.headers.get("x-frame-options"), "DENY");
}

test("the exact safe browser root permanently redirects to AgentMarkit", async () => {
  const response = await request("/");

  assert.equal(response.status, 308);
  assert.equal(response.headers.get("location"), "https://agentmarkit.com/manage/#");
  assertSecurityHeaders(response);
  assert.equal(await response.text(), "");
});

test("other browser routes return the retirement page with a 410", async () => {
  for (const path of ["/connect", "/anything/here?from=old-link", "/?from=old-link"]) {
    const response = await request(path);
    const body = await response.text();

    assert.equal(response.status, 410);
    assert.match(response.headers.get("content-type"), /^text\/html/);
    assertSecurityHeaders(response);
    assert.match(body, /Gmail is a connection\. Network Observatory is a tool\./);
    assert.match(body, /href="https:\/\/agentmarkit\.com\/manage\/"/);
  }
});

test("non-GET root requests never redirect", async () => {
  const response = await request("/", { method: "HEAD" });

  assert.equal(response.status, 410);
  assert.match(response.headers.get("content-type"), /^application\/json/);
  assertSecurityHeaders(response);
  assert.equal(response.headers.get("location"), null);
  assert.equal(await response.text(), "");
});

test("token-shaped legacy URLs are always gone and never redirected", async () => {
  const paths = [
    "/nobs_0123456789abcdef",
    "/old/acn_0123456789abcdef01234567",
    "/?token=secret",
    "/?connection=acn_0123456789abcdef01234567",
    "/?next=nobs_0123456789abcdef",
    "/%6eobs_0123456789abcdef",
  ];
  for (const path of paths) {
    const response = await request(path);
    assert.equal(response.status, 410, path);
    assert.match(response.headers.get("content-type"), /^application\/json/, path);
    assertSecurityHeaders(response);
    assert.equal(response.headers.get("location"), null, path);
  }
});

test("API routes and non-GET methods return 410 JSON", async () => {
  const cases = [
    ["/api", { method: "GET" }],
    ["/api/connect", { method: "GET" }],
    ["/api/mcp/old", { method: "HEAD" }],
    ["/", { method: "POST" }],
    ["/connect", { method: "DELETE" }],
    ["/anything", { method: "OPTIONS" }],
  ];

  for (const [path, init] of cases) {
    const response = await request(path, init);

    assert.equal(response.status, 410);
    assert.match(response.headers.get("content-type"), /^application\/json/);
    assertSecurityHeaders(response);

    if (init.method === "HEAD") {
      assert.equal(await response.text(), "");
    } else {
      assert.deepEqual(await response.json(), {
        error: "gone",
        message: "This legacy connection service is retired. Continue in AgentMarkit.",
      });
    }
  }
});

test("retirement page has one safe destination and no setup mechanism", async () => {
  const response = await request("/connect");
  const body = await response.text();
  const links = [...body.matchAll(/<a\s[^>]*href="([^"]+)"/gi)].map((match) => match[1]);

  assert.equal(links.length, 2);
  assert.deepEqual([...new Set(links)], ["https://agentmarkit.com/manage/"]);
  assert.match(body, /class="brand"><svg[^>]+viewBox="0 0 650 128"[^>]+aria-label="AgentMarkit"/);
  assert.ok(
    body.indexOf('<div class="actions">') < body.indexOf('<div class="grid">'),
    "the primary exit must appear before the explanatory cards",
  );
  assert.doesNotMatch(body, /<form\b|<input\b|<button\b|<script\b/i);
  assert.doesNotMatch(body, /<img\b|<link\b[^>]+stylesheet/i);
  assert.doesNotMatch(body, /http-equiv=["']refresh|window\.location|location\.href/i);
  assert.doesNotMatch(body, /bearer|hermes\s+mcp|mcp\s+add|nobs_[a-z0-9]+/i);
});

test("wrangler targets only the retired Worker and declares no bindings", async () => {
  const config = await readFile(new URL("../wrangler.toml", import.meta.url), "utf8");

  assert.match(config, /^name = "network-observatory-connect"$/m);
  assert.match(config, /^account_id = "1e8cfc7ef84fbb46a6efa51fe89822e8"$/m);
  assert.match(config, /^workers_dev = true$/m);
  assert.doesNotMatch(config, /\[\[(?:d1_databases|kv_namespaces|r2_buckets|services)\]\]|\bvars\s*=|secret/i);
});
