import assert from "node:assert/strict";
import test from "node:test";

import { safeAgentReturnUrl } from "../lib/agent-return-url.mjs";

test("allows only the named Gmail connection return route", () => {
  const value = "https://agentmarkit.com/agent/day/connections/gmail/";
  assert.equal(safeAgentReturnUrl(value), value);
  assert.equal(
    safeAgentReturnUrl("https://agentmarkit.com/agent/day-2/connections/gmail/"),
    "https://agentmarkit.com/agent/day-2/connections/gmail/",
  );
});

test("allows the exact legacy Gmail query route during migration", () => {
  const value = "https://agentmarkit.com/connections/gmail/?id=agent_123";
  assert.equal(safeAgentReturnUrl(value), value);
});

test("rejects alternate origins, credentials, ports, fragments, and paths", () => {
  const rejected = [
    "http://agentmarkit.com/agent/day/connections/gmail/",
    "https://agentmarkit.com.evil.test/agent/day/connections/gmail/",
    "https://user@agentmarkit.com/agent/day/connections/gmail/",
    "https://agentmarkit.com:443/agent/day/connections/gmail/",
    "https://agentmarkit.com/agent/day/connections/gmail/#done",
    "https://agentmarkit.com/agent/day/connections/gmail/?next=/manage/",
    "https://agentmarkit.com/manage/",
    "https://agentmarkit.com/agent/Day/connections/gmail/",
    "https://agentmarkit.com/agent/day/connections/gmail",
  ];
  for (const value of rejected) assert.equal(safeAgentReturnUrl(value), null, value);
});

test("legacy route accepts one validated id and no extra query data", () => {
  const rejected = [
    "https://agentmarkit.com/connections/gmail/",
    "https://agentmarkit.com/connections/gmail/?id=x",
    "https://agentmarkit.com/connections/gmail/?id=agent_123&id=agent_456",
    "https://agentmarkit.com/connections/gmail/?id=agent_123&next=/manage/",
    "https://agentmarkit.com/connections/gmail/?id=agent_123#done",
  ];
  for (const value of rejected) assert.equal(safeAgentReturnUrl(value), null, value);
});
