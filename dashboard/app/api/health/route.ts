import { bridge } from "@/lib/bridge";
import { demoEnabled } from "@/lib/session";
export const dynamic = "force-dynamic";
export async function GET() {
  if (demoEnabled())
    return Response.json(
      { status: "demo", connected: false },
      { headers: { "Cache-Control": "no-store" } },
    );
  if (
    !process.env.AUTH_URL ||
    !process.env.AUTH_SECRET ||
    !process.env.AUTH_DISCORD_ID ||
    !process.env.AUTH_DISCORD_SECRET
  )
    return Response.json({ status: "configuration-required" }, { status: 503 });
  try {
    await bridge("100000000000000000", "/v1/health");
    return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ status: "disconnected" }, { status: 503 });
  }
}
