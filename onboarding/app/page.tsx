"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import {
  browserFlowHeaders,
  connectionIdFromHash,
  createBrowserConnectionFlowCoordinator,
  gmailAuthorizationRequest,
  listenForConnectionHashChange,
} from "@/lib/connection-fragment.mjs";

const DISCLOSURE_VERSION = "gmail-metadata-v1";
const FLOW_TAB_KEY = "agentmarkit_gmail_flow";
const FLOW_CONNECTION_KEY = "agentmarkit_gmail_connection_id";

type Connection = {
  connectionId: string;
  agentName: string;
  state: "waiting" | "authorizing" | "connected" | "needs_reconnect";
  expiresAt: string;
  returnUrl: string | null;
};

type BrowserFlow = {
  connectionId: string;
  tabToken: string;
};

class ConnectionPageError extends Error {}

function exchangeHandoff(connectionId: string): Promise<BrowserFlow> {
  return fetch("/api/connections/handoff", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ connectionId }),
  }).then(async (response) => {
    const data = (await response.json()) as { error?: string; tabToken?: string };
    if (!response.ok || !data.tabToken?.startsWith("tab_")) {
      throw new ConnectionPageError(data.error || "We could not open this Gmail connection.");
    }
    return { connectionId, tabToken: data.tabToken };
  });
}

function persistBrowserFlow(flow: BrowserFlow) {
  window.sessionStorage.setItem(FLOW_TAB_KEY, flow.tabToken);
  window.sessionStorage.setItem(FLOW_CONNECTION_KEY, flow.connectionId);
}

function browserFlowFromSession(): BrowserFlow | null {
  const tabToken = window.sessionStorage.getItem(FLOW_TAB_KEY) || "";
  const connectionId = window.sessionStorage.getItem(FLOW_CONNECTION_KEY) || "";
  if (
    !/^tab_[a-f0-9]{48}$/.test(tabToken) ||
    !/^acn_[a-f0-9]{24}$/.test(connectionId)
  ) {
    return null;
  }
  return { connectionId, tabToken };
}

function requestGoogleAuthorization(flow: BrowserFlow) {
  const request = gmailAuthorizationRequest(flow, DISCLOSURE_VERSION);
  return fetch("/api/connections/authorize", {
    method: "POST",
    ...request,
  }).then(async (response) => {
    const data = (await response.json().catch(() => null)) as
      | { connectUrl?: string; error?: string }
      | null;
    if (!response.ok || !data?.connectUrl) {
      throw new ConnectionPageError(
        data?.error || "Google could not be opened. Try again.",
      );
    }
    const target = new URL(data.connectUrl);
    if (target.protocol !== "https:" || target.username || target.password) {
      throw new ConnectionPageError("Google returned an unsafe approval link.");
    }
    return target.href;
  });
}

// The coordinator keeps only concurrent work. Settled handoffs are evicted so a
// newly issued one-use cookie for the same connection can be consumed. Its
// latest in-flight promise bridges React's development effect replay after the
// URL fragment has already been removed.
const browserConnectionFlow = createBrowserConnectionFlowCoordinator({
  exchange: exchangeHandoff,
  authorize: requestGoogleAuthorization,
  persist: persistBrowserFlow,
  schedule: (callback: () => void, delay: number) =>
    window.setTimeout(callback, delay),
  cancel: (timer: number) => window.clearTimeout(timer),
  navigate: (url: string) => window.location.assign(url),
});

type PageState =
  | { kind: "missing" }
  | { kind: "loading" }
  | { kind: "ready"; connection: Connection; flow: BrowserFlow }
  | { kind: "error"; message: string };

function Brand() {
  return (
    <a className="wordmark" href="https://agentmarkit.com/" aria-label="AgentMarkit home">
      <img
        src="/agentmarkit-logo.svg"
        width="650"
        height="128"
        alt="AgentMarkit"
      />
    </a>
  );
}

export default function Home() {
  const [page, setPage] = useState<PageState>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [googleUrl, setGoogleUrl] = useState("");

  useEffect(() => {
    let stopped = false;
    let sequence = 0;
    let activeController: AbortController | null = null;

    async function loadConnection(connectionId = "") {
      const requestSequence = ++sequence;
      activeController?.abort();
      const controller = new AbortController();
      activeController = controller;
      const isCurrent = () => !stopped && requestSequence === sequence;

      try {
        const problem = new URLSearchParams(window.location.search).get("problem");
        if (problem) {
          browserConnectionFlow.invalidate();
          const messages: Record<string, string> = {
            "invalid-link": "This link is not valid.",
            "expired-link": "This link has expired.",
            "used-link": "This link has already been used.",
            "not-ready": "Your agent is still being set up.",
            "identity-check": "This Gmail connection belongs to the browser tab where setup began.",
            "verification-failed": "Google could not confirm this connection.",
          };
          if (isCurrent()) {
            setPage({
              kind: "error",
              message: messages[problem] || "This link is not working.",
            });
          }
          return;
        }

        const flowRequest = browserConnectionFlow.begin(
          connectionId,
          browserFlowFromSession(),
        );
        if (connectionId) {
          setPage({ kind: "loading" });
          setError("");
          setGoogleUrl("");
          window.history.replaceState(
            null,
            "",
            `${window.location.pathname}${window.location.search}`,
          );
        }
        const flow = await flowRequest.activate();
        if (!isCurrent() || !flowRequest.isCurrent()) return;
        if (!flow) {
          setPage({ kind: "missing" });
          return;
        }

        const response = await fetch("/api/connections/current", {
          cache: "no-store",
          headers: browserFlowHeaders(flow),
          signal: controller.signal,
        });
        if (response.status === 401) {
          if (isCurrent() && flowRequest.isCurrent()) {
            browserConnectionFlow.invalidate();
            setPage({ kind: "missing" });
          }
          return;
        }
        const data = (await response.json().catch(() => null)) as
          | (Connection & { error?: string })
          | null;
        if (!response.ok || !data) {
          throw new ConnectionPageError(
            data?.error || "We could not open this Gmail connection.",
          );
        }
        if (data.connectionId !== flow.connectionId) {
          throw new ConnectionPageError("We could not open this Gmail connection.");
        }
        if (isCurrent() && flowRequest.isCurrent()) {
          setPage({ kind: "ready", connection: data, flow });
        }
      } catch (cause) {
        if (!isCurrent()) return;
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setPage({
          kind: "error",
          message:
            cause instanceof ConnectionPageError
              ? cause.message
              : "We could not open this Gmail connection. Try again from AgentMarkit.",
        });
      }
    }

    const stopListening = listenForConnectionHashChange(
      window,
      (connectionId: string) => void loadConnection(connectionId),
    );
    void loadConnection(connectionIdFromHash(window.location.hash));

    return () => {
      stopped = true;
      activeController?.abort();
      browserConnectionFlow.invalidate();
      stopListening();
    };
  }, []);

  useEffect(() => {
    if (
      page.kind !== "ready" ||
      (page.connection.state !== "waiting" &&
        page.connection.state !== "authorizing")
    ) {
      return;
    }
    let stopped = false;
    browserConnectionFlow.prepareAuthorization(page.flow)
      .then((connectUrl) => {
        if (stopped || !connectUrl) return;
        setGoogleUrl(connectUrl);
        // Let the fallback link paint before leaving this page. If browser
        // navigation is interrupted, the exact same safe link remains usable.
        browserConnectionFlow.scheduleNavigation(page.flow, connectUrl, 120);
      })
      .catch((cause) => {
        if (stopped) return;
        setError(
          cause instanceof ConnectionPageError
            ? cause.message
            : "Google could not be opened. Check your connection and try again.",
        );
        setBusy(false);
      });
    return () => {
      stopped = true;
      browserConnectionFlow.cancelNavigation(page.flow);
    };
  }, [page]);

  function retryGoogle() {
    if (page.kind !== "ready") return;
    setBusy(true);
    setError("");
    browserConnectionFlow.prepareAuthorization(page.flow)
      .then((connectUrl) => {
        if (!connectUrl) return;
        setGoogleUrl(connectUrl);
        browserConnectionFlow.navigateNow(page.flow, connectUrl);
      })
      .catch((cause) => {
        setError(
          cause instanceof ConnectionPageError
            ? cause.message
            : "Google could not be opened. Check your connection and try again.",
        );
        setBusy(false);
      });
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
            <div>
              <p className="section-label">Gmail metadata</p>
              <h1>Opening Gmail</h1>
              <div className="connection-progress">
                <span className="progress-dot" aria-hidden="true" />
                <span>Checking this connection...</span>
              </div>
            </div>
          </section>
        ) : null}

        {page.kind === "missing" ? (
          <section className="connection-sheet">
            <p className="section-label">Gmail metadata</p>
            <h1>Start from your agent</h1>
            <p className="intro">
              Open the agent you want to connect in AgentMarkit, then choose
              Gmail metadata.
            </p>
            <a className="primary-action" href="https://agentmarkit.com/manage/">
              Open my agents
            </a>
          </section>
        ) : null}

        {page.kind === "error" ? (
          <section className="connection-sheet">
            <p className="section-label">Gmail metadata</p>
            <h1>We could not open this Gmail connection</h1>
            <p className="intro">{page.message}</p>
            <p className="help-copy">
              Open your agent in AgentMarkit and start again from its Gmail metadata page.
            </p>
            <a className="primary-action" href="https://agentmarkit.com/manage/">
              Open my agents
            </a>
          </section>
        ) : null}

        {page.kind === "ready" && page.connection.state === "connected" ? (
          <section className="connection-sheet">
            <p className="section-label connected-label">Connected</p>
            <h1>Gmail metadata is connected</h1>
            <p className="intro">
              {page.connection.agentName} can now answer who you exchanged email with
              and when. It still cannot read your messages.
            </p>
            <a className="primary-action" href={page.connection.returnUrl || "https://agentmarkit.com/manage/"}>
              Back to {page.connection.agentName}
            </a>
          </section>
        ) : null}

        {page.kind === "ready" && page.connection.state === "needs_reconnect" ? (
          <section className="connection-sheet">
            <p className="section-label">Gmail metadata</p>
            <h1>Reconnect Gmail in AgentMarkit</h1>
            <p className="intro">
              This connection has stopped working. AgentMarkit will safely replace the
              old authorization when you reconnect it from {page.connection.agentName}.
            </p>
            <a
              className="primary-action"
              href={page.connection.returnUrl || "https://agentmarkit.com/manage/"}
            >
              Reconnect Gmail
            </a>
          </section>
        ) : null}

        {page.kind === "ready" &&
        (page.connection.state === "waiting" || page.connection.state === "authorizing") ? (
          <section className="connection-sheet status-sheet" aria-live="polite">
            <div>
              <p className="section-label">Gmail metadata</p>
              <h1>Opening Google</h1>
              <p className="intro">
                Google will ask you to approve access to email addresses, dates, and
                labels for {page.connection.agentName}. This connection cannot read
                message content or send email.
              </p>

              <div className="connection-progress">
                <span className="progress-dot" aria-hidden="true" />
                <span>{googleUrl ? "Continue in Google." : "Preparing Google's approval page..."}</span>
              </div>

              {error ? <p className="error" role="alert">{error}</p> : null}

              {googleUrl ? (
                <a className="primary-action" href={googleUrl} referrerPolicy="no-referrer">
                  Open Google
                </a>
              ) : error ? (
                <button className="primary-action" type="button" onClick={retryGoogle} disabled={busy}>
                  {busy ? "Opening Google..." : "Try again"}
                </button>
              ) : null}
            </div>
          </section>
        ) : null}
      </main>

      <footer className="site-footer">
        <span>Gmail metadata is a separate AgentMarkit connection.</span>
        <nav aria-label="Legal">
          <a href="https://agentmarkit.com/privacy/">Privacy</a>
          <a href="https://agentmarkit.com/data-controls/#google-controls">Google data controls</a>
          <a href="https://agentmarkit.com/contact/?topic=setup-help">Get help</a>
        </nav>
      </footer>
    </div>
  );
}
