import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

async function database() {
  const db = new DatabaseSync(":memory:");
  const migrations = await Promise.all([
    read("../drizzle/0000_organic_jetstream.sql"),
    read("../drizzle/0001_puzzling_the_initiative.sql"),
    read("../drizzle/0002_flimsy_wendell_vaughn.sql"),
    read("../drizzle/0003_young_wither.sql"),
    read("../drizzle/0004_shallow_black_panther.sql"),
    read("../drizzle/0005_acoustic_ulik.sql"),
    read("../drizzle/0006_chief_medusa.sql"),
  ]);
  for (const migration of migrations) {
    db.exec(migration.replaceAll("--> statement-breakpoint", ""));
  }
  return db;
}

function insertConnection(db, overrides = {}) {
  const value = {
    id: "acn_first",
    requestId: "request-first",
    userId: "user-first",
    installationRef: "installation-first",
    agentName: "Day",
    mcpTokenHash: "mcp-first",
    claimTokenHash: "claim-first",
    createdAt: "2026-09-08T12:00:00.000Z",
    claimExpiresAt: "2026-09-15T12:00:00.000Z",
    ...overrides,
  };
  db.prepare(
    `INSERT INTO agent_connections
      (id, request_id, user_id, installation_ref, agent_name,
       mcp_token_hash, claim_token_hash, created_at, claim_expires_at,
       installed_at, authorization_started_at, session_id, revoked_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    value.id,
    value.requestId,
    value.userId,
    value.installationRef,
    value.agentName,
    value.mcpTokenHash,
    value.claimTokenHash,
    value.createdAt,
    value.claimExpiresAt,
    value.installedAt || null,
    value.authorizationStartedAt || null,
    value.sessionId || null,
    value.revokedAt || null,
  );
}

test("Composio identity material is unambiguous and grant-specific", () => {
  const material = (ownerRef, installationRef, connectionId) =>
    `agentmarkit-grant:${JSON.stringify([
      ownerRef,
      installationRef,
      connectionId,
    ])}`;

  assert.notEqual(
    material("owner:team", "machine", "acn_one"),
    material("owner", "team:machine", "acn_one"),
  );
  assert.notEqual(
    material("owner", "machine", "acn_one"),
    material("owner", "machine", "acn_two"),
  );
});

test("one installation cannot have two active grants", async () => {
  const db = await database();
  insertConnection(db);

  assert.throws(
    () =>
      insertConnection(db, {
        id: "acn_second",
        requestId: "request-second",
        userId: "user-second",
        mcpTokenHash: "mcp-second",
        claimTokenHash: "claim-second",
      }),
    /UNIQUE constraint failed/,
  );

  db.prepare("UPDATE agent_connections SET revoked_at = ? WHERE id = ?").run(
    "2026-09-08T13:00:00.000Z",
    "acn_first",
  );
  assert.doesNotThrow(() =>
    insertConnection(db, {
      id: "acn_second",
      requestId: "request-second",
      userId: "user-second",
      mcpTokenHash: "mcp-second",
      claimTokenHash: "claim-second",
    }),
  );
});

test("a browser handoff is consumed once when its flow opens", async () => {
  const db = await database();
  insertConnection(db, { installedAt: "2026-09-08T12:01:00.000Z" });
  const consume = db.prepare(
    `UPDATE agent_connections
     SET claim_opened_at = ?, browser_token_hash = ?, browser_tab_token_hash = ?,
       browser_token_expires_at = ?
     WHERE claim_token_hash = ? AND claim_opened_at IS NULL
       AND claim_expires_at > ? AND installed_at IS NOT NULL
       AND revoked_at IS NULL`,
  );
  const args = [
    "2026-09-08T12:02:00.000Z",
    "browser-first",
    "tab-first",
    "2026-09-08T14:02:00.000Z",
    "claim-first",
    "2026-09-08T12:02:00.000Z",
  ];

  assert.equal(consume.run(...args).changes, 1);
  assert.equal(consume.run(...args).changes, 0);
});

test("an old authorization attempt cannot complete after lease takeover", async () => {
  const db = await database();
  insertConnection(db, {
    installedAt: "2026-09-08T12:01:00.000Z",
    authorizationStartedAt: "2026-09-08T12:02:00.000Z",
  });

  const takeover = db.prepare(
    `UPDATE agent_connections
     SET authorization_started_at = ?
     WHERE id = ? AND session_id IS NULL
       AND (authorization_started_at IS NULL OR authorization_started_at < ?)
       AND revoked_at IS NULL`,
  );
  assert.equal(
    takeover.run(
      "2026-09-08T12:08:00.000Z",
      "acn_first",
      "2026-09-08T12:03:00.000Z",
    ).changes,
    1,
  );

  const complete = db.prepare(
    `UPDATE agent_connections SET session_id = ?
     WHERE id = ? AND authorization_started_at = ?
       AND session_id IS NULL AND revoked_at IS NULL`,
  );
  assert.equal(
    complete.run("session-stale", "acn_first", "2026-09-08T12:02:00.000Z").changes,
    0,
  );
  assert.equal(
    complete.run("session-current", "acn_first", "2026-09-08T12:08:00.000Z").changes,
    1,
  );
  assert.equal(
    db.prepare("SELECT session_id FROM agent_connections WHERE id = ?")
      .get("acn_first").session_id,
    "session-current",
  );
});

test("authorization requires the same unexpired browser and tab pair", async () => {
  const db = await database();
  insertConnection(db, { installedAt: "2026-09-08T12:01:00.000Z" });
  db.prepare(
    `UPDATE agent_connections
     SET browser_token_hash = ?, browser_tab_token_hash = ?,
       browser_token_expires_at = ?
     WHERE id = ?`,
  ).run(
    "browser-current",
    "tab-current",
    "2026-09-08T14:00:00.000Z",
    "acn_first",
  );
  const reserve = db.prepare(
    `UPDATE agent_connections
     SET authorization_started_at = ?
     WHERE id = ? AND session_id IS NULL
       AND browser_token_hash = ? AND browser_tab_token_hash = ?
       AND browser_token_expires_at > ? AND installed_at IS NOT NULL
       AND revoked_at IS NULL`,
  );

  assert.equal(
    reserve.run(
      "2026-09-08T12:02:00.000Z",
      "acn_first",
      "browser-current",
      "tab-from-another-tab",
      "2026-09-08T12:02:00.000Z",
    ).changes,
    0,
  );
  assert.equal(
    reserve.run(
      "2026-09-08T12:02:00.000Z",
      "acn_first",
      "browser-current",
      "tab-current",
      "2026-09-08T12:02:00.000Z",
    ).changes,
    1,
  );
});

test("an active or started connection cannot replace its browser handoff", async () => {
  const db = await database();
  insertConnection(db, {
    installedAt: "2026-09-08T12:01:00.000Z",
    authorizationStartedAt: "2026-09-08T12:02:00.000Z",
  });
  const issue = db.prepare(
    `UPDATE agent_connections
     SET claim_token_hash = ?, claim_expires_at = ?, claim_opened_at = NULL
     WHERE id = ? AND (
         (claim_opened_at IS NULL AND claim_expires_at <= ?)
         OR (claim_opened_at IS NOT NULL AND browser_token_expires_at IS NOT NULL
           AND browser_token_expires_at <= ?)
       )
       AND installed_at IS NOT NULL AND session_id IS NULL
       AND authorization_started_at IS NULL AND authorized_at IS NULL
       AND revoked_at IS NULL`,
  );

  assert.equal(
    issue.run(
      "claim-second",
      "2026-09-08T12:07:00.000Z",
      "acn_first",
      "2026-09-08T12:02:00.000Z",
      "2026-09-08T12:02:00.000Z",
    ).changes,
    0,
  );

  db.prepare(
    "UPDATE agent_connections SET authorization_started_at = NULL WHERE id = ?",
  ).run("acn_first");
  assert.equal(
    issue.run(
      "claim-second",
      "2026-09-08T12:07:00.000Z",
      "acn_first",
      "2026-09-08T12:02:00.000Z",
      "2026-09-08T12:02:00.000Z",
    ).changes,
    0,
  );
});

test("an expired dormant handoff is issued once across retries", async () => {
  const db = await database();
  insertConnection(db, {
    installedAt: "2026-09-08T12:01:00.000Z",
    claimExpiresAt: "1970-01-01T00:00:00.000Z",
  });
  const issue = db.prepare(
    `UPDATE agent_connections
     SET claim_token_hash = ?, claim_expires_at = ?, claim_opened_at = NULL
     WHERE id = ? AND (
         (claim_opened_at IS NULL AND claim_expires_at <= ?)
         OR (claim_opened_at IS NOT NULL AND browser_token_expires_at IS NOT NULL
           AND browser_token_expires_at <= ?)
       )
       AND installed_at IS NOT NULL AND session_id IS NULL
       AND authorization_started_at IS NULL AND authorized_at IS NULL
       AND revoked_at IS NULL`,
  );
  const args = [
    "claim-issued",
    "2026-09-08T12:07:00.000Z",
    "acn_first",
    "2026-09-08T12:02:00.000Z",
    "2026-09-08T12:02:00.000Z",
  ];

  assert.equal(issue.run(...args).changes, 1);
  assert.equal(issue.run(...args).changes, 0);
  const issued = db.prepare(
    "SELECT claim_token_hash, claim_expires_at FROM agent_connections WHERE id = ?",
  ).get("acn_first");
  assert.equal(issued.claim_token_hash, "claim-issued");
  assert.equal(issued.claim_expires_at, "2026-09-08T12:07:00.000Z");
});

test("an abandoned browser handoff can restart only after its flow expires", async () => {
  const db = await database();
  insertConnection(db, { installedAt: "2026-09-08T12:01:00.000Z" });
  db.prepare(
    `UPDATE agent_connections
     SET claim_opened_at = ?, browser_token_hash = ?, browser_tab_token_hash = ?,
       browser_token_expires_at = ? WHERE id = ?`,
  ).run(
    "2026-09-08T12:02:00.000Z",
    "browser-first",
    "tab-first",
    "2026-09-08T12:05:00.000Z",
    "acn_first",
  );
  const issue = db.prepare(
    `UPDATE agent_connections
     SET claim_token_hash = ?, claim_expires_at = ?, claim_opened_at = NULL,
       browser_token_hash = NULL, browser_tab_token_hash = NULL,
       browser_token_expires_at = NULL
     WHERE id = ? AND (
         (claim_opened_at IS NULL AND claim_expires_at <= ?)
         OR (claim_opened_at IS NOT NULL AND browser_token_expires_at IS NOT NULL
           AND browser_token_expires_at <= ?)
       )
       AND installed_at IS NOT NULL AND session_id IS NULL
       AND authorization_started_at IS NULL AND authorized_at IS NULL
       AND revoked_at IS NULL`,
  );

  assert.equal(
    issue.run(
      "handoff-too-early",
      "2026-09-08T12:09:00.000Z",
      "acn_first",
      "2026-09-08T12:04:00.000Z",
      "2026-09-08T12:04:00.000Z",
    ).changes,
    0,
  );
  assert.equal(
    issue.run(
      "handoff-restarted",
      "2026-09-08T12:11:00.000Z",
      "acn_first",
      "2026-09-08T12:06:00.000Z",
      "2026-09-08T12:06:00.000Z",
    ).changes,
    1,
  );
});

test("revocation wins over a late connected status update", async () => {
  const db = await database();
  insertConnection(db, {
    installedAt: "2026-09-08T12:01:00.000Z",
    sessionId: "session-first",
    revokedAt: "2026-09-08T12:04:00.000Z",
  });
  const markConnected = db.prepare(
    `UPDATE agent_connections SET authorized_at = COALESCE(authorized_at, ?)
     WHERE id = ? AND session_id IS NOT NULL AND revoked_at IS NULL`,
  );

  assert.equal(
    markConnected.run("2026-09-08T12:05:00.000Z", "acn_first").changes,
    0,
  );
  assert.equal(
    db.prepare("SELECT authorized_at FROM agent_connections WHERE id = ?")
      .get("acn_first").authorized_at,
    null,
  );
});

test("a late connected-account handle reopens remote cleanup", async () => {
  const db = await database();
  insertConnection(db, {
    sessionId: "session-first",
    revokedAt: "2026-09-08T12:04:00.000Z",
  });
  db.prepare(
    `UPDATE agent_connections SET remote_cleanup_at = ? WHERE id = ?`,
  ).run("2026-09-08T12:05:00.000Z", "acn_first");

  db.prepare(
    `UPDATE agent_connections
     SET connected_account_id = COALESCE(connected_account_id, ?),
       remote_cleanup_at = NULL,
       remote_cleanup_error = CASE
         WHEN revoked_at IS NOT NULL THEN 'connected_account_cleanup_required'
         ELSE remote_cleanup_error
       END
     WHERE id = ?`,
  ).run("ca_late", "acn_first");

  const row = db.prepare(
    `SELECT connected_account_id, remote_cleanup_at, remote_cleanup_error
     FROM agent_connections WHERE id = ?`,
  ).get("acn_first");
  assert.equal(row.connected_account_id, "ca_late");
  assert.equal(row.remote_cleanup_at, null);
  assert.equal(row.remote_cleanup_error, "connected_account_cleanup_required");
});
