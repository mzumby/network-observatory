import assert from "node:assert/strict";
import test from "node:test";

import {
  connectionIdFromHash,
  createBrowserConnectionFlowCoordinator,
  gmailAuthorizationRequest,
  listenForConnectionHashChange,
} from "../lib/connection-fragment.mjs";

const CONNECTION_ID = "acn_0123456789abcdef01234567";
const SECOND_CONNECTION_ID = "acn_89abcdef0123456701234567";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function flow(connectionId, suffix) {
  return { connectionId, tabToken: `tab_${suffix.repeat(48)}` };
}

function coordinator(overrides = {}) {
  return createBrowserConnectionFlowCoordinator({
    exchange: overrides.exchange || (() => Promise.reject(new Error("unexpected exchange"))),
    authorize: overrides.authorize || (() => Promise.reject(new Error("unexpected authorization"))),
    persist: overrides.persist || (() => {}),
    schedule: overrides.schedule || (() => 1),
    cancel: overrides.cancel || (() => {}),
    navigate: overrides.navigate || (() => {}),
  });
}

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

test("an out-of-order A to B switch can persist, authorize, and navigate only B", async () => {
  const exchangeA = deferred();
  const exchangeB = deferred();
  const persisted = [];
  const authorizationRequests = [];
  const navigations = [];
  const timers = [];
  const browserFlow = coordinator({
    exchange(connectionId) {
      return connectionId === CONNECTION_ID ? exchangeA.promise : exchangeB.promise;
    },
    authorize(activeFlow) {
      const request = gmailAuthorizationRequest(
        activeFlow,
        "gmail-metadata-v1",
      );
      request.url = `https://accounts.google.test/${activeFlow.connectionId}`;
      authorizationRequests.push(request);
      return request.url;
    },
    persist(activeFlow) {
      persisted.push(activeFlow);
    },
    schedule(callback) {
      timers.push(callback);
      return timers.length;
    },
    navigate(url) {
      navigations.push(url);
    },
  });

  const flowA = flow(CONNECTION_ID, "a");
  const flowB = flow(SECOND_CONNECTION_ID, "b");
  const requestA = browserFlow.begin(CONNECTION_ID);
  const activationA = requestA.activate();
  const requestB = browserFlow.begin(SECOND_CONNECTION_ID);
  const activationB = requestB.activate();

  exchangeB.resolve(flowB);
  assert.deepEqual(await activationB, flowB);
  exchangeA.resolve(flowA);
  assert.equal(await activationA, null);
  assert.deepEqual(persisted, [flowB]);

  assert.equal(await browserFlow.prepareAuthorization(flowA), null);
  const connectUrl = await browserFlow.prepareAuthorization(flowB);
  assert.equal(connectUrl, `https://accounts.google.test/${SECOND_CONNECTION_ID}`);
  assert.deepEqual(authorizationRequests, [
    {
      headers: {
        "content-type": "application/json",
        "x-agentmarkit-flow": flowB.tabToken,
        "x-agentmarkit-connection": SECOND_CONNECTION_ID,
      },
      body: JSON.stringify({
        connectionId: SECOND_CONNECTION_ID,
        accepted: true,
        disclosureVersion: "gmail-metadata-v1",
      }),
      url: `https://accounts.google.test/${SECOND_CONNECTION_ID}`,
    },
  ]);

  assert.equal(
    browserFlow.scheduleNavigation(
      flowA,
      `https://accounts.google.test/${CONNECTION_ID}`,
      120,
    ),
    false,
  );
  assert.equal(browserFlow.scheduleNavigation(flowB, connectUrl, 120), true);
  timers.forEach((callback) => callback());
  assert.deepEqual(navigations, [connectUrl]);
});

test("a same-id handoff shares only pending work and consumes a reissued cookie", async () => {
  const firstExchange = deferred();
  const persisted = [];
  let exchangeCount = 0;
  const browserFlow = coordinator({
    exchange(connectionId) {
      exchangeCount += 1;
      if (exchangeCount === 1) return firstExchange.promise;
      return flow(connectionId, "2");
    },
    persist(activeFlow) {
      persisted.push(activeFlow);
    },
  });

  const firstRequest = browserFlow.begin(CONNECTION_ID);
  const firstActivation = firstRequest.activate();
  const strictModeReplay = browserFlow.begin();
  const replayActivation = strictModeReplay.activate();
  assert.equal(exchangeCount, 1);

  firstExchange.resolve(flow(CONNECTION_ID, "1"));
  assert.equal(await firstActivation, null);
  assert.equal((await replayActivation).tabToken, `tab_${"1".repeat(48)}`);
  assert.equal(persisted.length, 1);

  const storedFlow = flow(SECOND_CONNECTION_ID, "d");
  assert.deepEqual(await browserFlow.begin("", storedFlow).activate(), storedFlow);
  assert.equal(exchangeCount, 1);

  const reissued = browserFlow.begin(CONNECTION_ID);
  assert.equal((await reissued.activate()).tabToken, `tab_${"2".repeat(48)}`);
  assert.equal(exchangeCount, 2);
  assert.equal(persisted.length, 3);
});

test("a rejected handoff is evicted so a new same-id handoff can retry", async () => {
  let exchangeCount = 0;
  const browserFlow = coordinator({
    exchange(connectionId) {
      exchangeCount += 1;
      if (exchangeCount === 1) throw new Error("expired cookie");
      return flow(connectionId, "c");
    },
  });

  await assert.rejects(
    browserFlow.begin(CONNECTION_ID).activate(),
    /expired cookie/,
  );
  const retried = await browserFlow.begin(CONNECTION_ID).activate();
  assert.equal(retried.tabToken, `tab_${"c".repeat(48)}`);
  assert.equal(exchangeCount, 2);
});

test("switching connections during the paint delay cancels and guards stale navigation", async () => {
  const scheduled = [];
  const navigations = [];
  const browserFlow = coordinator({
    exchange(connectionId) {
      return flow(connectionId, connectionId === CONNECTION_ID ? "a" : "b");
    },
    authorize(activeFlow) {
      return `https://accounts.google.test/${activeFlow.connectionId}`;
    },
    schedule(callback) {
      const timer = { callback, cancelled: false };
      scheduled.push(timer);
      return timer;
    },
    cancel(timer) {
      timer.cancelled = true;
    },
    navigate(url) {
      navigations.push(url);
    },
  });

  const activeA = await browserFlow.begin(CONNECTION_ID).activate();
  const urlA = await browserFlow.prepareAuthorization(activeA);
  assert.equal(browserFlow.scheduleNavigation(activeA, urlA, 120), true);

  const requestB = browserFlow.begin(SECOND_CONNECTION_ID);
  assert.equal(scheduled[0].cancelled, true);
  const activeB = await requestB.activate();
  const urlB = await browserFlow.prepareAuthorization(activeB);
  assert.equal(browserFlow.scheduleNavigation(activeB, urlB, 120), true);

  // Invoke even the cancelled callback to prove the connection guard is a
  // second line of defense beyond clearTimeout.
  scheduled.forEach(({ callback }) => callback());
  assert.deepEqual(navigations, [urlB]);
});
