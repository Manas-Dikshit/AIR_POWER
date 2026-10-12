import { prisma } from "../src/lib/prisma";
import { activateScenario, applyAllocationPlan, generateAllocationPlan } from "../src/services/operations-orchestrator";

const main = async () => {
  console.log("== Scenario A: aircraft becomes unavailable");
  const scenario = await activateScenario("aircraft-unavailable", {});
  console.log(scenario.title);
  scenario.initialConditions.forEach((c) => console.log("  initial:", c));
  scenario.changes.forEach((c) => console.log("  change :", c));
  for (const t of scenario.affectedTasks) console.log("  affected:", t.id, t.status, "|", t.note);

  const before = await prisma.allocationPlan.findFirst({ where: { status: "APPLIED" }, include: { allocations: true } });
  const plan = await generateAllocationPlan();
  console.log("== Revised plan", plan.id, plan.status, plan.dataVersion);
  const beforeMap = new Map(
    (before?.allocations ?? []).filter((a) => a.status === "ASSIGNED").map((a) => [a.taskId, a.aircraftId])
  );
  for (const a of plan.allocations) {
    const old = beforeMap.get(a.taskId);
    const marker = old !== undefined && old !== a.aircraftId ? `  <-- was ${old}` : "";
    console.log(`${a.taskId} ${a.status.padEnd(11)} ${(a.aircraftId ?? "-").padEnd(7)} ${(a.crewId ?? "-").padEnd(9)} ${a.explanation.slice(0, 90)}${marker}`);
  }

  const applied = await applyAllocationPlan(plan.id);
  console.log("== Applied revised plan", applied.id, applied.status);

  console.log("== Stale check: try to apply an old generated plan again");
  try {
    await applyAllocationPlan(plan.id);
  } catch (error) {
    console.log("  rejected:", (error as Error).message);
  }

  await prisma.$disconnect();
};
main();
