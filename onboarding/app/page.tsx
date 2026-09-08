"use client";

import { useEffect, useState } from "react";

const DISCLOSURE_VERSION = "gmail-metadata-v1";
const FLOW_TAB_KEY = "agentmarkit_gmail_flow";

type Connection = {
  connectionId: string;
  agentName: string;
  state: "waiting" | "authorizing" | "connected" | "needs_reconnect";
  expiresAt: string;
  returnUrl: string | null;
};

// React runs effects twice in development. Keep the one-time claim exchange
// alive between those effect runs so the first request is not cancelled after
// the URL fragment has already been removed.
let pendingClaimExchange: Promise<void> | null = null;

class ConnectionPageError extends Error {}

function exchangeClaim(token: string) {
  return fetch("/api/connections/claim", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
  }).then(async (response) => {
    const data = (await response.json()) as { error?: string; tabToken?: string };
    if (!response.ok || !data.tabToken?.startsWith("tab_")) {
      throw new ConnectionPageError(data.error || "This setup link is not working.");
    }
    window.sessionStorage.setItem(FLOW_TAB_KEY, data.tabToken);
  });
}

function flowHeader() {
  return { "x-agentmarkit-flow": window.sessionStorage.getItem(FLOW_TAB_KEY) || "" };
}

type PageState =
  | { kind: "missing" }
  | { kind: "loading" }
  | { kind: "ready"; connection: Connection }
  | { kind: "error"; message: string };

function Brand() {
  return (
    <a className="wordmark" href="https://agentmarkit.com/" aria-label="AgentMarkit home">
      AgentMar<span>kit</span>
    </a>
  );
}

export default function Home() {
  const [page, setPage] = useState<PageState>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const claimToken = new URLSearchParams(window.location.hash.slice(1)).get("claim");
    if (claimToken && !pendingClaimExchange) {
      pendingClaimExchange = exchangeClaim(claimToken);
    }
    if (claimToken) {
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}`,
      );
    }
    const problem = new URLSearchParams(window.location.search).get("problem");
    const controller = new AbortController();
    let stopped = false;
    async function loadConnection() {
      if (problem) {
        const messages: Record<string, string> = {
          "invalid-link": "This link is not valid.",
          "expired-link": "This link has expired.",
          "used-link": "This link has already been used.",
          "not-ready": "Your agent is still being set up.",
          "identity-check": "Open the Gmail connection from the same browser tab where you started.",
          "verification-failed": "Google could not confirm this connection.",
        };
        if (!stopped) {
          setPage({
            kind: "error",
            message: messages[problem] || "This link is not working.",
          });
        }
        return;
      }
      if (pendingClaimExchange) await pendingClaimExchange;

      const response = await fetch("/api/connections/current", {
        cache: "no-store",
        headers: flowHeader(),
        signal: controller.signal,
      });
      if (response.status === 401) {
        if (!stopped) setPage({ kind: "missing" });
        return;
      }
      const data = (await response.json().catch(() => null)) as
        | (Connection & { error?: string })
        | null;
      if (!response.ok || !data) {
        throw new ConnectionPageError(
          data?.error || "This setup link is not working.",
        );
      }
      if (!stopped) setPage({ kind: "ready", connection: data });
    }

    loadConnection().catch((cause) => {
        if (stopped) return;
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setPage({
          kind: "error",
          message:
            cause instanceof ConnectionPageError
              ? cause.message
              : "We could not open this Gmail connection. Try again from AgentMarkit.",
        });
      });

    return () => {
      stopped = true;
      controller.abort();
    };
  }, []);

  async function continueToGoogle() {
    if (page.kind !== "ready") return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/connections/authorize", {
        method: "POST",
        headers: { "content-type": "application/json", ...flowHeader() },
        body: JSON.stringify({
          connectionId: page.connection.connectionId,
          accepted: true,
          disclosureVersion: DISCLOSURE_VERSION,
        }),
      });
      const data = (await response.json().catch(() => null)) as
        | { connectUrl?: string; error?: string }
        | null;
      if (!response.ok || !data?.connectUrl) {
        throw new ConnectionPageError(
          data?.error || "Google could not be opened. Try again.",
        );
      }
      window.location.assign(data.connectUrl);
    } catch (cause) {
      setError(
        cause instanceof ConnectionPageError
          ? cause.message
          : "Google could not be opened. Check your connection and try again.",
      );
      setBusy(false);
    }
  }

  return (
    <div className="site-frame">
      <header className="site-header">
        <Brand />
        <a className="header-link" href="https://agentmarkit.com/manage/">
          My agents
        </a>
      </header>

      <main className="connection-page">
        {page.kind === "loading" ? (
          <section className="connection-sheet status-sheet" aria-live="polite">
            <p>Checking your setup link...</p>
          </section>
        ) : null}

        {page.kind === "missing" ? (
          <section className="connection-sheet">
            <p className="section-label">Gmail connection</p>
            <h1>Connect Gmail to your agent</h1>
            <p className="intro">
              To connect Gmail, open your agent in AgentMarkit and choose Connections,
              then Gmail.
            </p>
            <a className="primary-action" href="https://agentmarkit.com/manage/">
              Open my agents
            </a>
          </section>
        ) : null}

        {page.kind === "error" ? (
          <section className="connection-sheet">
            <p className="section-label">Gmail connection</p>
            <h1>This setup link is not working</h1>
            <p className="intro">{page.message}</p>
            <p className="help-copy">
              Open your agent in AgentMarkit and start again from its Connections page.
            </p>
            <a className="primary-action" href="https://agentmarkit.com/manage/">
              Open my agents
            </a>
          </section>
        ) : null}

        {page.kind === "ready" && page.connection.state === "connected" ? (
          <section className="connection-sheet">
            <p className="section-label connected-label">Connected</p>
            <h1>Gmail is connected to {page.connection.agentName}</h1>
            <p className="intro">
              {page.connection.agentName} can see who you exchanged email with and
              when. It cannot read what your messages say.
            </p>
            <a className="primary-action" href={page.connection.returnUrl || "https://agentmarkit.com/manage/"}>
              Back to {page.connection.agentName}
            </a>
          </section>
        ) : null}

        {page.kind === "ready" && page.connection.state === "needs_reconnect" ? (
          <section className="connection-sheet">
            <p className="section-label">Gmail connection</p>
            <h1>Reconnect Gmail to {page.connection.agentName}</h1>
            <p className="intro">
              This Gmail connection has stopped working. Open this agent in AgentMarkit
              to reconnect it.
            </p>
            <a
              className="primary-action"
              href={page.connection.returnUrl || "https://agentmarkit.com/manage/"}
            >
              Back to {page.connection.agentName}
            </a>
          </section>
        ) : null}

        {page.kind === "ready" &&
        (page.connection.state === "waiting" || page.connection.state === "authorizing") ? (
          <section className="connection-sheet">
            <p className="section-label">Gmail connection</p>
            <h1>Connect Gmail to {page.connection.agentName}</h1>
            <p className="intro">
              {page.connection.agentName} can see who you exchanged email with and
              when. It cannot read what your messages say.
            </p>

            <div className="permission-grid" aria-label="What this connection allows">
              <section>
                <h2>{page.connection.agentName} can use</h2>
                <ul>
                  <li>The people on each email, including Cc and Bcc recipients</li>
                  <li>The date and Gmail labels</li>
                </ul>
              </section>
              <section>
                <h2>{page.connection.agentName} cannot</h2>
                <ul>
                  <li>Read subjects, messages, previews, or attachments</li>
                  <li>Create, send, delete, label, archive, or change email</li>
                </ul>
              </section>
            </div>

            <p className="testing-note">
              This connection is still in testing. Only Google accounts we have approved
              can connect. Google may ask you to reconnect after seven days.
            </p>

            {error ? <p className="error" role="alert">{error}</p> : null}

            <button className="primary-action" type="button" onClick={continueToGoogle} disabled={busy}>
              {busy ? "Opening Google..." : "Continue to Google"}
            </button>

            <details>
              <summary>How your information is handled</summary>
              <div className="details-copy">
                <p>
                  We use Composio to handle the connection with Google. When you ask a
                  related question, {page.connection.agentName} can receive the people,
                  dates, and labels described above. It also receives Gmail&apos;s internal
                  date and stable message and thread IDs. Those IDs help it find the
                  right record, but they do not contain the email itself.
                </p>
                <p>
                  Disconnecting stops future access. It does not delete notes that
                  {page.connection.agentName} has already saved.
                </p>
              </div>
            </details>
          </section>
        ) : null}
      </main>

      <footer className="site-footer">
        <span>Only the agent you choose gets this connection.</span>
        <nav aria-label="Legal">
          <a href="https://agentmarkit.com/privacy/">Privacy</a>
          <a href="https://agentmarkit.com/data-controls/#google-controls">Google data controls</a>
          <a href="https://agentmarkit.com/contact/?topic=setup-help">Get help</a>
        </nav>
      </footer>
    </div>
  );
}
