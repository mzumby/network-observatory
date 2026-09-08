# Gmail connections for provisioned agents

This runbook covers the AgentMarkit Gmail metadata connection and the controlled
Day test. The customer flow is not live yet. Each customer will connect their
own Google account, and each agent will get separate, revocable access.

Day is the first test case. Nothing in the connection code is specific to Day.

## Production blocker: bind the signed-in owner to the agent

The current claim URL is one-time and short-lived, but it can still be
forwarded before anyone opens it. The first person who opens it can connect a
Google account to the named agent. The browser and callback checks protect the
rest of that attempt, but they do not prove that the person owns the agent.

Use the current flow only for the controlled Day test. Do not expose it as a
customer feature or describe it as live.

Before production, AgentMarkit must authenticate the person on its own site and
bind the signed-in owner, the selected agent, and the connection claim. The
Connect callback must verify that binding before it accepts the Google account.
A signed, short-lived, one-use assertion from AgentMarkit's server is one way to
do this. It must be delivered server-to-server or tied to the signed-in
AgentMarkit session, not added to a bearer link that can be forwarded. The
assertion must name an opaque owner reference, the installation reference, and
the connection ID. A claim URL by itself is not proof of ownership.

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
Google, Worker-secret, or auth-config change and before creating a claim.

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
- `claimUrl: null`. The customer link stays unavailable until the agent-side
  installation has passed its check.
- `connectionId`, which the provisioning service uses for status and revocation.

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

The PATCH response contains the short-lived, one-time `claimUrl`. For the
controlled Day test, keep it private and do not open it before the installation
check passes. For production, do not hand this bearer link directly to a
customer. The **Connect Gmail** action must first verify the signed-in
AgentMarkit owner and create an owner-bound handoff.

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
  --url "$NETWORK_OBSERVATORY_CONNECT_URL" installed 'acn_CONNECTION_ID' \
  --secret-file "/private/operator/path/day-claim.json"

python3 onboarding/scripts/provision_agent_connection.py \
  --url "$NETWORK_OBSERVATORY_CONNECT_URL" rotate 'acn_CONNECTION_ID' \
  --secret-file "/private/operator/path/day-new-claim.json"
```

The CLI writes the full response to a new file with mode `0600` and redacts the
bearer token and claim link from terminal output. It refuses to overwrite an
existing file. AgentMarkit's provisioning service should call the API directly
and pass the bearer through its secret channel instead of using this manual
handoff.

Use `rotate` when a claim link expires or the person opens it but does not start
Google authorization. Once Google authorization has started, revoke the
connection and create a new one instead of reusing its Composio session.

## Intended customer flow

1. They open their agent in AgentMarkit and choose **Connections > Gmail**.
2. The Connect page names the agent and explains what it can access.
3. They click **Continue to Google** and choose their account.
4. The page waits for confirmation before it says Gmail is connected.
5. They return to their agent and ask a question such as "Who have I emailed
   recently?"

The customer never enters an email address, handles a gateway URL, runs a
terminal command, or pastes anything into their agent.

If someone opens `connect.agentmarkit.com` without a valid AgentMarkit claim,
the page must not offer a generic Gmail form. It sends them back to **My
agents**, where they can choose the agent first.

## Day test

Day already exists, so this first test is a controlled operator run. It is not
proof that the customer identity binding is ready.

1. Enable Composio callback identity verification with the hosted verifier URL.
2. Run the protected preflight and require an HTTP 200 result with every check
   set to `true`.
3. Create Day's dormant connection through the admin API.
4. Install the fixed `mcpUrl` and returned `mcpBearerToken` on Day through
   Agent37's private file API. Store the token in Hermes's private `.env` file
   and reference it from the MCP header. Do not put the token in a URL, shell
   command, chat, or command log.
5. Probe the endpoint and confirm that it lists exactly the two expected tools.
6. Mark the connection installed and retrieve its one-time claim URL.
7. The operator running the controlled test opens the claim URL privately in
   the browser that will finish Google authorization. Do not forward it.
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
