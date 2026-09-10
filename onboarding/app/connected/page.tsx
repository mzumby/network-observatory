"use client";

import { useEffect, useState } from "react";

type Status = {
  connectionId: string;
  agentName: string;
  state: "waiting" | "authorizing" | "connected" | "needs_reconnect" | "revoked";
  returnUrl: string | null;
  error?: string;
};

class StatusPageError extends Error {}

export default function Connected() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;

    async function check() {
      try {
        const tabToken = window.sessionStorage.getItem("agentmarkit_gmail_flow") || "";
        const connectionId =
          window.sessionStorage.getItem("agentmarkit_gmail_connection_id") || "";
        const response = await fetch("/api/connections/status", {
          cache: "no-store",
          headers: {
            "x-agentmarkit-flow": tabToken,
            "x-agentmarkit-connection": connectionId,
          },
        });
        const data = (await response.json().catch(() => null)) as Status | null;
        if (!response.ok || !data) {
          throw new StatusPageError(
            data?.error || "We could not check this connection.",
          );
        }
        if (stopped) return;
        setStatus(data);
        if (data.state === "connected") {
          window.sessionStorage.removeItem("agentmarkit_gmail_flow");
          window.sessionStorage.removeItem("agentmarkit_gmail_connection_id");
          return;
        }
        if (data.state === "needs_reconnect") return;
        if (data.state === "revoked") {
          setError("This Gmail connection has been turned off.");
          return;
        }
        attempts += 1;
        if (attempts >= 30) setSlow(true);
        if (attempts >= 60) return;
        timer = setTimeout(check, attempts >= 30 ? 4000 : 1500);
      } catch (cause) {
        if (!stopped) {
          setError(
            cause instanceof StatusPageError
              ? cause.message
              : "We could not check this connection. Return to AgentMarkit and try again.",
          );
        }
      }
    }

    check();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  const agentName = status?.agentName || "your agent";
  const backUrl = status?.returnUrl || "https://agentmarkit.com/manage/";

  return (
    <div className="site-frame">
      <header className="site-header">
        <a className="wordmark" href="https://agentmarkit.com/" aria-label="AgentMarkit home">
          AgentMar<span>kit</span>
        </a>
        <a className="header-link" href="https://agentmarkit.com/manage/">
          My agents
        </a>
      </header>

      <main className="connection-page">
        {error ? (
          <section className="connection-sheet">
            <p className="section-label">Gmail connection</p>
            <h1>We could not check the connection</h1>
            <p className="intro">{error}</p>
            <a className="primary-action" href={backUrl}>Back to AgentMarkit</a>
          </section>
        ) : status?.state === "connected" ? (
          <section className="connection-sheet">
            <p className="section-label connected-label">Connected</p>
            <h1>Gmail is connected to {agentName}</h1>
            <p className="intro">
              {agentName} can now answer questions about who you exchanged email with
              and when. It cannot read what your messages say.
            </p>
            <div className="try-this">
              <span>Next, in Discord</span>
              <p>
                Send <code>/new</code>, then ask &quot;Who have I been emailing recently?&quot;
              </p>
            </div>
            <a className="primary-action" href={backUrl}>Back to {agentName}</a>
          </section>
        ) : status?.state === "needs_reconnect" ? (
          <section className="connection-sheet">
            <p className="section-label">Gmail connection</p>
            <h1>Reconnect Gmail to {agentName}</h1>
            <p className="intro">
              This Gmail connection has stopped working. Return to AgentMarkit to
              reconnect it.
            </p>
            <a className="primary-action" href={backUrl}>Back to {agentName}</a>
          </section>
        ) : (
          <section className="connection-sheet status-sheet" aria-live="polite">
            <div>
              <p className="section-label">Connecting Gmail</p>
              <h1>Checking your Google account</h1>
              <p className="intro">
                Keep this page open while we confirm the connection for {agentName}.
              </p>
              <div className="connection-progress" aria-label="Connection progress">
                <span className="progress-dot" aria-hidden="true" />
                <span>{slow ? "Google has not confirmed the connection yet." : "Waiting for Google..."}</span>
              </div>
              {slow ? (
                <p className="help-copy">
                  This is taking longer than usual. {agentName} will not get access unless
                  the connection is confirmed. You can wait here or return to AgentMarkit
                  and try again.
                </p>
              ) : null}
              {slow ? <a className="primary-action" href={backUrl}>Back to {agentName}</a> : null}
            </div>
          </section>
        )}
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
