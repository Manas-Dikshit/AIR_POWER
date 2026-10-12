import { handle, ok } from "@/lib/api";
import { getDataVersion, getRegions, getTasks } from "@/lib/repository";
import { activateScenario } from "@/services/operations-orchestrator";
import { getLatestAppliedPlan } from "@/lib/plans";
import { ScenarioActivateInput } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Initial conditions of the simulated world, used by the scenario simulator. */
export async function GET() {
  return handle(async () => {
    const [regions, tasks, plan, dataVersion] = await Promise.all([
      getRegions(),
      getTasks(),
      getLatestAppliedPlan(),
      getDataVersion(),
    ]);
    return ok({
      regions,
      dataVersion,
      tasks: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        priority: t.priority,
        status: t.status,
        category: t.category,
        simulatedRegionId: t.simulatedRegionId,
        startsAt: t.startsAt,
        endsAt: t.endsAt,
        constraintNotes: t.constraintNotes,
      })),
      planInForce: plan ? { id: plan.id, appliedAt: plan.appliedAt, dataVersion: plan.dataVersion } : null,
    });
  });
}

export type { ScenarioActivateInput };
