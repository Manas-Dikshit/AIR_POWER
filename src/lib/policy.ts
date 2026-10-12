import type { TaskCategory } from "./domain";

/**
 * Operating policy. All thresholds that influence allocation live here so the
 * rules are auditable and easy to demonstrate. These are synthetic demo rules,
 * not real operational doctrine.
 */
export const POLICY = {
  /** Aircraft below this readiness are never allocated, even if nominally available. */
  minReadinessForAllocation: 60,

  /** A region under a weather restriction blocks these task categories. */
  weatherRestrictedBlockedCategories: ["TRAINING", "TRANSPORT"] as TaskCategory[],

  /** A region with restricted airspace blocks these task categories. */
  airspaceRestrictedBlockedCategories: ["LOGISTICS", "TRANSPORT"] as TaskCategory[],

  /** A support resource under its minimum quantity is treated as deferred. */
  resourceDeferralEnabled: true,

  /** Hours added to a maintenance estimate by the "maintenance delay" scenario. */
  maintenanceDelayHours: 12,
} as const;

export const SCENARIO_TYPES = [
  "aircraft-unavailable",
  "weather-restriction",
  "airspace-restriction",
  "maintenance-delay",
] as const;
export type ScenarioType = (typeof SCENARIO_TYPES)[number];

export function isWeatherBlocked(category: string): boolean {
  return (POLICY.weatherRestrictedBlockedCategories as string[]).includes(category);
}

export function isAirspaceBlocked(category: string): boolean {
  return (POLICY.airspaceRestrictedBlockedCategories as string[]).includes(category);
}
