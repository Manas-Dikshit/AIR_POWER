import { handle, ok, parseBody } from "@/lib/api";
import { aircraftPatchSchema } from "@/lib/validation";
import { updateAircraft } from "@/services/operations-orchestrator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const patch = await parseBody(request, aircraftPatchSchema);
    const { maintenanceCompletionAt, ...rest } = patch;
    const result = await updateAircraft(id, {
      ...rest,
      ...(maintenanceCompletionAt !== undefined
        ? { maintenanceCompletionAt: maintenanceCompletionAt ? new Date(maintenanceCompletionAt) : null }
        : {}),
    });
    return ok(result);
  });
}
