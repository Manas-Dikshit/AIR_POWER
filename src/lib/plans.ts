import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { ServiceError } from "./errors";
import { POLICY } from "./policy";
import {
  getDataVersion,
  logActivity,
  readOperationalDataSet,
  type AircraftRow,
  type CrewRow,
  type RegionRow,
  type ResourceRow,
  type TaskRow,
} from "./repository";
import type { AllocationOutcome, PrebookedAssignment, RecommendedAssignment } from "./allocation";

/**
 * Plan store: persist a generated plan, validate it against live data, and
 * apply it atomically. This is the only place that flips task, aircraft, crew
 * and resource state based on a plan.
 */

export type PlanSummary = {
  assigned: number;
  unassigned: number;
  blocked: number;
  skipped: number;
  aircraftUtilisationPercent: number;
  crewUtilisationPercent: number;
  violations: number;
  notes: string[];
  violations_detail: AllocationOutcome["violations"];
};

const PLANNABLE = ["PENDING", "RECOMMENDED", "BLOCKED"];

export function buildSummary(outcome: AllocationOutcome): PlanSummary {
  const notes: string[] = [];
  if (outcome.assignments.length === 0) notes.push("No task could be served with the resources available.");
  if (outcome.blocked.length > 0)
    notes.push(`${outcome.blocked.length} task(s) blocked by a hard constraint (maintenance, qualification, weather, airspace or support resource).`);
  if (outcome.unassigned.length > 0)
    notes.push(`${outcome.unassigned.length} task(s) left unassigned because higher priority tasks consumed the compatible resources.`);
  if (outcome.skipped.length > 0) notes.push(`${outcome.skipped.length} task(s) were not considered (already assigned or closed).`);

  return {
    assigned: outcome.assignments.length,
    unassigned: outcome.unassigned.length,
    blocked: outcome.blocked.length,
    skipped: outcome.skipped.length,
    aircraftUtilisationPercent: outcome.utilisation.aircraft.percent,
    crewUtilisationPercent: outcome.utilisation.crew.percent,
    violations: outcome.violations.length,
    notes,
    violations_detail: outcome.violations,
  };
}

/** Persists a plan and its allocation rows in one transaction. */
export async function createPlan(dataVersion: string, outcome: AllocationOutcome) {
  const summary = buildSummary(outcome);
  const rows: Prisma.AllocationCreateManyInput[] = [
    ...outcome.assignments.map((a) => ({
      planId: "",
      taskId: a.taskId,
      aircraftId: a.aircraftId,
      crewId: a.crewId,
      resourceId: a.resourceId,
      status: a.status,
      score: a.score,
      explanation: a.explanation,
      breakdown: JSON.stringify(a.breakdown),
    })),
    ...[...outcome.blocked, ...outcome.unassigned].map((r) => ({
      planId: "",
      taskId: r.taskId,
      status: r.status,
      score: r.score,
      explanation: r.explanation,
      breakdown: null,
    })),
  ];

  return prisma.$transaction(async (tx) => {
    const plan = await tx.allocationPlan.create({
      data: { status: "GENERATED", dataVersion, summary: JSON.stringify(summary) },
    });
    if (rows.length > 0) {
      await tx.allocation.createMany({ data: rows.map((r) => ({ ...r, planId: plan.id })) });
    }
    return plan;
  });
}

export async function getLatestAppliedPlan() {
  return prisma.allocationPlan.findFirst({
    where: { status: "APPLIED" },
    orderBy: { appliedAt: "desc" },
    include: { allocations: true },
  });
}

/** Bookings still in force, so a fresh plan cannot steal them. */
export async function getPrebookedAssignments(): Promise<PrebookedAssignment[]> {
  const plan = await getLatestAppliedPlan();
  if (!plan) return [];
  const taskIds = plan.allocations.filter((a) => a.status === "ASSIGNED").map((a) => a.taskId);
  if (taskIds.length === 0) return [];
  const tasks = await prisma.operationalTask.findMany({ where: { id: { in: taskIds }, status: "ASSIGNED" } });
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const out: PrebookedAssignment[] = [];
  for (const a of plan.allocations) {
    const task = taskById.get(a.taskId);
    if (!task) continue; // task was cancelled, deleted or already replaced
    out.push({
      taskId: a.taskId,
      aircraftId: a.aircraftId,
      crewId: a.crewId,
      resourceId: a.resourceId,
      quantity: task.requiredResourceQuantity,
      start: task.startsAt,
      end: task.endsAt,
    });
  }
  return out;
}

type PlanAllocationRow = {
  taskId: string;
  aircraftId: string | null;
  crewId: string | null;
  resourceId: string | null;
  status: string;
};

/**
 * Re-checks every assignment in a plan against live data. Returns a list of
 * human-readable problems; an empty list means the plan can be applied.
 */
export function validatePlanAssignments(
  allocations: PlanAllocationRow[],
  data: { aircraft: AircraftRow[]; crew: CrewRow[]; resources: ResourceRow[]; tasks: TaskRow[] }
): string[] {
  const problems: string[] = [];
  const aircraftById = new Map(data.aircraft.map((a) => [a.id, a]));
  const crewById = new Map(data.crew.map((c) => [c.id, c]));
  const resourceById = new Map(data.resources.map((r) => [r.id, r]));
  const taskById = new Map(data.tasks.map((t) => [t.id, t]));
  const usedAircraft: Array<{ id: string; start: number; end: number }> = [];
  const usedCrew: Array<{ id: string; start: number; end: number }> = [];
  const consumed = new Map<string, number>();

  for (const a of allocations) {
    const task = taskById.get(a.taskId);
    if (!task) {
      problems.push(`Task ${a.taskId} no longer exists.`);
      continue;
    }
    if (!PLANNABLE.includes(task.status) && a.status === "RECOMMENDED") {
      problems.push(`Task ${a.taskId} is now ${task.status} and can no longer be allocated.`);
      continue;
    }
    if (a.status !== "RECOMMENDED") continue;

    const aircraft = a.aircraftId ? aircraftById.get(a.aircraftId) : undefined;
    const crew = a.crewId ? crewById.get(a.crewId) : undefined;
    const resource = a.resourceId ? resourceById.get(a.resourceId) : undefined;

    if (!aircraft) problems.push(`Aircraft ${a.aircraftId} for ${a.taskId} no longer exists.`);
    else {
      if (!["AVAILABLE", "ASSIGNED"].includes(aircraft.status))
        problems.push(`Aircraft ${aircraft.id} for ${a.taskId} is now ${aircraft.status}.`);
      if (aircraft.category !== task.requiredAircraftCategory)
        problems.push(`Aircraft ${aircraft.id} no longer matches the required category for ${a.taskId}.`);
      if (aircraft.readinessPercentage < POLICY.minReadinessForAllocation)
        problems.push(`Aircraft ${aircraft.id} fell below the ${POLICY.minReadinessForAllocation}% readiness minimum.`);
      if (aircraft.maintenanceCompletionAt && aircraft.maintenanceCompletionAt > task.startsAt)
        problems.push(`Aircraft ${aircraft.id} is still under maintenance when ${a.taskId} starts.`);
      const clash = usedAircraft.find(
        (u) => u.id === aircraft.id && u.start < task.endsAt.getTime() && task.startsAt.getTime() < u.end
      );
      if (clash) problems.push(`Aircraft ${aircraft.id} is double-booked by ${a.taskId}.`);
      else usedAircraft.push({ id: aircraft.id, start: task.startsAt.getTime(), end: task.endsAt.getTime() });
    }

    if (!crew) problems.push(`Crew ${a.crewId} for ${a.taskId} no longer exists.`);
    else {
      if (!["AVAILABLE", "ASSIGNED"].includes(crew.status))
        problems.push(`Crew ${crew.id} for ${a.taskId} is now ${crew.status}.`);
      if (crew.qualificationCategory !== task.requiredCrewQualification)
        problems.push(`Crew ${crew.id} no longer holds the qualification required by ${a.taskId}.`);
      const clash = usedCrew.find(
        (u) => u.id === crew.id && u.start < task.endsAt.getTime() && task.startsAt.getTime() < u.end
      );
      if (clash) problems.push(`Crew ${crew.id} is double-booked by ${a.taskId}.`);
      else usedCrew.push({ id: crew.id, start: task.startsAt.getTime(), end: task.endsAt.getTime() });
    }

    if (!resource) problems.push(`Support resource ${a.resourceId} for ${a.taskId} no longer exists.`);
    else {
      if (resource.status === "UNAVAILABLE") problems.push(`Support resource ${resource.name} for ${a.taskId} is unavailable.`);
      if (POLICY.resourceDeferralEnabled && resource.availableQuantity < resource.minimumRequired)
        problems.push(
          `Support resource ${resource.name} is below its configured minimum (${resource.availableQuantity} of ${resource.minimumRequired}).`
        );
      const total = (consumed.get(resource.id) ?? 0) + task.requiredResourceQuantity;
      consumed.set(resource.id, total);
      if (total > resource.availableQuantity)
        problems.push(`Support resource ${resource.name} cannot cover ${a.taskId} (needs ${total}, has ${resource.availableQuantity}).`);
    }
  }

  return problems;
}

/**
 * Applies an approved plan. Refuses stale plans and plans that no longer match
 * live data, then mutates assignments inside a single transaction.
 */
export async function applyPlan(planId: string) {
  const plan = await prisma.allocationPlan.findUnique({ where: { id: planId }, include: { allocations: true } });
  if (!plan) throw new ServiceError(`Plan ${planId} was not found`, 404);
  if (plan.status === "APPLIED") throw new ServiceError("This plan has already been applied", 409);
  if (plan.status === "SUPERSEDED")
    throw new ServiceError("This plan has been superseded by a newer plan and cannot be applied", 409);

  const currentVersion = await getDataVersion();
  if (currentVersion !== plan.dataVersion) {
    throw new ServiceError(
      "This plan is stale: operational data changed after it was generated. Generate a fresh plan before applying.",
      409,
      { planDataVersion: plan.dataVersion, currentDataVersion: currentVersion }
    );
  }

  const data = await readOperationalDataSet();
  const problems = validatePlanAssignments(plan.allocations, data);
  if (problems.length > 0) {
    throw new ServiceError(
      "This plan no longer matches current operational data and was not applied. Generate a fresh plan.",
      409,
      problems
    );
  }

  const now = new Date();
  const taskById = new Map(data.tasks.map((t) => [t.id, t]));

  return prisma.$transaction(async (tx) => {
    await tx.allocationPlan.updateMany({
      where: { status: "APPLIED", id: { not: plan.id } },
      data: { status: "SUPERSEDED" },
    });

    let applied = 0;
    let blockedRows = 0;
    let unassignedRows = 0;

    for (const allocation of plan.allocations) {
      const task = taskById.get(allocation.taskId);
      if (!task) continue;

      if (allocation.status === "RECOMMENDED") {
        await tx.allocation.update({ where: { id: allocation.id }, data: { status: "ASSIGNED" } });
        await tx.operationalTask.update({
          where: { id: task.id },
          data: { status: "ASSIGNED", constraintNotes: null },
        });
        if (allocation.aircraftId)
          await tx.aircraft.update({ where: { id: allocation.aircraftId }, data: { status: "ASSIGNED" } });
        if (allocation.crewId) await tx.crew.update({ where: { id: allocation.crewId }, data: { status: "ASSIGNED" } });
        if (allocation.resourceId) {
          const resource = await tx.supportResource.findUnique({ where: { id: allocation.resourceId } });
          if (resource) {
            const remaining = Math.max(0, resource.availableQuantity - task.requiredResourceQuantity);
            await tx.supportResource.update({
              where: { id: resource.id },
              data: { availableQuantity: remaining, status: remaining < resource.minimumRequired ? "LOW" : "AVAILABLE" },
            });
          }
        }
        applied += 1;
      } else if (PLANNABLE.includes(task.status)) {
        const nextStatus = allocation.status === "BLOCKED" ? "BLOCKED" : "PENDING";
        await tx.operationalTask.update({
          where: { id: task.id },
          data: { status: nextStatus, constraintNotes: allocation.explanation },
        });
        if (nextStatus === "BLOCKED") blockedRows += 1;
        else unassignedRows += 1;
      }
    }

    const updated = await tx.allocationPlan.update({
      where: { id: plan.id },
      data: { status: "APPLIED", appliedAt: now },
    });

    await tx.activityLog.create({
      data: {
        eventType: "PLAN_APPLIED",
        description: `Plan applied: ${applied} assignment(s), ${blockedRows} task(s) blocked, ${unassignedRows} left pending.`,
        entityType: "AllocationPlan",
        entityId: plan.id,
      },
    });

    return updated;
  });
}

const planInclude = {
  allocations: {
    orderBy: [{ status: "asc" }, { score: "desc" }],
    include: { task: { include: { region: true } }, aircraft: true, crew: true, resource: true },
  },
} satisfies Prisma.AllocationPlanInclude;

export type PlanDto = Prisma.AllocationPlanGetPayload<{ include: typeof planInclude }>;

export const listPlans = () =>
  prisma.allocationPlan.findMany({
    orderBy: { generatedAt: "desc" },
    include: planInclude,
    take: 25,
  });

export const getPlanById = (id: string) =>
  prisma.allocationPlan.findUnique({ where: { id }, include: planInclude });

/** Convenience for the UI: id/score/aircraft/crew per task. */
export function assignmentFingerprint(allocations: { taskId: string; aircraftId: string | null; crewId: string | null; status: string }[]) {
  return new Map(
    allocations
      .filter((a) => a.status === "ASSIGNED" || a.status === "RECOMMENDED")
      .map((a) => [a.taskId, `${a.aircraftId ?? "-"}/${a.crewId ?? "-"}`])
  );
}

/** The assignments in force right now, joined with task detail for the UI. */
export async function getActiveAssignments() {
  const plan = await getLatestAppliedPlan();
  if (!plan) return [];
  const tasks = await prisma.operationalTask.findMany({ include: { region: true } });
  const byId = new Map(tasks.map((t) => [t.id, t]));
  return plan.allocations
    .filter((a) => a.status === "ASSIGNED")
    .map((a) => {
      const task = byId.get(a.taskId);
      return {
        taskId: a.taskId,
        taskTitle: task?.title ?? a.taskId,
        priority: task?.priority ?? "—",
        regionName: task?.region.name ?? "—",
        aircraftId: a.aircraftId,
        crewId: a.crewId,
        resourceId: a.resourceId,
        score: a.score,
        explanation: a.explanation,
        appliedAt: plan.appliedAt,
      };
    });
}

export type { AircraftRow, CrewRow, RegionRow, ResourceRow, TaskRow };
export type { RecommendedAssignment };
