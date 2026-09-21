# Legacy Connect retirement Worker

This Worker replaces the old `network-observatory-connect` setup service with a
small `410 Gone` page. It has no bindings, credentials, setup forms, or automatic
redirects. The only browser destination is AgentMarkit's **My Agents** page.

## Verify

```sh
npm test
```

`wrangler.toml` deliberately targets the existing Worker name and account. This
directory does not include a deployment script. Deploy only after review and
explicit production approval.
