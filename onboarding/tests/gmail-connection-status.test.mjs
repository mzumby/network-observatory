import assert from "node:assert/strict";
import test from "node:test";

import { confirmedGmailReconnectReason } from "../lib/gmail-connection-status.mjs";

const connected = {
  authorized_at: "2026-09-21T12:00:00.000Z",
  needs_reconnect_at: null,
  connected_account_id: "ca_expected",
};

test("a confirmed active bound Gmail account stays connected", () => {
  assert.equal(
    confirmedGmailReconnectReason(connected, {
      active: true,
      connectedAccountId: "ca_expected",
    }),
    null,
  );
});

test("a confirmed inactive Gmail account requires reconnect", () => {
  assert.equal(
    confirmedGmailReconnectReason(connected, {
      active: false,
      connectedAccountId: "ca_expected",
    }),
    "inactive",
  );
});

test("a confirmed account mismatch requires reconnect", () => {
  for (const connectedAccountId of [null, "ca_other"]) {
    assert.equal(
      confirmedGmailReconnectReason(connected, {
        active: true,
        connectedAccountId,
      }),
      "account_mismatch",
    );
  }
});

test("a real Gmail 401 confirms the stored authorization is no longer usable", () => {
  assert.equal(
    confirmedGmailReconnectReason(
      connected,
      { active: true, connectedAccountId: "ca_expected" },
      { ok: false, status: 401 },
    ),
    "authorization_rejected",
  );
});

test("scope, quota, and provider failures do not change connection state", () => {
  for (const status of [null, 403, 429, 500]) {
    assert.equal(
      confirmedGmailReconnectReason(
        connected,
        { active: true, connectedAccountId: "ca_expected" },
        { ok: false, status },
      ),
      null,
    );
  }
});

test("records already disconnected or reconnecting are not changed", () => {
  assert.equal(
    confirmedGmailReconnectReason(
      { ...connected, authorized_at: null },
      { active: false, connectedAccountId: null },
    ),
    null,
  );
  assert.equal(
    confirmedGmailReconnectReason(
      { ...connected, needs_reconnect_at: "2026-09-22T00:00:00.000Z" },
      { active: false, connectedAccountId: null },
    ),
    null,
  );
});
