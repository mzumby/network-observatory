# Reset the custom Gmail integration in Composio

This guide recreates the Network Observatory Gmail integration under a new
Composio account and a new Google Cloud project. It also explains how to give
each person a private connection that they can use with their own agents.

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
| Gmail connection | One person | No | That person's authorization to their Gmail |
| Private Observatory MCP URL | One person | Only across that person's trusted agents | A bearer credential for that person's connection |

The Google account that owns the Cloud project does not have to be the Gmail
account an agent inspects. The owner account creates the OAuth app. Each user
authorizes their own mailbox later.

The relationship looks like this:

```text
one Google OAuth app
        |
one reusable Composio Gmail auth config
        |
one private Gmail connection per person
        |
one private Observatory MCP URL per person
        |
that person's Hermes or other MCP-capable agents
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

Do this before sending someone the Connect page. The Connect page cannot add
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
8. Click **Create**.
9. Copy the **Client ID** and **Client secret** into a password manager or
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
Observatory creates real user-scoped sessions and connection links itself.

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

## Part 8: Choose how to cut over from the old account

The current Worker stores Composio session IDs in Cloudflare D1. Those session
IDs belong to the old Composio project. Changing the project API key does not
migrate them.

### Recommended if anyone relies on the current connection

Use a side-by-side deployment:

1. Leave the existing Worker, D1 database, Composio key, and auth config alone.
2. Create a second Worker environment and a second D1 database for the new
   Composio project.
3. Give the new Worker its own URL and set the new Composio key and auth-config
   ID there.
4. Test your own Gmail from start to finish.
5. Move users to newly provisioned private URLs one at a time.
6. Retire the old deployment only after every active user has moved.

This requires a small Cloudflare configuration change in the repository. It is
safer than changing a live deployment in place because the old private URLs
keep working during migration.

### Faster if breaking every old private URL is acceptable

Use an in-place reset:

1. Replace the auth-config ID in
   `onboarding/wrangler.jsonc` with the new `ac_...` value.
2. Replace the Worker's `COMPOSIO_API_KEY` secret with the new project key.
3. Deploy the Worker.
4. Re-provision every user through the Connect page.

All old private MCP URLs should be treated as obsolete after this switch. The
users must create and install new ones.

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
5. Keep the existing `IDENTITY_PEPPER` and `INVITE_ADMIN_TOKEN` during an
   in-place reset. Rotating either one is a separate migration. For a completely
   new Worker environment, create new values and store them as secrets.
6. Install dependencies and run the checks:

   ```bash
   npm ci
   npm run lint
   npm run test
   ```

7. Apply the existing D1 migrations to a new database, or confirm they are
   already applied to an existing one:

   ```bash
   npm run db:migrate:cloudflare
   ```

8. Deploy:

   ```bash
   npm run deploy:cloudflare
   ```

9. Check the health endpoint:

   ```bash
   curl https://connect.agentmarkit.com/api/health
   ```

The response should include:

```json
{
  "ok": true,
  "configured": true,
  "gmailScope": "https://www.googleapis.com/auth/gmail.metadata"
}
```

For a side-by-side deployment, use the new Worker URL in the final health
check. Do not run the in-place secret replacement against the old Worker.

## Part 10: Test the whole flow yourself

Do not rely only on the Composio Playground. Test the same path a real user
will follow.

1. Confirm your Gmail address is in Google Auth platform > **Audience** >
   **Test users**.
2. Open the Network Observatory Connect page.
3. Enter the exact Gmail address you added as a test user.
4. Click **Create my connection**.
5. Copy the entire agent setup block before doing anything else.
6. Paste the block into a private Hermes chat and let Hermes run the command.
7. Return to the Connect page and approve the Google connection.
8. Start a new Hermes chat.
9. Run:

   ```bash
   hermes mcp test network-observatory-gmail
   ```

10. Ask the agent a metadata-only question, such as, “Which people have I
    exchanged email with most recently?”
11. Confirm the returned information contains addresses, dates, labels, and
    stable Gmail IDs only. It must not contain subject lines, snippets, message
    bodies, or attachments.

In Composio, use **Platform** > **Users**, **Sessions**, and **Logs** to confirm
that the test created a user-scoped session and that calls are reaching the
new project.

## Part 11: Onboard each person

### What you do first

1. Ask for the exact Gmail address they want connected.
2. Add it in Google Cloud under **Google Auth platform** > **Audience** >
   **Test users**.
3. Send them the Connect page URL in a private message.

### What the person does

1. Opens the Connect page.
2. Enters the exact Gmail address you added.
3. Clicks **Create my connection**.
4. Copies the whole setup block. It is shown once and contains a private URL.
5. Pastes that block into their agent.
6. Approves Google when the Connect page sends them to the consent flow.
7. Starts a new agent session.
8. Tests `network-observatory-gmail`.

Behind the scenes, the shared auth config is reused, but the person gets a
separate pseudonymous Composio user, session, Gmail authorization, and private
Observatory bearer URL.

## Let someone use it with all their agents

The safest simple rule is:

> One private endpoint belongs to one person. That person may install it in
> their own trusted agents. Never share it between people.

For Hermes, the setup block already contains the exact command:

```bash
hermes mcp add network-observatory-gmail --url "PRIVATE_MCP_URL"
```

They can run the same command on each Hermes agent they own. For another
MCP-capable agent, add a remote Streamable HTTP MCP server named
`network-observatory-gmail` and use the same private URL.

Treat that URL like a password. Anyone who has it can use the person's Gmail
metadata connection until the URL expires or is revoked.

If you need to revoke one agent without interrupting the person's other agents,
issue a separate private endpoint per agent. The current Connect page does not
ask for an agent name, so keep a private record of which endpoint or session
belongs to which agent. Adding agent labels is a sensible future product change.

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

That is expected while an External Google app remains in Testing. Follow the
fresh reconnect URL returned by the agent, approve Google again, and retry.
The private Observatory MCP URL stays the same.

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
- [ ] The Worker health endpoint reports `configured: true`.
- [ ] A real end-to-end user connection works.
- [ ] The agent receives metadata but no subject, snippet, body, or attachment.
- [ ] Every person receives their private endpoint privately.
- [ ] The old deployment remains available until migration is complete, or all
      users understand that their old endpoints have been replaced.

## Official references

- [Composio: authenticating tools and reusable auth configs](https://docs.composio.dev/docs/tools-direct/authenticating-tools)
- [Composio: managed versus custom authentication](https://docs.composio.dev/docs/authentication/custom-app-vs-managed-app)
- [Composio: current Platform auth-config navigation](https://docs.composio.dev/kb/guide/dashboard-auth-configs-navigation)
- [Composio: current project settings and API-key navigation](https://docs.composio.dev/kb/guide/dashboard-project-settings-navigation)
- [Google: configure the OAuth consent screen and scopes](https://developers.google.com/workspace/guides/configure-oauth-consent)
- [Google: Gmail scope definitions and verification categories](https://developers.google.com/workspace/gmail/api/auth/scopes)
- [Google: OAuth refresh-token expiration](https://developers.google.com/identity/protocols/oauth2#expiration)
