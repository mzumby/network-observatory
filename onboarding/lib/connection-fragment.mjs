const CONNECTION_ID_RE = /^acn_[a-f0-9]{24}$/;

export function connectionIdFromHash(hash) {
  if (typeof hash !== "string") return "";
  const fragment = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const values = fragment.getAll("connection");
  return fragment.size === 1 &&
    values.length === 1 &&
    CONNECTION_ID_RE.test(values[0])
    ? values[0]
    : "";
}

export function listenForConnectionHashChange(target, onConnection) {
  const handleHashChange = () => {
    const connectionId = connectionIdFromHash(target.location.hash);
    if (connectionId) onConnection(connectionId);
  };
  target.addEventListener("hashchange", handleHashChange);
  return () => target.removeEventListener("hashchange", handleHashChange);
}

function runWhilePending(pending, key, start) {
  const existing = pending.get(key);
  if (existing) return existing;

  let promise;
  try {
    promise = Promise.resolve(start());
  } catch (cause) {
    promise = Promise.reject(cause);
  }
  pending.set(key, promise);
  const remove = () => {
    if (pending.get(key) === promise) pending.delete(key);
  };
  promise.then(remove, remove);
  return promise;
}

function flowKey(flow) {
  return `${flow.connectionId}\u0000${flow.tabToken}`;
}

export function browserFlowHeaders(flow) {
  return {
    "x-agentmarkit-flow": flow.tabToken,
    "x-agentmarkit-connection": flow.connectionId,
  };
}

export function gmailAuthorizationRequest(flow, disclosureVersion) {
  return {
    headers: {
      "content-type": "application/json",
      ...browserFlowHeaders(flow),
    },
    body: JSON.stringify({
      connectionId: flow.connectionId,
      accepted: true,
      disclosureVersion,
    }),
  };
}

export function createBrowserConnectionFlowCoordinator({
  exchange,
  authorize,
  persist,
  schedule,
  cancel,
  navigate,
}) {
  const handoffs = new Map();
  const authorizations = new Map();
  let generation = 0;
  let activeFlow = null;
  let latestHandoff = null;
  let navigationTimer = null;
  let navigationFlowKey = "";

  function cancelNavigation(flow = null) {
    if (
      navigationTimer === null ||
      (flow && navigationFlowKey !== flowKey(flow))
    ) {
      return false;
    }
    cancel(navigationTimer);
    navigationTimer = null;
    navigationFlowKey = "";
    return true;
  }

  function invalidate() {
    generation += 1;
    activeFlow = null;
    cancelNavigation();
  }

  function begin(connectionId = "", storedFlow = null) {
    invalidate();
    const requestGeneration = generation;
    let handoff = null;
    let fallbackFlow = storedFlow;

    if (connectionId) {
      const promise = runWhilePending(handoffs, connectionId, () =>
        exchange(connectionId),
      );
      handoff = { connectionId, promise };
      latestHandoff = handoff;
      const clearLatest = () => {
        if (latestHandoff === handoff) latestHandoff = null;
      };
      promise.then(clearLatest, clearLatest);
      fallbackFlow = null;
    } else if (latestHandoff) {
      handoff = latestHandoff;
      fallbackFlow = null;
    }

    const isCurrent = () => requestGeneration === generation;
    return {
      isCurrent,
      async activate() {
        try {
          const flow = handoff ? await handoff.promise : fallbackFlow;
          if (!isCurrent()) return null;
          if (!flow) return null;
          if (handoff && flow.connectionId !== handoff.connectionId) {
            throw new Error("The Gmail handoff returned the wrong connection.");
          }
          activeFlow = flow;
          persist(flow);
          if (latestHandoff === handoff) latestHandoff = null;
          return flow;
        } catch (cause) {
          if (isCurrent() && latestHandoff === handoff) latestHandoff = null;
          throw cause;
        }
      },
    };
  }

  function isActive(flow) {
    return Boolean(activeFlow && flowKey(activeFlow) === flowKey(flow));
  }

  async function prepareAuthorization(flow) {
    if (!isActive(flow)) return null;
    const key = flowKey(flow);
    const url = await runWhilePending(authorizations, key, () => authorize(flow));
    return isActive(flow) ? url : null;
  }

  function scheduleNavigation(flow, url, delay) {
    if (!isActive(flow)) return false;
    cancelNavigation();
    const key = flowKey(flow);
    navigationFlowKey = key;
    navigationTimer = schedule(() => {
      navigationTimer = null;
      navigationFlowKey = "";
      if (activeFlow && flowKey(activeFlow) === key) navigate(url);
    }, delay);
    return true;
  }

  function navigateNow(flow, url) {
    if (!isActive(flow)) return false;
    cancelNavigation();
    navigate(url);
    return true;
  }

  return {
    begin,
    cancelNavigation,
    invalidate,
    isActive,
    navigateNow,
    prepareAuthorization,
    scheduleNavigation,
  };
}
