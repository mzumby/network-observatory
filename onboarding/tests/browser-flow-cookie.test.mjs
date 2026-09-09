import assert from "node:assert/strict";
import test from "node:test";

import {
  AGENTMARKIT_FLOW_COOKIE_PATH,
  AGENTMARKIT_FLOW_COOKIE_PREFIX,
  agentMarkitFlowCookie,
  agentMarkitFlowCookieName,
  agentMarkitFlowTokenFromCookie,
  clearAgentMarkitFlowCookie,
} from "../lib/browser-flow-cookie.mjs";

const CONNECTION_ONE = "acn_111111111111111111111111";
const CONNECTION_TWO = "acn_222222222222222222222222";

test("browser flow cookies stay separate for different agents", () => {
  const one = agentMarkitFlowCookieName(CONNECTION_ONE);
  const two = agentMarkitFlowCookieName(CONNECTION_TWO);
  const header = `${one}=flow_one; ${two}=flow_two`;

  assert.notEqual(one, two);
  assert.equal(agentMarkitFlowTokenFromCookie(header, CONNECTION_ONE), "flow_one");
  assert.equal(agentMarkitFlowTokenFromCookie(header, CONNECTION_TWO), "flow_two");
  assert.equal(agentMarkitFlowTokenFromCookie(header, "invalid"), "");
});

test("a live browser flow cookie is host-only and limited to connection APIs", () => {
  const cookie = agentMarkitFlowCookie(
    "flow_secret",
    "https://connect.agentmarkit.com/api/connections/handoff",
    CONNECTION_ONE,
    7200,
  );

  assert.match(cookie, new RegExp(`^${AGENTMARKIT_FLOW_COOKIE_PREFIX}${CONNECTION_ONE}=`));
  assert.match(cookie, new RegExp(`Path=${AGENTMARKIT_FLOW_COOKIE_PATH}`));
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Max-Age=7200/);
  assert.match(cookie, /Secure/);
  assert.doesNotMatch(cookie, /Domain=/);
});

test("clearing one browser flow does not target another agent", () => {
  const cleared = clearAgentMarkitFlowCookie(
    "https://connect.agentmarkit.com/api/connections/status",
    CONNECTION_ONE,
  );

  assert.match(cleared, new RegExp(`^${agentMarkitFlowCookieName(CONNECTION_ONE)}=`));
  assert.doesNotMatch(cleared, new RegExp(agentMarkitFlowCookieName(CONNECTION_TWO)));
  assert.match(cleared, /Max-Age=0/);
});
