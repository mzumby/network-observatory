export const dynamic = "force-dynamic";

function retired() {
  return Response.json(
    {
      error: "This connection format has been retired. Reconnect the agent through AgentMarkit.",
    },
    {
      status: 410,
      headers: {
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    },
  );
}

export async function POST() {
  return retired();
}

export async function GET() {
  return retired();
}
