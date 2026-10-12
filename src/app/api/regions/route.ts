import { handle, ok } from "@/lib/api";
import { getRegionList } from "@/services/operations-orchestrator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return handle(async () => ok(await getRegionList()));
}
