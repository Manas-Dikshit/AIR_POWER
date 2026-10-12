import { describe, expect, it } from "vitest";
import { allocate } from "../src/lib/allocation";
import { aircraft, crew, hoursFromNow, region, resource, task, world, HOUR, NOW } from "./fixtures";

/**
 * Business rules of the allocation engine. Each test bends exactly one hard
 * constraint or scoring input and asserts the documented behaviour.
 */
describe("allocation engine", () => {
  it("1. never assigns an unavailable aircraft", () => {
    const outcome = allocate(world({ aircraft: [aircraft({ status: "UNAVAILABLE" })] }));

    expect(outcome.assignments).toHaveLength(0);
    expect(outcome.blocked[0].explanation).toMatch(/unavailable|maintenance/i);
  });

  it("1b. never assigns an aircraft below the readiness minimum", () => {
    const outcome = allocate(world({ aircraft: [aircraft({ readinessPercentage: 45 })] }));
    expect(outcome.assignments).toHaveLength(0);
    expect(outcome.blocked[0].explanation).toMatch(/readiness minimum/);
  });

  it("2. never assigns unavailable or unqualified crew", () => {
    const unqualified = allocate(world({ crew: [crew({ qualificationCategory: "PILOT_ROTARY" })] }));
    expect(unqualified.assignments).toHaveLength(0);
    expect(unqualified.blocked[0].explanation).toMatch(/no crew holds the required qualification/);

    const unavailable = allocate(world({ crew: [crew({ status: "UNAVAILABLE" })] }));
    expect(unavailable.assignments).toHaveLength(0);
    expect(unavailable.blocked[0].explanation).toMatch(/currently unavailable/);
  });

  it("2b. ignores crew who are not available inside the task window", () => {
    const outcome = allocate(world({ crew: [crew({ availableFrom: hoursFromNow(12) })] }));
    expect(outcome.assignments).toHaveLength(0);
  });

  it("3. refuses tasks that violate a hard weather or airspace constraint", () => {
    const weather = allocate(
      world({
        regions: [region({ weatherStatus: "RESTRICTED" })],
        tasks: [task({ category: "TRAINING" })],
      })
    );
    expect(weather.assignments).toHaveLength(0);
    expect(weather.blocked[0].explanation).toMatch(/weather .* is Restricted/);

    const airspace = allocate(
      world({
        regions: [region({ airspaceStatus: "RESTRICTED" })],
        tasks: [task({ category: "LOGISTICS" })],
      })
    );
    expect(airspace.assignments).toHaveLength(0);
    expect(airspace.blocked[0].explanation).toMatch(/airspace .* is Restricted/);
  });

  it("3b. still allows exempt categories inside a restricted region", () => {
    const outcome = allocate(
      world({
        regions: [region({ airspaceStatus: "RESTRICTED" })],
        tasks: [task({ category: "EMERGENCY_SUPPLY" })],
      })
    );
    expect(outcome.assignments).toHaveLength(1);
  });

  it("4. detects maintenance conflicts", () => {
    const everyAirframeInMaintenance = allocate(
      world({
        aircraft: [
          aircraft({ id: "AC-001", status: "MAINTENANCE", maintenanceCompletionAt: hoursFromNow(20) }),
          aircraft({ id: "AC-002", status: "MAINTENANCE", maintenanceCompletionAt: hoursFromNow(30) }),
        ],
      })
    );
    expect(everyAirframeInMaintenance.assignments).toHaveLength(0);
    expect(everyAirframeInMaintenance.blocked[0].explanation).toMatch(/under maintenance/);

    const backTooLate = allocate(
      world({ aircraft: [aircraft({ status: "MAINTENANCE", maintenanceCompletionAt: hoursFromNow(20) })] })
    );
    expect(backTooLate.assignments).toHaveLength(0);
  });

  it("4b. defers when no airframe can meet its turnaround before the window opens", () => {
    const outcome = allocate(
      world({
        aircraft: [aircraft({ turnaroundMinutes: 240 })],
        tasks: [task({ startsAt: hoursFromNow(1), endsAt: hoursFromNow(3) })],
      })
    );
    expect(outcome.assignments).toHaveLength(0);
    expect(outcome.blocked[0].explanation).toMatch(/turnaround/);
  });

  it("5. considers higher priority tasks before lower priority ones", () => {
    const outcome = allocate(
      world({
        tasks: [
          task({ id: "TASK-LOW", priority: "LOW", startsAt: hoursFromNow(4), endsAt: hoursFromNow(8) }),
          task({ id: "TASK-CRIT", priority: "CRITICAL", startsAt: hoursFromNow(5), endsAt: hoursFromNow(9) }),
        ],
      })
    );

    expect(outcome.assignments).toHaveLength(1);
    expect(outcome.assignments[0].taskId).toBe("TASK-CRIT");
    expect(outcome.unassigned[0].taskId).toBe("TASK-LOW");
    expect(outcome.unassigned[0].explanation).toMatch(/already committed/i);
  });

  it("5b. prefers the higher scoring combination when resources are comparable", () => {
    const outcome = allocate(
      world({
        aircraft: [
          aircraft({ id: "AC-001", readinessPercentage: 95 }),
          aircraft({ id: "AC-002", readinessPercentage: 70 }),
        ],
        crew: [crew({ id: "CREW-002" }), crew({ id: "CREW-001" })],
      })
    );
    expect(outcome.assignments[0].aircraftId).toBe("AC-001");
    expect(outcome.assignments[0].crewId).toBe("CREW-001"); // deterministic tie-break
  });

  it("6. never double-allocates a scarce support resource", () => {
    const outcome = allocate(
      world({
        resources: [resource({ availableQuantity: 5, minimumRequired: 1 })],
        aircraft: [aircraft({ id: "AC-001" }), aircraft({ id: "AC-002" })],
        crew: [crew({ id: "CREW-001" }), crew({ id: "CREW-002" })],
        tasks: [
          task({ id: "TASK-001", requiredResourceQuantity: 3, startsAt: hoursFromNow(4), endsAt: hoursFromNow(5) }),
          task({ id: "TASK-002", requiredResourceQuantity: 3, startsAt: hoursFromNow(10), endsAt: hoursFromNow(11) }),
        ],
      })
    );

    expect(outcome.assignments).toHaveLength(1);
    expect(outcome.utilisation.resources[0].consumed).toBe(3);
    expect(outcome.utilisation.resources[0].remaining).toBe(2);
    expect(outcome.blocked[0].taskId).toBe("TASK-002");
    expect(outcome.blocked[0].explanation).toMatch(/capacity was consumed|holdings/);
  });

  it("6b. defers tasks whose support resource is below its configured minimum", () => {
    const outcome = allocate(world({ resources: [resource({ availableQuantity: 2, minimumRequired: 5 })] }));
    expect(outcome.assignments).toHaveLength(0);
    expect(outcome.blocked[0].explanation).toMatch(/below the configured minimum/);
  });

  it("7. does not allocate one airframe or crew member to overlapping tasks", () => {
    const overlapping = allocate(
      world({
        tasks: [
          task({ id: "TASK-001", startsAt: hoursFromNow(4), endsAt: hoursFromNow(9) }),
          task({ id: "TASK-002", startsAt: hoursFromNow(6), endsAt: hoursFromNow(7) }),
        ],
      })
    );
    expect(overlapping.assignments).toHaveLength(1);
    expect(overlapping.unassigned[0].taskId).toBe("TASK-002");
    expect(overlapping.unassigned[0].explanation).toMatch(/aircraft and crew/);
  });

  it("7b. reuses one airframe for non-overlapping windows", () => {
    const sequential = allocate(
      world({
        tasks: [
          task({ id: "TASK-001", startsAt: hoursFromNow(4), endsAt: hoursFromNow(6) }),
          task({ id: "TASK-002", startsAt: hoursFromNow(10), endsAt: hoursFromNow(12) }),
        ],
      })
    );
    expect(sequential.assignments).toHaveLength(2);
    expect(new Set(sequential.assignments.map((a) => a.aircraftId))).toEqual(new Set(["AC-001"]));
  });

  it("reserves the plan in force so a replan cannot steal a committed airframe", () => {
    const outcome = allocate(
      world({
        prebooked: [
          {
            taskId: "TASK-000",
            aircraftId: "AC-001",
            crewId: "CREW-001",
            resourceId: "RES-01",
            quantity: 10,
            start: hoursFromNow(4),
            end: hoursFromNow(8),
          },
        ],
      })
    );
    expect(outcome.assignments).toHaveLength(0);
    expect(outcome.unassigned[0].explanation).toMatch(/already committed/);
    expect(outcome.utilisation.resources[0].remaining).toBe(90);
  });

  it("never allocates beyond the requested resource quantity and reports utilisation", () => {
    const outcome = allocate(
      world({
        tasks: [task({ requiredResourceQuantity: 30 })],
        resources: [resource({ availableQuantity: 40, minimumRequired: 5 })],
      })
    );
    expect(outcome.assignments).toHaveLength(1);
    expect(outcome.utilisation.aircraft).toEqual({ total: 1, allocated: 1, percent: 100 });
    expect(outcome.utilisation.resources[0]).toMatchObject({ availableQuantity: 40, consumed: 30, remaining: 10 });
    expect(outcome.violations).toHaveLength(0);
  });

  it("reports a fleet gap as a detected constraint violation", () => {
    const outcome = allocate(
      world({
        tasks: [task({ requiredAircraftCategory: "ROTARY", requiredCrewQualification: "PILOT_ROTARY" })],
      })
    );
    expect(outcome.assignments).toHaveLength(0);
    expect(outcome.blocked[0].explanation).toMatch(/no available resource matches the required category/);
    expect(outcome.violations.map((v) => v.type)).toContain("FLEET_GAP");
  });

  it("skips tasks that are already assigned or closed", () => {
    const outcome = allocate(
      world({
        tasks: [
          task({ id: "TASK-001", status: "ASSIGNED" }),
          task({ id: "TASK-002", status: "COMPLETED" }),
          task({ id: "TASK-003", status: "CANCELLED" }),
        ],
      })
    );
    expect(outcome.assignments).toHaveLength(0);
    expect(outcome.skipped.map((s) => s.taskId)).toEqual(["TASK-001", "TASK-002", "TASK-003"]);
  });

  it("is deterministic: identical inputs produce identical plans", () => {
    const input = world({
      aircraft: [aircraft({ id: "AC-001" }), aircraft({ id: "AC-002" })],
      crew: [crew({ id: "CREW-001" }), crew({ id: "CREW-002" })],
    });
    expect(allocate(input)).toEqual(allocate(input));
  });

  it("scores every recommendation from the documented weighted factors", () => {
    const outcome = allocate(world());
    const [assignment] = outcome.assignments;
    expect(assignment.breakdown.priority).toBe(0.5); // MEDIUM
    expect(assignment.score).toBeGreaterThan(0);
    expect(assignment.score).toBeLessThanOrEqual(100);
    expect(assignment.explanation).toContain(String(assignment.score));
    // the score is reproducible from the published breakdown
    const recomputed =
      0.4 * assignment.breakdown.priority +
      0.2 * assignment.breakdown.readiness +
      0.2 * assignment.breakdown.timeWindow +
      0.2 * assignment.breakdown.efficiency;
    expect(Math.round(recomputed * 1000) / 10).toBe(assignment.score);
  });

  it("keeps the clock injection honest", () => {
    // a task whose window already closed is still schedulable only if it starts
    // after `now`; the engine never looks at wall-clock time
    expect(allocate(world({ now: new Date(NOW.getTime() + 48 * HOUR) })).assignments).toHaveLength(0);
  });
});
