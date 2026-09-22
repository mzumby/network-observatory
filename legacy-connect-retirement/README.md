# Legacy Connect retirement Worker

This Worker replaces the old `network-observatory-connect` setup service with a
small retirement boundary. An exact, query-free browser `GET /` permanently
redirects to AgentMarkit's **My Agents** page. Every API path, token-shaped URL,
query-bearing root request, and non-GET request returns `410 Gone`. Other browser
paths show a static `410 Gone` page with the same single safe destination.
The redirect sets an explicit empty fragment so a browser cannot carry an
uninspectable fragment from the retired hostname onto AgentMarkit.

## Verify

```sh
npm test
```

`wrangler.toml` deliberately targets the existing Worker name and account. This
directory does not include a deployment script. Deploy only after review and
explicit production approval. Once this retirement Worker is deployed, never
roll the legacy hostname back to the former mixed setup or token-path Worker.
The AgentMarkit site and `connect.agentmarkit.com` can roll back independently;
the legacy security boundary remains retired.
