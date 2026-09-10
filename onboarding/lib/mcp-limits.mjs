const TOOL_SWEEP = "network_observatory_sweep_email_metadata";
const TOOL_GET = "network_observatory_get_message_metadata";

function integer(value, fallback) {
  return typeof value === "number" && Number.isInteger(value) ? value : fallback;
}

export function mcpRequestCost(rpc) {
  if (!rpc || rpc.method !== "tools/call") return 1;
  const name = rpc.params?.name;
  if (name === TOOL_GET) return 2;
  if (name !== TOOL_SWEEP) return 1;

  const args =
    rpc.params?.arguments && typeof rpc.params.arguments === "object"
      ? rpc.params.arguments
      : {};
  const messageCount = Math.min(Math.max(integer(args.max_results, 25), 1), 25);
  return 2 + messageCount;
}
