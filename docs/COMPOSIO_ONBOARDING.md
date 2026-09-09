# Gmail connections for provisioned agents

> **Operator-only runbook.** Customers and agents should not follow these
> provisioning commands. Their only setup entry point is the exact agent's
> **Connections > Gmail** control in AgentMarkit.

This runbook covers the AgentMarkit Gmail metadata connection and the controlled
Day test. The customer flow is not live yet. Each customer will connect their
own Google account, and each agent will get separate, revocable access.

Day is the first test case. Nothing in the connection code is specific to Day.

## How AgentMarkit binds the right owner to the right agent

AgentMarkit is the source of truth for who owns an agent and which machine runs
it. Its **Connect Gmail** action must run behind AgentMarkit login and check all
three of these before it starts the browser handoff:

1. The signed-in owner.
2. The exact agent and machine selected on the page.
3. The Network Observatory `connectionId` saved for that machine.

After those checks, AgentMarkit's server asks Network Observatory to issue the
handoff:

```json
{
  "connectionId": "acn_example",
  "issueHandoff": true,
  "ownerRef": "stable-opaque-customer-id",
  "installationRef": "stable-agent-installation-id"
}
```

Network Observatory derives the private owner identity again and compares both
it and `installationRef` with the stored connection. A mismatch returns a
generic not-found response. If the connection already has an active, unopened
handoff, the API returns that same handoff instead of creating another one.
Otherwise it creates one that expires in five minutes. The authenticated server
response contains `handoffToken`, `connectUrl`, and `handoffExpiresAt`.

AgentMarkit puts the token in this per-connection cookie:

```text
agentmarkit_gmail_handoff_<connectionId>=<handoffToken>;
Max-Age=<smaller of 300 or seconds remaining until handoffExpiresAt>;
Path=/api/connections/handoff; Domain=agentmarkit.com;
HttpOnly; Secure; SameSite=Strict
```

The response to the browser contains only `connectUrl`. The token is not put in
the URL, page HTML, browser JavaScript, logs, or analytics. The cookie lasts five
minutes at most. Its domain allows `connect.agentmarkit.com` to receive it, and
its path limits browser requests carrying it to `/api/connections/handoff`.

The Connect page posts the non-secret connection ID to
`/api/connections/handoff`. Network Observatory checks the one-use handoff token,
checks that it belongs to that connection, consumes it, and clears the parent-
domain cookie. It then creates this host-only browser-flow cookie on
`connect.agentmarkit.com`:

```text
agentmarkit_gmail_connection_<connectionId>=<flowToken>;
Path=/api/connections; Max-Age=7200;
HttpOnly; Secure; SameSite=Lax
```

Network Observatory also returns a separate tab token. The page keeps the tab
token and connection ID in `sessionStorage`. Every later browser request sends
the tab token as `x-agentmarkit-flow` and the connection ID as
`x-agentmarkit-connection`; Network Observatory also requires the matching
per-connection cookie. This lets two agents run setup in separate tabs without
overwriting each other's cookies.

The Network Observatory half of this handoff is implemented in this pull
request. The AgentMarkit half still needs a companion pull request and has not
been merged or tested end to end. Keep the Network Observatory pull request in
draft. Do not deploy or describe the customer flow as live yet.

## What is shared and what stays separate

The operator manages one Google OAuth app and one Composio auth config. The
Google app requests only:

`https://www.googleapis.com/auth/gmail.metadata`

Composio creates a separate private identity for every connection grant.
Network Observatory gives each agent its own gateway credential. Google tokens
and the Composio API key never go onto the agent.

One person can connect more than one agent. They approve Google separately for
each one. A replacement grant also gets a new identity and a new Google
approval, even for the same machine. This prevents an agent from silently
reusing an old or different Gmail account. Access can be removed from one agent
without changing the others.

## Runtime configuration

The hosted `onboarding/` service needs:

- `COMPOSIO_API_KEY`: the server-side key for the Composio project.
- `COMPOSIO_GMAIL_AUTH_CONFIG_ID`: the custom Gmail auth config ID.
- `INVITE_ADMIN_TOKEN`: a random operator secret used by the provisioning API.
- `IDENTITY_PEPPER`: a different random secret used to create private customer
  identifiers and rate-limit keys.

Do not commit these values. The D1 database stores private agent-scoped
identifiers, token hashes, Composio session IDs, connection status, and
timestamps. It does not store plain email addresses, Google tokens, or raw
gateway credentials.

Treat `IDENTITY_PEPPER` as part of the D1 database's identity. Generate it once
for a fresh database, then preserve it. The service uses it to derive private
owner IDs and the credentials used for bearer recovery and handoff reissue. If
you rotate it while keeping existing rows, those derived values no longer match
the stored grants. An intentional rotation requires every affected agent to be
re-provisioned and every owner to reconnect. Plan that as a separate migration.

`INVITE_ADMIN_TOKEN` is a high-privilege provisioning credential. A caller with
this token can create and revoke grants. It can also repeat an idempotent create
request with the same fields and recover the exact MCP bearer credential. Keep
the AgentMarkit copy only in AgentMarkit's server-side secret store. The Connect
Worker holds the matching runtime secret. Never send it to a browser, agent,
customer machine, chat, analytics service, or command log.

## Set up Google and Composio once

In Google Cloud:

1. Enable the Gmail API.
2. Set the OAuth app to External.
3. Request only `gmail.metadata`.
4. Add each test Gmail account under **Google Auth platform > Audience > Test
   users** while the app remains in Testing.
5. Add the callback URL shown by the custom Composio auth config under
   **Authorized redirect URIs**.
6. Leave **Authorized JavaScript origins** empty because Composio handles this
   OAuth redirect on its server. If Composio's current dashboard explicitly
   asks for an origin later, follow that live instruction.

In Composio:

1. Keep the custom Gmail auth config and API key in the same project.
2. Use the Google client ID and secret from the Google Cloud project above.
3. Confirm that the auth config requests only `gmail.metadata`.
4. Go to **Platform > Settings > General > Configuration** and enable
   **Callback identity verification**.
5. Set the verification URL to:

   ```text
   https://connect.agentmarkit.com/api/connections/verify
   ```

This is a project-wide Composio setting, not a Gmail auth-config setting. It
affects every connection created in that Platform project. Use a dedicated
project for this integration unless every other connection in the project is
prepared to use the same callback verifier.

Composio must reach the verifier over public HTTPS. A localhost URL will not
work. For local testing, expose the local verifier through a temporary HTTPS
tunnel and put that tunnel URL in the Composio setting. Change it back before a
controlled hosted test.

Google test authorizations may expire after seven days.

For a full account reset, see
[`COMPOSIO_CUSTOM_GMAIL_RESET_GUIDE.md`](./COMPOSIO_CUSTOM_GMAIL_RESET_GUIDE.md).

## Deploy the new service beside the old one

This rollout uses a new Worker, a new D1 database, and a new Composio project.
It does not upgrade the old service in place. Before deploying, make a private
inventory of every agent that still uses the old Worker.

A fresh D1 database needs all migrations from `0000` through `0006`. The deploy
command does not apply them. Confirm that `wrangler.jsonc` points at the new D1
database, then run the migration command before the deploy command:

```bash
cd onboarding
npm run db:migrate:cloudflare
npm run deploy:cloudflare
```

The new Worker returns HTTP 410 Gone for the legacy `/api/mcp/[token]` and
`/api/provision` routes. Move each legacy agent separately: create its
agent-bound grant, install the new bearer through the private machine channel,
have the owner reconnect Google, and verify a real metadata query.

Keep the old Worker, D1 database, Composio project, key, and auth config intact
until every legacy agent has passed that check. Retiring them is a separate,
reviewed change that needs explicit approval. A normal deploy must never retire
or delete the old service.

## Run the protected preflight

The public health route checks only that the Worker has its four local settings.
It does not call Composio or confirm the live auth config. A green health result
is not permission proof.

Load `INVITE_ADMIN_TOKEN` from the server-side secret store, then run:

```bash
curl --fail-with-body --silent --show-error \
  -H "Authorization: Bearer ${INVITE_ADMIN_TOKEN}" \
  https://connect.agentmarkit.com/api/admin/preflight
```

The protected preflight calls Composio and checks that the auth config exists,
uses custom OAuth2 credentials for Gmail, is enabled for Tool Router, and has
exactly the `gmail.metadata` Gmail permission. Run it after any Composio,
Google, Worker-secret, or auth-config change and before creating a handoff.

## Add the connection when an agent is provisioned

The provisioning service calls `POST /api/admin/agent-connections` with its
server token. It supplies:

```json
{
  "requestId": "provisioning-request-123",
  "ownerRef": "stable-opaque-customer-id",
  "installationRef": "stable-agent-installation-id",
  "agentName": "Day",
  "returnUrl": "https://agentmarkit.com/agent/?id=agent-id"
}
```

The first response contains:

- `mcpUrl`, the fixed Network Observatory server address.
- `mcpBearerToken`, the private credential installed on the named agent through
  the provisioning service. It must never be sent to the browser, Discord,
  logs, or analytics.
- `connectionId`, which the provisioning service uses for status and revocation.

The create response does not contain `handoffToken` or `connectUrl`. Installing
the connection does not issue them either. Network Observatory returns them
only for a later `issueHandoff` request with the verified owner and installation
references.

Creation is idempotent by `requestId`. If a later request uses the same ID and
all four identity fields still match, the API returns the same connection and
the exact same MCP bearer credential. If any field differs, it returns a
conflict. This recovery behavior is why the admin token needs server-secret
handling.

Install the connection as `network-observatory-gmail`. Put `mcpUrl` in the URL
field and send `mcpBearerToken` in the `Authorization: Bearer ...` header. The
token must not appear in the URL. On Hermes, store the token in the private
`.env` file and reference it from the config:

```yaml
mcp_servers:
  network-observatory-gmail:
    url: "https://connect.agentmarkit.com/api/mcp"
    headers:
      Authorization: "Bearer ${MCP_NETWORK_OBSERVATORY_GMAIL_API_KEY}"
    enabled: true
    tools:
      include:
        - network_observatory_sweep_email_metadata
        - network_observatory_get_message_metadata
```

The agent should include only these tools:

- `network_observatory_sweep_email_metadata`
- `network_observatory_get_message_metadata`

The endpoint is dormant at this point. It can initialize and list its two tools,
but a tool call says Gmail has not been connected yet.

After the agent-side probe passes, call `PATCH /api/admin/agent-connections`:

```json
{
  "connectionId": "acn_example",
  "installed": true
}
```

This install PATCH returns no handoff token. It only records that the agent-side
check passed. AgentMarkit does not request a handoff until the authenticated
owner later chooses **Connect Gmail** for this exact machine.

AgentMarkit can check a connection without retrieving either secret:

```bash
curl --fail-with-body --silent --show-error \
  -H "Authorization: Bearer ${INVITE_ADMIN_TOKEN}" \
  "https://connect.agentmarkit.com/api/admin/agent-connections?connectionId=acn_example"
```

The GET response contains only `connectionId`, `agentName`, `state`,
`installed`, and `handoffExpiresAt`. It does not include `mcpUrl`,
`mcpBearerToken`, `handoffToken`, or `connectUrl`.

After the owner and machine check, AgentMarkit calls PATCH again with
`issueHandoff: true`, plus the same `ownerRef` and `installationRef` used to
create the connection. Network Observatory checks those values against the
stored grant before returning the server-only handoff response shown above.

The operator CLI exposes the same actions:

```bash
python3 onboarding/scripts/provision_agent_connection.py \
  --url "$NETWORK_OBSERVATORY_CONNECT_URL" create \
  --request-id "provisioning-request-123" \
  --owner-ref "stable-opaque-customer-id" \
  --installation-ref "stable-agent-installation-id" \
  --agent-name "Day" \
  --secret-file "/private/operator/path/day-mcp.json"

python3 onboarding/scripts/provision_agent_connection.py \
  --url "$NETWORK_OBSERVATORY_CONNECT_URL" installed 'acn_CONNECTION_ID'

python3 onboarding/scripts/provision_agent_connection.py \
  --url "$NETWORK_OBSERVATORY_CONNECT_URL" handoff 'acn_CONNECTION_ID' \
  --owner-ref "stable-opaque-customer-id" \
  --installation-ref "stable-agent-installation-id" \
  --secret-file "/private/operator/path/day-handoff.json"
```

The `create` and `handoff` commands write their secret responses to new files
with mode `0600`. They redact the MCP bearer and handoff token from terminal
output and refuse to overwrite an existing file. `installed` returns only safe
status and needs no secret file. AgentMarkit's provisioning service should call
the API directly instead of using this operator helper.

The server sets the handoff lifetime. There is no duration option. An active,
unopened handoff is reused. An expired one is replaced the next time the
authenticated AgentMarkit action requests a handoff. If the owner closes the
Connect tab before Google authorization starts, choosing **Connect Gmail** again
replaces the abandoned browser flow and invalidates its old tab tokens. Once
Google authorization has started, revoke the connection and create a new one
instead of reusing its Composio session.

## Intended customer flow

1. They open their agent in AgentMarkit and choose **Connections > Gmail**.
2. The Connect page names the agent and explains what it can access.
3. They click **Continue to Google** and choose their account.
4. The page waits for confirmation before it says Gmail is connected.
5. They return to their agent and ask a question such as "Who have I emailed
   recently?"

The customer never enters an email address, handles a gateway URL, runs a
terminal command, or pastes anything into their agent.

If someone opens `connect.agentmarkit.com` without a valid AgentMarkit handoff,
the page must not offer a generic Gmail form. It sends them back to **My
agents**, where they can choose the agent first.

## Day test

Day already exists, so this first test is a controlled operator run. The
intended browser flow cannot be tested until the AgentMarkit companion exists.
An operator-only harness can exercise the Network Observatory half, but that is
not proof that the owner and machine binding works.

1. Enable Composio callback identity verification with the hosted verifier URL.
2. Run the protected preflight and require an HTTP 200 result with every check
   set to `true`.
3. Create Day's dormant connection through the admin API.
4. Install the fixed `mcpUrl` and returned `mcpBearerToken` on Day through
   Agent37's private file API. Store the token in Hermes's private `.env` file
   and reference it from the MCP header. Do not put the token in a URL, shell
   command, chat, or command log.
5. Probe the endpoint and confirm that it lists exactly the two expected tools.
6. Mark the connection installed. Confirm that this response contains no
   `handoffToken` or `connectUrl`.
7. For a Network-only test, have the operator harness request a handoff with
   Day's exact `ownerRef` and `installationRef`. Put the returned token in the
   per-connection cookie with `Max-Age` capped at the seconds remaining until
   `handoffExpiresAt`, then open `connectUrl`. Do not put the token in a URL or
   browser script.
8. Confirm the page names Day, then authorize the approved test Gmail account.
9. Ask, "Who have I emailed recently?" Confirm that Day receives sender,
   recipient, date, and label details. Confirm that no subject, message text,
   preview, or attachment appears.
10. Restart Day and repeat the query.
11. Revoke the connection, complete remote cleanup, and confirm the old bearer
    no longer works.

## Review and revoke

List both legacy and agent-bound connections:

```bash
python3 onboarding/scripts/manage_access.py \
  --url "$NETWORK_OBSERVATORY_CONNECT_URL" list
```

Revoke one agent-bound connection:

```bash
python3 onboarding/scripts/provision_agent_connection.py \
  --url "$NETWORK_OBSERVATORY_CONNECT_URL" revoke 'acn_CONNECTION_ID'
```

An ordinary per-agent disconnect first revokes the local grant. It then deletes
that grant's Composio Tool Router session and connected-account record. It does
not ask Google to revoke the upstream OAuth grant. This keeps a disconnect for
Day from unexpectedly breaking another agent that uses the same Google account
and OAuth client.

If Composio cleanup fails, the API returns `202` with `remoteCleanup:
"pending"`. Retry the same revoke call until it returns `remoteCleanup:
"complete"`.

Revoking the AgentMarkit app from the person's Google Account is a separate,
account-wide action. It may stop every agent using that Google account through
the same Google project and client. Offer that action only when the person
explicitly asks to revoke the Google account authorization, not for an ordinary
per-agent disconnect.

Reconnect is a replacement, not a repair of the old grant:

1. Revoke the old local grant so its bearer stops working.
2. Finish deletion of its Composio session and connected-account record.
3. Provision a fresh agent grant and install its new private bearer.
4. Have the owner approve Google again through a newly authenticated
   AgentMarkit flow.

Notes the agent already saved are separate from the Gmail connection. They must
also be removed from the agent workspace if the customer asks for deletion.

## Data returned to the agent

The gateway can return Gmail message IDs, thread IDs, labels, internal dates,
and the From, To, Cc, Bcc, and Date headers. It cannot return subjects,
previews, message bodies, or attachments. It cannot send, draft, delete, label,
or change email.
