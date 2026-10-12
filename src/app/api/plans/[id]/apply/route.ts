import { handle, ok } from "@/lib/api";
import { applyAllocationPlan } from "@/services/operations-orchestrator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Applies an approved plan. Refuses if the plan is stale (data changed after it
 * was generated) or if any assignment no longer satisfies the hard constraints.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    return ok(await applyAllocationPlan(id));
  });
}
