import { handle, ok, parseBody } from "@/lib/api";
import { crewPatchSchema } from "@/lib/validation";
import { updateCrew } from "@/services/operations-orchestrator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const patch = await parseBody(request, crewPatchSchema);
    const { availableFrom, ...rest } = patch;
    const result = await updateCrew(id, {
      ...rest,
      ...(availableFrom !== undefined ? { availableFrom: availableFrom ? new Date(availableFrom) : null } : {}),
    });
    return ok(result);
  });
}
