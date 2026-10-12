import { allocate } from "./allocation";
import { applyPlan, createPlan } from "./plans";
import { prisma } from "./prisma";
import { getDataVersion, readOperationalDataSet, toAllocationInputs } from "./repository";

/**
 * Deterministic demonstration dataset.
 *
 * Ids and offsets are fixed, so every seed produces the same operational
 * picture: available and committed airframes, a maintenance float that is fully
 * occupied, a weather-restricted region, an airspace-restricted region, a task
 * with no qualified crew on strength, a task that cannot be served because a
 * support resource is below its minimum, and more high-priority tasks than
 * compatible crew.
 *
 * All identifiers, names and quantities are synthetic.
 */

const HOURS = 3600_000;

export async function seedDemoData() {
  const base = new Date();
  base.setSeconds(0, 0);
  const at = (hours: number) => new Date(base.getTime() + hours * HOURS);
  const before = (hours: number) => new Date(base.getTime() - hours * HOURS);

  await prisma.$transaction([
    prisma.allocation.deleteMany(),
    prisma.allocationPlan.deleteMany(),
    prisma.operationalTask.deleteMany(),
    prisma.aircraft.deleteMany(),
    prisma.crew.deleteMany(),
    prisma.supportResource.deleteMany(),
    prisma.simulatedRegion.deleteMany(),
    prisma.activityLog.deleteMany(),
  ]);

  await prisma.simulatedRegion.createMany({
    data: [
      { id: "REG-01", name: "Northern Corridor", weatherStatus: "NORMAL", airspaceStatus: "RESTRICTED" },
      { id: "REG-02", name: "Coastal Sector", weatherStatus: "RESTRICTED", airspaceStatus: "OPEN" },
      { id: "REG-03", name: "Central Highlands", weatherStatus: "NORMAL", airspaceStatus: "OPEN" },
      { id: "REG-04", name: "Eastern Valley", weatherStatus: "NORMAL", airspaceStatus: "OPEN" },
    ],
  });

  await prisma.aircraft.createMany({
    data: [
      { id: "AC-001", name: "Medium-lift transport A", category: "TRANSPORT", status: "AVAILABLE", readinessPercentage: 92, turnaroundMinutes: 45 },
      { id: "AC-002", name: "Medium-lift transport B", category: "TRANSPORT", status: "AVAILABLE", readinessPercentage: 86, turnaroundMinutes: 50 },
      { id: "AC-003", name: "Short-field transport C", category: "TRANSPORT", status: "AVAILABLE", readinessPercentage: 74, turnaroundMinutes: 60 },
      { id: "AC-004", name: "Short-field transport D", category: "TRANSPORT", status: "MAINTENANCE", readinessPercentage: 55, turnaroundMinutes: 120, maintenanceCompletionAt: at(36) },
      { id: "AC-005", name: "Medium-lift transport E", category: "TRANSPORT", status: "UNAVAILABLE", readinessPercentage: 30, turnaroundMinutes: 150 },
      { id: "AC-006", name: "Utility rotary A", category: "ROTARY", status: "MAINTENANCE", readinessPercentage: 85, turnaroundMinutes: 60, maintenanceCompletionAt: at(18) },
      { id: "AC-007", name: "Utility rotary B", category: "ROTARY", status: "MAINTENANCE", readinessPercentage: 52, turnaroundMinutes: 90, maintenanceCompletionAt: at(30) },
      { id: "AC-008", name: "Utility rotary C", category: "ROTARY", status: "MAINTENANCE", readinessPercentage: 40, turnaroundMinutes: 150, maintenanceCompletionAt: at(72) },
      { id: "AC-009", name: "Observation platform A", category: "SURVEILLANCE", status: "AVAILABLE", readinessPercentage: 90, turnaroundMinutes: 50 },
      { id: "AC-010", name: "Observation platform B", category: "SURVEILLANCE", status: "UNAVAILABLE", readinessPercentage: 35, turnaroundMinutes: 120 },
      { id: "AC-011", name: "Basic trainer A", category: "TRAINER", status: "AVAILABLE", readinessPercentage: 95, turnaroundMinutes: 30 },
      { id: "AC-012", name: "Basic trainer B", category: "TRAINER", status: "AVAILABLE", readinessPercentage: 72, turnaroundMinutes: 55 },
    ],
  });

  await prisma.crew.createMany({
    data: [
      { id: "CREW-001", displayName: "Pilot A. Rao", qualificationCategory: "PILOT_TRANSPORT", status: "AVAILABLE" },
      { id: "CREW-002", displayName: "Pilot B. Sethi", qualificationCategory: "PILOT_TRANSPORT", status: "AVAILABLE" },
      { id: "CREW-003", displayName: "Pilot C. Nambiar", qualificationCategory: "PILOT_TRANSPORT", status: "AVAILABLE", availableFrom: at(14) },
      { id: "CREW-004", displayName: "Pilot D. Feroz", qualificationCategory: "PILOT_TRANSPORT", status: "UNAVAILABLE" },
      { id: "CREW-005", displayName: "Pilot E. Kale", qualificationCategory: "PILOT_TRANSPORT", status: "UNAVAILABLE" },
      { id: "CREW-006", displayName: "Pilot F. Varma", qualificationCategory: "PILOT_ROTARY", status: "AVAILABLE" },
      { id: "CREW-007", displayName: "Pilot G. Ansari", qualificationCategory: "PILOT_ROTARY", status: "AVAILABLE" },
      { id: "CREW-008", displayName: "Pilot H. Pillai", qualificationCategory: "PILOT_ROTARY", status: "AVAILABLE" },
      { id: "CREW-009", displayName: "Pilot I. Bose", qualificationCategory: "PILOT_ROTARY", status: "AVAILABLE" },
      { id: "CREW-010", displayName: "Pilot J. Menon", qualificationCategory: "PILOT_TRAINER", status: "AVAILABLE" },
      { id: "CREW-011", displayName: "Pilot K. Grewal", qualificationCategory: "PILOT_TRAINER", status: "AVAILABLE" },
      { id: "CREW-012", displayName: "Pilot L. Dutta", qualificationCategory: "PILOT_TRAINER", status: "UNAVAILABLE" },
      { id: "CREW-013", displayName: "Loadmaster M. Sheikh", qualificationCategory: "LOADMASTER", status: "AVAILABLE" },
      { id: "CREW-014", displayName: "Loadmaster N. Chacko", qualificationCategory: "LOADMASTER", status: "AVAILABLE" },
      { id: "CREW-015", displayName: "Loadmaster O. Rathore", qualificationCategory: "LOADMASTER", status: "UNAVAILABLE" },
      { id: "CREW-016", displayName: "Tech P. Salvi", qualificationCategory: "MAINTENANCE_TECH", status: "AVAILABLE" },
      { id: "CREW-017", displayName: "Tech Q. Bhosale", qualificationCategory: "MAINTENANCE_TECH", status: "AVAILABLE" },
      { id: "CREW-018", displayName: "Tech R. Tandon", qualificationCategory: "MAINTENANCE_TECH", status: "UNAVAILABLE" },
    ],
  });

  await prisma.supportResource.createMany({
    data: [
      { id: "RES-01", name: "Aviation fuel — main store", category: "FUEL", availableQuantity: 120, minimumRequired: 40, status: "AVAILABLE" },
      { id: "RES-02", name: "Fuel bowser reserve", category: "FUEL", availableQuantity: 26, minimumRequired: 30, status: "LOW" },
      { id: "RES-03", name: "Line maintenance slots", category: "MAINTENANCE_CAPACITY", availableQuantity: 12, minimumRequired: 4, status: "AVAILABLE" },
      { id: "RES-04", name: "Ground support sets", category: "GROUND_SUPPORT", availableQuantity: 18, minimumRequired: 6, status: "AVAILABLE" },
      { id: "RES-05", name: "Spare parts kits", category: "SPARE_PARTS", availableQuantity: 9, minimumRequired: 3, status: "AVAILABLE" },
      { id: "RES-06", name: "Medical supply pallets", category: "MEDICAL_SUPPLY", availableQuantity: 3, minimumRequired: 5, status: "LOW" },
      { id: "RES-07", name: "De-icing fluid", category: "GROUND_SUPPORT", availableQuantity: 5, minimumRequired: 2, status: "AVAILABLE" },
      { id: "RES-08", name: "Ground power units", category: "GROUND_SUPPORT", availableQuantity: 6, minimumRequired: 2, status: "AVAILABLE" },
    ],
  });

  await prisma.operationalTask.createMany({
    data: [
      {
        id: "TASK-001",
        title: "Emergency medical resupply to highland clinic",
        category: "EMERGENCY_SUPPLY",
        priority: "CRITICAL",
        requiredAircraftCategory: "TRANSPORT",
        requiredCrewQualification: "PILOT_TRANSPORT",
        requiredResourceCategory: "FUEL",
        requiredResourceQuantity: 20,
        simulatedRegionId: "REG-03",
        startsAt: at(4),
        endsAt: at(8),
        status: "PENDING",
        constraintNotes: "Time-critical medical resupply; must not slip beyond the planned window.",
      },
      {
        id: "TASK-002",
        title: "Scheduled cargo run — northern line",
        category: "LOGISTICS",
        priority: "HIGH",
        requiredAircraftCategory: "TRANSPORT",
        requiredCrewQualification: "PILOT_TRANSPORT",
        requiredResourceCategory: "FUEL",
        requiredResourceQuantity: 25,
        simulatedRegionId: "REG-01",
        startsAt: at(6),
        endsAt: at(12),
        status: "PENDING",
        constraintNotes: "Routing depends on northern airspace availability.",
      },
      {
        id: "TASK-003",
        title: "Coastal continuation training sortie",
        category: "TRAINING",
        priority: "MEDIUM",
        requiredAircraftCategory: "TRAINER",
        requiredCrewQualification: "PILOT_TRAINER",
        requiredResourceCategory: "FUEL",
        requiredResourceQuantity: 10,
        simulatedRegionId: "REG-02",
        startsAt: at(28),
        endsAt: at(32),
        status: "PENDING",
        constraintNotes: "Weather-dependent training; can be deferred without operational impact.",
      },
      {
        id: "TASK-004",
        title: "Rotary lift for highland outpost",
        category: "TRANSPORT",
        priority: "HIGH",
        requiredAircraftCategory: "ROTARY",
        requiredCrewQualification: "PILOT_ROTARY",
        requiredResourceCategory: "FUEL",
        requiredResourceQuantity: 15,
        simulatedRegionId: "REG-04",
        startsAt: at(10),
        endsAt: at(16),
        status: "PENDING",
        constraintNotes: "Requires rotary lift; no fixed-wing substitute available.",
      },
      {
        id: "TASK-005",
        title: "Observation sweep — eastern valley",
        category: "LOGISTICS",
        priority: "MEDIUM",
        requiredAircraftCategory: "SURVEILLANCE",
        requiredCrewQualification: "PILOT_SURVEILLANCE",
        requiredResourceCategory: "GROUND_SUPPORT",
        requiredResourceQuantity: 2,
        simulatedRegionId: "REG-04",
        startsAt: at(14),
        endsAt: at(18),
        status: "PENDING",
        constraintNotes: "Requires an observation-qualified crew member.",
      },
      {
        id: "TASK-006",
        title: "Spare parts delivery to forward depot",
        category: "LOGISTICS",
        priority: "MEDIUM",
        requiredAircraftCategory: "TRANSPORT",
        requiredCrewQualification: "LOADMASTER",
        requiredResourceCategory: "SPARE_PARTS",
        requiredResourceQuantity: 4,
        simulatedRegionId: "REG-04",
        startsAt: at(26),
        endsAt: at(32),
        status: "PENDING",
        constraintNotes: "Loadmaster required to supervise pallet handling.",
      },
      {
        id: "TASK-007",
        title: "Aircrew continuation training",
        category: "TRAINING",
        priority: "LOW",
        requiredAircraftCategory: "TRAINER",
        requiredCrewQualification: "PILOT_TRAINER",
        requiredResourceCategory: "FUEL",
        requiredResourceQuantity: 8,
        simulatedRegionId: "REG-03",
        startsAt: at(30),
        endsAt: at(34),
        status: "PENDING",
        constraintNotes: "Routine currency training; lowest scheduling priority.",
      },
      {
        id: "TASK-008",
        title: "Ground equipment transfer",
        category: "LOGISTICS",
        priority: "MEDIUM",
        requiredAircraftCategory: "TRANSPORT",
        requiredCrewQualification: "PILOT_TRANSPORT",
        requiredResourceCategory: "GROUND_SUPPORT",
        requiredResourceQuantity: 6,
        simulatedRegionId: "REG-03",
        startsAt: at(6),
        endsAt: at(7),
        status: "PENDING",
        constraintNotes: "Competes with emergency resupply for transport crews.",
      },
      {
        id: "TASK-009",
        title: "Forward depot replenishment run",
        category: "LOGISTICS",
        priority: "HIGH",
        requiredAircraftCategory: "TRANSPORT",
        requiredCrewQualification: "PILOT_TRANSPORT",
        requiredResourceCategory: "FUEL",
        requiredResourceQuantity: 30,
        simulatedRegionId: "REG-03",
        startsAt: at(5),
        endsAt: at(9),
        status: "PENDING",
        constraintNotes: "High fuel uplift; verify main store before release.",
      },
      {
        id: "TASK-010",
        title: "Runway line maintenance support",
        category: "MAINTENANCE_SUPPORT",
        priority: "MEDIUM",
        requiredAircraftCategory: "TRANSPORT",
        requiredCrewQualification: "MAINTENANCE_TECH",
        requiredResourceCategory: "MAINTENANCE_CAPACITY",
        requiredResourceQuantity: 3,
        simulatedRegionId: "REG-03",
        startsAt: at(12),
        endsAt: at(18),
        status: "PENDING",
        constraintNotes: "Carries maintenance technicians and line equipment.",
      },
      {
        id: "TASK-011",
        title: "Emergency medical stores airlift",
        category: "EMERGENCY_SUPPLY",
        priority: "HIGH",
        requiredAircraftCategory: "TRANSPORT",
        requiredCrewQualification: "LOADMASTER",
        requiredResourceCategory: "MEDICAL_SUPPLY",
        requiredResourceQuantity: 2,
        simulatedRegionId: "REG-04",
        startsAt: at(34),
        endsAt: at(40),
        status: "PENDING",
        constraintNotes: "Depends on medical supply pallets being replenished above the minimum holding.",
      },
      {
        id: "TASK-012",
        title: "Command liaison transport",
        category: "TRANSPORT",
        priority: "MEDIUM",
        requiredAircraftCategory: "TRANSPORT",
        requiredCrewQualification: "PILOT_TRANSPORT",
        requiredResourceCategory: "FUEL",
        requiredResourceQuantity: 10,
        simulatedRegionId: "REG-04",
        startsAt: at(20),
        endsAt: at(24),
        status: "PENDING",
        constraintNotes: "Fixed schedule; last-minute aircraft changes are acceptable.",
      },
      {
        id: "TASK-013",
        title: "Depot audit flight",
        category: "LOGISTICS",
        priority: "LOW",
        requiredAircraftCategory: "TRANSPORT",
        requiredCrewQualification: "PILOT_TRANSPORT",
        requiredResourceCategory: "SPARE_PARTS",
        requiredResourceQuantity: 2,
        simulatedRegionId: "REG-04",
        startsAt: before(30),
        endsAt: before(26),
        status: "COMPLETED",
        constraintNotes: "Closed out after the audit report was filed.",
      },
    ],
  });

  await prisma.activityLog.createMany({
    data: [
      {
        eventType: "SCENARIO_LOADED",
        description:
          "Initial demonstration scenario loaded: 12 aircraft, 18 crew, 8 support resources, 4 simulated regions and 13 support tasks. Northern Corridor airspace is restricted and Coastal Sector weather is restricted.",
        entityType: "System",
        createdAt: before(7),
      },
      {
        eventType: "MAINTENANCE_OPENED",
        description: "Maintenance window opened for all three rotary airframes (AC-006, AC-007, AC-008); rotary lift is temporarily unavailable.",
        entityType: "Aircraft",
        entityId: "AC-006",
        createdAt: before(6),
      },
      {
        eventType: "WEATHER_ADVISORY",
        description: "Weather advisory raised for Coastal Sector (REG-02): training and transport tasks suspended by policy.",
        entityType: "SimulatedRegion",
        entityId: "REG-02",
        createdAt: before(5),
      },
      {
        eventType: "TASK_CREATED",
        description: "TASK-001 created: \"Emergency medical resupply to highland clinic\" (CRITICAL EMERGENCY_SUPPLY, region Central Highlands).",
        entityType: "OperationalTask",
        entityId: "TASK-001",
        createdAt: before(4),
      },
      {
        eventType: "AIRSPACE_NOTICE",
        description: "Airspace over Northern Corridor (REG-01) restricted: logistics and transport tasks there are suspended by policy.",
        entityType: "SimulatedRegion",
        entityId: "REG-01",
        createdAt: before(3),
      },
      {
        eventType: "RESOURCE_LOW",
        description: "Medical supply pallets (RES-06) fell to 3 against a configured minimum of 5; dependent tasks will be deferred.",
        entityType: "SupportResource",
        entityId: "RES-06",
        createdAt: before(2),
      },
      {
        eventType: "TASK_COMPLETED",
        description: "TASK-013 completed: \"Depot audit flight\".",
        entityType: "OperationalTask",
        entityId: "TASK-013",
        createdAt: before(1),
      },
    ],
  });

  // The plan in force is produced by the real engine, so the seeded world is
  // always internally consistent with the allocator.
  const dataVersion = await getDataVersion();
  const data = await readOperationalDataSet();
  const outcome = allocate({ now: base, ...toAllocationInputs(data) });
  const plan = await createPlan(dataVersion, outcome);

  await prisma.allocationPlan.update({
    where: { id: plan.id },
    data: { generatedAt: before(2), appliedAt: before(2) },
  });

  await applyPlan(plan.id);

  await prisma.activityLog.create({
    data: {
      eventType: "PLAN_GENERATED",
      description: `Initial plan generated from data version ${dataVersion}: ${outcome.assignments.length} assignment(s), ${outcome.blocked.length} blocked, ${outcome.unassigned.length} unassigned.`,
      entityType: "AllocationPlan",
      entityId: plan.id,
      createdAt: before(2),
    },
  });

  return { planId: plan.id, dataVersion };
}

export { HOURS };
