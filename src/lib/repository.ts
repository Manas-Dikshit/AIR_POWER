import { createHash } from "crypto";
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
