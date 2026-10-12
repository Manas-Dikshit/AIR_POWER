import { handle, ok } from "@/lib/api";
import { generateAllocationPlan } from "@/services/operations-orchestrator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Generates recommendations and stores a plan. Never mutates assignments. */
export async function POST() {
  return handle(async () => ok(await generateAllocationPlan(), 201));
}
