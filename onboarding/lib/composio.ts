import { sanitizeGmailMessage } from "./gmail-metadata.mjs";

const COMPOSIO_API = "https://backend.composio.dev/api/v3.1";
const COMPOSIO_TIMEOUT_MS = 20_000;

interface SessionResponse {
  session_id: string;
  mcp: {
    type: "http";
    url: string;
    headers?: Record<string, string>;
  };
}

interface LinkResponse {
  redirect_url: string;
}

interface ProxyResponse {
  data: unknown;
  status: number;
}

export class GmailProxyError extends Error {
  public readonly status: number;

  constructor(status: number) {
    super(`Gmail returned ${status}.`);
    this.name = "GmailProxyError";
    this.status = status;
  }
}

interface ToolkitStatusResponse {
  items?: Array<{
    slug?: string;
    connected_account?: {
      id?: string;
      status?: string;
    } | null;
  }>;
}

interface CompleteAuthResponse {
  connected_account_id: string;
  toolkit_slug: string;
}

interface ConnectedAccountsResponse {
  items?: Array<{
    id?: string;
    user_id?: string;
    status?: string;
    toolkit?: { slug?: string };
    auth_config?: { id?: string };
  }>;
}

interface SessionConfigResponse {
  session_id: string;
  config?: {
    connected_accounts?: Record<string, Array<string | null>> | null;
  };
}

interface AuthConfigResponse {
  id?: string;
  type?: string;
  toolkit?: { slug?: string };
  auth_scheme?: string | null;
  is_composio_managed?: boolean | null;
  status?: string;
  credentials?: Record<string, unknown> | null;
  scopes?: unknown;
  is_enabled_for_tool_router?: boolean;
}

export const GMAIL_METADATA_SCOPE =
  "https://www.googleapis.com/auth/gmail.metadata";

export type GmailAuthConfigCheck = {
  verified: boolean;
  checks: {
    exists: boolean;
    custom: boolean;
    gmail: boolean;
    oauth2: boolean;
    enabled: boolean;
    metadataOnly: boolean;
  };
};

async function composioRequest<T>(
  apiKey: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${COMPOSIO_API}${path}`, {
    ...init,
    signal: init.signal || AbortSignal.timeout(COMPOSIO_TIMEOUT_MS),
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      ...init.headers,
    },
  });

  const data = (await response.json().catch(() => null)) as
    | (T & { message?: string; error?: string | { message?: string } })
    | null;
  if (!response.ok || !data) {
    const nestedError =
      data?.error && typeof data.error === "object" ? data.error.message : null;
    const detail =
      data?.message ||
      nestedError ||
      (typeof data?.error === "string" ? data.error : null) ||
      `Composio returned ${response.status}`;
    throw new Error(detail);
  }
  return data;
}

export async function createGmailLink(
  apiKey: string,
  sessionId: string,
  callbackUrl: string,
) {
  const link = await composioRequest<LinkResponse>(
    apiKey,
    `/tool_router/session/${encodeURIComponent(sessionId)}/link`,
    {
      method: "POST",
      body: JSON.stringify({
        toolkit: "gmail",
        callback_url: callbackUrl,
      }),
    },
  );
  return link.redirect_url;
}

export async function createGmailSession(
  apiKey: string,
  authConfigId: string,
  userId: string,
  callbackUrl: string,
) {
  const session = await composioRequest<SessionResponse>(
    apiKey,
    "/tool_router/session",
    {
      method: "POST",
      body: JSON.stringify({
        user_id: userId,
        toolkits: { enable: ["gmail"] },
        auth_configs: { gmail: authConfigId },
        tools: {
          gmail: {
            enable: [
              "GMAIL_FETCH_EMAILS",
              "GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID",
            ],
          },
        },
        manage_connections: {
          enable: true,
          callback_url: callbackUrl,
          enable_wait_for_connections: false,
          enable_connection_removal: true,
        },
        workbench: { enable: false, enable_proxy_execution: true },
        multi_account: { enable: false },
        preload: {
          tools: [
            "GMAIL_FETCH_EMAILS",
            "GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID",
          ],
        },
        search: { enable: false },
        execute: { enable_multi_execute: false },
      }),
    },
  );

  return session.session_id;
}

export async function completeGmailAuth(
  apiKey: string,
  sessionUri: string,
  userId: string,
) {
  return composioRequest<CompleteAuthResponse>(
    apiKey,
    "/connected_accounts/complete_auth",
    {
      method: "POST",
      body: JSON.stringify({ session_uri: sessionUri, user_id: userId }),
    },
  );
}

export async function pinGmailConnectedAccount(
  apiKey: string,
  sessionId: string,
  connectedAccountId: string,
) {
  const session = await composioRequest<SessionConfigResponse>(
    apiKey,
    `/tool_router/session/${encodeURIComponent(sessionId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        connected_accounts: { gmail: [connectedAccountId] },
      }),
    },
  );
  const pinned = session.config?.connected_accounts?.gmail;
  if (
    session.session_id !== sessionId ||
    !Array.isArray(pinned) ||
    pinned.length !== 1 ||
    pinned[0] !== connectedAccountId
  ) {
    throw new Error("Composio did not pin the verified Gmail account.");
  }
}

function scopeList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  if (typeof value === "string") {
    return value.split(/[\s,]+/).filter(Boolean);
  }
  return [];
}

export async function inspectGmailAuthConfig(
  apiKey: string,
  authConfigId: string,
): Promise<GmailAuthConfigCheck> {
  const config = await composioRequest<AuthConfigResponse>(
    apiKey,
    `/auth_configs/${encodeURIComponent(authConfigId)}`,
  );
  const credentials = config.credentials || {};
  const scopes = [
    ...scopeList(config.scopes),
    ...scopeList(credentials.scopes),
    ...scopeList(credentials.scope),
  ];
  const mailboxScopes = [...new Set(scopes)].filter(
    (scope) =>
      scope.includes("googleapis.com/auth/gmail.") ||
      scope.replace(/\/+$/, "") === "https://mail.google.com",
  );
  const checks = {
    exists: config.id === authConfigId,
    custom:
      config.type?.toLowerCase() === "custom" &&
      config.is_composio_managed === false,
    gmail: config.toolkit?.slug?.toLowerCase() === "gmail",
    oauth2: config.auth_scheme?.toUpperCase() === "OAUTH2",
    enabled:
      config.status?.toUpperCase() === "ENABLED" &&
      config.is_enabled_for_tool_router !== false,
    metadataOnly:
      mailboxScopes.length === 1 && mailboxScopes[0] === GMAIL_METADATA_SCOPE,
  };
  return {
    verified: Object.values(checks).every(Boolean),
    checks,
  };
}

export async function deleteSession(apiKey: string, sessionId: string) {
  const response = await fetch(
    `${COMPOSIO_API}/tool_router/session/${encodeURIComponent(sessionId)}`,
    {
      method: "DELETE",
      headers: { "x-api-key": apiKey },
      signal: AbortSignal.timeout(COMPOSIO_TIMEOUT_MS),
    },
  );
  return response.ok || response.status === 404;
}

export async function getGmailConnectionStatus(apiKey: string, sessionId: string) {
  const toolkits = await composioRequest<ToolkitStatusResponse>(
    apiKey,
    `/tool_router/session/${encodeURIComponent(sessionId)}/toolkits`,
  );
  const gmail = toolkits.items?.find(
    (item) => item.slug?.toLowerCase() === "gmail",
  );
  return {
    active: gmail?.connected_account?.status?.toUpperCase() === "ACTIVE",
    connectedAccountId: gmail?.connected_account?.id || null,
  };
}

export async function findGmailConnectedAccount(
  apiKey: string,
  userId: string,
  authConfigId: string,
) {
  const query = new URLSearchParams({ limit: "10" });
  query.append("toolkit_slugs", "gmail");
  query.append("user_ids", userId);
  query.append("auth_config_ids", authConfigId);
  const result = await composioRequest<ConnectedAccountsResponse>(
    apiKey,
    `/connected_accounts?${query.toString()}`,
  );
  const accounts = (result.items || []).filter(
    (item) =>
      item.id?.startsWith("ca_") &&
      item.user_id === userId &&
      item.toolkit?.slug?.toLowerCase() === "gmail" &&
      item.auth_config?.id === authConfigId,
  );
  const active = accounts.find(
    (item) => item.status?.toUpperCase() === "ACTIVE",
  );
  return active?.id || accounts[0]?.id || null;
}

export async function deleteConnectedAccount(
  apiKey: string,
  connectedAccountId: string,
) {
  const response = await fetch(
    `${COMPOSIO_API}/connected_accounts/${encodeURIComponent(connectedAccountId)}`,
    {
      method: "DELETE",
      headers: { "x-api-key": apiKey },
      signal: AbortSignal.timeout(COMPOSIO_TIMEOUT_MS),
    },
  );
  return response.ok || response.status === 404;
}

async function gmailProxy(
  apiKey: string,
  sessionId: string,
  endpoint: string,
) {
  const response = await composioRequest<ProxyResponse>(
    apiKey,
    `/tool_router/session/${encodeURIComponent(sessionId)}/proxy_execute`,
    {
      method: "POST",
      body: JSON.stringify({
        toolkit_slug: "gmail",
        endpoint,
        method: "GET",
      }),
    },
  );
  if (
    typeof response.status !== "number" ||
    !Number.isInteger(response.status) ||
    response.status < 100 ||
    response.status > 599
  ) {
    throw new Error("Composio returned an invalid Gmail status.");
  }
  if (response.status < 200 || response.status >= 300) {
    throw new GmailProxyError(response.status);
  }
  return response.data;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

export async function getGmailMessageMetadata(
  apiKey: string,
  sessionId: string,
  messageId: string,
) {
  const query = new URLSearchParams({ format: "metadata" });
  for (const header of ["From", "To", "Cc", "Bcc", "Date"]) {
    query.append("metadataHeaders", header);
  }
  const endpoint =
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/` +
    `${encodeURIComponent(messageId)}?${query.toString()}`;
  return sanitizeGmailMessage(await gmailProxy(apiKey, sessionId, endpoint));
}

export async function sweepGmailMetadata(
  apiKey: string,
  sessionId: string,
  options: {
    maxResults: number;
    pageToken?: string;
    labelIds?: string[];
    includeSpamTrash?: boolean;
  },
) {
  const requestedCount = Math.min(Math.max(options.maxResults, 1), 25);
  const query = new URLSearchParams({
    maxResults: String(requestedCount),
    includeSpamTrash: options.includeSpamTrash ? "true" : "false",
  });
  if (options.pageToken) query.set("pageToken", options.pageToken);
  for (const labelId of options.labelIds || []) query.append("labelIds", labelId);

  const endpoint =
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?${query.toString()}`;
  const list = asRecord(await gmailProxy(apiKey, sessionId, endpoint));
  const messages = Array.isArray(list.messages) ? list.messages : [];
  const ids = [
    ...new Set(
      messages
        .map((item) => asRecord(item).id)
        .filter((item): item is string => typeof item === "string"),
    ),
  ].slice(0, requestedCount);

  const metadata = [];
  for (let index = 0; index < ids.length; index += 5) {
    const chunk = await Promise.all(
      ids.slice(index, index + 5).map(async (id) => {
        try {
          return await getGmailMessageMetadata(apiKey, sessionId, id);
        } catch (cause) {
          if (cause instanceof GmailProxyError && cause.status === 404) {
            return null;
          }
          throw cause;
        }
      }),
    );
    metadata.push(
      ...chunk.filter((message): message is NonNullable<typeof message> =>
        Boolean(message),
      ),
    );
  }
  return {
    messages: metadata,
    nextPageToken:
      typeof list.nextPageToken === "string" ? list.nextPageToken : null,
  };
}
