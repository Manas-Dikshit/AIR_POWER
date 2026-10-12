import { PRIORITY_RANK, PRIORITY_WEIGHT, type TaskPriority } from "./domain";
import { POLICY, regionBlockReason } from "./policy";

/**
 * Allocation engine.
 *
 * Deliberately a pure function: no database, no clock of its own (`now` is
 * injected), no randomness. Given the same inputs it returns the same plan,
 * which is what makes the recommendations explainable and testable.
 *
 * It is a greedy, priority-ordered algorithm. Each task is served, in order of
 * priority then earliest window, by the highest scoring (aircraft, crew,
 * resource) combination that satisfies every hard constraint. It is NOT
 * claimed to be globally optimal: a lower priority task that would have freed a
 * better resource may lose out. That trade-off is intentional and visible.
 */

export type AllocationAircraft = {
  id: string;
  name: string;
  category: string;
  status: string;
  readinessPercentage: number;
  turnaroundMinutes: number;
  maintenanceCompletionAt: Date | null;
};

export type AllocationCrew = {
  id: string;
  displayName: string;
  qualificationCategory: string;
  status: string;
  availableFrom: Date | null;
};

export type AllocationResource = {
  id: string;
  name: string;
  category: string;
  availableQuantity: number;
  minimumRequired: number;
  status: string;
};

export type AllocationRegion = {
  id: string;
  name: string;
  weatherStatus: string;
  airspaceStatus: string;
};

export type AllocationTask = {
  id: string;
  title: string;
  category: string;
  priority: string;
  requiredAircraftCategory: string;
  requiredCrewQualification: string;
  requiredResourceCategory: string;
  requiredResourceQuantity: number;
  simulatedRegionId: string;
  startsAt: Date;
  endsAt: Date;
  status: string;
};

export type CandidateBreakdown = {
  priority: number;
  readiness: number;
  timeWindow: number;
  efficiency: number;
};

export type RecommendedAssignment = {
  taskId: string;
  aircraftId: string;
  crewId: string;
  resourceId: string;
  status: "RECOMMENDED";
  score: number;
  breakdown: CandidateBreakdown;
  explanation: string;
};

export type RejectedTask = {
  taskId: string;
  status: "BLOCKED" | "UNASSIGNED";
  score: number;
  explanation: string;
};

export type Utilisation = {
  aircraft: { total: number; allocated: number; percent: number };
  crew: { total: number; allocated: number; percent: number };
  resources: Array<{
    id: string;
    name: string;
    category: string;
    availableQuantity: number;
    consumed: number;
    remaining: number;
  }>;
};

export type ConstraintViolation = {
  type: string;
  entityId: string;
  description: string;
};

export type AllocationOutcome = {
  assignments: RecommendedAssignment[];
  unassigned: RejectedTask[];
  blocked: RejectedTask[];
  utilisation: Utilisation;
  violations: ConstraintViolation[];
  /** Tasks untouched because their status is already terminal or already assigned. */
  skipped: Array<{ taskId: string; status: string; reason: string }>;
};

/**
 * Work already committed by the currently applied plan. Those bookings are
 * reserved before the fresh run so a replan cannot silently steal an aircraft
 * or crew member that is still flying a task we are not re-planning.
 */
export type PrebookedAssignment = {
  taskId: string;
  aircraftId: string | null;
  crewId: string | null;
  resourceId: string | null;
  quantity: number;
  start: Date;
  end: Date;
};

export type AllocationInput = {
  now: Date;
  aircraft: AllocationAircraft[];
  crew: AllocationCrew[];
  resources: AllocationResource[];
  regions: AllocationRegion[];
  tasks: AllocationTask[];
  minReadiness?: number;
  prebooked?: PrebookedAssignment[];
};

/** Statuses a fresh plan is allowed to (re)allocate. */
const PLANNABLE_STATUSES = ["PENDING", "RECOMMENDED", "BLOCKED"];

/**
 * ASSIGNED means "committed by the plan in force", not "physically broken", so
 * a replan may reuse those airframes; their existing bookings are reserved via
 * `prebooked`. MAINTENANCE and UNAVAILABLE are never allocated.
 */
const NETWORK_READY_STATUSES = ["AVAILABLE", "ASSIGNED"];

/** Weights of the transparent scoring function. They sum to 1. */
export const SCORE_WEIGHTS = {
  priority: 0.4,
  readiness: 0.2,
  timeWindow: 0.2,
  efficiency: 0.2,
} as const;

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

const minutes = (ms: number) => ms / 60000;

/** Turnaround of this many minutes or more scores zero on the time-window term. */
const TURNAROUND_HORIZON_MINUTES = 240;

function scoreFrom(b: CandidateBreakdown): number {
  const raw =
    SCORE_WEIGHTS.priority * b.priority +
    SCORE_WEIGHTS.readiness * b.readiness +
    SCORE_WEIGHTS.timeWindow * b.timeWindow +
    SCORE_WEIGHTS.efficiency * b.efficiency;
  return Math.round(clamp01(raw) * 1000) / 10; // 0..100, one decimal
}

type Interval = { start: number; end: number };

function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

function isBooked(bookings: Interval[], candidate: Interval): boolean {
  return bookings.some((b) => overlaps(b, candidate));
}

function rankTasks(tasks: AllocationTask[]): AllocationTask[] {
  return [...tasks].sort((a, b) => {
    const byPriority =
      (PRIORITY_RANK[b.priority as TaskPriority] ?? 0) - (PRIORITY_RANK[a.priority as TaskPriority] ?? 0);
    if (byPriority !== 0) return byPriority;
    const byStart = a.startsAt.getTime() - b.startsAt.getTime();
    if (byStart !== 0) return byStart;
    return a.id.localeCompare(b.id); // deterministic tie-break
  });
}

export function allocate(input: AllocationInput): AllocationOutcome {
  const minReadiness = input.minReadiness ?? POLICY.minReadinessForAllocation;
  const now = input.now.getTime();

  const regionsById = new Map(input.regions.map((r) => [r.id, r]));
  const aircraftBookings = new Map<string, Interval[]>();
  const crewBookings = new Map<string, Interval[]>();
  const remainingQuantity = new Map(input.resources.map((r) => [r.id, r.availableQuantity]));

  // Reserve what the plan in force is already flying.
  for (const pre of input.prebooked ?? []) {
    const interval = { start: pre.start.getTime(), end: pre.end.getTime() };
    if (pre.aircraftId) aircraftBookings.set(pre.aircraftId, [...(aircraftBookings.get(pre.aircraftId) ?? []), interval]);
    if (pre.crewId) crewBookings.set(pre.crewId, [...(crewBookings.get(pre.crewId) ?? []), interval]);
    if (pre.resourceId && remainingQuantity.has(pre.resourceId)) {
      remainingQuantity.set(pre.resourceId, Math.max(0, (remainingQuantity.get(pre.resourceId) ?? 0) - pre.quantity));
    }
  }

  const assignments: RecommendedAssignment[] = [];
  const blocked: RejectedTask[] = [];
  const unassigned: RejectedTask[] = [];
  const skipped: AllocationOutcome["skipped"] = [];

  const ordered = rankTasks(input.tasks);

  for (const task of ordered) {
    if (!PLANNABLE_STATUSES.includes(task.status)) {
      skipped.push({
        taskId: task.id,
        status: task.status,
        reason:
          task.status === "ASSIGNED"
            ? "Already assigned in an applied plan; not re-planned."
            : "Task is closed and was not considered.",
      });
      continue;
    }

    const region = regionsById.get(task.simulatedRegionId);
    const window: Interval = { start: task.startsAt.getTime(), end: task.endsAt.getTime() };

    // ---- Hard constraint: region must exist, weather and airspace policy ----
    if (!region) {
      blocked.push(reject(task, "BLOCKED", "Blocked: the task references an unknown operating region."));
      continue;
    }
    const regionBlock = regionBlockReason(task.category, region);
    if (regionBlock) {
      blocked.push(reject(task, "BLOCKED", `Blocked: ${regionBlock}.`));
      continue;
    }

    // ---- Stage 1: is there any aircraft of the required category at all? ----
    const sameCategory = input.aircraft.filter((a) => a.category === task.requiredAircraftCategory);
    if (sameCategory.length === 0) {
      blocked.push(
        reject(
          task,
          "BLOCKED",
          `Not recommended: no available resource matches the required category ${task.requiredAircraftCategory}.`
        )
      );
      continue;
    }

    // ---- Stage 2: aircraft that are actually usable right now ----
    const usableAircraft = sameCategory.filter((a) => isAircraftUsableNow(a, task, now, minReadiness));
    if (usableAircraft.length === 0) {
      blocked.push(reject(task, "BLOCKED", aircraftBlockReason(sameCategory, task, now, minReadiness)));
      continue;
    }

    // ---- Stage 3: qualified, available crew ----
    const qualifiedCrew = input.crew.filter((c) => c.qualificationCategory === task.requiredCrewQualification);
    if (qualifiedCrew.length === 0) {
      blocked.push(
        reject(
          task,
          "BLOCKED",
          `Blocked: no crew holds the required qualification ${task.requiredCrewQualification}.`
        )
      );
      continue;
    }
    const usableCrew = qualifiedCrew.filter((c) => isCrewUsableNow(c, task, now));
    if (usableCrew.length === 0) {
      blocked.push(
        reject(
          task,
          "BLOCKED",
          `Blocked: all ${qualifiedCrew.length} crew member(s) qualified as ${task.requiredCrewQualification} are currently unavailable.`
        )
      );
      continue;
    }

    // ---- Stage 4: support resource ----
    const sameResourceCategory = input.resources.filter((r) => r.category === task.requiredResourceCategory);
    if (sameResourceCategory.length === 0) {
      blocked.push(
        reject(task, "BLOCKED", `Deferred: no support resource of category ${task.requiredResourceCategory} is stocked.`)
      );
      continue;
    }
    const usableResources = sameResourceCategory.filter((r) => isResourceUsable(r, task, remainingQuantity, minReadiness));
    if (usableResources.length === 0) {
      blocked.push(reject(task, "BLOCKED", resourceBlockReason(sameResourceCategory, task, remainingQuantity)));
      continue;
    }

    // ---- Stage 5: everything passes, but the best resources may be booked ----
    const freeAircraft = usableAircraft.filter((a) => !isBooked(aircraftBookings.get(a.id) ?? [], window));
    const freeCrew = usableCrew.filter((c) => !isBooked(crewBookings.get(c.id) ?? [], window));
    if (freeAircraft.length === 0 || freeCrew.length === 0) {
      const which = freeAircraft.length === 0 && freeCrew.length === 0 ? "aircraft and crew" : freeAircraft.length === 0 ? "aircraft" : "crew";
      unassigned.push(
        reject(
          task,
          "UNASSIGNED",
          `Not recommended: every compatible ${which} is already committed to a higher priority task in this plan.`
        )
      );
      continue;
    }

    // ---- Score every surviving combination and take the best ----
    let best: RecommendedAssignment | null = null;
    for (const aircraft of freeAircraft) {
      for (const crew of freeCrew) {
        for (const resource of usableResources) {
          const remaining = remainingQuantity.get(resource.id) ?? 0;
          // "Resource utilisation efficiency" blends how tightly the support
          // resource fits the requirement with how evenly the airframe fleet is
          // being used, so a single aircraft is not favoured for every task.
          const resourceFit = clamp01(task.requiredResourceQuantity / Math.max(1, remaining));
          const airframeSpread = 1 / (1 + (aircraftBookings.get(aircraft.id)?.length ?? 0));
          const breakdown: CandidateBreakdown = {
            priority: PRIORITY_WEIGHT[task.priority as TaskPriority] ?? 0.25,
            readiness: clamp01(aircraft.readinessPercentage / 100),
            timeWindow: clamp01(1 - aircraft.turnaroundMinutes / TURNAROUND_HORIZON_MINUTES),
            efficiency: clamp01((resourceFit + airframeSpread) / 2),
          };
          const score = scoreFrom(breakdown);
          if (!best || betterThan(score, { aircraftId: aircraft.id, crewId: crew.id, resourceId: resource.id }, best)) {
            best = {
              taskId: task.id,
              aircraftId: aircraft.id,
              crewId: crew.id,
              resourceId: resource.id,
              status: "RECOMMENDED",
              score,
              breakdown,
              explanation: explainAssignment(task, aircraft, crew, resource, region.name, score),
            };
          }
        }
      }
    }

    if (!best) {
      unassigned.push(reject(task, "UNASSIGNED", "Not recommended: no combination of resource, crew and support satisfied all constraints."));
      continue;
    }

    // Commit the booking so later tasks cannot double-book it.
    aircraftBookings.set(best.aircraftId, [...(aircraftBookings.get(best.aircraftId) ?? []), window]);
    crewBookings.set(best.crewId, [...(crewBookings.get(best.crewId) ?? []), window]);
    remainingQuantity.set(best.resourceId, (remainingQuantity.get(best.resourceId) ?? 0) - task.requiredResourceQuantity);
    assignments.push(best);
  }

  return {
    assignments,
    unassigned,
    blocked,
    skipped,
    utilisation: buildUtilisation(input, assignments, remainingQuantity),
    violations: detectViolations(input, minReadiness),
  };
}

function reject(task: AllocationTask, status: "BLOCKED" | "UNASSIGNED", explanation: string): RejectedTask {
  return { taskId: task.id, status, score: 0, explanation };
}

function isAircraftUsableNow(a: AllocationAircraft, task: AllocationTask, now: number, minReadiness: number): boolean {
  if (!NETWORK_READY_STATUSES.includes(a.status)) return false;
  if (a.readinessPercentage < minReadiness) return false;
  return readyAt(a, now) <= task.startsAt.getTime();
}

/** The moment the aircraft could realistically be airborne again. */
function readyAt(a: AllocationAircraft, now: number): number {
  const turnaroundDone = now + a.turnaroundMinutes * 60000;
  const maintenanceDone = a.maintenanceCompletionAt?.getTime() ?? 0;
  return Math.max(turnaroundDone, maintenanceDone);
}

function aircraftBlockReason(
  sameCategory: AllocationAircraft[],
  task: AllocationTask,
  now: number,
  minReadiness: number
): string {
  const allMaintenance = sameCategory.every((a) => a.status === "MAINTENANCE");
  if (allMaintenance) {
    return `Blocked: all compatible ${task.requiredAircraftCategory} resources are currently under maintenance.`;
  }
  const timeWindowOnly =
    sameCategory.some((a) => a.status === "AVAILABLE" && a.readinessPercentage >= minReadiness) &&
    sameCategory.every((a) => !isAircraftUsableNow(a, task, now, minReadiness));
  if (timeWindowOnly) {
    const soonest = Math.min(...sameCategory.map((a) => readyAt(a, now)));
    return `Deferred: the earliest compatible ${task.requiredAircraftCategory} resource cannot meet its ${Math.round(
      minutes(soonest - now)
    )} minute turnaround/recovery time before the task window opens.`;
  }
  return `Blocked: all compatible ${task.requiredAircraftCategory} resources are unavailable or below the ${minReadiness}% readiness minimum.`;
}

function isCrewUsableNow(c: AllocationCrew, task: AllocationTask, now: number): boolean {
  if (c.status !== "AVAILABLE") return false;
  const from = c.availableFrom?.getTime() ?? now;
  return from <= task.startsAt.getTime();
}

function isResourceUsable(
  r: AllocationResource,
  task: AllocationTask,
  remaining: Map<string, number>,
  _minReadiness: number
): boolean {
  if (r.status === "UNAVAILABLE") return false;
  if ((remaining.get(r.id) ?? 0) < task.requiredResourceQuantity) return false;
  if (POLICY.resourceDeferralEnabled && r.availableQuantity < r.minimumRequired) return false;
  return true;
}

function resourceBlockReason(
  sameCategory: AllocationResource[],
  task: AllocationTask,
  remaining: Map<string, number>
): string {
  const belowMinimum = sameCategory.find((r) => r.availableQuantity < r.minimumRequired);
  if (belowMinimum && POLICY.resourceDeferralEnabled) {
    return `Deferred: the required support resource ${belowMinimum.name} is below the configured minimum (${belowMinimum.availableQuantity} of ${belowMinimum.minimumRequired}).`;
  }
  const tooSmall = sameCategory.every((r) => r.availableQuantity < task.requiredResourceQuantity);
  if (tooSmall) {
    return `Deferred: available ${task.requiredResourceCategory} holdings cannot cover the required quantity of ${task.requiredResourceQuantity}.`;
  }
  return `Not recommended: remaining ${task.requiredResourceCategory} capacity was consumed by higher priority tasks in this plan.`;
}

function betterThan(
  score: number,
  ids: { aircraftId: string; crewId: string; resourceId: string },
  best: RecommendedAssignment
): boolean {
  if (score !== best.score) return score > best.score;
  const cmp = ids.aircraftId.localeCompare(best.aircraftId);
  if (cmp !== 0) return cmp < 0;
  const crewCmp = ids.crewId.localeCompare(best.crewId);
  if (crewCmp !== 0) return crewCmp < 0;
  return ids.resourceId.localeCompare(best.resourceId) < 0;
}

function explainAssignment(
  task: AllocationTask,
  aircraft: AllocationAircraft,
  crew: AllocationCrew,
  resource: AllocationResource,
  regionName: string,
  score: number
): string {
  return (
    `Eligible: ${task.requiredAircraftCategory} resource ${aircraft.id} (readiness ${aircraft.readinessPercentage}%) ` +
    `with ${crew.qualificationCategory} qualified crew ${crew.id}, ${resource.name} drawn from ${resource.category}, ` +
    `${regionName} weather/airspace clear for ${task.category}. Turnaround ${aircraft.turnaroundMinutes}min fits the window. Score ${score}/100.`
  );
}

function buildUtilisation(
  input: AllocationInput,
  assignments: RecommendedAssignment[],
  remaining: Map<string, number>
): Utilisation {
  const pct = (used: number, total: number) => (total === 0 ? 0 : Math.round((used / total) * 100));
  const usedAircraft = new Set(assignments.map((a) => a.aircraftId));
  const usedCrew = new Set(assignments.map((a) => a.crewId));
  return {
    aircraft: { total: input.aircraft.length, allocated: usedAircraft.size, percent: pct(usedAircraft.size, input.aircraft.length) },
    crew: { total: input.crew.length, allocated: usedCrew.size, percent: pct(usedCrew.size, input.crew.length) },
    resources: input.resources.map((r) => {
      const left = remaining.get(r.id) ?? r.availableQuantity;
      return {
        id: r.id,
        name: r.name,
        category: r.category,
        availableQuantity: r.availableQuantity,
        consumed: r.availableQuantity - left,
        remaining: left,
      };
    }),
  };
}

/** Data-quality problems and standing restrictions, reported alongside the plan. */
function detectViolations(input: AllocationInput, minReadiness: number): ConstraintViolation[] {
  const out: ConstraintViolation[] = [];

  for (const a of input.aircraft) {
    if (a.status === "AVAILABLE" && a.readinessPercentage < minReadiness) {
      out.push({
        type: "READINESS_BELOW_MINIMUM",
        entityId: a.id,
        description: `${a.id} is marked available but its readiness (${a.readinessPercentage}%) is below the ${minReadiness}% allocation minimum.`,
      });
    }
  }

  for (const r of input.resources) {
    if (r.availableQuantity < r.minimumRequired) {
      out.push({
        type: "RESOURCE_BELOW_MINIMUM",
        entityId: r.id,
        description: `${r.name} is below its configured minimum (${r.availableQuantity} of ${r.minimumRequired}); dependent tasks are deferred.`,
      });
    }
  }

  for (const region of input.regions) {
    if (region.weatherStatus === "RESTRICTED") {
      out.push({
        type: "WEATHER_RESTRICTION",
        entityId: region.id,
        description: `Weather over ${region.name} is restricted; ${POLICY.weatherRestrictedBlockedCategories.join(", ")} tasks there are suspended.`,
      });
    }
    if (region.airspaceStatus === "RESTRICTED") {
      out.push({
        type: "AIRSPACE_RESTRICTION",
        entityId: region.id,
        description: `Airspace over ${region.name} is restricted; ${POLICY.airspaceRestrictedBlockedCategories.join(", ")} tasks there are suspended.`,
      });
    }
  }

  for (const t of input.tasks) {
    if (["COMPLETED", "CANCELLED"].includes(t.status)) continue;
    if (!input.aircraft.some((a) => a.category === t.requiredAircraftCategory)) {
      out.push({
        type: "FLEET_GAP",
        entityId: t.id,
        description: `${t.id} requires a ${t.requiredAircraftCategory} resource but the fleet has none of that category.`,
      });
    } else if (!input.crew.some((c) => c.qualificationCategory === t.requiredCrewQualification)) {
      out.push({
        type: "QUALIFICATION_GAP",
        entityId: t.id,
        description: `${t.id} requires ${t.requiredCrewQualification} qualified crew but none are on strength.`,
      });
    }
  }

  return out;
}
