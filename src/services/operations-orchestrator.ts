import { allocate, type AllocationOutcome } from "@/lib/allocation";
import { ServiceError } from "@/lib/api";
import { CLOSED_TASK_STATUSES, type TaskStatus } from "@/lib/domain";
import {
  applyPlan,
  createPlan,
  getActiveAssignments,
  getLatestAppliedPlan,
  getPlanById,
  getPrebookedAssignments,
  listPlans,
} from "@/lib/plans";
import { POLICY, regionBlockReason, isWeatherBlocked, isAirspaceBlocked } from "@/lib/policy";
import { prisma } from "@/lib/prisma";
import {
  db,
  getAircraft,
  getAircraftById,
  getActivity,
  getCrew,
  getCrewById,
  getDataVersion,
  getRegions,
  getResources,
  getTaskById,
  getTasks,
  getTasksWithRegion,
  logActivity,
  nextTaskId,
  readOperationalDataSet,
  releaseTaskAssignment,
  toAllocationInputs,
  type AircraftRow,
  type CrewRow,
  type RegionRow,
  type TaskRow,
} from "@/lib/repository";
import type { ScenarioActivateInput, TaskCreateInput, TaskUpdateInput } from "@/lib/validation";
import { seedDemoData } from "@/lib/seed";

/**
 * Operations orchestrator.
 *
 * The single place where data is read, constraints are validated, the
 * allocation engine is run and the results are turned into plans, scenario
 * changes and activity records. React components and route handlers only ever
 * call these functions.
 */

const MIN_READINESS = POLICY.minReadinessForAllocation;

/* ------------------------------------------------------------------ reads */

export async function getDashboard() {
  const now = new Date();
  const [aircraft, crew, resources, regions, tasks, activity, lastPlan] = await Promise.all([
    getAircraft(),
    getCrew(),
    getResources(),
    getRegions(),
    getTasksWithRegion(),
    getActivity(8),
    getLatestAppliedPlan(),
  ]);

  const open = tasks.filter((t) => !CLOSED_TASK_STATUSES.includes(t.status as TaskStatus));
  const count = (rows: { status: string }[], status: string) => rows.filter((r) => r.status === status).length;

  const availableAircraft = count(aircraft, "AVAILABLE");
  const assignedAircraft = count(aircraft, "ASSIGNED");
  const maintenanceAircraft = count(aircraft, "MAINTENANCE");
  const unavailableAircraft = count(aircraft, "UNAVAILABLE");

  const availableCrew = count(crew, "AVAILABLE");
  const assignedCrew = count(crew, "ASSIGNED");
  const unavailableCrew = count(crew, "UNAVAILABLE");

  const blockedTasks = open.filter((t) => t.status === "BLOCKED").length;
  const regionsById = new Map(regions.map((r) => [r.id, r]));
  const needsReplanning = open.filter(
    (t) => t.status === "BLOCKED" || regionBlockReason(t.category, regionsById.get(t.simulatedRegionId) ?? blankRegion) !== null
  ).length;

  const restrictedRegions = regions.filter((r) => r.weatherStatus === "RESTRICTED" || r.airspaceStatus === "RESTRICTED");
  const belowMinimumResources = resources.filter((r) => r.availableQuantity < r.minimumRequired);
  const activeConstraints = maintenanceAircraft + restrictedRegions.length + belowMinimumResources.length;

  const totalStrength = aircraft.length + crew.length;
  const resourceUtilisationPercent =
    totalStrength === 0 ? 0 : Math.round(((assignedAircraft + assignedCrew) / totalStrength) * 100);

  const avgReadiness =
    aircraft.length === 0 ? 0 : aircraft.reduce((sum, a) => sum + a.readinessPercentage, 0) / aircraft.length;

  // Operational readiness: a published, data-derived blend of the four things
  // that actually gate a task — airframes, crew, tasks already blocked and
  // average fleet health.
  const readinessScore = Math.round(
    100 *
      (0.45 * (aircraft.length ? availableAircraft / aircraft.length : 0) +
        0.25 * (crew.length ? availableCrew / crew.length : 0) +
        0.2 * (open.length ? 1 - blockedTasks / open.length : 1) +
        0.1 * (avgReadiness / 100))
  );
  const readinessBand = readinessScore >= 85 ? "READY" : readinessScore >= 65 ? "DEGRADED" : "CONSTRAINED";

  const CATEGORIES = ["TRANSPORT", "ROTARY", "SURVEILLANCE", "TRAINER"];
  const aircraftChart = CATEGORIES.map((category) => {
    const rows = aircraft.filter((a) => a.category === category);
    return {
      category,
      available: rows.filter((r) => r.status === "AVAILABLE").length,
      assigned: rows.filter((r) => r.status === "ASSIGNED").length,
      maintenance: rows.filter((r) => r.status === "MAINTENANCE").length,
      unavailable: rows.filter((r) => r.status === "UNAVAILABLE").length,
    };
  });

  const taskBreakdown = ["PENDING", "RECOMMENDED", "ASSIGNED", "BLOCKED", "COMPLETED", "CANCELLED"].map((status) => ({
    status,
    count: tasks.filter((t) => t.status === status).length,
  }));

  const inHours = (h: number) => new Date(now.getTime() + h * 3600_000);
  const timeline = [
    ...aircraft
      .filter((a) => a.status === "MAINTENANCE" && a.maintenanceCompletionAt)
      .map((a) => ({
        at: a.maintenanceCompletionAt as Date,
        kind: "MAINTENANCE" as const,
        title: `${a.id} estimated back in service`,
        detail: `${a.name} — readiness ${a.readinessPercentage}%`,
      })),
    ...regions
      .filter((r) => r.weatherStatus === "RESTRICTED")
      .map((r) => ({
        at: inHours(24),
        kind: "WEATHER" as const,
        title: `Weather review due — ${r.name}`,
        detail: `Restricted: ${POLICY.weatherRestrictedBlockedCategories.join(", ")} tasks suspended`,
      })),
    ...regions
      .filter((r) => r.airspaceStatus === "RESTRICTED")
      .map((r) => ({
        at: inHours(12),
        kind: "AIRSPACE" as const,
        title: `Airspace review due — ${r.name}`,
        detail: `Restricted: ${POLICY.airspaceRestrictedBlockedCategories.join(", ")} tasks suspended`,
      })),
    ...open
      .filter((t) => t.startsAt >= now)
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
      .slice(0, 4)
      .map((t) => ({
        at: t.startsAt,
        kind: "TASK" as const,
        title: `${t.id} window opens — ${t.title}`,
        detail: `${t.priority} · ${t.region.name}`,
      })),
  ]
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .slice(0, 8)
    .map((entry) => ({ ...entry, at: entry.at.toISOString() }));

  return {
    generatedAt: now.toISOString(),
    dataVersion: await getDataVersion(),
    metrics: {
      totalAircraft: aircraft.length,
      availableAircraft,
      assignedAircraft,
      maintenanceAircraft,
      unavailableAircraft,
      totalCrew: crew.length,
      availableCrew,
      assignedCrew,
      unavailableCrew,
      totalTasks: tasks.length,
      openTasks: open.length,
      pendingTasks: open.filter((t) => t.status === "PENDING").length,
      blockedTasks,
      needsReplanning,
      activeConstraints,
      restrictedRegions: restrictedRegions.length,
      resourcesBelowMinimum: belowMinimumResources.length,
      resourceUtilisationPercent,
    },
    readiness: {
      score: readinessScore,
      band: readinessBand,
      averageFleetReadiness: Math.round(avgReadiness),
      formula: "45% available airframes + 25% available crew + 20% unblocked tasks + 10% average fleet readiness",
    },
    aircraftChart,
    taskBreakdown,
    timeline,
    activity,
    lastPlan: lastPlan
      ? { id: lastPlan.id, generatedAt: lastPlan.generatedAt, appliedAt: lastPlan.appliedAt, status: lastPlan.status }
      : null,
  };
}

const blankRegion = { name: "unknown region", weatherStatus: "NORMAL", airspaceStatus: "OPEN" };

export async function getFleetOverview() {
  const [aircraft, crew, resources, regions, active] = await Promise.all([
    getAircraft(),
    getCrew(),
    getResources(),
    getRegions(),
    getActiveAssignments(),
  ]);
  const assignmentByTask = new Map(active.map((a) => [a.taskId, a]));
  const tasks = await getTasks();
  return {
    aircraft: aircraft.map((a) => {
      const assigned = tasks.find(
        (t) => assignmentByTask.has(t.id) && assignmentByTask.get(t.id)?.aircraftId === a.id && t.status === "ASSIGNED"
      );
      return {
        ...a,
        assignedTaskId: assigned?.id ?? null,
        assignedTaskTitle: assigned?.title ?? null,
      };
    }),
    crew,
    resources,
    regions,
    activeAssignments: active,
  };
}

export async function getTaskList() {
  const [tasks, active] = await Promise.all([getTasksWithRegion(), getActiveAssignments()]);
  const byTask = new Map(active.map((a) => [a.taskId, a]));
  return tasks.map((t) => ({
    ...t,
    assignment: byTask.get(t.id) ?? null,
  }));
}

export async function getRegionList() {
  return getRegions();
}

export async function getActivityLog(limit: number) {
  return getActivity(limit);
}

export async function getPlanList() {
  const plans = await listPlans();
  return plans.map((p) => ({ ...p, summaryParsed: safeJson(p.summary) }));
}

export async function getPlan(id: string) {
  const plan = await getPlanById(id);
  if (!plan) throw new ServiceError(`Plan ${id} was not found`, 404);
  return { ...plan, summaryParsed: safeJson(plan.summary) };
}

function safeJson(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/* ----------------------------------------------------------------- writes */

export async function updateAircraft(id: string, patch: Partial<AircraftRow> & { maintenanceCompletionAt?: Date | null }) {
  const current = await getAircraftById(id);
  if (!current) throw new ServiceError(`Aircraft ${id} was not found`, 404);

  const next = {
    status: patch.status ?? current.status,
    readinessPercentage: patch.readinessPercentage ?? current.readinessPercentage,
    turnaroundMinutes: patch.turnaroundMinutes ?? current.turnaroundMinutes,
    maintenanceCompletionAt:
      patch.maintenanceCompletionAt !== undefined ? patch.maintenanceCompletionAt : current.maintenanceCompletionAt,
    name: patch.name ?? current.name,
  };

  if (next.status === "AVAILABLE" && next.readinessPercentage < MIN_READINESS) {
    throw new ServiceError(
      `${id} cannot be set Available: its readiness (${next.readinessPercentage}%) is below the ${MIN_READINESS}% minimum. Raise readiness first.`,
      422
    );
  }
  if (next.status === "MAINTENANCE" && (!next.maintenanceCompletionAt || next.maintenanceCompletionAt.getTime() <= Date.now())) {
    throw new ServiceError(`${id} is in maintenance: an estimated completion time in the future is required.`, 422);
  }
  if (next.status !== "MAINTENANCE" && next.maintenanceCompletionAt && next.maintenanceCompletionAt.getTime() > Date.now()) {
    throw new ServiceError(
      `${id} still has a future maintenance completion estimate. Move it to Maintenance or clear the estimate.`,
      422
    );
  }
  if (next.status === "UNAVAILABLE" && next.readinessPercentage > MIN_READINESS) {
    next.readinessPercentage = Math.min(next.readinessPercentage, 25);
  }

  return prisma.$transaction(async (tx) => {
    await tx.aircraft.update({ where: { id }, data: next });
    const affected = await flagTasksForAircraft(tx, id);
    const dataVersion = await getDataVersion();
    await tx.activityLog.create({
      data: {
        eventType: "AIRCRAFT_UPDATED",
        description: `${id} updated: status ${current.status} → ${next.status}, readiness ${current.readinessPercentage}% → ${next.readinessPercentage}%, turnaround ${current.turnaroundMinutes} → ${next.turnaroundMinutes} min.${affected.length ? ` ${affected.length} task(s) flagged for review.` : ""}`,
        entityType: "Aircraft",
        entityId: id,
      },
    });
    return { aircraft: { ...current, ...next }, affectedTasks: affected, dataVersion };
  });
}

/** Re-evaluates tasks touched by an airframe change. */
async function flagTasksForAircraft(tx: typeof db, aircraftId: string): Promise<string[]> {
  const aircraft = await tx.aircraft.findUnique({ where: { id: aircraftId } });
  if (!aircraft) return [];
  const usable = ["AVAILABLE", "ASSIGNED"].includes(aircraft.status) && aircraft.readinessPercentage >= MIN_READINESS;

  const plan = await tx.allocationPlan.findFirst({ where: { status: "APPLIED" }, orderBy: { appliedAt: "desc" } });
  const assignedHere = plan
    ? (await tx.allocation.findMany({ where: { planId: plan.id, aircraftId, status: "ASSIGNED" } })).map((a) => a.taskId)
    : [];

  const candidates = assignedHere.length
    ? await tx.operationalTask.findMany({ where: { id: { in: assignedHere }, status: "ASSIGNED" } })
    : [];

  if (usable || candidates.length === 0) return [];
  const flagged: string[] = [];
  for (const task of candidates) {
    await releaseTaskAssignment(tx, task.id);
    await tx.operationalTask.update({
      where: { id: task.id },
      data: { status: "PENDING", constraintNotes: `Flagged for review: assigned aircraft ${aircraftId} is now ${aircraft.status}.` },
    });
    flagged.push(task.id);
  }
  return flagged;
}

export async function updateCrew(id: string, patch: Partial<CrewRow> & { availableFrom?: Date | null }) {
  const current = await getCrewById(id);
  if (!current) throw new ServiceError(`Crew member ${id} was not found`, 404);

  const next = {
    status: patch.status ?? current.status,
    qualificationCategory: patch.qualificationCategory ?? current.qualificationCategory,
    availableFrom: patch.availableFrom !== undefined ? patch.availableFrom : current.availableFrom,
    displayName: patch.displayName ?? current.displayName,
  };

  if (next.status !== "AVAILABLE" && next.availableFrom && next.availableFrom.getTime() > Date.now()) {
    throw new ServiceError(
      `${id} is not available, so it cannot carry a future "available from" date. Clear the date or set the status to Available.`,
      422
    );
  }
  if (next.status === "AVAILABLE" && (!next.availableFrom || next.availableFrom.getTime() > Date.now())) {
    // availableFrom is optional; when set for an available member it must be in the past
    if (next.availableFrom) throw new ServiceError(`${id} is marked Available but its "available from" date is in the future.`, 422);
  }

  return prisma.$transaction(async (tx) => {
    await tx.crew.update({ where: { id }, data: next });
    const affected = await flagTasksForCrew(tx, id);
    const dataVersion = await getDataVersion();
    await tx.activityLog.create({
      data: {
        eventType: "CREW_UPDATED",
        description: `${id} (${next.displayName}) updated: status ${current.status} → ${next.status}, qualification ${current.qualificationCategory} → ${next.qualificationCategory}.${affected.length ? ` ${affected.length} task(s) flagged for review.` : ""}`,
        entityType: "Crew",
        entityId: id,
      },
    });
    return { crew: { ...current, ...next }, affectedTasks: affected, dataVersion };
  });
}

async function flagTasksForCrew(tx: typeof db, crewId: string): Promise<string[]> {
  const crew = await tx.crew.findUnique({ where: { id: crewId } });
  if (!crew) return [];
  const usable = ["AVAILABLE", "ASSIGNED"].includes(crew.status);
  const plan = await tx.allocationPlan.findFirst({ where: { status: "APPLIED" }, orderBy: { appliedAt: "desc" } });
  const assignedHere = plan
    ? (await tx.allocation.findMany({ where: { planId: plan.id, crewId, status: "ASSIGNED" } })).map((a) => a.taskId)
    : [];
  const candidates = assignedHere.length
    ? await tx.operationalTask.findMany({ where: { id: { in: assignedHere }, status: "ASSIGNED" } })
    : [];
  if (usable || candidates.length === 0) return [];

  const flagged: string[] = [];
  for (const task of candidates) {
    await releaseTaskAssignment(tx, task.id);
    await tx.operationalTask.update({
      where: { id: task.id },
      data: { status: "PENDING", constraintNotes: `Flagged for review: assigned crew ${crewId} is now ${crew.status}.` },
    });
    flagged.push(task.id);
  }
  return flagged;
}

export async function updateResource(id: string, patch: { availableQuantity?: number; minimumRequired?: number }) {
  const resource = await db.supportResource.findUnique({ where: { id } });
  if (!resource) throw new ServiceError(`Support resource ${id} was not found`, 404);
  const availableQuantity = patch.availableQuantity ?? resource.availableQuantity;
  const minimumRequired = patch.minimumRequired ?? resource.minimumRequired;

  return db.$transaction(async (tx) => {
    const updated = await tx.supportResource.update({
      where: { id },
      data: { availableQuantity, minimumRequired, status: availableQuantity < minimumRequired ? "LOW" : "AVAILABLE" },
    });
    await tx.activityLog.create({
      data: {
        eventType: "RESOURCE_UPDATED",
        description: `${resource.name} inventory set to ${availableQuantity} (minimum ${minimumRequired}) — status ${updated.status}.`,
        entityType: "SupportResource",
        entityId: id,
      },
    });
    return updated;
  });
}

export async function createTask(input: TaskCreateInput) {
  const region = await db.simulatedRegion.findUnique({ where: { id: input.simulatedRegionId } });
  if (!region) throw new ServiceError(`Simulated region ${input.simulatedRegionId} was not found`, 422);

  const id = await nextTaskId();
  const task = await db.operationalTask.create({
    data: {
      id,
      title: input.title,
      category: input.category,
      priority: input.priority,
      requiredAircraftCategory: input.requiredAircraftCategory,
      requiredCrewQualification: input.requiredCrewQualification,
      requiredResourceCategory: input.requiredResourceCategory,
      requiredResourceQuantity: input.requiredResourceQuantity,
      simulatedRegionId: input.simulatedRegionId,
      startsAt: new Date(input.startsAt),
      endsAt: new Date(input.endsAt),
      status: "PENDING",
      constraintNotes: input.constraintNotes ?? null,
    },
    include: { region: true },
  });

  await logActivity("TASK_CREATED", `${id} created: "${task.title}" (${task.priority} ${task.category}, region ${region.name}).`, "OperationalTask", id);
  return task;
}

export async function updateTask(id: string, input: TaskUpdateInput) {
  const current = await getTaskById(id);
  if (!current) throw new ServiceError(`Task ${id} was not found`, 404);

  const startsAt = input.startsAt ? new Date(input.startsAt) : current.startsAt;
  const endsAt = input.endsAt ? new Date(input.endsAt) : current.endsAt;
  if (endsAt.getTime() <= startsAt.getTime()) {
    throw new ServiceError("The end of the window must be after its start", 422);
  }
  if (input.simulatedRegionId) {
    const region = await db.simulatedRegion.findUnique({ where: { id: input.simulatedRegionId } });
    if (!region) throw new ServiceError(`Simulated region ${input.simulatedRegionId} was not found`, 422);
  }
  if (current.status === "COMPLETED" && input.status && input.status !== "COMPLETED") {
    const next = input.status;
    if (!["PENDING", "CANCELLED"].includes(next)) {
      throw new ServiceError(`A completed task can only be reopened as Pending or cancelled.`, 422);
    }
  }

  const nextStatus = input.status ?? current.status;
  const releasing = current.status === "ASSIGNED" && nextStatus !== "ASSIGNED";

  return prisma.$transaction(async (tx) => {
    if (releasing) await releaseTaskAssignment(tx, id);
    const updated = await tx.operationalTask.update({
      where: { id },
      data: {
        title: input.title ?? current.title,
        category: input.category ?? current.category,
        priority: input.priority ?? current.priority,
        requiredAircraftCategory: input.requiredAircraftCategory ?? current.requiredAircraftCategory,
        requiredCrewQualification: input.requiredCrewQualification ?? current.requiredCrewQualification,
        requiredResourceCategory: input.requiredResourceCategory ?? current.requiredResourceCategory,
        requiredResourceQuantity: input.requiredResourceQuantity ?? current.requiredResourceQuantity,
        simulatedRegionId: input.simulatedRegionId ?? current.simulatedRegionId,
        startsAt,
        endsAt,
        status: nextStatus,
        constraintNotes: input.constraintNotes !== undefined ? input.constraintNotes : current.constraintNotes,
      },
      include: { region: true },
    });
    await tx.activityLog.create({
      data: {
        eventType: nextStatus !== current.status ? "TASK_STATUS_CHANGED" : "TASK_UPDATED",
        description:
          nextStatus !== current.status
            ? `${id} status ${current.status} → ${nextStatus}.`
            : `${id} details updated.`,
        entityType: "OperationalTask",
        entityId: id,
      },
    });
    return updated;
  });
}

export async function deleteTask(id: string) {
  const current = await getTaskById(id);
  if (!current) throw new ServiceError(`Task ${id} was not found`, 404);
  await prisma.$transaction(async (tx) => {
    if (current.status === "ASSIGNED") await releaseTaskAssignment(tx, id);
    await tx.operationalTask.delete({ where: { id } });
    await tx.activityLog.create({
      data: {
        eventType: "TASK_DELETED",
        description: `${id} deleted ("${current.title}").`,
        entityType: "OperationalTask",
        entityId: id,
      },
    });
  });
  return { id };
}

/* ------------------------------------------------------------- allocation */

export async function generateAllocationPlan() {
  const data = await readOperationalDataSet();
  const openTasks = data.tasks.filter((t) => !CLOSED_TASK_STATUSES.includes(t.status as TaskStatus));
  if (openTasks.length === 0) throw new ServiceError("There are no open tasks to plan.", 422);

  const dataVersion = await getDataVersion();
  const prebooked = await getPrebookedAssignments();
  const now = new Date();
  const outcome = allocate({ now, ...toAllocationInputs(data), prebooked });
  const plan = await createPlan(dataVersion, outcome);

  await logActivity(
    "PLAN_GENERATED",
    `Plan generated from data version ${dataVersion}: ${outcome.assignments.length} recommendation(s), ${outcome.blocked.length} blocked, ${outcome.unassigned.length} unassigned.`,
    "AllocationPlan",
    plan.id
  );

  return getPlan(plan.id);
}

export async function applyAllocationPlan(id: string) {
  const applied = await applyPlan(id);
  return getPlan(applied.id);
}

/* --------------------------------------------------------------- scenarios */

export type ScenarioResult = {
  type: string;
  title: string;
  initialConditions: string[];
  changes: string[];
  affectedTasks: Array<{ id: string; title: string; priority: string; status: string; note: string }>;
  dataVersion: string;
};

export async function activateScenario(type: string, input: ScenarioActivateInput): Promise<ScenarioResult> {
  switch (type) {
    case "aircraft-unavailable":
      return scenarioAircraftUnavailable(input);
    case "weather-restriction":
      return scenarioWeatherRestriction(input);
    case "airspace-restriction":
      return scenarioAirspaceRestriction(input);
    case "maintenance-delay":
      return scenarioMaintenanceDelay(input);
    default:
      throw new ServiceError(`Unknown scenario "${type}"`, 404);
  }
}

async function scenarioAircraftUnavailable(input: ScenarioActivateInput): Promise<ScenarioResult> {
  const all = await getAircraft();
  const target = input.aircraftId
    ? all.find((a) => a.id === input.aircraftId)
    : all.find((a) => a.status === "ASSIGNED") ?? all.find((a) => a.status === "AVAILABLE");
  if (!target) throw new ServiceError("No aircraft is available to simulate this event.", 422);
  if (target.status === "UNAVAILABLE") throw new ServiceError(`${target.id} is already unavailable.`, 422);

  const committed = await commitScenario(
    async (tx) => {
      const plan = await tx.allocationPlan.findFirst({ where: { status: "APPLIED" }, orderBy: { appliedAt: "desc" } });
      const taskIds = plan
        ? (await tx.allocation.findMany({ where: { planId: plan.id, aircraftId: target.id, status: "ASSIGNED" } })).map((a) => a.taskId)
        : [];

      await tx.aircraft.update({
        where: { id: target.id },
        data: { status: "UNAVAILABLE", readinessPercentage: Math.min(target.readinessPercentage, 25) },
      });

      const affected: string[] = [];
      for (const taskId of taskIds) {
        const task = await tx.operationalTask.findUnique({ where: { id: taskId } });
        if (!task || CLOSED_TASK_STATUSES.includes(task.status as TaskStatus)) continue;
        if (task.status === "ASSIGNED") await releaseTaskAssignment(tx, taskId);
        await tx.operationalTask.update({
          where: { id: taskId },
          data: {
            status: "PENDING",
            constraintNotes: `Reassigned for review: ${target.id} became unavailable during scenario activation.`,
          },
        });
        affected.push(taskId);
      }

      await tx.activityLog.create({
        data: {
          eventType: "SCENARIO_ACTIVATED",
          description: `Scenario A — ${target.id} (${target.name}) set to Unavailable; ${affected.length} assignment(s) flagged for review.`,
          entityType: "Aircraft",
          entityId: target.id,
        },
      });

      return { affected, taskIds };
    },
    () => getDataVersion()
  );

  return {
    type: "aircraft-unavailable",
    title: "Scenario A — Aircraft becomes unavailable",
    initialConditions: [
      `${target.id} (${target.name}, ${target.category}) was ${target.status} at ${target.readinessPercentage}% readiness with a ${target.turnaroundMinutes} min turnaround.`,
      `${committed.taskIds.length} task(s) in the plan in force were assigned to it: ${committed.taskIds.join(", ") || "none"}.`,
    ],
    changes: [
      `${target.id} set to Unavailable and readiness capped at ${Math.min(target.readinessPercentage, 25)}%.`,
      `${committed.affected.length} task(s) flagged for review and returned to Pending: ${committed.affected.join(", ") || "none"}.`,
      "Generate a revised plan to see the reassignments.",
    ],
    affectedTasks: await describeTasks(committed.affected),
    dataVersion: await getDataVersion(),
  };
}

async function scenarioWeatherRestriction(input: ScenarioActivateInput): Promise<ScenarioResult> {
  const [regions, tasks] = await Promise.all([getRegions(), getTasks()]);
  const normal = regions.filter((r) => r.weatherStatus === "NORMAL");
  const target = input.regionId ? regions.find((r) => r.id === input.regionId) : pickBusiestRegion(normal, tasks);
  if (!target) throw new ServiceError("Every simulated region is already under a weather restriction.", 422);
  if (target.weatherStatus === "RESTRICTED") throw new ServiceError(`${target.name} is already under a weather restriction.`, 422);

  const openHere = tasks.filter(
    (t) => t.simulatedRegionId === target.id && !CLOSED_TASK_STATUSES.includes(t.status as TaskStatus)
  );

  const committed = await prisma.$transaction(async (tx) => {
    await tx.simulatedRegion.update({ where: { id: target.id }, data: { weatherStatus: "RESTRICTED" } });
    const affected: string[] = [];
    for (const task of openHere.filter((t) => isWeatherBlocked(t.category))) {
      if (task.status === "ASSIGNED") await releaseTaskAssignment(tx, task.id);
      await tx.operationalTask.update({
        where: { id: task.id },
        data: {
          status: "BLOCKED",
          constraintNotes: `Blocked: weather over ${target.name} is Restricted and standing policy suspends ${task.category} tasks there.`,
        },
      });
      affected.push(task.id);
    }
    await tx.activityLog.create({
      data: {
        eventType: "SCENARIO_ACTIVATED",
        description: `Scenario B — weather over ${target.name} set to Restricted; ${affected.length} task(s) blocked by policy.`,
        entityType: "SimulatedRegion",
        entityId: target.id,
      },
    });
    return { affected };
  });

  return {
    type: "weather-restriction",
    title: "Scenario B — Weather restriction",
    initialConditions: [
      `${target.name} was Normal with ${openHere.length} open task(s).`,
      `Standing policy suspends ${POLICY.weatherRestrictedBlockedCategories.join(", ")} tasks under a weather restriction.`,
    ],
    changes: [
      `${target.name} weather set to Restricted.`,
      `${committed.affected.length} task(s) blocked: ${committed.affected.join(", ") || "none"}.`,
    ],
    affectedTasks: await describeTasks(committed.affected),
    dataVersion: await getDataVersion(),
  };
}

async function scenarioAirspaceRestriction(input: ScenarioActivateInput): Promise<ScenarioResult> {
  const [regions, tasks] = await Promise.all([getRegions(), getTasks()]);
  const openRegions = regions.filter((r) => r.airspaceStatus === "OPEN");
  const target = input.regionId ? regions.find((r) => r.id === input.regionId) : pickBusiestRegion(openRegions, tasks);
  if (!target) throw new ServiceError("Every simulated region already has restricted airspace.", 422);
  if (target.airspaceStatus === "RESTRICTED")
    throw new ServiceError(`${target.name} airspace is already restricted.`, 422);

  const openHere = tasks.filter(
    (t) => t.simulatedRegionId === target.id && !CLOSED_TASK_STATUSES.includes(t.status as TaskStatus)
  );

  const committed = await prisma.$transaction(async (tx) => {
    await tx.simulatedRegion.update({ where: { id: target.id }, data: { airspaceStatus: "RESTRICTED" } });
    const affected: string[] = [];
    for (const task of openHere.filter((t) => isAirspaceBlocked(t.category))) {
      if (task.status === "ASSIGNED") await releaseTaskAssignment(tx, task.id);
      await tx.operationalTask.update({
        where: { id: task.id },
        data: {
          status: "BLOCKED",
          constraintNotes: `Blocked: airspace over ${target.name} is Restricted and standing policy suspends ${task.category} tasks there.`,
        },
      });
      affected.push(task.id);
    }
    await tx.activityLog.create({
      data: {
        eventType: "SCENARIO_ACTIVATED",
        description: `Scenario C — airspace over ${target.name} set to Restricted; ${affected.length} task(s) blocked by policy.`,
        entityType: "SimulatedRegion",
        entityId: target.id,
      },
    });
    return { affected };
  });

  return {
    type: "airspace-restriction",
    title: "Scenario C — Airspace restriction",
    initialConditions: [
      `${target.name} airspace was Open with ${openHere.length} open task(s).`,
      `Standing policy suspends ${POLICY.airspaceRestrictedBlockedCategories.join(", ")} tasks under an airspace restriction; emergency supply is exempt.`,
    ],
    changes: [
      `${target.name} airspace set to Restricted.`,
      `${committed.affected.length} task(s) blocked: ${committed.affected.join(", ") || "none"}.`,
    ],
    affectedTasks: await describeTasks(committed.affected),
    dataVersion: await getDataVersion(),
  };
}

async function scenarioMaintenanceDelay(input: ScenarioActivateInput): Promise<ScenarioResult> {
  const all = await getAircraft();
  const target = input.aircraftId
    ? all.find((a) => a.id === input.aircraftId)
    : all.find((a) => a.status === "MAINTENANCE");
  if (!target) throw new ServiceError("No aircraft is currently under maintenance.", 422);
  if (target.status !== "MAINTENANCE")
    throw new ServiceError(`Only an aircraft under maintenance can have its estimate extended (${target.id} is ${target.status}).`, 422);

  const hours = input.hours ?? POLICY.maintenanceDelayHours;
  const now = Date.now();
  const before = target.maintenanceCompletionAt ?? new Date(now);
  const after = new Date(Math.max(before.getTime(), now) + hours * 3600_000);

  const tasks = await getTasks();
  const atRisk = tasks.filter(
    (t) =>
      t.requiredAircraftCategory === target.category &&
      !CLOSED_TASK_STATUSES.includes(t.status as TaskStatus) &&
      t.startsAt.getTime() < after.getTime()
  );

  const committed = await prisma.$transaction(async (tx) => {
    await tx.aircraft.update({
      where: { id: target.id },
      data: { maintenanceCompletionAt: after, readinessPercentage: Math.max(10, target.readinessPercentage - 15) },
    });
    const affected: string[] = [];
    for (const task of atRisk) {
      if (task.status === "ASSIGNED") await releaseTaskAssignment(tx, task.id);
      await tx.operationalTask.update({
        where: { id: task.id },
        data: {
          status: "PENDING",
          constraintNotes: `Flagged for review: ${target.id} maintenance extended to ${after.toISOString().slice(0, 16).replace("T", " ")}Z, so ${target.category} capacity is reduced before ${task.startsAt.toISOString().slice(0, 16).replace("T", " ")}Z.`,
        },
      });
      affected.push(task.id);
    }
    await tx.activityLog.create({
      data: {
        eventType: "SCENARIO_ACTIVATED",
        description: `Scenario D — ${target.id} maintenance extended by ${hours}h to ${after.toISOString()}; ${affected.length} future task(s) flagged.`,
        entityType: "Aircraft",
        entityId: target.id,
      },
    });
    return { affected };
  });

  return {
    type: "maintenance-delay",
    title: "Scenario D — Maintenance delay",
    initialConditions: [
      `${target.id} (${target.name}) is in maintenance, estimated complete ${before.toISOString()}.`,
      `${atRisk.length} ${target.category} task(s) were scheduled to start before the new estimate.`,
    ],
    changes: [
      `Estimate extended by ${hours}h to ${after.toISOString()}.`,
      `Readiness reduced to ${Math.max(10, target.readinessPercentage - 15)}%.`,
      `${committed.affected.length} future task(s) flagged for review: ${committed.affected.join(", ") || "none"}.`,
    ],
    affectedTasks: await describeTasks(committed.affected),
    dataVersion: await getDataVersion(),
  };
}

function pickBusiestRegion(regions: RegionRow[], tasks: TaskRow[]): RegionRow | undefined {
  return [...regions].sort((a, b) => {
    const load = (r: RegionRow) =>
      tasks.filter((t) => t.simulatedRegionId === r.id && !CLOSED_TASK_STATUSES.includes(t.status as TaskStatus)).length;
    const diff = load(b) - load(a);
    return diff !== 0 ? diff : a.id.localeCompare(b.id);
  })[0];
}

async function commitScenario<T>(work: (tx: typeof db) => Promise<T>, after?: () => Promise<string>): Promise<T> {
  const result = await prisma.$transaction(work);
  void after;
  return result;
}

async function describeTasks(ids: string[]) {
  if (ids.length === 0) return [];
  const tasks = await db.operationalTask.findMany({ where: { id: { in: ids } } });
  return tasks.map((t) => ({
    id: t.id,
    title: t.title,
    priority: t.priority,
    status: t.status,
    note: t.constraintNotes ?? "No constraint note recorded.",
  }));
}

/* ------------------------------------------------------------------- reset */

export async function resetDemoData() {
  await seedDemoData();
  const dataVersion = await getDataVersion();
  await logActivity("DEMO_RESET", `Demonstration state reset from the deterministic seed (data version ${dataVersion}).`, "System");
  return { reset: true, dataVersion };
}
