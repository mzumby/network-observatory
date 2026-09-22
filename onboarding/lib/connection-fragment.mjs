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
