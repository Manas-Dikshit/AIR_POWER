"use client";

import { useMemo, useState } from "react";
import { FilePlus2, Route, Sparkles } from "lucide-react";
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
  cn,
  toneFor,
} from "@/components/ui";
import { apiPost, notifyChanged, useApi } from "@/lib/client";
import { useToast } from "@/components/ui";
import { formatWhen } from "@/lib/format";

type AllocationRow = {
  id: string;
  taskId: string;
  status: string;
  score: number;
  explanation: string;
  breakdown: string | null;
  task: {
    id: string;
    title: string;
    category: string;
    priority: string;
    startsAt: string;
    endsAt: string;
    region: { id: string; name: string };
  };
  aircraft: { id: string; name: string; readinessPercentage: number } | null;
  crew: { id: string; displayName: string } | null;
  resource: { id: string; name: string; category: string } | null;
};

type PlanRow = {
  id: string;
  status: string;
  generatedAt: string;
  appliedAt: string | null;
  dataVersion: string;
  summaryParsed: {
    assigned: number;
    unassigned: number;
    blocked: number;
    skipped: number;
    aircraftUtilisationPercent: number;
    crewUtilisationPercent: number;
    violations: number;
    notes: string[];
  } | null;
  allocations: AllocationRow[];
};

type Breakdown = { priority: number; readiness: number; timeWindow: number; efficiency: number };

function parseBreakdown(raw: string | null): Breakdown | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" ? (value as Breakdown) : null;
  } catch {
    return null;
  }
}

const fingerprint = (row: AllocationRow) => `${row.aircraftId ?? "—"} / ${row.crewId ?? "—"}`;

type ChangeKind = "IN_FORCE" | "UNCHANGED" | "REASSIGNED" | "NEW" | "DROPPED" | "OTHER";

function changeKind(row: AllocationRow, inForce: Map<string, string>): ChangeKind {
  if (row.status === "ASSIGNED") return "IN_FORCE";
  if (row.status === "RECOMMENDED") {
    const previous = inForce.get(row.taskId);
    if (!previous) return "NEW";
    return previous === fingerprint(row) ? "UNCHANGED" : "REASSIGNED";
  }
  return inForce.has(row.taskId) ? "DROPPED" : "OTHER";
}

const CHANGE_META: Record<ChangeKind, { label: string; tone: "slate" | "green" | "amber" | "blue" | "red" }> = {
  IN_FORCE: { label: "In force", tone: "slate" },
  UNCHANGED: { label: "Unchanged", tone: "green" },
  REASSIGNED: { label: "Reassign", tone: "amber" },
  NEW: { label: "New", tone: "blue" },
  DROPPED: { label: "Released", tone: "red" },
  OTHER: { label: "—", tone: "slate" },
};

export default function PlansPage() {
  const { data: plans, error, loading, reload } = useApi<PlanRow[]>("/api/plans");
  const toast = useToast();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [confirmApply, setConfirmApply] = useState(false);

  const selected = useMemo(
    () => plans?.find((plan) => plan.id === selectedId) ?? plans?.[0] ?? null,
    [plans, selectedId]
  );

  const inForce = useMemo(() => {
    const map = new Map<string, string>();
    const applied = plans?.find((plan) => plan.status === "APPLIED");
    for (const row of applied?.allocations ?? []) {
      if (row.status === "ASSIGNED") map.set(row.taskId, fingerprint(row));
    }
    return map;
  }, [plans]);

  const rowChanges = useMemo(() => {
    if (!selected) return [];
    let reassigned = 0;
    let fresh = 0;
    let released = 0;
    for (const row of selected.allocations) {
      const kind = changeKind(row, inForce);
      if (kind === "REASSIGNED") reassigned += 1;
      else if (kind === "NEW") fresh += 1;
      else if (kind === "DROPPED") released += 1;
    }
    return { reassigned, fresh, released };
  }, [selected, inForce]);

  if (loading) return <LoadingState label="Loading allocation plans" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const generate = async () => {
    setGenerating(true);
    try {
      const plan = await apiPost<PlanRow>("/api/plans/generate");
      setSelectedId(plan.id);
      notifyChanged();
      toast.success("Plan generated", `${plan.summaryParsed?.assigned ?? 0} recommendation(s). Review it, then apply when you agree.`);
    } catch (caught) {
      toast.error("Generation failed", caught instanceof Error ? caught.message : "Unexpected error");
    } finally {
      setGenerating(false);
    }
  };

  const apply = async () => {
    if (!selected) return;
    setApplying(true);
    try {
      await apiPost(`/api/plans/${selected.id}/apply`);
      setConfirmApply(false);
      notifyChanged();
      toast.success("Plan applied", "Assignments are now committed and reflected everywhere.");
    } catch (caught) {
      setConfirmApply(false);
      toast.error("Plan not applied", caught instanceof Error ? caught.message : "Unexpected error");
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card variant={1}>
        <CardHeader
          icon={<Route size={18} />}
          title="Allocation plans"
          subtitle="Generate a plan of recommendations, review the reasoning per task, then apply it. Plans go stale the moment operational data changes."
          actions={
            <Button variant="primary" onClick={generate} disabled={generating} aria-label="Generate a new allocation plan">
              <Sparkles size={15} />
              {generating ? "Generating…" : "Generate new plan"}
            </Button>
          }
        />
        {plans && plans.length > 0 ? (
          <div className="flex flex-wrap gap-2 px-4 py-3 text-xs">
            <ExplainPill label="Recommended" value={selected?.summaryParsed?.assigned ?? 0} tone="blue" />
            <ExplainPill label="Blocked" value={selected?.summaryParsed?.blocked ?? 0} tone="red" />
            <ExplainPill label="Unassigned" value={selected?.summaryParsed?.unassigned ?? 0} tone="amber" />
            <ExplainPill
              label="Aircraft / crew utilisation"
              value={`${selected?.summaryParsed?.aircraftUtilisationPercent ?? 0}% / ${selected?.summaryParsed?.crewUtilisationPercent ?? 0}%`}
              tone="green"
            />
            <span className="inline-flex items-center gap-1 border-2 border-ink/60 bg-paper px-2 py-0.5 text-ink/70">
              Score = 40% priority + 20% readiness + 20% window fit + 20% resource efficiency
            </span>
          </div>
        ) : null}
      </Card>

      {!plans || plans.length === 0 ? (
        <Card variant={2}>
          <EmptyState
            title="No plans yet"
            detail="Generate the first plan of recommendations from the current operational data."
            action={
              <Button variant="primary" onClick={generate} disabled={generating}>
                <FilePlus2 size={15} /> Generate first plan
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[21rem_1fr] items-start">
          <Card variant={2}>
            <CardHeader title="Plan history" subtitle="Newest first. Applying a plan supersedes the previous one." />
            <ul className="divide-y divide-dashed divide-ink/20">
              {plans.map((plan, index) => (
                <li key={plan.id}>
                  <button
                    onClick={() => setSelectedId(plan.id)}
                    className={cn(
                      "block w-full px-4 py-2.5 text-left hover:bg-amber-100/40",
                      selected?.id === plan.id && "bg-amber-100/70"
                    )}
                    aria-pressed={selected?.id === plan.id}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-hand text-xl text-navy-900">
                        {plan.status === "APPLIED" ? "Plan in force" : `Plan #${plans.length - index}`}
                      </span>
                      <StatusPill value={plan.status} />
                    </span>
                    <span className="text-xs text-ink/60">
                      generated {formatWhen(plan.generatedAt)}
                      {plan.appliedAt ? ` · applied ${formatWhen(plan.appliedAt)}` : ""}
                    </span>
                    <span className="mt-1 block text-[11px] text-ink/55">
                      {plan.summaryParsed?.assigned ?? 0} recommended · {plan.summaryParsed?.blocked ?? 0} blocked ·{" "}
                      {plan.summaryParsed?.unassigned ?? 0} unassigned
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          <Card variant={3}>
            {!selected ? (
              <EmptyState title="Select a plan" detail="Pick a plan from the history to inspect its recommendations." />
            ) : (
              <>
                <CardHeader
                  title={`${selected.status === "APPLIED" ? "Plan in force" : "Recommended plan"} — ${selected.id.slice(0, 8)}`}
                  subtitle={`Generated ${formatWhen(selected.generatedAt)} · data version ${selected.dataVersion}${
                    selected.appliedAt ? ` · applied ${formatWhen(selected.appliedAt)}` : ""
                  }`}
                  actions={
                    <Button
                      variant={selected.status === "APPLIED" ? "secondary" : "success"}
                      disabled={selected.status !== "GENERATED" || applying}
                      onClick={() => setConfirmApply(true)}
                    >
                      {selected.status === "APPLIED" ? "Already applied" : applying ? "Applying…" : "Apply plan"}
                    </Button>
                  }
                />
                {selected.summaryParsed?.notes?.length ? (
                  <ul className="space-y-1 border-b-2 border-dashed border-ink/20 px-4 py-2 text-xs text-ink/70">
                    {selected.summaryParsed.notes.map((note, index) => (
                      <li key={index} className="list-inside list-disc">
                        {note}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {(rowChanges.reassigned > 0 || rowChanges.fresh > 0 || rowChanges.released > 0) && selected.status !== "APPLIED" ? (
                  <p className="border-b-2 border-dashed border-ink/20 px-4 py-2 text-xs text-ink/75">
                    vs the plan in force:{" "}
                    {rowChanges.reassigned > 0 ? (
                      <strong className="text-amber-800">{rowChanges.reassigned} reassignment(s)</strong>
                    ) : null}
                    {rowChanges.reassigned > 0 && (rowChanges.fresh > 0 || rowChanges.released > 0) ? " · " : ""}
                    {rowChanges.fresh > 0 ? <strong className="text-blue-800">{rowChanges.fresh} newly allocated</strong> : null}
                    {rowChanges.fresh > 0 && rowChanges.released > 0 ? " · " : ""}
                    {rowChanges.released > 0 ? <strong className="text-red-700">{rowChanges.released} released</strong> : null}
                  </p>
                ) : null}
                <Table>
                  <thead>
                    <tr>
                      <TH>Task</TH>
                      <TH>Priority</TH>
                      <TH>Region</TH>
                      <TH>Recommendation</TH>
                      <TH>Score</TH>
                      <TH>Change</TH>
                      <TH>Status</TH>
                      <TH>Why</TH>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.allocations.map((row) => {
                      const kind = changeKind(row, inForce);
                      const meta = CHANGE_META[kind];
                      const breakdown = parseBreakdown(row.breakdown);
                      return (
                        <tr key={row.id}>
                          <TD className="max-w-44">
                            <span className="font-hand text-lg text-navy-900">{row.task.id}</span>
                            <span className="block text-xs">{row.task.title}</span>
                          </TD>
                          <TD>
                            <Badge tone={toneFor(row.task.status)}>{row.task.priority}</Badge>
                          </TD>
                          <TD className="whitespace-nowrap text-xs">{row.task.region.name}</TD>
                          <TD className="text-xs">
                            {row.aircraft || row.crew ? (
                              <>
                                <span className="block font-semibold text-navy-900">{row.aircraft ? `${row.aircraft.id} · ${row.aircraft.name}` : "—"}</span>
                                <span className="block text-ink/65">{row.crew ? `${row.crew.id} · ${row.crew.displayName}` : "—"}</span>
                                <span className="block text-ink/55">{row.resource ? `${row.resource.name}` : "—"}</span>
                              </>
                            ) : (
                              <span className="text-ink/55">—</span>
                            )}
                          </TD>
                          <TD className="whitespace-nowrap">
                            <span className={cn("font-hand text-xl", row.score > 0 ? "text-navy-900" : "text-ink/40")}>{row.score}</span>
                            {breakdown ? (
                              <span className="block text-[10px] text-ink/50">
                                P {breakdown.priority.toFixed(2)} · R {breakdown.readiness.toFixed(2)} · W{" "}
                                {breakdown.timeWindow.toFixed(2)} · E {breakdown.efficiency.toFixed(2)}
                              </span>
                            ) : null}
                          </TD>
                          <TD>
                            <Badge tone={meta.tone}>{meta.label}</Badge>
                          </TD>
                          <TD>
                            <StatusPill value={row.status} />
                          </TD>
                          <TD className="max-w-72 text-xs text-ink/70">{row.explanation}</TD>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </>
            )}
          </Card>
        </div>
      )}

      {confirmApply && selected ? (
        <ConfirmDialog
          open
          title="Apply this plan?"
          confirmLabel="Apply plan"
          busy={applying}
          message={
            <>
              Commits{" "}
              <strong>
                {selected.summaryParsed?.assigned ?? 0} recommendation(s)
              </strong>{" "}
              to the operational register: tasks become Assigned, the airframes, crew and support holdings are reserved, and
              the current plan is superseded.
              <br />
              <br />
              If operational data changed after this plan was generated it will be refused as stale — generate a fresh plan
              in that case.
            </>
          }
          onCancel={() => setConfirmApply(false)}
          onConfirm={apply}
        />
      ) : null}
    </div>
  );
}

function ExplainPill({ label, value, tone }: { label: string; value: string | number; tone: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 border-2 border-ink/60 bg-white px-2 py-0.5">
      <span className="h-2 w-2 rounded-full bg-ink/30" style={{ borderRadius: "50%" }} />
      <span className="uppercase tracking-wide text-ink/60">{label}</span>
      <strong className={cn(tone === "blue" && "text-blue-800", tone === "red" && "text-red-700", tone === "amber" && "text-amber-800", tone === "green" && "text-emerald-800")}>
        {value}
      </strong>
    </span>
  );
}