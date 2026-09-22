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

    .brand { display: inline-flex; align-items: center; }
    .brand svg { display: block; width: 34px; height: 34px; }
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
    <div class="brand"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="AgentMarkit"><g transform="translate(16)"><path fill="#E8FF00" d="M10 0H86L96 10V118L86 128H10L0 118V10Z"/><g fill="#11120F"><rect x="16" y="18" width="13" height="13"/><rect x="33" y="18" width="13" height="13"/><rect x="50" y="18" width="13" height="13"/><rect x="50" y="35" width="13" height="13"/><rect x="67" y="35" width="13" height="13"/><rect x="16" y="52" width="13" height="13"/><rect x="33" y="52" width="13" height="13"/><rect x="50" y="52" width="13" height="13"/><rect x="67" y="52" width="13" height="13"/><rect x="16" y="69" width="13" height="13"/><rect x="67" y="69" width="13" height="13"/><rect x="16" y="86" width="13" height="13"/><rect x="33" y="86" width="13" height="13"/><rect x="50" y="86" width="13" height="13"/><rect x="67" y="86" width="13" height="13"/><rect x="50" y="103" width="13" height="13"/><rect x="67" y="103" width="13" height="13"/></g></g></svg></div>
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
        <p>Open the agent you want to connect, then choose Gmail metadata. It can use who, when, labels, and message IDs. It cannot read message bodies.</p>
      </section>
      <section>
        <div class="number">02 / TOOL</div>
        <h2>Network Observatory</h2>
        <p>If this tool is installed, set it up with your LinkedIn export. Otherwise choose it while building a new Mix-and-match agent. Gmail stays optional.</p>
      </section>
    </div>
    <div class="actions">
      <a href="https://agentmarkit.com/manage/">Open my agents</a>
      <div class="note">This retired address cannot start or repair a connection.</div>
    </div>
  </main>
</body>
</html>`;

const JSON_BODY = JSON.stringify({
  error: "gone",
  message: "This legacy connection service is retired. Continue in AgentMarkit.",
});

// The explicit empty fragment prevents browsers from inheriting a fragment
// from the legacy URL, which the Worker cannot inspect.
const AGENTMARKIT_DESTINATION = "https://agentmarkit.com/manage/#";
const TOKEN_SHAPED_VALUE = /(?:nobs_|handoff_|flow_|tab_|acn_)[A-Za-z0-9_-]{8,}/i;
const TOKEN_QUERY_KEY = /^(?:access_token|authorization|bearer|code|connection|key|session|token)$/i;

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

function moved() {
  return new Response(null, {
    status: 308,
    headers: {
      ...SECURITY_HEADERS,
      Location: AGENTMARKIT_DESTINATION,
    },
  });
}

function isApiPath(pathname) {
  return pathname === "/api" || pathname.startsWith("/api/");
}

function isTokenShaped(url) {
  let decodedPath = url.pathname;
  try {
    decodedPath = decodeURIComponent(url.pathname);
  } catch {
    // A malformed path is never eligible for the safe root redirect.
  }
  if (TOKEN_SHAPED_VALUE.test(`${decodedPath}${url.search}`)) return true;
  return [...url.searchParams.keys()].some((key) => TOKEN_QUERY_KEY.test(key));
}

export function handleRequest(request) {
  const method = request.method.toUpperCase();
  const url = new URL(request.url);
  const pathname = url.pathname;

  if (method === "GET" && pathname === "/" && !url.search) {
    return moved();
  }

  const head = method === "HEAD";
  if (method !== "GET" || isApiPath(pathname) || isTokenShaped(url)) {
    return gone(head ? null : JSON_BODY, "application/json; charset=utf-8");
  }

  return gone(RETIREMENT_HTML, "text/html; charset=utf-8");
}

export default {
  fetch(request) {
    return handleRequest(request);
  },
};
