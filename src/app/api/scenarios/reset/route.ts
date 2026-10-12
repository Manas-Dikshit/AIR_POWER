import { handle, ok } from "@/lib/api";
import { resetDemoData } from "@/services/operations-orchestrator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Restores the original seeded demonstration state. */
export async function POST() {
  return handle(async () => ok(await resetDemoData()));
}
