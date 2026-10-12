// Shared domain vocabulary: the single source of truth for the string values
// stored in SQLite (see prisma/schema.prisma) and used across the app.

export const AIRCRAFT_CATEGORIES = ["TRANSPORT", "ROTARY", "SURVEILLANCE", "TRAINER"] as const;
export type AircraftCategory = (typeof AIRCRAFT_CATEGORIES)[number];

export const AIRCRAFT_STATUSES = ["AVAILABLE", "ASSIGNED", "MAINTENANCE", "UNAVAILABLE"] as const;
export type AircraftStatus = (typeof AIRCRAFT_STATUSES)[number];

export const CREW_STATUSES = ["AVAILABLE", "ASSIGNED", "UNAVAILABLE"] as const;
export type CrewStatus = (typeof CREW_STATUSES)[number];

export const QUALIFICATION_CATEGORIES = [
  "PILOT_TRANSPORT",
  "PILOT_ROTARY",
  "PILOT_SURVEILLANCE",
  "PILOT_TRAINER",
  "LOADMASTER",
  "MAINTENANCE_TECH",
] as const;
export type QualificationCategory = (typeof QUALIFICATION_CATEGORIES)[number];

export const RESOURCE_CATEGORIES = [
  "FUEL",
  "MAINTENANCE_CAPACITY",
  "GROUND_SUPPORT",
  "SPARE_PARTS",
  "MEDICAL_SUPPLY",
] as const;
export type ResourceCategory = (typeof RESOURCE_CATEGORIES)[number];

export const RESOURCE_STATUSES = ["AVAILABLE", "LOW", "UNAVAILABLE"] as const;
export type ResourceStatus = (typeof RESOURCE_STATUSES)[number];

export const TASK_CATEGORIES = [
  "LOGISTICS",
  "TRANSPORT",
  "TRAINING",
  "MAINTENANCE_SUPPORT",
  "EMERGENCY_SUPPLY",
] as const;
export type TaskCategory = (typeof TASK_CATEGORIES)[number];

export const TASK_PRIORITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_STATUSES = [
  "PENDING",
  "RECOMMENDED",
  "ASSIGNED",
  "BLOCKED",
  "COMPLETED",
  "CANCELLED",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const WEATHER_STATUSES = ["NORMAL", "RESTRICTED"] as const;
export type WeatherStatus = (typeof WEATHER_STATUSES)[number];

export const AIRSPACE_STATUSES = ["OPEN", "RESTRICTED"] as const;
export type AirspaceStatus = (typeof AIRSPACE_STATUSES)[number];

export const PLAN_STATUSES = ["GENERATED", "APPLIED", "SUPERSEDED"] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

// Allocation outcomes that can be persisted against a task.
export const ALLOCATION_STATUSES = ["RECOMMENDED", "ASSIGNED", "BLOCKED", "UNASSIGNED", "RELEASED"] as const;
export type AllocationStatus = (typeof ALLOCATION_STATUSES)[number];

export const PRIORITY_RANK: Record<TaskPriority, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

/** Normalised 0..1 priority weight used by the scoring function. */
export const PRIORITY_WEIGHT: Record<TaskPriority, number> = {
  CRITICAL: 1,
  HIGH: 0.75,
  MEDIUM: 0.5,
  LOW: 0.25,
};

/** Tasks in a terminal state are never replanned. */
export const CLOSED_TASK_STATUSES: TaskStatus[] = ["COMPLETED", "CANCELLED"];

/** Aircraft that can be picked up by a fresh allocation plan. */
export const AIRCRAFT_ALLOCATABLE_STATUSES: AircraftStatus[] = ["AVAILABLE"];

export const HUMAN_LABELS: Record<string, string> = {
  TRANSPORT: "Transport",
  ROTARY: "Rotary Wing",
  SURVEILLANCE: "Surveillance",
  TRAINER: "Trainer",
  AVAILABLE: "Available",
  ASSIGNED: "Assigned",
  MAINTENANCE: "Maintenance",
  UNAVAILABLE: "Unavailable",
  LOW: "Low",
  NORMAL: "Normal",
  RESTRICTED: "Restricted",
  OPEN: "Open",
  PENDING: "Pending",
  RECOMMENDED: "Recommended",
  BLOCKED: "Blocked",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  CRITICAL: "Critical",
  HIGH: "High",
  MEDIUM: "Medium",
  LOWPRIORITY: "Low",
  LOGISTICS: "Logistics",
  TRAINING: "Training",
  MAINTENANCE_SUPPORT: "Maintenance Support",
  EMERGENCY_SUPPORT: "Emergency Supply",
  EMERGENCY_SUPPLY: "Emergency Supply",
  FUEL: "Fuel",
  MAINTENANCE_CAPACITY: "Maintenance Capacity",
  GROUND_SUPPORT: "Ground Support",
  SPARE_PARTS: "Spare Parts",
  MEDICAL_SUPPLY: "Medical Supply",
  PILOT_TRANSPORT: "Pilot — Transport",
  PILOT_ROTARY: "Pilot — Rotary",
  PILOT_SURVEILLANCE: "Pilot — Surveillance",
  PILOT_TRAINER: "Pilot — Trainer",
  LOADMASTER: "Loadmaster",
  MAINTENANCE_TECH: "Maintenance Technician",
  GENERATED: "Generated",
  APPLIED: "Applied",
  SUPERSEDED: "Superseded",
  RELEASED: "Released",
  UNASSIGNED: "Unassigned",
  WEATHER: "Weather",
  AIRSPACE: "Airspace",
  AIRCRAFT_UNAVAILABLE: "Aircraft unavailable",
  MAINTENANCE_DELAY: "Maintenance delay",
};

export function humanise(value: string | null | undefined): string {
  if (!value) return "—";
  return HUMAN_LABELS[value] ?? value;
}
