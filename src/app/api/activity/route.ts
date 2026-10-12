import { handle, ok } from "@/lib/api";
import { activityQuerySchema } from "@/lib/validation";
import { getActivityLog } from "@/services/operations-orchestrator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  return handle(async () => {
    const url = new URL(request.url);
    const { limit } = activityQuerySchema.parse({ limit: url.searchParams.get("limit") ?? undefined });
    return ok(await getActivityLog(limit));
  });
}
