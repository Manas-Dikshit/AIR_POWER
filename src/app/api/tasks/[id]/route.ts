import { handle, ok, parseBody } from "@/lib/api";
import { taskUpdateSchema } from "@/lib/validation";
import { deleteTask, updateTask } from "@/services/operations-orchestrator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const input = await parseBody(request, taskUpdateSchema);
    return ok(await updateTask(id, input));
  });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    return ok(await deleteTask(id));
  });
}
