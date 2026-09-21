const RETIREMENT_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Connection setup moved | AgentMarkit</title>
  <style>
    :root {
      color-scheme: light;
      --canvas: #f3f1eb;
      --paper: #fffefa;
      --ink: #11110f;
      --muted: #64635e;
      --line: #d8d5cc;
      --blue: #1246ff;
      --lime: #c7ff35;
    }

    * { box-sizing: border-box; }

    body {
      min-height: 100vh;
      margin: 0;
      background: var(--canvas);
      color: var(--ink);
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    }

    header {
      display: flex;
      min-height: 68px;
      align-items: center;
      justify-content: space-between;
      padding: 0 32px;
      border-bottom: 1px solid var(--line);
      background: var(--paper);
    }

    .brand { font-weight: 800; letter-spacing: -0.05em; }
    .status { color: var(--muted); font-size: 12px; text-transform: uppercase; }

    main {
      width: min(1040px, calc(100% - 40px));
      margin: 72px auto;
    }

    .eyebrow {
      display: inline-block;
      margin-bottom: 18px;
      padding: 7px 10px;
      background: var(--lime);
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    h1 {
      max-width: 850px;
      margin: 0;
      font-size: clamp(38px, 6vw, 74px);
      line-height: 0.98;
      letter-spacing: -0.065em;
    }

    .intro {
      max-width: 700px;
      margin: 28px 0 42px;
      color: var(--muted);
      font-family: Arial, Helvetica, sans-serif;
      font-size: 19px;
      line-height: 1.55;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      border-top: 1px solid var(--line);
      border-left: 1px solid var(--line);
      background: var(--paper);
    }

    section {
      min-height: 220px;
      padding: 28px;
      border-right: 1px solid var(--line);
      border-bottom: 1px solid var(--line);
    }

    .number { color: var(--blue); font-size: 12px; font-weight: 800; }
    h2 { margin: 32px 0 12px; font-size: 21px; letter-spacing: -0.03em; }
    section p { margin: 0; color: var(--muted); font-family: Arial, Helvetica, sans-serif; line-height: 1.55; }

    .actions {
      display: flex;
      align-items: center;
      gap: 22px;
      margin-top: 32px;
    }

    a {
      display: inline-flex;
      min-height: 48px;
      align-items: center;
      justify-content: center;
      padding: 0 20px;
      background: var(--blue);
      color: #fff;
      font-size: 14px;
      font-weight: 800;
      text-decoration: none;
    }

    a:focus-visible { outline: 3px solid var(--lime); outline-offset: 3px; }
    .note { max-width: 440px; color: var(--muted); font-family: Arial, Helvetica, sans-serif; font-size: 13px; line-height: 1.45; }

    @media (max-width: 700px) {
      header { padding: 0 20px; }
      main { margin: 48px auto; }
      .grid { grid-template-columns: 1fr; }
      section { min-height: 0; }
      .actions { align-items: flex-start; flex-direction: column; }
      a { width: 100%; }
    }
  </style>
</head>
<body>
  <header>
    <div class="brand">AgentMarkit</div>
    <div class="status">Retired setup address</div>
  </header>
  <main>
    <div class="eyebrow">Setup has moved</div>
    <h1>Gmail is a connection. Network Observatory is a tool.</h1>
    <p class="intro">They now have separate setup flows, so you can connect Gmail metadata without starting Network Observatory.</p>
    <div class="grid">
      <section>
        <div class="number">01 / CONNECTION</div>
        <h2>Gmail metadata</h2>
        <p>Open the agent you want to connect, then choose Connections and Gmail. It can use who, when, labels, and message IDs. It cannot read message bodies.</p>
      </section>
      <section>
        <div class="number">02 / TOOL</div>
        <h2>Network Observatory</h2>
        <p>Add it when you want to turn a LinkedIn export into a network map. Gmail is optional, and connecting it does not automatically scan or import anything.</p>
      </section>
    </div>
    <div class="actions">
      <a href="https://agentmarkit.com/manage/">Open My Agents</a>
      <div class="note">This retired address cannot start or repair a connection.</div>
    </div>
  </main>
</body>
</html>`;

const JSON_BODY = JSON.stringify({
  error: "gone",
  message: "This legacy connection service is retired. Continue in AgentMarkit.",
});

const SECURITY_HEADERS = Object.freeze({
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; connect-src 'none'; font-src 'none'; img-src 'none'; media-src 'none'; object-src 'none'; script-src 'none'; worker-src 'none'",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy": "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
});

function gone(body, contentType) {
  return new Response(body, {
    status: 410,
    statusText: "Gone",
    headers: {
      ...SECURITY_HEADERS,
      "Content-Type": contentType,
    },
  });
}

function isApiPath(pathname) {
  return pathname === "/api" || pathname.startsWith("/api/");
}

export function handleRequest(request) {
  const method = request.method.toUpperCase();
  const pathname = new URL(request.url).pathname;
  const head = method === "HEAD";

  if ((method !== "GET" && !head) || isApiPath(pathname)) {
    return gone(head ? null : JSON_BODY, "application/json; charset=utf-8");
  }

  return gone(head ? null : RETIREMENT_HTML, "text/html; charset=utf-8");
}

export default {
  fetch(request) {
    return handleRequest(request);
  },
};
