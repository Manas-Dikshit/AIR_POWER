import { z } from "zod";
import {
  AIRCRAFT_CATEGORIES,
  AIRCRAFT_STATUSES,
  AIRSPACE_STATUSES,
  CREW_STATUSES,
  QUALIFICATION_CATEGORIES,
  RESOURCE_CATEGORIES,
  RESOURCE_STATUSES,
  TASK_CATEGORIES,
  TASK_PRIORITIES,
  TASK_STATUSES,
  WEATHER_STATUSES,
} from "./domain";

const isoDate = z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Must be a valid ISO date-time");

export const aircraftPatchSchema = z
  .object({
    name: z.string().trim().min(3).max(80).optional(),
    status: z.enum(AIRCRAFT_STATUSES).optional(),
    readinessPercentage: z.number().int().min(0).max(100).optional(),
    turnaroundMinutes: z.number().int().min(5).max(720).optional(),
    maintenanceCompletionAt: isoDate.nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "At least one field must be supplied");
export type AircraftPatch = z.infer<typeof aircraftPatchSchema>;

export const crewPatchSchema = z
  .object({
    displayName: z.string().trim().min(3).max(60).optional(),
    status: z.enum(CREW_STATUSES).optional(),
    qualificationCategory: z.enum(QUALIFICATION_CATEGORIES).optional(),
    availableFrom: isoDate.nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "At least one field must be supplied");
export type CrewPatch = z.infer<typeof crewPatchSchema>;

export const resourcePatchSchema = z
  .object({
    availableQuantity: z.number().int().min(0).max(10000).optional(),
    minimumRequired: z.number().int().min(0).max(10000).optional(),
    status: z.enum(RESOURCE_STATUSES).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "At least one field must be supplied");

export const taskCreateSchema = z
  .object({
    title: z.string().trim().min(3, "Title must be at least 3 characters").max(120),
    category: z.enum(TASK_CATEGORIES),
    priority: z.enum(TASK_PRIORITIES),
    requiredAircraftCategory: z.enum(AIRCRAFT_CATEGORIES),
    requiredCrewQualification: z.enum(QUALIFICATION_CATEGORIES),
    requiredResourceCategory: z.enum(RESOURCE_CATEGORIES),
    requiredResourceQuantity: z.number().int().min(1).max(500),
    simulatedRegionId: z.string().min(1),
    startsAt: isoDate,
    endsAt: isoDate,
    constraintNotes: z.string().trim().max(400).optional().nullable(),
  })
  .refine((v) => Date.parse(v.endsAt) > Date.parse(v.startsAt), {
    message: "The end of the window must be after its start",
    path: ["endsAt"],
  });
export type TaskCreateInput = z.infer<typeof taskCreateSchema>;

export const taskUpdateSchema = z
  .object({
    title: z.string().trim().min(3).max(120).optional(),
    category: z.enum(TASK_CATEGORIES).optional(),
    priority: z.enum(TASK_PRIORITIES).optional(),
    requiredAircraftCategory: z.enum(AIRCRAFT_CATEGORIES).optional(),
    requiredCrewQualification: z.enum(QUALIFICATION_CATEGORIES).optional(),
    requiredResourceCategory: z.enum(RESOURCE_CATEGORIES).optional(),
    requiredResourceQuantity: z.number().int().min(1).max(500).optional(),
    simulatedRegionId: z.string().min(1).optional(),
    startsAt: isoDate.optional(),
    endsAt: isoDate.optional(),
    status: z.enum(TASK_STATUSES).optional(),
    constraintNotes: z.string().trim().max(400).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "At least one field must be supplied");
export type TaskUpdateInput = z.infer<typeof taskUpdateSchema>;

export const scenarioActivateSchema = z
  .object({
    aircraftId: z.string().optional(),
    regionId: z.string().optional(),
    hours: z.number().int().min(1).max(72).optional(),
  })
  .default({});
export type ScenarioActivateInput = z.infer<typeof scenarioActivateSchema>;

export const regionPatchSchema = z
  .object({
    weatherStatus: z.enum(WEATHER_STATUSES).optional(),
    airspaceStatus: z.enum(AIRSPACE_STATUSES).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "At least one field must be supplied");

export const listQuerySchema = z.object({
  q: z.string().trim().optional(),
  status: z.string().trim().optional(),
  category: z.string().trim().optional(),
  priority: z.string().trim().optional(),
});

export const activityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
