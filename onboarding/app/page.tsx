"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Setup = {
  connectUrl: string;
  mcpUrl: string;
  hermesCommand: string | null;
  hermesConfig: string | null;
  note: string;
};

export default function Home() {
  const [email, setEmail] = useState("");
  const [setup, setSetup] = useState<Setup | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleDisclosureAccepted, setGoogleDisclosureAccepted] = useState(false);
  const hermesSetup = useMemo(
    () => setup?.hermesCommand || setup?.hermesConfig || "",
    [setup],
  );

  // The Google consent flow leaves this page, and the setup command is shown
  // exactly once (the server keeps only a hash). Losing it on "back" strands
  // the user, so keep it for the life of this browser tab.
  useEffect(() => {
    const saved = sessionStorage.getItem("netobs-setup");
    if (saved) {
      try {
        setSetup(JSON.parse(saved) as Setup);
      } catch {
        sessionStorage.removeItem("netobs-setup");
      }
    }
  }, []);

  function startOver() {
    sessionStorage.removeItem("netobs-setup");
    setSetup(null);
    setEmail("");
    setGoogleDisclosureAccepted(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSetup(null);
    try {
      const response = await fetch("/api/provision", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await response.json()) as Setup & { error?: string };
      if (!response.ok) throw new Error(data.error || "Setup failed.");
      sessionStorage.setItem("netobs-setup", JSON.stringify(data));
      setSetup(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Setup failed.");
    } finally {
      setBusy(false);
    }
  }

  async function copySetup() {
    if (hermesSetup) await navigator.clipboard.writeText(hermesSetup);
  }

  return (
    <main>
      <header className="topbar">
        <a className="wordmark" href="https://agentmarkit.com/">
          AgentMarkit Network Observatory
        </a>
        <span className="status">Private enrichment setup</span>
      </header>

      <section className="hero">
        <div className="eyebrow">Your network, with a little more memory</div>
        <h1>Connect Gmail without handing over your inbox.</h1>
        <p className="lede">
          Your LinkedIn map already works on its own. This optional connection lets
          your Hermes agent see who you exchanged email with and when. Message bodies
          and attachments stay out of the Observatory.
        </p>
      </section>

      <section className="setup-grid" aria-label="Gmail enrichment setup">
        <div className="steps">
          <div className="step">
            <span>01</span>
            <div>
              <h2>Sign in</h2>
              <p>
                Enter the Gmail you want connected. Use the exact address
                because that is what Google checks. While this is in testing,
                each address must be approved before it will work. If yours
                has not been approved, Google will stop the connection.
              </p>
            </div>
          </div>
          <div className="step">
            <span>02</span>
            <div>
              <h2>Give your agent the setup command</h2>
              <p>
                The page shows it once. Copy it and paste it to your agent
                before anything else; it's your private endpoint, connecting
                only your agent and your Gmail.
              </p>
            </div>
          </div>
          <div className="step">
            <span>03</span>
            <div>
              <h2>Approve Google</h2>
              <p>
                The test app is currently unverified, so Google shows a warning.
                Review the app name and requested access before continuing. If
                Google says access is denied, use the AgentMarkit contact form
                to ask whether your exact Gmail is on the tester list. While the
                app is in testing, you will reconnect every seven days.
              </p>
            </div>
          </div>
        </div>

        <div className="panel">
          {!setup ? (
            <form onSubmit={submit}>
              <label htmlFor="email">Google account email</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                required
              />

              {error ? <p className="error" role="alert">{error}</p> : null}
              <button type="submit" disabled={busy}>
                {busy ? "Creating your private session…" : "Create my connection"}
              </button>
              <p className="fineprint">
                Your email is converted to a private identifier. The onboarding
                service does not store it in plain text.
              </p>
            </form>
          ) : (
            <div className="success" aria-live="polite">
              <div className="success-mark">Ready</div>
              <h2>Two steps, in order.</h2>
              <ol className="success-steps">
                <li>
                  <div className="code-wrap">
                    <div className="code-label">Step 1: Copy this and paste it to your agent</div>
                    <pre>{hermesSetup}</pre>
                    <button className="secondary" type="button" onClick={copySetup}>
                      Copy setup
                    </button>
                  </div>
                  <p>
                    Do this first. For your security it is shown only once, so
                    put it somewhere safe (your agent chat is perfect) before
                    moving on.
                  </p>
                </li>
                <li>
                  <section className="google-disclosure" aria-labelledby="google-disclosure-title">
                    <h3 id="google-disclosure-title">Before you connect Google</h3>
                    <p>
                      Your agent will get only From, To, Cc, Bcc, Date, labels,
                      internal date, and stable Gmail message or thread IDs. It
                      will not get subjects, snippets, message bodies, or
                      attachments, and it cannot send, edit, or delete email.
                    </p>
                    <p>
                      This information is used to answer your requests about
                      relationship history and communication recency. The request
                      travels through Composio and the AgentMarkit gateway to your
                      agent's rented machine. If your selected model needs the
                      result to answer, it receives the filtered result too.
                    </p>
                    <p>
                      Composio stores the Google authorization. AgentMarkit does
                      not keep returned Gmail metadata in its gateway database.
                      Your agent can save the filtered result in its chat, files,
                      or relationship memory, and the hosting provider's encrypted
                      backup can include those copies.
                    </p>
                    <p>
                      You can revoke future access and request deletion of the
                      connector session. Copies saved by your agent must be
                      deleted from the agent workspace separately. Read the{" "}
                      <a href="https://agentmarkit.com/privacy/" target="_blank" rel="noopener noreferrer">privacy policy</a>
                      {" "}and{" "}
                      <a href="https://agentmarkit.com/data-controls/#google-controls" target="_blank" rel="noopener noreferrer">Google data controls</a>.
                    </p>
                    <label className="google-consent">
                      <input
                        type="checkbox"
                        checked={googleDisclosureAccepted}
                        onChange={(event) => setGoogleDisclosureAccepted(event.target.checked)}
                      />
                      <span>
                        I understand this data path and want to connect this Gmail
                        account to my agent for this purpose.
                      </span>
                    </label>
                  </section>
                  <a
                    className="primary-link"
                    href={googleDisclosureAccepted ? setup.connectUrl : undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-disabled={!googleDisclosureAccepted}
                    onClick={(event) => {
                      if (!googleDisclosureAccepted) event.preventDefault();
                    }}
                  >
                    Step 2: Connect my Google account
                  </a>
                  <p>
                    Opens in a new tab. Approve the Google screen there and
                    you are done; your agent's connection starts working the
                    moment you approve.
                  </p>
                </li>
              </ol>
              <p className="fineprint">{setup.note}</p>
              <button className="linklike" type="button" onClick={startOver}>
                Start over with a different account
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="trust">
        <div>
          <strong>LinkedIn remains the source of truth.</strong>
          <span>Gmail is optional enrichment, never a requirement.</span>
        </div>
        <div>
          <strong>Identity decisions stay reversible.</strong>
          <span>Potential duplicates wait for human confirmation.</span>
        </div>
        <div>
          <strong>Your inbox is not a knowledge base.</strong>
          <span>The Observatory keeps relationship timing, not correspondence.</span>
        </div>
      </section>

      <footer>
        <a href="https://agentmarkit.com/privacy/">
          Privacy and Google data use
        </a>
        <span>Built for small, trusted testing while Google verification is pending.</span>
      </footer>
    </main>
  );
}
