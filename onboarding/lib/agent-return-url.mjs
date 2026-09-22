const AGENTMARKIT_PREFIX = "https://agentmarkit.com/";
const AGENT_SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const LEGACY_AGENT_ID_RE = /^[A-Za-z0-9_-]{4,64}$/;

// Return links are an allowlist, not a general same-site redirect. The exact
// string prefix rejects userinfo, explicit ports, and alternate spellings
// before URL normalization can hide them.
export function safeAgentReturnUrl(value) {
  if (typeof value !== "string" || !value.startsWith(AGENTMARKIT_PREFIX)) {
    return null;
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (
    url.origin !== "https://agentmarkit.com" ||
    url.username ||
    url.password ||
    url.port ||
    url.hash
  ) {
    return null;
  }

  const named = url.pathname.match(/^\/agent\/([^/]+)\/connections\/gmail\/$/);
  if (named) {
    return AGENT_SLUG_RE.test(named[1]) && !url.search ? url.href : null;
  }

  if (url.pathname !== "/connections/gmail/") return null;
  const ids = url.searchParams.getAll("id");
  return url.searchParams.size === 1 &&
    ids.length === 1 &&
    LEGACY_AGENT_ID_RE.test(ids[0])
    ? url.href
    : null;
}
