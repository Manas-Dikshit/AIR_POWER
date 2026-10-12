import { handle, ok, parseBody } from "@/lib/api";
import { taskCreateSchema } from "@/lib/validation";
import { createTask, getTaskList } from "@/services/operations-orchestrator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return handle(async () => ok(await getTaskList()));
}

export async function POST(request: Request) {
  return handle(async () => {
    const input = await parseBody(request, taskCreateSchema);
    return ok(await createTask(input), 201);
  });
}
