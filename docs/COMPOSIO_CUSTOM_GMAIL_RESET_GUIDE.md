# Reset the custom Gmail integration in Composio

> **Operator-only runbook.** Customers and agents should not follow these
> account, credential, deployment, or migration steps. Their only setup entry
> point is the exact agent's **Connections > Gmail** control in AgentMarkit.

This guide recreates the Network Observatory Gmail integration under a new
Composio account and a new Google Cloud project. It also explains how
AgentMarkit gives each provisioned agent its own private connection.

The integration is deliberately narrower than a normal Gmail connection:

- Google grants only `https://www.googleapis.com/auth/gmail.metadata`.
- Network Observatory exposes only two read-only tools.
- The proxy requests `format=metadata` and removes subject, snippet, body, and
  attachment data before the agent receives a result.

The Google scope is one safety layer. The Network Observatory proxy is the
second safety layer. Keep both.

## First, understand what belongs to whom

| Thing | Owner | Reused? | What it contains |
| --- | --- | --- | --- |
| Google Cloud project | You or your company | Yes | Gmail API, consent screen, OAuth client |
| Composio Platform project | You or your company | Yes | API key, Gmail auth config, users, sessions |
| Gmail auth config | Your Composio project | Yes, for every user | Google client ID, client secret, allowed scope |
| Gmail authorization | One connection grant | No | That person's approval for the named agent and grant |
| Private Observatory gateway credential | One agent | No | Access from that agent to the person's connection |

The Google account that owns the Cloud project does not have to be the Gmail
account an agent inspects. The owner account creates the OAuth app. Each user
authorizes their own mailbox later.

The relationship looks like this:

```text
one Google OAuth app
        |
one reusable Composio Gmail auth config
        |
one private Composio identity per connection grant
        |
one private Observatory gateway credential per agent
        |
the named agent
```

Do not create one shared Gmail connection for everyone. Do not give users the
Composio API key or the Google client secret.

## What you need before starting

- The Google account that should own the new Cloud project.
- The new Composio account.
- A name for the OAuth app. For example, `Network Observatory Gmail Metadata`.
- A support email and developer contact email.
- The exact Gmail addresses of your first testers.
- Access to the Network Observatory repository and its Cloudflare Worker.

Use two browser tabs for the setup. Google needs a callback URI that Composio
shows during auth-config creation, while Composio needs credentials that Google
creates afterward.

## Part 1: Create the Google Cloud project

1. Open the [Google Cloud Console](https://console.cloud.google.com/) and sign
   in with the new owner account.
2. Click the project name in the top bar.
3. Click **New Project**.
4. Enter a clear name, such as `Network Observatory Gmail Metadata`.
5. Choose the correct organization and billing location if Google asks.
6. Click **Create**.
7. When creation finishes, use the project picker to select the new project.

Keep checking the selected project name while you work. Google often leaves a
different project selected after opening a direct settings link.

## Part 2: Enable the Gmail API

1. Open the navigation menu in Google Cloud.
2. Go to **APIs & Services** > **Library**.
3. Search for `Gmail API`.
4. Open **Gmail API**.
5. Click **Enable**.

## Part 3: Configure the Google consent screen

1. Open the navigation menu.
2. Go to **Google Auth platform** > **Branding**.
3. If the page says the Google Auth platform is not configured, click
   **Get Started**.
4. Under **App Information**, enter the app name and select the user support
   email.
5. Click **Next**.
6. Under **Audience**, choose one of these:

   - Choose **External** if people outside one Google Workspace organization
     will use it. This is the normal choice for independent agent owners.
   - Choose **Internal** only if every user is in the same Google Workspace
     organization and the project belongs to that organization.

7. Enter the developer contact email.
8. Accept Google's API Services User Data Policy if you agree.
9. Click **Continue**, then **Create**.

### Add the one allowed scope

1. In **Google Auth platform**, click **Data Access**.
2. Click **Add or remove scopes**.
3. Search for or paste this exact scope:

   ```text
   https://www.googleapis.com/auth/gmail.metadata
   ```

4. Select it and click **Update** or **Save**.
5. Check the resulting list. Remove `gmail.readonly`, `gmail.modify`,
   `mail.google.com`, or any other Gmail scope if one was added accidentally.

Google classifies `gmail.metadata` as a restricted scope. It permits message
labels and headers, but not the body. A public production app using this scope
must follow Google's restricted-scope verification requirements. If restricted
data is transmitted through or stored on a server, Google also requires the
security-assessment path. Testing is fine for a small initial group, but it is
not the final public launch state.

### Add test users

If the app is **External** and its publishing status is **Testing**:

1. In **Google Auth platform**, click **Audience**.
2. Under **Test users**, click **Add users**.
3. Enter your own Gmail address and each tester's exact Gmail address.
4. Click **Save**.

Do this before a controlled connection test. The Connect service cannot add
Google test users for you.

Google refresh tokens for an External app in Testing normally expire after
seven days when Gmail scopes are requested. Users will need to reconnect. That
seven-day behavior does not go away merely because the flow works once.

## Part 4: Start the custom auth config in Composio

1. Open the [Composio dashboard](https://dashboard.composio.dev/) in the second
   browser tab and sign in to the new account.
2. Use the product switcher to choose **Platform**, not **For You**.
3. Select the Platform project that will own this integration. A new account
   may create its first project during onboarding. Give it a clear name if the
   setup asks.
4. In the project sidebar, click **Auth Configs**.
5. Click **Create Auth Config**.
6. Search for and select **Gmail**.
7. Choose **OAuth2**.
8. Choose the option to use your own or customer-owned OAuth credentials, not
   Composio-managed authentication.
9. Find the redirect or callback URI shown by the dashboard and copy it.

Always copy the URI from the current dashboard. Do not reuse one from an old
Filament project, a screenshot, or an older guide.

Leave this Composio page open while you create the Google client.

## Part 5: Create the Google OAuth client

1. Return to the Google Cloud tab.
2. Go to **Google Auth platform** > **Clients**.
3. Click **Create Client**.
4. For **Application type**, choose **Web application**.
5. Give it a clear name, such as `Composio Network Observatory`.
6. Under **Authorized redirect URIs**, click **Add URI**.
7. Paste the exact redirect URI copied from the Composio auth-config screen.
8. Leave **Authorized JavaScript origins** empty. This OAuth client is used for
   Composio's server-side redirect, so it does not need a browser origin. If
   Composio's current dashboard explicitly asks for an origin in the future,
   follow that live instruction instead.
9. Click **Create**.
10. Copy the **Client ID** and **Client secret** into a password manager or
   secret manager. Do not put either value in the repository or this guide.

The application type must be **Web application**. Google's Gmail quickstarts
often create a Desktop client for a local sample, but Composio's hosted OAuth
callback needs a Web application client.

## Part 6: Finish the Composio auth config

1. Return to the open Composio auth-config page.
2. Paste the Google **Client ID**.
3. Paste the Google **Client secret**.
4. In the scope field, enter only:

   ```text
   https://www.googleapis.com/auth/gmail.metadata
   ```

5. If Composio expects multiple scopes as one field, keep this as the only
   value. Do not accept broader default Gmail scopes.
6. Click **Create Auth Configuration**.
7. Open the completed config and copy its ID. It begins with `ac_`.

This auth config is a reusable blueprint. Do not click **Connect Account** for
each real user. That button creates a Playground test connection. Network
Observatory creates grant-scoped sessions through its server API.

## Part 7: Create the Composio project API key

1. Confirm the correct Platform project is still selected.
2. Click **Settings**.
3. Open **Project Settings** > **API Keys**.
4. Click **Create API Key**.
5. Copy the new key directly into your secret manager.

The auth config and API key must belong to the same Composio Platform project.
Projects are isolated, so a key from the new project cannot read sessions or
auth configs from the old Filament project.

For the first end-to-end test, use a normal project API key and keep it only on
the server. Composio also supports scoped project keys, but the current service
needs at least session creation and deletion plus proxy execution. Do not
remove API-key permissions until that route set has been tested.

Do not confuse the two kinds of scope:

- The Gmail OAuth scope controls what Google permits.
- Composio API-key permissions control which Composio APIs the Worker can call.

### Enable callback identity verification

In the same Composio Platform project, follow this exact path:

**Platform > Settings > General > Configuration > enable Callback identity
verification**

Set the verification URL to:

```text
https://connect.agentmarkit.com/api/connections/verify
```

This setting applies to the whole Composio project, not just the Gmail auth
config. Every connection in that project will use the configured verifier. Use
a dedicated Platform project for Network Observatory unless the other
integrations in the project are built for the same callback.

Composio must be able to reach the verification URL over public HTTPS.
`localhost` and private network addresses will not work. For local testing,
expose the local callback through a temporary HTTPS tunnel and put the tunnel's
public `/api/connections/verify` URL in this setting. Restore the hosted URL
before the controlled Day test.

## Part 8: Choose how to cut over from the old account

The current Worker stores Composio session IDs in Cloudflare D1. Those session
IDs belong to the old Composio project. Changing the project API key does not
migrate them.

This rollout is side by side. The repository now points at a new Worker and a
new D1 database for AgentMarkit. Deploying it creates or updates that new target.
It does not upgrade, replace, or retire the old Worker and database.

Before you deploy, make a private inventory of every agent still using the old
service. Record the agent, owner, old endpoint, and whether it is still active.
Legacy agents that use `/api/mcp/[token]` cannot use that URL on the new Worker.
The new endpoint returns HTTP 410 Gone for that route. Each legacy agent needs a
new agent-bound grant, a privately installed bearer, and a new Google approval
through AgentMarkit.

### Recommended if anyone relies on the current connection

Use a side-by-side deployment:

1. Leave the existing Worker, D1 database, Composio key, and auth config alone.
2. Create a second Worker environment and a second D1 database for the new
   Composio project.
3. Give the new Worker its own URL and set the new Composio key and auth-config
   ID there.
4. Test your own Gmail from start to finish.
5. Provision new agent grants one at a time and move each agent to its new
   private bearer.
6. Check each migrated agent with a real metadata query, then mark it complete
   in the inventory.

This requires a small Cloudflare configuration change in the repository. It is
safer than changing a live deployment in place because the old private URLs
keep working during migration.

### Retire the old service separately

Do not retire anything as part of the normal deploy. Keep the old Worker, D1
database, Composio project, API key, and auth config available until the
inventory shows that every legacy agent has moved.

Retirement is a separate change with its own review and explicit approval. That
change may remove the old Worker, database, credentials, or Composio resources
only after the final migration check. A deploy of the new service must never do
that cleanup automatically.

## Part 9: Update and deploy Network Observatory

Do this from a terminal. Never paste the real key into a shell command, source
file, issue, or chat. Let Wrangler prompt for it.

1. Open the repository:

   ```bash
   cd /Users/mzvibe/Desktop/code/network-observatory/onboarding
   ```

2. In `wrangler.jsonc`, set `COMPOSIO_GMAIL_AUTH_CONFIG_ID` to the new
   `ac_...` value.
3. Store the new Composio key as a Cloudflare secret:

   ```bash
   npx wrangler secret put COMPOSIO_API_KEY
   ```

4. Paste the key only when Wrangler prompts.
5. This is a fresh Worker with a fresh D1 database, so create new random values
   for `IDENTITY_PEPPER` and `INVITE_ADMIN_TOKEN` and store them as Worker
   secrets. Put the matching admin token in AgentMarkit's server-side secret
   store. Once the D1 database has connection rows, keep the same pepper. It
   derives private owner IDs and the credentials used for bearer recovery and
   handoff reissue. Rotating it against an existing D1 database makes those
   derived values disagree with the stored grants. An intentional rotation
   therefore requires every affected agent to be re-provisioned and every owner
   to reconnect. Treat that as a separate migration, not routine secret
   rotation.
6. Install dependencies and run the checks:

   ```bash
   npm ci
   npm run lint
   npm run test
   ```

7. Confirm that `wrangler.jsonc` names the new D1 database, then apply every
   migration from `0000` through `0006` in order:

   ```bash
   npm run db:migrate:cloudflare
   ```

   A fresh D1 database has no earlier schema to build on. Do not start at `0002`.
   Wrangler records completed migrations, so the same command is safe to run
   again when you need to confirm the database is current.

8. Deploy the new Worker:

   ```bash
   npm run deploy:cloudflare
   ```

   Deploying the Worker does not run D1 migrations. Run step 7 first. This
   command also does not retire the old Worker or delete its D1 database.

9. Check the public health endpoint:

   ```bash
   curl https://connect.agentmarkit.com/api/health
   ```

The response should include:

```json
{
  "ok": true,
  "configured": true,
  "gmailPermission": {
    "declared": "https://www.googleapis.com/auth/gmail.metadata",
    "check": "Run the protected admin preflight before rollout."
  },
  "callbackVerifier": {
    "path": "/api/connections/verify",
    "check": "Confirm it is enabled in the Composio project before rollout."
  },
  "mode": "agentmarkit-browser-handoff"
}
```

This route checks only the Worker's local configuration. It does not call
Composio, inspect the live auth config, or prove that callback identity
verification is enabled. Do not use it as the launch check.

10. Load `INVITE_ADMIN_TOKEN` from AgentMarkit's server-side secret store and
    run the protected preflight:

   ```bash
   curl --fail-with-body --silent --show-error \
     -H "Authorization: Bearer ${INVITE_ADMIN_TOKEN}" \
     https://connect.agentmarkit.com/api/admin/preflight
   ```

The protected route calls Composio. Require HTTP 200, `ok: true`, and every
entry under `checks` to be `true`. It confirms that the selected auth config is
custom OAuth2 for Gmail, enabled for Tool Router, and limited to the one
`gmail.metadata` permission.

`INVITE_ADMIN_TOKEN` is a high-privilege provisioning secret. With it, a caller
can create or revoke grants. A caller can also repeat an idempotent create with
the same fields and recover the exact MCP bearer credential. Keep the
AgentMarkit copy only in AgentMarkit's server-side secret store. The Connect
Worker holds the matching runtime secret. Never put it in a browser, agent,
customer machine, repository, chat, analytics service, or command log.

Use the new Worker URL in the final health check. Do not replace secrets,
apply migrations, or deploy code against the old Worker or its D1 database.

## Part 10: Run the controlled Day test

Do not rely only on the Composio Playground. This test checks the new
connection path on Day, but it is not a production customer test. The intended
browser handoff cannot be tested until the AgentMarkit companion exists. An
operator-only harness can exercise the Network Observatory half, but it does
not test the real owner and machine check.

1. Confirm **Callback identity verification** is enabled in the Composio
   project and points to the hosted verifier URL.
2. Run the protected preflight and require HTTP 200 with every check set to
   `true`.
3. Confirm your Gmail address is in Google Auth platform > **Audience** >
   **Test users**.
4. Create a dormant connection for Day through the provisioning API.
5. Install the fixed gateway URL and returned bearer token on Day through the
   private provisioning channel. Put the token in an Authorization header, not
   the URL. Do not put it in a browser, chat, shell command, or command log.
6. Probe the installed connection and confirm it lists exactly the two approved
   Gmail metadata tools.
7. Mark the connection installed. Confirm that the response contains no
   `handoffToken` or `connectUrl`.
8. Use an operator-only test harness to call PATCH with `issueHandoff: true`,
   Day's exact `ownerRef`, and Day's exact `installationRef`. Network
   Observatory re-derives the stored owner identity and checks the installation
   before it returns `handoffToken`, `connectUrl`, and `handoffExpiresAt`.
9. Put the token in a per-connection HttpOnly, Secure, SameSite=Strict cookie
   scoped to `/api/connections/handoff` on `agentmarkit.com`. Set `Max-Age` to
   the smaller of 300 or the seconds remaining until `handoffExpiresAt`. Return
   only `connectUrl` to the browser.
10. Check that the page says **Connect Gmail to Day**, then choose **Continue to
   Google**.
11. Approve your test Gmail account and wait for the page to confirm the
   connection.
12. Ask Day a metadata-only question, such as, "Which people have I exchanged
   email with most recently?"
13. Confirm the result contains addresses, dates, labels, and stable Gmail IDs
    only. It must not contain subject lines, snippets, message bodies, or
    attachments.
14. Restart Day and repeat the question so the backfill path is tested across a
    fresh agent session.
15. Revoke Day's grant, finish the Composio cleanup, and confirm the old bearer
    no longer works.

In Composio, use **Platform** > **Users**, **Sessions**, and **Logs** to confirm
that the test created a grant-scoped session and that calls are reaching the
new project.

Network Observatory no longer puts the secret in the browser address. A copied
`connectUrl` cannot start setup without the matching handoff cookie. The cookie
can be created only after AgentMarkit authenticates the owner and checks the
exact machine and its saved `connectionId`.

The Network Observatory half is in this pull request. The AgentMarkit endpoint
that performs those owner and machine checks, sets the cookie, and returns the
non-secret address still needs a companion pull request. Keep this pull request
in draft until both halves pass an end-to-end test.

## Part 11: Customer onboarding after the companion merge

This is the intended customer flow. It is not live until the AgentMarkit
companion is merged and the checks below pass.

### What AgentMarkit does first

1. Create a dormant connection when the agent is provisioned.
2. Install its private gateway credential through the machine's secret channel.
3. Confirm the two approved tools are available.
4. Mark the connection installed and save its `connectionId` on the exact
   machine record. The install response contains no handoff.
5. When the owner chooses **Connect Gmail**, confirm that the signed-in owner
   owns that machine and that its saved `connectionId` still matches.
6. Call PATCH with `issueHandoff: true`, plus the verified `ownerRef` and
   `installationRef`. Network Observatory derives the stored private owner
   identity again and checks the exact installation. It returns not found if
   either value does not match.
7. Set `handoffToken` in this at-most-five-minute response cookie:

   ```text
   agentmarkit_gmail_handoff_<connectionId>=<handoffToken>;
   Max-Age=<smaller of 300 or seconds remaining until handoffExpiresAt>;
   Path=/api/connections/handoff; Domain=agentmarkit.com;
   HttpOnly; Secure; SameSite=Strict
   ```

8. Return only `connectUrl` to the browser. Never return the handoff token in
   JSON, HTML, a browser-readable cookie, logs, or analytics.

Network Observatory exchanges the handoff for this host-only browser cookie:

```text
agentmarkit_gmail_connection_<connectionId>=<flowToken>;
Path=/api/connections; Max-Age=7200;
HttpOnly; Secure; SameSite=Lax
```

It also gives that tab its own token. Later browser requests include the tab
token in `x-agentmarkit-flow` and the connection ID in
`x-agentmarkit-connection`. Network Observatory requires both headers and the
matching per-connection cookie. Two agents can therefore be connected in
separate tabs without one flow replacing the other.

AgentMarkit can call
`GET /api/admin/agent-connections?connectionId=acn_example` to refresh the
connection state without retrieving the MCP URL, MCP bearer, handoff token, or
Connect address. The response contains only `connectionId`, `agentName`,
`state`, `installed`, and `handoffExpiresAt`. A repeated handoff request returns
the same active, unopened handoff. If it has expired, Network Observatory issues
a new five-minute handoff. If the owner closes the Connect tab before Google
authorization starts, choosing **Connect Gmail** again replaces the abandoned
browser flow and invalidates its old tab tokens. If Google authorization already
started, revoke the connection and create a new one.

During the testing period, the operator must also add the person's exact Gmail
address under **Google Auth platform > Audience > Test users**.

### What the person does

1. Opens their agent in AgentMarkit.
2. Chooses **Connections > Gmail**.
3. Checks the short explanation of what the agent can access.
4. Chooses **Continue to Google** and approves their account.
5. Waits for the page to confirm the connection.
6. Returns to the agent and asks a simple email-recency question.

Behind the scenes, the shared auth config is reused. The person gets a
pseudonymous Composio user, and the agent gets its own revocable gateway
credential. The customer never sees that credential.

## Let someone connect more than one agent

Provision each agent separately. Each one gets its own gateway credential and
its own **Connect Gmail** button. Never copy a credential from one agent to
another.

Turning off Gmail for Day stops Day without changing another agent.
AgentMarkit keeps the credential and installation record. The customer only
sees the account approval page.

## Disconnect and reconnect

An ordinary per-agent disconnect revokes the local AgentMarkit grant first. It
then deletes that grant's Composio Tool Router session and connected-account
record. It does not revoke the upstream OAuth grant at Google. That boundary
matters when one Google account is connected to more than one agent.

Revoking the AgentMarkit app from the person's Google Account is a separate,
account-wide action. It may stop every agent using that Google account through
the same Google project and client. Use it only when the person explicitly asks
to revoke Google access for the account.

To reconnect one agent:

1. Revoke the old local grant.
2. Retry cleanup until the old Composio session and connected-account record
   are deleted.
3. Provision a fresh grant and install its new private bearer on the agent.
4. Send the signed-in owner through a new authenticated browser handoff and
   Google approval flow.

Do not reuse the old handoff, Composio session, connected account, or bearer.

## Troubleshooting

### Google says access is denied

The exact Gmail address is probably missing from **Audience** > **Test users**,
or the user signed in with a different Google account.

### Google reports `redirect_uri_mismatch`

Open the Composio auth config, copy the redirect URI it currently shows, and
compare it character for character with the Google Web application's
**Authorized redirect URIs**.

### Composio says the auth config cannot be found

The API key and auth config are probably in different Platform projects. Check
the selected project in the Composio dashboard.

### The API returns `401 Invalid API key`

Check that the Worker has the new project key. If it is a scoped Composio key,
also check that it permits session writes and proxy execution.

### It worked, then stopped about a week later

That is expected while an External Google app remains in Testing. Open the
agent's Gmail connection in AgentMarkit. AgentMarkit must revoke the old grant,
finish its Composio cleanup, create a fresh grant, install the new bearer
privately, and ask the owner to approve Google again.

### The agent sees message content

Stop onboarding users. Check both layers:

1. Google Data Access must contain only `gmail.metadata`.
2. The deployed Observatory proxy must still force `format=metadata` and strip
   subject, snippet, body, and attachments.

Do not treat a corrected consent screen as fixing existing grants. Revoke and
reconnect affected accounts so Google issues fresh authorization.

## Launch checklist

- [ ] The new Google Cloud project is selected.
- [ ] Gmail API is enabled.
- [ ] Audience is intentionally External or Internal.
- [ ] Data Access contains only `gmail.metadata` for Gmail.
- [ ] Every beta tester is on the Google test-user list.
- [ ] The Google OAuth client is a Web application.
- [ ] Its authorized redirect URI exactly matches Composio.
- [ ] The Composio key and auth config belong to the same Platform project.
- [ ] The old Worker, D1 database, Composio project, key, and auth config have
      been inventoried and left unchanged.
- [ ] `wrangler.jsonc` points at the new Worker and new D1 database.
- [ ] The fresh D1 database has migrations `0000` through `0006` applied before
      the Worker is deployed. The deploy command does not apply them.
- [ ] The new Worker uses a new `IDENTITY_PEPPER`. The value is saved for the
      lifetime of this D1 database and is not treated as a routine rotation.
- [ ] Composio callback identity verification is enabled at **Platform >
      Settings > General > Configuration**.
- [ ] The verifier is the public HTTPS URL
      `https://connect.agentmarkit.com/api/connections/verify`.
- [ ] The Worker health endpoint reports `configured: true`, with the
      understanding that this checks local settings only.
- [ ] The protected admin preflight returns HTTP 200 and every check is `true`.
- [ ] `INVITE_ADMIN_TOKEN` exists only in the Connect Worker and AgentMarkit's
      server-side secret store.
- [ ] The controlled Day connection works from approval through a live metadata
      query.
- [ ] The agent receives metadata but no subject, snippet, body, or attachment.
- [ ] Every agent has its own private gateway credential.
- [ ] No gateway credential appears in a browser, chat, analytics, or command log.
- [ ] The install PATCH returns no handoff token or Connect address.
- [ ] After the Connect click, AgentMarkit checks the signed-in owner, exact
      machine, and saved `connectionId`, then calls `issueHandoff: true` with
      the verified owner and installation references.
- [ ] Network Observatory rejects a handoff request when either verified
      reference does not match the stored grant.
- [ ] AgentMarkit sets `handoffToken` only in the per-connection HttpOnly,
      Secure, SameSite=Strict cookie scoped to `/api/connections/handoff` on
      `agentmarkit.com`. Its `Max-Age` is the smaller of 300 or the remaining
      seconds before `handoffExpiresAt`.
- [ ] The browser receives only `connectUrl`. Copying that address to a browser
      without the matching cookie fails.
- [ ] The browser flow cookie is named
      `agentmarkit_gmail_connection_<connectionId>`, is host-only, and is scoped
      to `/api/connections` with HttpOnly, Secure, SameSite=Lax, and a two-hour
      lifetime.
- [ ] Browser flow calls require the matching cookie, tab token, and
      `x-agentmarkit-connection` value.
- [ ] Two agent connection flows can remain open in separate tabs without
      replacing each other's cookies.
- [ ] If an owner closes the Connect tab before Google authorization starts,
      choosing **Connect Gmail** again replaces the abandoned flow immediately
      and the old browser tokens no longer work.
- [ ] A connection ID from another machine fails, and a consumed handoff cannot
      be used again.
- [ ] The AgentMarkit companion pull request is merged and the full Day flow is
      tested before this Network Observatory pull request leaves draft.
- [ ] Until those checks pass, nobody describes the flow as live.
- [ ] Every legacy `/api/mcp/[token]` agent has a new agent-bound grant, a newly
      installed private bearer, a new Google approval, and a successful metadata
      query on the new service.
- [ ] Retirement of the old Worker, D1 database, and Composio resources is a
      separate reviewed change with explicit approval.

## Official references

- [Composio: authenticating tools and reusable auth configs](https://docs.composio.dev/docs/tools-direct/authenticating-tools)
- [Composio: managed versus custom authentication](https://docs.composio.dev/docs/authentication/custom-app-vs-managed-app)
- [Composio: current Platform auth-config navigation](https://docs.composio.dev/kb/guide/dashboard-auth-configs-navigation)
- [Composio: current project settings and API-key navigation](https://docs.composio.dev/kb/guide/dashboard-project-settings-navigation)
- [Composio: callback identity verification](https://docs.composio.dev/reference/api-reference/connected-accounts)
- [Google: configure the OAuth consent screen and scopes](https://developers.google.com/workspace/guides/configure-oauth-consent)
- [Google: Gmail scope definitions and verification categories](https://developers.google.com/workspace/gmail/api/auth/scopes)
- [Google: OAuth refresh-token expiration](https://developers.google.com/identity/protocols/oauth2#expiration)
