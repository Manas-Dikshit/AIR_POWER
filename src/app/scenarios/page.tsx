"use client";

import { useMemo, useState } from "react";
import { CloudRain, FlaskConical, Plane, RefreshCw, ShieldAlert, Wrench } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  LoadingState,
  StatusPill,
  TD,
  TH,
  Table,
  humanStatus,
} from "@/components/ui";
import { apiPost, notifyChanged, useApi } from "@/lib/client";
import { useToast } from "@/components/ui";
import { formatWhen } from "@/lib/format";

type RegionRow = {
  id: string;
  name: string;
  weatherStatus: string;
  airspaceStatus: string;
};

type ScenarioView = {
  dataVersion: string;
  regions: RegionRow[];
  tasks: Array<{ id: string; title: string; priority: string; status: string; category: string; constraintNotes: string | null }>;
  planInForce: { id: string; appliedAt: string; dataVersion: string } | null;
};

type ScenarioResult = {
  type: string;
  title: string;
  initialConditions: string[];
  changes: string[];
  affectedTasks: Array<{ id: string; title: string; priority: string; status: string; note: string }>;
  dataVersion: string;
};

const SCENARIOS = [
  {
    type: "aircraft-unavailable",
    title: "A · Aircraft unavailable",
    icon: Plane,
    description:
      "An airframe currently committed to the plan goes offline mid-cycle. Its tasks are flagged for review and the revised plan must find replacements.",
  },
  {
    type: "weather-restriction",
    title: "B · Weather restriction",
    icon: CloudRain,
    description:
      "A region's weather turns Restricted. Standing policy suspends the affected task categories there and the plan must route around it.",
  },
  {
    type: "airspace-restriction",
    title: "C · Airspace restriction",
    icon: ShieldAlert,
    description:
      "A region's airspace is Restricted. Affected task categories suspend there unless exempt, pushing the plan onto other regions.",
  },
  {
    type: "maintenance-delay",
    title: "D · Maintenance delay",
    icon: Wrench,
    description:
      "An airframe's maintenance overruns its estimate. Future task windows that needed its category are flagged and the plan rebalances.",
  },
] as const;

type PlanRow = {
  id: string;
  status: string;
  generatedAt: string;
  appliedAt: string | null;
  dataVersion: string;
  allocations: Array<{
    id: string;
    taskId: string;
    status: string;
    score: number;
    explanation: string;
    task: {
      id: string;
      title: string;
      priority: string;
      category: string;
      startsAt: string;
      endsAt: string;
      region: { id: string; name: string };
    };
    aircraft: { id: string; name: string } | null;
    crew: { id: string; displayName: string } | null;
    resource: { id: string; name: string } | null;
  }>;
};

const fingerprint = (row: { aircraftId?: string | null; crewId?: string | null; aircraft?: { id: string } | null; crew?: { id: string } | null }) =>
  `${row.aircraft?.id ?? row.aircraftId ?? "—"} / ${row.crew?.id ?? row.crewId ?? "—"}`;

type DiffRow = {
  taskId: string;
  title: string;
  priority: string;
  previous: string;
  revised: string;
  kind: "REASSIGNED" | "UNCHANGED" | "NEW" | "RELEASED" | "STILL";
};

export default function ScenariosPage() {
  const { data: view, error, loading, reload } = useApi<ScenarioView>("/api/scenarios");
  const { data: plans } = useApi<PlanRow[]>("/api/plans");
  const toast = useToast();

  const [activeResult, setActiveResult] = useState<ScenarioResult | null>(null);
  const [previousMap, setPreviousMap] = useState<Map<string, string>>(new Map());
  const [revisedPlan, setRevisedPlan] = useState<PlanRow | null>(null);
  const [activating, setActivating] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [confirmApply, setConfirmApply] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);

  const diff = useMemo<DiffRow[]>(() => {
    if (!revisedPlan) return [];
    const rows: DiffRow[] = [];
    for (const allocation of revisedPlan.allocations) {
      const previous = previousMap.get(allocation.taskId);
      const revised = `${allocation.aircraft?.id ?? "—"} / ${allocation.crew?.id ?? "—"}`;
      if (allocation.status === "RECOMMENDED") {
        const kind: DiffRow["kind"] = !previous ? "NEW" : previous === revised ? "UNCHANGED" : "REASSIGNED";
        rows.push({
          taskId: allocation.taskId,
          title: allocation.task.title,
          priority: allocation.task.priority,
          previous: previous ?? "—",
          revised,
          kind,
        });
      } else {
        rows.push({
          taskId: allocation.taskId,
          title: allocation.task.title,
          priority: allocation.task.priority,
          previous: previous ?? "—",
          revised: allocation.status === "BLOCKED" ? "Blocked" : "Unassigned",
          kind: previous ? "RELEASED" : "STILL",
        });
      }
    }
    return rows;
  }, [revisedPlan, previousMap]);

  if (loading) return <LoadingState label="Loading scenario workspace" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!view) return <EmptyState title="Nothing to simulate" detail="The scenario workspace returned no data." />;

  const activate = async (type: string) => {
    const snapshot = new Map<string, string>();
    const applied = plans?.find((plan) => plan.status === "APPLIED");
    for (const row of applied?.allocations ?? []) {
      if (row.status === "ASSIGNED" || row.status === "RELEASED") snapshot.set(row.taskId, fingerprint(row));
    }
    setPreviousMap(snapshot);
    setRevisedPlan(null);
    setActiveResult(null);
    setActivating(type);
    try {
      const result = await apiPost<ScenarioResult>(`/api/scenarios/${type}/activate`, {});
      setActiveResult(result);
      notifyChanged();
      toast.success(
        result.title,
        `${result.affectedTasks.length} task(s) affected. Generate a revised plan to see the reassignments.`
      );
    } catch (caught) {
      toast.error("Scenario not activated", caught instanceof Error ? caught.message : "Unexpected error");
    } finally {
      setActivating(null);
    }
  };

  const generateRevised = async () => {
    setGenerating(true);
    try {
      const plan = await apiPost<PlanRow>("/api/plans/generate");
      setRevisedPlan(plan);
      notifyChanged();
      toast.success("Revised plan generated", "Compare it against the plan that was in force, then apply when ready.");
    } catch (caught) {
      toast.error("Generation failed", caught instanceof Error ? caught.message : "Unexpected error");
    } finally {
      setGenerating(false);
    }
  };

  const applyRevised = async () => {
    if (!revisedPlan) return;
    setApplying(true);
    try {
      await apiPost(`/api/plans/${revisedPlan.id}/apply`);
      setConfirmApply(false);
      setRevisedPlan(null);
      setActiveResult(null);
      notifyChanged();
      toast.success("Revised plan applied", "The scenario response is now committed to the operational register.");
    } catch (caught) {
      setConfirmApply(false);
      toast.error("Plan not applied", caught instanceof Error ? caught.message : "Unexpected error");
    } finally {
      setApplying(false);
    }
  };

  const reset = async () => {
    setResetting(true);
    try {
      await apiPost("/api/scenarios/reset");
      setConfirmReset(false);
      setActiveResult(null);
      setRevisedPlan(null);
      setPreviousMap(new Map());
      notifyChanged();
      toast.success("Demo state reset", "The deterministic seed is restored; no scenario is active.");
    } catch (caught) {
      toast.error("Reset failed", caught instanceof Error ? caught.message : "Unexpected error");
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card variant={1}>
        <CardHeader
          icon={<FlaskConical size={18} />}
          title="Scenario simulator"
          subtitle={`What-if events against the seeded synthetic world. Data version ${view.dataVersion}${
            view.planInForce ? ` · plan in force applied ${formatWhen(view.planInForce.appliedAt)}` : " · no plan in force"
          }.`}
          actions={
            <Button variant="danger" onClick={() => setConfirmReset(true)} disabled={resetting}>
              <RefreshCw size={14} /> Reset demo data
            </Button>
          }
        />
        <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-4">
          {SCENARIOS.map((scenario) => {
            const Icon = scenario.icon;
            return (
              <div key={scenario.type} className="sketch-2 flex flex-col bg-white p-3 sketch-shadow-sm">
                <span className="mb-2 flex items-center gap-2">
                  <Icon size={18} className="text-accent" />
                  <span className="font-hand text-xl leading-none text-navy-900">{scenario.title}</span>
                </span>
                <p className="flex-1 text-xs leading-relaxed text-ink/70">{scenario.description}</p>
                <Button className="mt-3" variant="primary" disabled={activating !== null} onClick={() => activate(scenario.type)}>
                  {activating === scenario.type ? "Activating…" : "Activate"}
                </Button>
              </div>
            );
          })}
        </div>
        <div className="grid gap-2 border-t-2 border-dashed border-ink/20 px-4 py-3 text-xs text-ink/65 sm:grid-cols-3">
          <RegionPanel label="Regions" regions={view.regions} />
          <div>
            <p className="mb-1 font-hand text-lg text-navy-900">Open tasks</p>
            <p>{view.tasks.length} in the register. Scenario results flag the ones this change touches.</p>
          </div>
          <div>
            <p className="mb-1 font-hand text-lg text-navy-900">Workflow</p>
            <p>Activate a scenario → generate a revised plan → review the diff → apply it. Reset restores the seed.</p>
          </div>
        </div>
      </Card>

      {activeResult ? (
        <Card variant={2}>
          <CardHeader
            icon={<FlaskConical size={18} />}
            title={activeResult.title}
            subtitle={`Data version now ${activeResult.dataVersion} · ${activeResult.affectedTasks.length} task(s) affected`}
            actions={
              <Button variant="primary" onClick={generateRevised} disabled={generating}>
                {generating ? "Generating…" : "Generate revised plan"}
              </Button>
            }
          />
          <div className="grid gap-4 p-4 lg:grid-cols-2">
            <div>
              <p className="mb-2 border-b-2 border-ink/30 font-hand text-lg text-navy-900">Initial conditions</p>
              <ul className="space-y-1 text-xs text-ink/75">
                {activeResult.initialConditions.map((item, index) => (
                  <li key={index} className="list-inside list-disc">
                    {item}
                  </li>
                ))}
              </ul>
              <p className="mb-2 mt-4 border-b-2 border-ink/30 font-hand text-lg text-navy-900">Changes applied</p>
              <ul className="space-y-1 text-xs text-ink/75">
                {activeResult.changes.map((item, index) => (
                  <li key={index} className="list-inside list-disc">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-2 border-b-2 border-ink/30 font-hand text-lg text-navy-900">Affected tasks</p>
              {activeResult.affectedTasks.length === 0 ? (
                <p className="text-xs text-ink/60">No open task was directly affected by this scenario.</p>
              ) : (
                <ul className="space-y-2">
                  {activeResult.affectedTasks.map((task) => (
                    <li key={task.id} className="sketch-sm border-2 border-ink/50 bg-white p-2">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-hand text-lg text-navy-900">{task.id}</span>
                        <span className="text-xs">{task.title}</span>
                        <Badge tone={task.priority === "CRITICAL" ? "red" : task.priority === "HIGH" ? "amber" : "slate"}>
                          {task.priority}
                        </Badge>
                        <StatusPill value={task.status} />
                      </span>
                      <p className="mt-1 text-[11px] text-ink/65">{task.note}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Card>
      ) : null}

      {revisedPlan ? (
        <Card variant={3}>
          <CardHeader
            icon={<RefreshCw size={18} />}
            title="Revised plan vs plan in force"
            subtitle={`Generated ${formatWhen(revisedPlan.generatedAt)}. Every task in the fresh recommendation is compared with what was assigned before the scenario.`}
            actions={
              <Button variant="success" onClick={() => setConfirmApply(true)} disabled={applying}>
                {applying ? "Applying…" : "Apply revised plan"}
              </Button>
            }
          />
          {diff.length === 0 ? (
            <EmptyState title="Nothing changed" detail="The revised plan keeps the assignments exactly as they were." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <TH>Task</TH>
                  <TH>Priority</TH>
                  <TH>Previous assignment</TH>
                  <TH>Revised assignment</TH>
                  <TH>Change</TH>
                </tr>
              </thead>
              <tbody>
                {diff.map((row) => (
                  <tr key={row.taskId}>
                    <TD className="max-w-44">
                      <span className="font-hand text-lg text-navy-900">{row.taskId}</span>
                      <span className="block text-xs">{row.title}</span>
                    </TD>
                    <TD>
                      <Badge tone={row.priority === "CRITICAL" ? "red" : row.priority === "HIGH" ? "amber" : row.priority === "MEDIUM" ? "blue" : "slate"}>
                        {row.priority}
                      </Badge>
                    </TD>
                    <TD className="whitespace-nowrap text-xs">{row.previous}</TD>
                    <TD className="whitespace-nowrap text-xs font-semibold text-navy-900">{row.revised}</TD>
                    <TD>
                      <Badge
                        tone={
                          row.kind === "REASSIGNED" ? "amber" : row.kind === "NEW" ? "blue" : row.kind === "RELEASED" ? "red" : row.kind === "UNCHANGED" ? "green" : "slate"
                        }
                      >
                        {humanStatus(row.kind)}
                      </Badge>
                    </TD>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      ) : null}

      {confirmApply && revisedPlan ? (
        <ConfirmDialog
          open
          title="Apply the revised plan?"
          confirmLabel="Apply revised plan"
          busy={applying}
          message={
            <>
              Commits the scenario response: affected tasks are re-allocated to the suggested airframes and crew, and the
              previous plan is superseded. Tasks left unassigned stay pending so you can see them in the task register.
            </>
          }
          onCancel={() => setConfirmApply(false)}
          onConfirm={applyRevised}
        />
      ) : null}

      {confirmReset ? (
        <ConfirmDialog
          open
          title="Reset the whole demo?"
          tone="danger"
          confirmLabel="Reset demo data"
          busy={resetting}
          message="All aircraft, crew, resources, regions and tasks return to the deterministic seed. Plans and the activity log are wiped. This cannot be undone."
          onCancel={() => setConfirmReset(false)}
          onConfirm={reset}
        />
      ) : null}
    </div>
  );
}

function RegionPanel({ label, regions }: { label: string; regions: RegionRow[] }) {
  return (
    <div>
      <p className="mb-1 font-hand text-lg text-navy-900">{label}</p>
      <ul className="space-y-1">
        {regions.map((region) => (
          <li key={region.id} className="flex items-center justify-between gap-2 text-xs">
            <span>{region.name}</span>
            <span className="flex gap-1">
              <Badge tone={region.weatherStatus === "RESTRICTED" ? "red" : "green"}>wx {humanStatus(region.weatherStatus)}</Badge>
              <Badge tone={region.airspaceStatus === "RESTRICTED" ? "red" : "green"}>as {humanStatus(region.airspaceStatus)}</Badge>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}