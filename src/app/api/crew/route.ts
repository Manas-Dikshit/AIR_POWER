import { handle, ok } from "@/lib/api";
import { getFleetOverview } from "@/services/operations-orchestrator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return handle(async () => {
    const fleet = await getFleetOverview();
    return ok(fleet.crew);
  });
}
