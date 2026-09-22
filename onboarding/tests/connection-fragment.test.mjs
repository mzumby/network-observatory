import assert from "node:assert/strict";
import test from "node:test";

import {
  connectionIdFromHash,
  listenForConnectionHashChange,
} from "../lib/connection-fragment.mjs";

const CONNECTION_ID = "acn_0123456789abcdef01234567";

test("the canonical connection fragment accepts one connection id only", () => {
  assert.equal(connectionIdFromHash(`#connection=${CONNECTION_ID}`), CONNECTION_ID);
  for (const hash of [
    "",
    "#connection=acn_short",
    `#connection=${CONNECTION_ID}&connection=${CONNECTION_ID}`,
    `#connection=${CONNECTION_ID}&next=%2Fmanage%2F`,
    `#other=${CONNECTION_ID}`,
  ]) {
    assert.equal(connectionIdFromHash(hash), "", hash);
  }
});

test("a same-document hash change starts the newly added connection", () => {
  let listener = null;
  const target = {
    location: { hash: "" },
    addEventListener(type, callback) {
      assert.equal(type, "hashchange");
      listener = callback;
    },
    removeEventListener(type, callback) {
      assert.equal(type, "hashchange");
      if (listener === callback) listener = null;
    },
  };
  const seen = [];
  const stop = listenForConnectionHashChange(target, (connectionId) => {
    seen.push(connectionId);
  });

  target.location.hash = `#connection=${CONNECTION_ID}`;
  listener();
  assert.deepEqual(seen, [CONNECTION_ID]);

  stop();
  assert.equal(listener, null);
});
