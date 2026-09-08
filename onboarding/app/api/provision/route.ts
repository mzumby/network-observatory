export const dynamic = "force-dynamic";

export async function POST() {
  return Response.json(
    {
      error:
        "Gmail setup now starts from an AgentMarkit agent. Open the agent and choose Gmail from Connections.",
    },
    {
      status: 410,
      headers: { "cache-control": "no-store" },
    },
  );
}
