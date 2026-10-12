import { handle, ok, parseBody } from "@/lib/api";
import { scenarioActivateSchema } from "@/lib/validation";
import { activateScenario } from "@/services/operations-orchestrator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ type: string }> }) {
  return handle(async () => {
    const { type } = await params;
    const input = (await parseBody(request, scenarioActivateSchema)) ?? {};
    return ok(await activateScenario(type, input));
  });
}
