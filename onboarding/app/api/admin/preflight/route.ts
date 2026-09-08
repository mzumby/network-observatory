import {
  GMAIL_METADATA_SCOPE,
  inspectGmailAuthConfig,
} from "@/lib/composio";
import { secretMatches } from "@/lib/crypto";
import { requireRuntimeConfig } from "@/lib/runtime";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const runtime = requireRuntimeConfig();
  const authorization = request.headers.get("authorization") || "";
  const supplied = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  if (!supplied || !(await secretMatches(supplied, runtime.INVITE_ADMIN_TOKEN))) {
    return Response.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }

  try {
    const authConfig = await inspectGmailAuthConfig(
      runtime.COMPOSIO_API_KEY,
      runtime.COMPOSIO_GMAIL_AUTH_CONFIG_ID,
    );
    return Response.json(
      {
        ok: authConfig.verified,
        authConfigId: runtime.COMPOSIO_GMAIL_AUTH_CONFIG_ID,
        expectedGmailScope: GMAIL_METADATA_SCOPE,
        requiredCallbackVerifier: `${new URL(request.url).origin}/api/connections/verify`,
        callbackVerifierCheck:
          "Confirm this exact URL is enabled under Composio Platform > Settings > General > Configuration.",
        checks: authConfig.checks,
      },
      {
        status: authConfig.verified ? 200 : 503,
        headers: { "cache-control": "no-store" },
      },
    );
  } catch {
    return Response.json(
      { ok: false, error: "Composio could not verify the Gmail permission." },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
