import { handle, ok, parseBody } from "@/lib/api";
import { resourcePatchSchema } from "@/lib/validation";
import { updateResource } from "@/services/operations-orchestrator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const patch = await parseBody(request, resourcePatchSchema);
    return ok(await updateResource(id, patch));
  });
}
