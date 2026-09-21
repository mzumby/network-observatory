import {
  GMAIL_METADATA_SCOPE,
  inspectGmailAuthConfig,
  probeGmailMetadata,
} from "@/lib/composio";
import { getLiveGmailSession } from "@/lib/database";
import { secretMatches } from "@/lib/crypto";
import { checkLiveGmail } from "@/lib/preflight-gmail.mjs";
import { requireRuntimeConfig } from "@/lib/runtime";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const runtime = requireRuntimeConfig();
  const authorization = request.headers.get("authorization") || "";
  const supplied = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  const releasePreflightToken = runtime.RELEASE_PREFLIGHT_TOKEN?.trim() || "";
  if (
    !releasePreflightToken ||
    !supplied ||
    !(await secretMatches(supplied, releasePreflightToken))
  ) {
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
    // Scopes and auth config say the paperwork is right. Only a real request
    // proves Google will answer: a disabled Gmail API passes every check above
    // and then refuses every call, which is exactly how this shipped broken.
    const live = await checkLiveGmail(
      runtime.COMPOSIO_API_KEY,
      getLiveGmailSession,
      probeGmailMetadata,
    );
    const ok = authConfig.verified && live.ok !== false;
    return Response.json(
      {
        ok,
        connectionApiContract: "agentmarkit-agent-bound-gmail-metadata/v1",
        authConfigId: runtime.COMPOSIO_GMAIL_AUTH_CONFIG_ID,
        expectedGmailScope: GMAIL_METADATA_SCOPE,
        requiredCallbackVerifier: `${new URL(request.url).origin}/api/connections/verify`,
        callbackVerifierCheck:
          "Confirm this exact URL is enabled under Composio Platform > Settings > General > Configuration.",
        checks: authConfig.checks,
        liveGmailCall: live,
      },
      {
        status: ok ? 200 : 503,
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
