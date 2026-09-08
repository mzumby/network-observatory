import { GMAIL_METADATA_SCOPE } from "@/lib/composio";
import { runtimeEnv } from "@/lib/runtime";

export const dynamic = "force-dynamic";

export async function GET() {
  const runtime = runtimeEnv();
  const configured = Boolean(
    runtime.COMPOSIO_API_KEY &&
      runtime.COMPOSIO_GMAIL_AUTH_CONFIG_ID &&
      runtime.INVITE_ADMIN_TOKEN &&
      runtime.IDENTITY_PEPPER,
  );

  return Response.json(
    {
      ok: configured,
      configured,
      gmailPermission: {
        declared: GMAIL_METADATA_SCOPE,
        check: "Run the protected admin preflight before rollout.",
      },
      callbackVerifier: {
        path: "/api/connections/verify",
        check: "Confirm it is enabled in the Composio project before rollout.",
      },
      mode: "agent-claim",
    },
    {
      headers: {
        "cache-control": "no-store",
      },
    },
  );
}
