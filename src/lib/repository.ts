import { createHash } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import type {
  AllocationAircraft,
  AllocationCrew,
  AllocationRegion,
  AllocationResource,
  AllocationTask,
} from "./allocation";
import type { TaskStatus } from "./domain";

/**
 * Data-access layer. Everything the services need from storage goes through
 * here so the allocation engine and the orchestrator stay storage-agnostic and
 * easy to test.
 */

export const db = prisma;

export type AircraftRow = {
  id: string;
  name: string;
  category: string;
  status: string;
  readinessPercentage: number;
  turnaroundMinutes: number;
  maintenanceCompletionAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CrewRow = {
  id: string;
  displayName: string;
  qualificationCategory: string;
  status: string;
  availableFrom: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ResourceRow = {
  id: string;
  name: string;
  category: string;
  availableQuantity: number;
  minimumRequired: number;
  status: string;
  updatedAt: Date;
};

export type RegionRow = {
  id: string;
  name: string;
  weatherStatus: string;
  airspaceStatus: string;
  updatedAt: Date;
};

export type TaskRow = {
  id: string;
  title: string;
  category: string;
  priority: string;
  requiredAircraftCategory: string;
  requiredCrewQualification: string;
  requiredResourceCategory: string;
  requiredResourceQuantity: number;
  constraintNotes: string | null;
  simulatedRegionId: string;
  startsAt: Date;
  endsAt: Date;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

export const getAircraft = () => prisma.aircraft.findMany({ orderBy: { id: "asc" } }) as Promise<AircraftRow[]>;
export const getCrew = () => prisma.crew.findMany({ orderBy: { id: "asc" } }) as Promise<CrewRow[]>;
export const getResources = () =>
  prisma.supportResource.findMany({ orderBy: { id: "asc" } }) as Promise<ResourceRow[]>;
export const getRegions = () => prisma.simulatedRegion.findMany({ orderBy: { id: "asc" } }) as Promise<RegionRow[]>;
export const getTasks = () => prisma.operationalTask.findMany({ orderBy: { id: "asc" } }) as Promise<TaskRow[]>;

/** Tasks with their region attached — used by the task table and dashboard. */
export const getTasksWithRegion = () =>
  prisma.operationalTask.findMany({
    orderBy: [{ priority: "asc" }, { startsAt: "asc" }],
    include: { region: true },
  });

export const getAircraftById = (id: string) => prisma.aircraft.findUnique({ where: { id } });
export const getCrewById = (id: string) => prisma.crew.findUnique({ where: { id } });
export const getTaskById = (id: string) => prisma.operationalTask.findUnique({ where: { id }, include: { region: true } });

/**
 * Fingerprint of the whole operational dataset. Any write changes it, so a plan
 * carrying an older fingerprint can be recognised as stale and refused.
 */
export async function getDataVersion(): Promise<string> {
  const [aircraft, crew, resources, regions, tasks] = await Promise.all([
    prisma.aircraft.aggregate({ _count: true, _max: { updatedAt: true } }),
    prisma.crew.aggregate({ _count: true, _max: { updatedAt: true } }),
    prisma.supportResource.aggregate({ _count: true, _max: { updatedAt: true } }),
    prisma.simulatedRegion.aggregate({ _count: true, _max: { updatedAt: true } }),
    prisma.operationalTask.aggregate({ _count: true, _max: { updatedAt: true } }),
  ]);

  const parts = [aircraft, crew, resources, regions, tasks].map(
    (a) => `${a._count}:${a._max.updatedAt?.getTime() ?? 0}`
  );
  return createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 12);
}

/** Everything the allocation engine needs, read in one go. */
export async function readOperationalDataSet() {
  const [aircraft, crew, resources, regions, tasks] = await Promise.all([
    getAircraft(),
    getCrew(),
    getResources(),
    getRegions(),
    getTasks(),
  ]);
  return { aircraft, crew, resources, regions, tasks };
}

export function toAllocationInputs(data: {
  aircraft: AircraftRow[];
  crew: CrewRow[];
  resources: ResourceRow[];
  regions: RegionRow[];
  tasks: TaskRow[];
}) {
  return {
    aircraft: data.aircraft as AllocationAircraft[],
    crew: data.crew as AllocationCrew[],
    resources: data.resources as AllocationResource[],
    regions: data.regions as AllocationRegion[],
    tasks: data.tasks as AllocationTask[],
  };
}

export async function logActivity(
  eventType: string,
  description: string,
  entityType?: string,
  entityId?: string
) {
  return prisma.activityLog.create({ data: { eventType, description, entityType, entityId } });
}

export const getActivity = (limit = 50) =>
  prisma.activityLog.findMany({ orderBy: { createdAt: "desc" }, take: limit });

export async function setTaskStatus(id: string, status: TaskStatus, constraintNotes?: string | null) {
  return prisma.operationalTask.update({ where: { id }, data: { status, constraintNotes } });
}

export async function nextTaskId(): Promise<string> {
  const ids = await prisma.operationalTask.findMany({ select: { id: true } });
  const highest = ids.reduce((max, { id }) => {
    const n = Number.parseInt(id.replace(/[^0-9]/g, ""), 10);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
  return `TASK-${String(highest + 1).padStart(3, "0")}`;
}

/**
 * Rolls back the resources a task is holding while it is assigned: the support
 * resource quantity is returned and the airframe/crew are released (only if no
 * other task in the plan in force still needs them). Called whenever a task
 * leaves the ASSIGNED state, so the inventory never leaks.
 */
export async function releaseTaskAssignment(tx: Prisma.TransactionClient, taskId: string) {
  const plan = await tx.allocationPlan.findFirst({ where: { status: "APPLIED" }, orderBy: { appliedAt: "desc" } });
  if (!plan) return null;

  const allocation = await tx.allocation.findFirst({ where: { planId: plan.id, taskId, status: "ASSIGNED" } });
  if (!allocation) return null;

  const task = await tx.operationalTask.findUnique({ where: { id: taskId } });
  if (!task) return null;

  await tx.allocation.update({ where: { id: allocation.id }, data: { status: "RELEASED" } });

  if (allocation.resourceId) {
    const resource = await tx.supportResource.findUnique({ where: { id: allocation.resourceId } });
    if (resource) {
      const restored = resource.availableQuantity + task.requiredResourceQuantity;
      await tx.supportResource.update({
        where: { id: resource.id },
        data: { availableQuantity: restored, status: restored < resource.minimumRequired ? "LOW" : "AVAILABLE" },
      });
    }
  }

  const stillUsed = async (field: "aircraftId" | "crewId", value: string) => {
    const count = await tx.allocation.count({
      where: { planId: plan.id, status: "ASSIGNED", [field]: value },
    });
    return count > 0;
  };

  if (allocation.aircraftId && !(await stillUsed("aircraftId", allocation.aircraftId))) {
    await tx.aircraft.updateMany({ where: { id: allocation.aircraftId, status: "ASSIGNED" }, data: { status: "AVAILABLE" } });
  }
  if (allocation.crewId && !(await stillUsed("crewId", allocation.crewId))) {
    await tx.crew.updateMany({ where: { id: allocation.crewId, status: "ASSIGNED" }, data: { status: "AVAILABLE" } });
  }

  return allocation;
}
