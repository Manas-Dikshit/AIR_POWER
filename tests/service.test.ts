import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma";
import { seedDemoData } from "../src/lib/seed";
import { getActivity, getDataVersion } from "../src/lib/repository";
import { getLatestAppliedPlan } from "../src/lib/plans";
import {
  activateScenario,
  applyAllocationPlan,
  generateAllocationPlan,
  resetDemoData,
  updateAircraft,
  updateCrew,
} from "../src/services/operations-orchestrator";

/**
 * Service-level rules that need the database: staleness, atomic application,
 * scenario replanning and the demonstration reset.
 *
 * These run against the SQLite database from DATABASE_URL and re-seed before
 * every test, so they always start from the documented demonstration state.
 */
describe("operations service", () => {
  beforeEach(async () => {
    await seedDemoData();
  });

  afterAll(async () => {
    await seedDemoData();
    await prisma.$disconnect();
  });

  it("8. rejects a plan as stale once operational data changes", async () => {
    const plan = await generateAllocationPlan();
    const versionAtGeneration = plan.dataVersion;

    await updateAircraft("AC-012", { turnaroundMinutes: 90 });

    expect(await getDataVersion()).not.toBe(versionAtGeneration);
    await expect(applyAllocationPlan(plan.id)).rejects.toThrow(/stale/i);
  });

  it("9. applying a plan updates assignments consistently", async () => {
    await updateCrew("CREW-003", { availableFrom: null });

    const plan = await generateAllocationPlan();
    const recommended = plan.allocations.filter((a) => a.status === "RECOMMENDED");
    expect(recommended.length).toBeGreaterThan(0);

    const fuelBefore = await prisma.supportResource.findUnique({ where: { id: "RES-01" } });
    const applied = await applyAllocationPlan(plan.id);
    expect(applied.status).toBe("APPLIED");
    expect(applied.appliedAt).not.toBeNull();

    for (const allocation of recommended) {
      const task = await prisma.operationalTask.findUnique({ where: { id: allocation.taskId } });
      expect(task?.status).toBe("ASSIGNED");
      const aircraft = await prisma.aircraft.findUnique({ where: { id: allocation.aircraftId! } });
      expect(aircraft?.status).toBe("ASSIGNED");
      const crew = await prisma.crew.findUnique({ where: { id: allocation.crewId! } });
      expect(crew?.status).toBe("ASSIGNED");
    }

    const fuelAfter = await prisma.supportResource.findUnique({ where: { id: "RES-01" } });
    const fuelConsumed = recommended
      .filter((a) => a.resource?.category === "FUEL")
      .reduce((sum, a) => sum + (a.task?.requiredResourceQuantity ?? 0), 0);
    expect(fuelAfter!.availableQuantity).toBe(fuelBefore!.availableQuantity - fuelConsumed);

    await expect(applyAllocationPlan(plan.id)).rejects.toThrow(/already been applied/i);
  });

  it("10. a scenario change produces fresh recommendations", async () => {
    const versionBefore = await getDataVersion();
    const scenario = await activateScenario("weather-restriction", {});
    expect(scenario.affectedTasks.length).toBeGreaterThan(0);
    expect(await getDataVersion()).not.toBe(versionBefore);

    const plan = await generateAllocationPlan();
    const byTask = new Map(plan.allocations.map((a) => [a.taskId, a]));
    for (const affected of scenario.affectedTasks) {
      expect(byTask.get(affected.id)?.status).not.toBe("RECOMMENDED");
    }
  });

  it("10b. an unavailable aircraft forces its tasks to be replanned", async () => {
    const before = await getLatestAppliedPlan();
    const victim = before!.allocations.find((a) => a.status === "ASSIGNED" && a.aircraftId === "AC-001");
    expect(victim).toBeDefined();

    const scenario = await activateScenario("aircraft-unavailable", {});
    expect(scenario.affectedTasks.map((t) => t.id)).toContain(victim!.taskId);

    const plan = await generateAllocationPlan();
    const replacement = plan.allocations.find((a) => a.taskId === victim!.taskId);
    expect(replacement?.status).toBe("RECOMMENDED");
    expect(replacement?.aircraftId).not.toBe("AC-001");

    const applied = await applyAllocationPlan(plan.id);
    expect(applied.status).toBe("APPLIED");
  });

  it("11. reset restores the initial demonstration state", async () => {
    await updateAircraft("AC-001", { status: "UNAVAILABLE" });
    await updateCrew("CREW-001", { status: "UNAVAILABLE" });

    await resetDemoData();

    const [aircraft, crew, resources, regions, tasks, plan] = await Promise.all([
      prisma.aircraft.findMany(),
      prisma.crew.findMany(),
      prisma.supportResource.findMany(),
      prisma.simulatedRegion.findMany(),
      prisma.operationalTask.findMany(),
      getLatestAppliedPlan(),
    ]);

    expect(aircraft).toHaveLength(12);
    expect(crew).toHaveLength(18);
    expect(resources).toHaveLength(8);
    expect(regions).toHaveLength(4);
    expect(tasks).toHaveLength(13);
    expect(plan?.status).toBe("APPLIED");

    expect(aircraft.find((a) => a.id === "AC-001")?.status).toBe("ASSIGNED");
    expect(aircraft.find((a) => a.id === "AC-005")?.status).toBe("UNAVAILABLE");
    expect(tasks.find((t) => t.id === "TASK-013")?.status).toBe("COMPLETED");
    expect(tasks.find((t) => t.id === "TASK-004")?.status).toBe("BLOCKED");
    expect(tasks.find((t) => t.id === "TASK-011")?.constraintNotes).toMatch(/below the configured minimum/);

    const activity = await getActivity(1);
    expect(activity[0].eventType).toBe("DEMO_RESET");
  });
});
