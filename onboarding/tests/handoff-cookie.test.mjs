import assert from "node:assert/strict";
import test from "node:test";

import {
  AGENTMARKIT_HANDOFF_COOKIE_PREFIX,
  AGENTMARKIT_HANDOFF_PATH,
  agentMarkitHandoffCookieName,
  agentMarkitHandoffTokenFromCookie,
  clearAgentMarkitHandoffCookie,
  trustedHandoffRequest,
} from "../lib/handoff-cookie.mjs";

const CONNECTION_ONE = "acn_111111111111111111111111";
const CONNECTION_TWO = "acn_222222222222222222222222";

test("the handoff token comes only from the named cookie", () => {
  const token = "claim_acn_example_secret";
  const otherToken = "claim_acn_other_secret";
  const header = [
    "unrelated=value",
    `${agentMarkitHandoffCookieName(CONNECTION_ONE)}=${encodeURIComponent(token)}`,
    `${agentMarkitHandoffCookieName(CONNECTION_TWO)}=${encodeURIComponent(otherToken)}`,
  ].join("; ");
  assert.equal(agentMarkitHandoffTokenFromCookie(header, CONNECTION_ONE), token);
  assert.equal(agentMarkitHandoffTokenFromCookie(header, CONNECTION_TWO), otherToken);
  assert.equal(agentMarkitHandoffTokenFromCookie("unrelated=value", CONNECTION_ONE), "");
  assert.equal(agentMarkitHandoffTokenFromCookie(header, "not-a-connection"), "");
});

test("the live handoff cookie clears across AgentMarkit subdomains", () => {
  const cookie = clearAgentMarkitHandoffCookie(
    "https://connect.agentmarkit.com/api/connections/handoff",
    CONNECTION_ONE,
  );
  assert.match(cookie, new RegExp(`^${AGENTMARKIT_HANDOFF_COOKIE_PREFIX}${CONNECTION_ONE}=`));
  assert.match(cookie, new RegExp(`Path=${AGENTMARKIT_HANDOFF_PATH}`));
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Max-Age=0/);
  assert.match(cookie, /Domain=agentmarkit\.com/);
  assert.match(cookie, /Secure/);
});

test("local handoff cleanup does not claim the AgentMarkit domain", () => {
  const cookie = clearAgentMarkitHandoffCookie(
    "http://localhost:3000/api/connections/handoff",
    CONNECTION_ONE,
  );
  assert.doesNotMatch(cookie, /Domain=/);
  assert.doesNotMatch(cookie, /Secure/);
});

test("the handoff exchange accepts only same-origin JSON", () => {
  const requestUrl = "https://connect.agentmarkit.com/api/connections/handoff";
  assert.equal(
    trustedHandoffRequest(
      requestUrl,
      "https://connect.agentmarkit.com",
      "application/json; charset=utf-8",
      "same-origin",
    ),
    true,
  );
  assert.equal(
    trustedHandoffRequest(
      requestUrl,
      "https://agentmarkit.com",
      "application/json",
      "same-site",
    ),
    false,
  );
  assert.equal(
    trustedHandoffRequest(
      requestUrl,
      "https://connect.agentmarkit.com",
      "text/plain",
      "same-origin",
    ),
    false,
  );
});
