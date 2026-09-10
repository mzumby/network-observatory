export const dynamic = "force-dynamic";

export async function POST() {
  return Response.json(
    {
      error: "Invite codes have been replaced by agent-bound Gmail connections.",
    },
    {
      status: 410,
      headers: { "cache-control": "no-store" },
    },
  );
}
