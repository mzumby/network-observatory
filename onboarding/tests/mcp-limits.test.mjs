import assert from "node:assert/strict";
import test from "node:test";

import { mcpRequestCost } from "../lib/mcp-limits.mjs";

test("MCP rate-limit cost includes Gmail calls and a possible status probe", () => {
  assert.equal(mcpRequestCost({ method: "initialize" }), 1);
  assert.equal(
    mcpRequestCost({
      method: "tools/call",
      params: { name: "network_observatory_get_message_metadata" },
    }),
    2,
  );
  assert.equal(
    mcpRequestCost({
      method: "tools/call",
      params: { name: "network_observatory_sweep_email_metadata" },
    }),
    27,
  );
  assert.equal(
    mcpRequestCost({
      method: "tools/call",
      params: {
        name: "network_observatory_sweep_email_metadata",
        arguments: { max_results: 1 },
      },
    }),
    3,
  );
  assert.equal(
    mcpRequestCost({
      method: "tools/call",
      params: {
        name: "network_observatory_sweep_email_metadata",
        arguments: { max_results: 100 },
      },
    }),
    27,
  );
});
