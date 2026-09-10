#!/usr/bin/env python3
"""Create, confirm, hand off, or revoke an agent-bound Gmail connection."""

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

CONNECT_ORIGIN = "https://connect.agentmarkit.com"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def validate_base_url(value):
    parsed = urllib.parse.urlsplit(value)
    if (
        parsed.scheme != "https"
        or not parsed.hostname
        or parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
        or parsed.path not in ("", "/")
    ):
        raise SystemExit("--url must be an HTTPS origin with no path, query, or credentials.")
    origin = urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, "", "", ""))
    if origin != CONNECT_ORIGIN:
        raise SystemExit(f"--url must be {CONNECT_ORIGIN}.")
    return origin


def call(url, token, method, payload):
    request = urllib.request.Request(
        url.rstrip("/") + "/api/admin/agent-connections",
        data=json.dumps(payload).encode(),
        method=method,
        headers={
            "authorization": "Bearer " + token,
            "content-type": "application/json",
        },
    )
    try:
        opener = urllib.request.build_opener(NoRedirect)
        with opener.open(request, timeout=30) as response:
            return json.loads(response.read().decode())
    except urllib.error.HTTPError as error:
        print(error.read().decode(), file=sys.stderr)
        raise SystemExit(1)


def reserve_secret_file(path):
    target = os.path.abspath(path)
    try:
        descriptor = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        raise SystemExit(f"Refusing to overwrite existing secret file: {target}")
    return target, descriptor


def write_secret_file(target, descriptor, payload):
    with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)
        handle.write("\n")


def print_redacted(payload, secret_file=None):
    clean = dict(payload)
    for key in ("mcpBearerToken", "handoffToken"):
        if clean.get(key):
            clean[key] = f"[saved in {secret_file}]"
    print(json.dumps(clean, indent=2))


def main():
    parser = argparse.ArgumentParser(
        description="Manage the private Gmail connection installed on one agent."
    )
    parser.add_argument("--url", required=True, help="deployed Connect base URL")
    commands = parser.add_subparsers(dest="command", required=True)

    create = commands.add_parser("create", help="create a dormant agent connection")
    create.add_argument("--request-id", required=True)
    create.add_argument("--owner-ref", required=True, help="stable opaque customer ID")
    create.add_argument("--installation-ref", required=True, help="stable agent installation ID")
    create.add_argument("--agent-name", required=True)
    create.add_argument("--return-url")
    create.add_argument("--secret-file", required=True, help="new 0600 JSON credential file")

    installed = commands.add_parser("installed", help="confirm the endpoint passed its agent-side check")
    installed.add_argument("connection_id")

    handoff = commands.add_parser("handoff", help="issue a five-minute browser handoff")
    handoff.add_argument("connection_id")
    handoff.add_argument("--owner-ref", required=True, help="owner verified by AgentMarkit")
    handoff.add_argument(
        "--installation-ref", required=True, help="installation verified by AgentMarkit"
    )
    handoff.add_argument("--secret-file", required=True, help="new 0600 JSON handoff file")

    revoke = commands.add_parser("revoke", help="revoke one agent connection")
    revoke.add_argument("connection_id")

    args = parser.parse_args()
    args.url = validate_base_url(args.url)
    token = os.environ.get("NETWORK_OBSERVATORY_INVITE_ADMIN_TOKEN")
    if not token:
        raise SystemExit("Set NETWORK_OBSERVATORY_INVITE_ADMIN_TOKEN in your shell first.")

    if args.command == "revoke":
        result = call(
            args.url,
            token,
            "DELETE",
            {"connectionId": args.connection_id},
        )
        print(json.dumps(result, indent=2))
        return

    if args.command == "installed":
        result = call(
            args.url,
            token,
            "PATCH",
            {"connectionId": args.connection_id, "installed": True},
        )
        print(json.dumps(result, indent=2))
        return

    secret_file, descriptor = reserve_secret_file(args.secret_file)
    try:
        if args.command == "create":
            payload = {
                "requestId": args.request_id,
                "ownerRef": args.owner_ref,
                "installationRef": args.installation_ref,
                "agentName": args.agent_name,
                "returnUrl": args.return_url,
            }
            result = call(args.url, token, "POST", payload)
        else:
            result = call(
                args.url,
                token,
                "PATCH",
                {
                    "connectionId": args.connection_id,
                    "issueHandoff": True,
                    "ownerRef": args.owner_ref,
                    "installationRef": args.installation_ref,
                },
            )
        write_secret_file(secret_file, descriptor, result)
        descriptor = None
    except BaseException:
        if descriptor is not None:
            try:
                os.close(descriptor)
            except OSError:
                pass
        try:
            os.unlink(secret_file)
        except FileNotFoundError:
            pass
        raise
    print_redacted(result, secret_file)


if __name__ == "__main__":
    main()
