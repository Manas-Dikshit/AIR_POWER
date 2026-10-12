import type {
  AllocationAircraft,
  AllocationCrew,
  AllocationInput,
  AllocationRegion,
  AllocationResource,
  AllocationTask,
} from "../src/lib/allocation";

/**
 * Fixture builders for the allocation engine tests. Every test starts from a
 * world that can serve exactly one task, then bends one constraint.
 */

export const NOW = new Date("2026-01-01T00:00:00.000Z");
export const HOUR = 3600_000;

export const hoursFromNow = (h: number) => new Date(NOW.getTime() + h * HOUR);

export function aircraft(overrides: Partial<AllocationAircraft> = {}): AllocationAircraft {
  return {
    id: "AC-001",
    name: "Test transport",
    category: "TRANSPORT",
    status: "AVAILABLE",
    readinessPercentage: 90,
    turnaroundMinutes: 30,
    maintenanceCompletionAt: null,
    ...overrides,
  };
}

export function crew(overrides: Partial<AllocationCrew> = {}): AllocationCrew {
  return {
    id: "CREW-001",
    displayName: "Test pilot",
    qualificationCategory: "PILOT_TRANSPORT",
    status: "AVAILABLE",
    availableFrom: null,
    ...overrides,
  };
}

export function resource(overrides: Partial<AllocationResource> = {}): AllocationResource {
  return {
    id: "RES-01",
    name: "Test fuel",
    category: "FUEL",
    availableQuantity: 100,
    minimumRequired: 10,
    status: "AVAILABLE",
    ...overrides,
  };
}

export function region(overrides: Partial<AllocationRegion> = {}): AllocationRegion {
  return {
    id: "REG-01",
    name: "Test region",
    weatherStatus: "NORMAL",
    airspaceStatus: "OPEN",
    ...overrides,
  };
}

export function task(overrides: Partial<AllocationTask> = {}): AllocationTask {
  return {
    id: "TASK-001",
    title: "Test task",
    category: "LOGISTICS",
    priority: "MEDIUM",
    requiredAircraftCategory: "TRANSPORT",
    requiredCrewQualification: "PILOT_TRANSPORT",
    requiredResourceCategory: "FUEL",
    requiredResourceQuantity: 10,
    simulatedRegionId: "REG-01",
    startsAt: hoursFromNow(4),
    endsAt: hoursFromNow(8),
    status: "PENDING",
    ...overrides,
  };
}

export function world(overrides: Partial<AllocationInput> = {}): AllocationInput {
  return {
    now: NOW,
    aircraft: [aircraft()],
    crew: [crew()],
    resources: [resource()],
    regions: [region()],
    tasks: [task()],
    ...overrides,
  };
}
