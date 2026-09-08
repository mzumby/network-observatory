# Connect service threat model

## Assets and boundaries

Protected assets are the Composio project API key, Google OAuth client secret,
`INVITE_ADMIN_TOKEN`, `IDENTITY_PEPPER`, tester Google tokens, one-time claim
links, browser flow tokens, private MCP bearer credentials, LinkedIn exports,
and local Trellis databases.

The public repository and public Connect page are untrusted surfaces. The
Connect worker and its D1 database are the application boundary. Composio and
Google are external processors. AgentMarkit's authenticated owner and machine
records are a separate trust boundary. Each Hermes instance is another trust
boundary.

The current AgentMarkit owner boundary is not connected to the claim exchange.
The flow is limited to the controlled Day test until that binding exists.

## Main threats and controls

| STRIDE area | Threat | Control |
| --- | --- | --- |
| Spoofing | Someone forwards a claim link before opening it | **Production blocker:** the claim proves possession, not ownership. Use it only for the controlled Day test until AgentMarkit authenticates the signed-in owner and binds that owner and agent to the callback. |
| Spoofing | Someone swaps the Google callback into another browser flow | Composio callback identity verification sends the `session_uri` to the hosted verifier. The verifier requires the same unexpired HttpOnly browser cookie and tab token that started the flow. This control works only when the Composio project setting is enabled. |
| Spoofing | Someone guesses an agent's MCP bearer | The bearer includes HMAC-derived secret material, only its hash is stored in D1, and it is sent in an Authorization header rather than a URL. |
| Tampering | A client asks Composio to send or delete email | The Observatory MCP server exposes two fixed read tools and never forwards arbitrary tool names |
| Tampering | A client injects a Gmail URL, method, or query | Server code constructs fixed `GET` endpoints and does not accept `q` or arbitrary proxy parameters |
| Repudiation | A connection cannot be tied to its grant | D1 records the connection ID, idempotent request ID, installation reference, pseudonymous Composio user ID, disclosure version, timestamps, session ID, and connected-account ID. |
| Information disclosure | Project or admin key reaches a tester or GitHub | Both keys exist only as hosted runtime secrets. The provisioning API never returns either one. |
| Information disclosure | The admin token is used to recover an agent bearer | `INVITE_ADMIN_TOKEN` is high privilege. An idempotent create with matching fields returns the exact bearer. Keep the AgentMarkit copy only in its server-side secret store and never expose the provisioning API to browser code. |
| Information disclosure | Agent bearer reaches a browser or chat | Provisioning returns it only to the authenticated server caller. AgentMarkit installs it through the machine's private secret channel and uses it only as an Authorization header. |
| Information disclosure | Gmail content leaks through a broad tool response | Gmail uses `gmail.metadata`; the server requests `format=metadata` and allowlists response fields |
| Information disclosure | Plain customer identity is retained | Owner and installation references are converted into a grant-specific HMAC identity before they are sent to Composio. |
| Denial of service | Claim guessing or MCP flooding consumes quota | Claim expiry, one-time consumption, browser-flow expiry, per-flow limits, per-token limits, payload limits, and disabled MCP batches limit abuse. |
| Elevation of privilege | Agent discovers Composio write tools or workbench | Search, workbench, and multi-execute are disabled; the tester never reaches Composio directly |

## Residual risks

- A forwarded, unused claim link lets the recipient connect a Google account to
  the named agent. Browser and callback pairing does not prove AgentMarkit
  ownership. This blocks production use.
- Anyone who receives an agent's MCP bearer can use that agent's metadata
  endpoint until the grant is revoked. Treat the bearer as a password.
- The operator's Composio project can execute allowed actions across project
  users. Protect the runtime key, use a scoped project key if practical, and
  rotate it after suspected exposure.
- The admin provisioning token can create and revoke grants and recover an
  idempotent grant's exact bearer. Store it only as a server secret.
- Composio and Google retain OAuth and execution records under their own
  policies.
- Google Testing access may expire after seven days. Reauthentication is
  expected. Reconnect revokes and cleans up the old local grant, provisions a
  fresh grant, and asks the owner to approve Google again.
- D1 records pseudonymous identifiers and session IDs. They are less sensitive
  than plain email but still require normal production access controls.
- The production dependency audit is clean. The local build and development
  toolchain still has advisories in Cloudflare, Vite, Vinext, and Drizzle
  dependencies. Do not expose the development server. Upgrade and retest that
  toolchain separately before treating the full development audit as clean.

## The dashboard write API (`serve.py --rw`)

By default `serve.py` only reads: the sole POST it accepts is `/login`, and the
screens fall back to a copy-paste sync block. `--rw` adds two write endpoints
(`/api/person`, `/api/merge`) so the screens can set priority, set a follow-up
date, add a note, or confirm an identity merge.

Boundary: this is a local tool serving a local SQLite file. The write API's job
is to make sure only the person who already holds the viewing password, in a
real browser session, on this origin, can change that file.

| Threat | Control |
|---|---|
| Open server + write API | `--rw` refuses to start without a saved password. |
| Unauthenticated writes | Every write requires the signed HttpOnly session cookie; no cookie, `401`. |
| Cross-site request forgery | `SameSite=Lax` is **not** sufficient on localhost, because ports don't factor into "site" — so writes additionally require `Content-Type: application/json` (which an HTML form cannot send cross-origin without a CORS preflight that is never granted), and an `Origin` header, when present, must match `Host`. |
| Cross-origin reads of responses | No CORS headers are ever emitted. |
| DNS rebinding | A rebound origin has a different cookie jar, so it holds no session; combined with the password requirement above, writes fail closed. |
| Resource exhaustion | Bodies cap at 16 KB; writes are rate-limited per client IP. |
| Shared link, unwanted edits | `--rw-local-only` accepts writes from loopback only, so viewers with the password can look but not change. |
| A bad write | Priority and follow-ups are plain reversible values; merges go through the journal and `unmerge` restores them. |

**Residual risk, stated plainly:** with `--rw` and without `--rw-local-only`,
the viewing password is also a writing password. Anyone you share the link and
password with can mark, snooze, and merge people in your graph. Share a
read-only link (the default) unless you specifically want otherwise.

## Revocation and recovery

An ordinary per-agent disconnect revokes the local grant first, then deletes
that grant's Composio Tool Router session and connected-account record. It does
not call Google's upstream token revocation. This prevents a disconnect for one
agent from unexpectedly stopping other agents that use the same Google account
and OAuth client.

Revoking the AgentMarkit app from the person's Google Account is a separate,
account-wide action. It may stop every agent that uses that Google account
through the same Google project and client. Do it only after an explicit
account-wide request.

Reconnect starts over. Revoke the old grant, finish its Composio cleanup,
provision a fresh grant, install the new agent bearer, and have the owner
approve Google again.

Connector revocation does not rewrite local relationship history. Confirmed
Trellis identity merges are journaled and can be undone with `trellis.py
unmerge`.
