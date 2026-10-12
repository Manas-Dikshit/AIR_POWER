"use client";

import { useMemo, useState } from "react";
import { ClipboardList, Pencil, Plus, Search, Trash2 } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
  Select,
  StatusPill,
  TD,
  TH,
  Table,
  Textarea,
  humanStatus,
} from "@/components/ui";
import { apiDelete, apiPatch, apiPost, notifyChanged, useApi } from "@/lib/client";
import { useToast } from "@/components/ui";
import {
  AIRCRAFT_CATEGORIES,
  QUALIFICATION_CATEGORIES,
  RESOURCE_CATEGORIES,
  TASK_CATEGORIES,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from "@/lib/domain";
import { formatWhen, humanise } from "@/lib/format";

type TaskRow = {
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
  startsAt: string;
  endsAt: string;
  status: string;
  region: { id: string; name: string; weatherStatus: string; airspaceStatus: string };
  assignment: {
    taskId: string;
    aircraftId: string | null;
    crewId: string | null;
    resourceId: string | null;
    score: number;
    explanation: string;
  } | null;
};

type RegionRow = { id: string; name: string; weatherStatus: string; airspaceStatus: string };

export default function TasksPage() {
  const { data: tasks, error, loading, reload } = useApi<TaskRow[]>("/api/tasks");
  const { data: regions } = useApi<RegionRow[]>("/api/regions");
  const toast = useToast();

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [priority, setPriority] = useState("ALL");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<TaskRow | null>(null);
  const [deleting, setDeleting] = useState<TaskRow | null>(null);

  const filtered = useMemo(() => {
    if (!tasks) return [];
    const needle = query.trim().toLowerCase();
    return tasks.filter(
      (task) =>
        (status === "ALL" || task.status === status) &&
        (priority === "ALL" || task.priority === priority) &&
        (needle.length === 0 ||
          task.id.toLowerCase().includes(needle) ||
          task.title.toLowerCase().includes(needle) ||
          task.region.name.toLowerCase().includes(needle))
    );
  }, [tasks, query, status, priority]);

  if (loading) return <LoadingState label="Loading tasks" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!tasks) return <EmptyState title="No tasks" detail="No task data returned." />;

  const summary = {
    open: tasks.filter((t) => !["COMPLETED", "CANCELLED"].includes(t.status)).length,
    blocked: tasks.filter((t) => t.status === "BLOCKED").length,
    assigned: tasks.filter((t) => t.status === "ASSIGNED").length,
  };

  return (
    <div className="space-y-4">
      <Card variant={1}>
        <CardHeader
          icon={<ClipboardList size={18} />}
          title="Support task register"
          subtitle={`${summary.open} open tasks · ${summary.blocked} blocked · ${summary.assigned} assigned (plan in force)`}
          actions={
            <>
              <div className="relative">
                <Search size={14} className="absolute left-2 top-2.5 text-ink/50" />
                <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tasks" className="w-48 pl-7" aria-label="Search tasks" />
              </div>
              <Select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter by status">
                <option value="ALL">All statuses</option>
                {TASK_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {humanStatus(value)}
                  </option>
                ))}
              </Select>
              <Select value={priority} onChange={(event) => setPriority(event.target.value)} aria-label="Filter by priority">
                <option value="ALL">All priorities</option>
                {TASK_PRIORITIES.map((value) => (
                  <option key={value} value={value}>
                    {humanStatus(value)}
                  </option>
                ))}
              </Select>
              <Button variant="primary" onClick={() => setCreating(true)}>
                <Plus size={15} /> New task
              </Button>
            </>
          }
        />
        {filtered.length === 0 ? (
          <EmptyState title="No task matches that filter" detail="Adjust the search box or the status/priority filters." />
        ) : (
          <Table>
            <thead>
              <tr>
                <TH>Task</TH>
                <TH>Category</TH>
                <TH>Priority</TH>
                <TH>Needs</TH>
                <TH>Window</TH>
                <TH>Region</TH>
                <TH>Status</TH>
                <TH>Constraint / explanation</TH>
                <TH />
              </tr>
            </thead>
            <tbody>
              {filtered.map((task) => (
                <tr key={task.id}>
                  <TD className="max-w-56">
                    <span className="font-hand text-lg text-navy-900">{task.id}</span>
                    <span className="block text-xs">{task.title}</span>
                  </TD>
                  <TD className="whitespace-nowrap text-xs">{humanise(task.category)}</TD>
                  <TD>
                    <PriorityBadge priority={task.priority} />
                  </TD>
                  <TD className="text-xs">
                    <span className="block">{humanise(task.requiredAircraftCategory)}</span>
                    <span className="block text-ink/60">{humanise(task.requiredCrewQualification)}</span>
                    <span className="block text-ink/60">
                      {humanise(task.requiredResourceCategory)} ×{task.requiredResourceQuantity}
                    </span>
                  </TD>
                  <TD className="whitespace-nowrap text-xs">
                    {formatWhen(task.startsAt)}
                    <span className="block text-ink/55">→ {formatWhen(task.endsAt)}</span>
                  </TD>
                  <TD className="whitespace-nowrap text-xs">
                    {task.region.name}
                    <span className="block text-[10px] text-ink/50">
                      {task.region.weatherStatus === "RESTRICTED" ? "weather restricted" : ""}
                      {task.region.airspaceStatus === "RESTRICTED" ? " · airspace restricted" : ""}
                    </span>
                  </TD>
                  <TD>
                    <StatusPill value={task.status} />
                    {task.assignment ? (
                      <span className="mt-1 block text-[10px] text-ink/50">
                        {task.assignment.aircraftId ?? ""} / {task.assignment.crewId ?? ""}
                      </span>
                    ) : null}
                  </TD>
                  <TD className="max-w-64 text-xs text-ink/70">
                    {task.constraintNotes ?? task.assignment?.explanation ?? "Awaiting allocation."}
                  </TD>
                  <TD>
                    <div className="flex flex-col gap-1">
                      <Button size="sm" onClick={() => setEditing(task)}>
                        <Pencil size={12} /> Edit
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => setDeleting(task)}>
                        <Trash2 size={12} /> Delete
                      </Button>
                    </div>
                  </TD>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {creating ? (
        <TaskDialog
          regions={regions ?? []}
          title="Create support task"
          onClose={() => setCreating(false)}
          onSubmit={async (payload) => {
            await apiPost("/api/tasks", payload);
            setCreating(false);
            notifyChanged();
            toast.success("Task created", "It is now Pending and will be picked up by the next allocation plan.");
          }}
        />
      ) : null}

      {editing ? (
        <TaskDialog
          regions={regions ?? []}
          task={editing}
          title={`Edit ${editing.id}`}
          onClose={() => setEditing(null)}
          onSubmit={async (payload) => {
            await apiPatch(`/api/tasks/${editing.id}`, payload);
            setEditing(null);
            notifyChanged();
            toast.success(`${editing.id} updated`, "Task details persisted. Its allocation will be re-evaluated on the next plan.");
          }}
        />
      ) : null}

      {deleting ? (
        <ConfirmDialog
          open
          title={`Delete ${deleting.id}?`}
          tone="danger"
          confirmLabel="Delete task"
          message={
            <>
              <strong>{deleting.title}</strong> ({humanise(deleting.category)}, {humanStatus(deleting.status)})
              <br />
              This permanently removes the task{deleting.status === "ASSIGNED" ? " and releases its aircraft, crew and resource holding" : ""}. This cannot be undone.
            </>
          }
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            await apiDelete(`/api/tasks/${deleting.id}`);
            setDeleting(null);
            notifyChanged();
            toast.success(`${deleting.id} deleted`, "Task and its allocations were removed.");
          }}
        />
      ) : null}
    </div>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const tone = { CRITICAL: "red", HIGH: "amber", MEDIUM: "blue", LOW: "slate" } as const;
  return <Badge tone={tone[priority as keyof typeof tone] ?? "slate"}>{priority}</Badge>;
}

function toLocalInput(value: string): string {
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function TaskDialog({
  regions,
  task,
  title,
  onClose,
  onSubmit,
}: {
  regions: RegionRow[];
  task?: TaskRow;
  title: string;
  onClose: () => void;
  onSubmit: (payload: Record<string, string | number | null>) => Promise<void>;
}) {
  const [form, setForm] = useState(() => ({
    title: task?.title ?? "",
    category: task?.category ?? "LOGISTICS",
    priority: task?.priority ?? "MEDIUM",
    requiredAircraftCategory: task?.requiredAircraftCategory ?? "TRANSPORT",
    requiredCrewQualification: task?.requiredCrewQualification ?? "PILOT_TRANSPORT",
    requiredResourceCategory: task?.requiredResourceCategory ?? "FUEL",
    requiredResourceQuantity: String(task?.requiredResourceQuantity ?? 10),
    simulatedRegionId: task?.simulatedRegionId ?? regions[0]?.id ?? "",
    startsAt: toLocalInput(task?.startsAt ?? new Date(Date.now() + 3600_000).toISOString()),
    endsAt: toLocalInput(task?.endsAt ?? new Date(Date.now() + 6 * 3600_000).toISOString()),
    status: task?.status ?? "PENDING",
    constraintNotes: task?.constraintNotes ?? "",
  }));
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async () => {
    setFormError(null);
    if (form.title.trim().length < 3) {
      setFormError("Title must be at least 3 characters.");
      return;
    }
    if (Number.isNaN(Number(form.requiredResourceQuantity)) || Number(form.requiredResourceQuantity) < 1) {
      setFormError("Required resource quantity must be a positive whole number.");
      return;
    }
    if (new Date(form.endsAt).getTime() <= new Date(form.startsAt).getTime()) {
      setFormError("The task window must end after it starts.");
      return;
    }
    setBusy(true);
    try {
      await onSubmit({
        ...form,
        requiredResourceQuantity: Number(form.requiredResourceQuantity),
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString(),
        constraintNotes: form.constraintNotes || null,
      });
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      title={title}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={busy}>
            {busy ? "Saving…" : "Save task"}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Title">
            <Input value={form.title} onChange={(event) => set("title", event.target.value)} placeholder="What needs to happen?" />
          </Field>
        </div>
        <Field label="Category">
          <Select value={form.category} onChange={(event) => set("category", event.target.value)}>
            {TASK_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {humanise(value)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Priority">
          <Select value={form.priority} onChange={(event) => set("priority", event.target.value)}>
            {TASK_PRIORITIES.map((value) => (
              <option key={value} value={value}>
                {humanStatus(value)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Required aircraft category">
          <Select value={form.requiredAircraftCategory} onChange={(event) => set("requiredAircraftCategory", event.target.value)}>
            {AIRCRAFT_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {humanise(value)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Required crew qualification">
          <Select value={form.requiredCrewQualification} onChange={(event) => set("requiredCrewQualification", event.target.value)}>
            {QUALIFICATION_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {humanise(value)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Required support resource">
          <Select value={form.requiredResourceCategory} onChange={(event) => set("requiredResourceCategory", event.target.value)}>
            {RESOURCE_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {humanise(value)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Required quantity" hint="Units of the support resource above.">
          <Input type="number" min={1} value={form.requiredResourceQuantity} onChange={(event) => set("requiredResourceQuantity", event.target.value)} />
        </Field>
        <Field label="Operating region">
          <Select value={form.simulatedRegionId} onChange={(event) => set("simulatedRegionId", event.target.value)}>
            {regions.map((region) => (
              <option key={region.id} value={region.id}>
                {region.name}
                {region.weatherStatus === "RESTRICTED" || region.airspaceStatus === "RESTRICTED" ? "*" : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status" hint={task ? "Closed tasks can only be reopened as Pending or Cancelled." : "New tasks start as Pending."}>
          <Select value={form.status} onChange={(event) => set("status", event.target.value)}>
            {TASK_STATUSES.map((value) => (
              <option key={value} value={value}>
                {humanStatus(value)}
              </option>
            ))}
          </Select>
        </Field>
        <div className="sm:col-span-2">
          <Field label="Window start">
            <Input type="datetime-local" value={form.startsAt} onChange={(event) => set("startsAt", event.target.value)} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Window end">
            <Input type="datetime-local" value={form.endsAt} onChange={(event) => set("endsAt", event.target.value)} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Constraint notes" hint="Optional context shown in the task register.">
            <Textarea rows={2} value={form.constraintNotes} onChange={(event) => set("constraintNotes", event.target.value)} placeholder="e.g. weather-dependent, must not slip, fixed schedule…" />
          </Field>
        </div>
      </div>
      {formError ? <p className="mt-3 sketch-2 border-red-600 bg-red-50 px-3 py-2 text-sm text-red-800">{formError}</p> : null}
    </Dialog>
  );
}