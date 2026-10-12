"use client";

import { useMemo, useState } from "react";
import { Package, Pencil, Plane, Search, Users } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
  ProgressBar,
  Select,
  StatusPill,
  TD,
  TH,
  Table,
  cn,
  humanStatus,
  toneFor,
} from "@/components/ui";
import { apiPatch, notifyChanged, useApi } from "@/lib/client";
import { AIRCRAFT_CATEGORIES, AIRCRAFT_STATUSES, CREW_STATUSES, QUALIFICATION_CATEGORIES } from "@/lib/domain";
import { formatWhen, humanise } from "@/lib/format";
import { useToast } from "@/components/ui";

type AircraftRow = {
  id: string;
  name: string;
  category: string;
  status: string;
  readinessPercentage: number;
  turnaroundMinutes: number;
  maintenanceCompletionAt: string | null;
  assignedTaskId: string | null;
  assignedTaskTitle: string | null;
};

type CrewRow = {
  id: string;
  displayName: string;
  qualificationCategory: string;
  status: string;
  availableFrom: string | null;
};

type ResourceRow = {
  id: string;
  name: string;
  category: string;
  availableQuantity: number;
  minimumRequired: number;
  status: string;
};

type Fleet = {
  aircraft: AircraftRow[];
  crew: CrewRow[];
  resources: ResourceRow[];
  regions: Array<{ id: string; name: string; weatherStatus: string; airspaceStatus: string }>;
};

export default function FleetPage() {
  const { data, error, loading, reload } = useApi<Fleet>("/api/fleet");
  const toast = useToast();

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [category, setCategory] = useState("ALL");
  const [crewStatus, setCrewStatus] = useState("ALL");
  const [editingAircraft, setEditingAircraft] = useState<AircraftRow | null>(null);
  const [editingCrew, setEditingCrew] = useState<CrewRow | null>(null);
  const [editingResource, setEditingResource] = useState<ResourceRow | null>(null);

  const aircraft = useMemo(() => {
    if (!data) return [];
    const needle = query.trim().toLowerCase();
    return data.aircraft.filter((row) => {
      const matchesQuery =
        needle.length === 0 ||
        row.id.toLowerCase().includes(needle) ||
        row.name.toLowerCase().includes(needle) ||
        (row.assignedTaskId ?? "").toLowerCase().includes(needle);
      const matchesStatus = status === "ALL" || row.status === status;
      const matchesCategory = category === "ALL" || row.category === category;
      return matchesQuery && matchesStatus && matchesCategory;
    });
  }, [data, query, status, category]);

  const crew = useMemo(() => {
    if (!data) return [];
    const needle = query.trim().toLowerCase();
    return data.crew.filter(
      (row) =>
        (crewStatus === "ALL" || row.status === crewStatus) &&
        (needle.length === 0 || row.displayName.toLowerCase().includes(needle) || row.id.toLowerCase().includes(needle))
    );
  }, [data, query, crewStatus]);

  if (loading) return <LoadingState label="Loading fleet and crew" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <EmptyState title="No fleet data" detail="The fleet endpoint returned nothing." />;

  const crewCounts = {
    AVAILABLE: data.crew.filter((c) => c.status === "AVAILABLE").length,
    ASSIGNED: data.crew.filter((c) => c.status === "ASSIGNED").length,
    UNAVAILABLE: data.crew.filter((c) => c.status === "UNAVAILABLE").length,
  };

  return (
    <div className="space-y-5">
      <Card variant={1}>
        <CardHeader
          icon={<Plane size={18} />}
          title="Fleet readiness"
          subtitle={`${data.aircraft.length} synthetic airframes. Search, filter and update status, readiness or availability.`}
          actions={
            <>
              <div className="relative">
                <Search size={14} className="absolute left-2 top-2.5 text-ink/50" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search id, name, task"
                  className="w-52 pl-7"
                  aria-label="Search aircraft"
                />
              </div>
              <Select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter by status">
                <option value="ALL">All statuses</option>
                {AIRCRAFT_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {humanStatus(value)}
                  </option>
                ))}
              </Select>
              <Select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Filter by category">
                <option value="ALL">All categories</option>
                {AIRCRAFT_CATEGORIES.map((value) => (
                  <option key={value} value={value}>
                    {humanise(value)}
                  </option>
                ))}
              </Select>
            </>
          }
        />
        {aircraft.length === 0 ? (
          <EmptyState title="No airframe matches that filter" detail="Try clearing the search box or widening the status filter." />
        ) : (
          <Table>
            <thead>
              <tr>
                <TH>ID</TH>
                <TH>Aircraft</TH>
                <TH>Category</TH>
                <TH>Availability</TH>
                <TH>Readiness</TH>
                <TH>Turnaround</TH>
                <TH>Maintenance complete</TH>
                <TH>Assigned task</TH>
                <TH>Support</TH>
                <TH />
              </tr>
            </thead>
            <tbody>
              {aircraft.map((row) => (
                <tr key={row.id}>
                  <TD className="font-hand text-lg text-navy-900">{row.id}</TD>
                  <TD>{row.name}</TD>
                  <TD className="whitespace-nowrap text-xs">{humanise(row.category)}</TD>
                  <TD>
                    <StatusPill value={row.status} />
                  </TD>
                  <TD className="w-40">
                    <ProgressBar value={row.readinessPercentage} tone={toneFor(row.status)} />
                  </TD>
                  <TD className="whitespace-nowrap text-xs">{row.turnaroundMinutes} min</TD>
                  <TD className="whitespace-nowrap text-xs">{row.maintenanceCompletionAt ? formatWhen(row.maintenanceCompletionAt) : "—"}</TD>
                  <TD className="text-xs">
                    {row.assignedTaskId ? (
                      <>
                        <span className="font-semibold">{row.assignedTaskId}</span>
                        <span className="block text-ink/60">{row.assignedTaskTitle}</span>
                      </>
                    ) : (
                      "—"
                    )}
                  </TD>
                  <TD>
                    <Badge tone={row.status === "UNAVAILABLE" ? "red" : row.readinessPercentage < 70 ? "amber" : "green"}>
                      {row.readinessPercentage < 70 ? "Below optimum" : "Nominal"}
                    </Badge>
                  </TD>
                  <TD>
                    <Button size="sm" onClick={() => setEditingAircraft(row)}>
                      <Pencil size={13} /> Update
                    </Button>
                  </TD>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_1fr]">
        <Card variant={2}>
          <CardHeader
            icon={<Users size={18} />}
            title="Crew availability"
            subtitle={`${crewCounts.AVAILABLE} available · ${crewCounts.ASSIGNED} assigned · ${crewCounts.UNAVAILABLE} unavailable`}
            actions={
              <Select value={crewStatus} onChange={(event) => setCrewStatus(event.target.value)} aria-label="Filter crew by status">
                <option value="ALL">All crew</option>
                {CREW_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {humanStatus(value)}
                  </option>
                ))}
              </Select>
            }
          />
          {crew.length === 0 ? (
            <EmptyState title="No crew member matches" detail="Adjust the filter above." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <TH>ID</TH>
                  <TH>Name</TH>
                  <TH>Qualification</TH>
                  <TH>Status</TH>
                  <TH>Available from</TH>
                  <TH />
                </tr>
              </thead>
              <tbody>
                {crew.map((row) => (
                  <tr key={row.id}>
                    <TD className="font-hand text-lg text-navy-900">{row.id}</TD>
                    <TD>{row.displayName}</TD>
                    <TD className="text-xs">{humanise(row.qualificationCategory)}</TD>
                    <TD>
                      <StatusPill value={row.status} />
                    </TD>
                    <TD className="whitespace-nowrap text-xs">{row.availableFrom ? formatWhen(row.availableFrom) : "now"}</TD>
                    <TD>
                      <Button size="sm" onClick={() => setEditingCrew(row)}>
                        <Pencil size={13} /> Update
                      </Button>
                    </TD>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card variant={3}>
          <CardHeader
            icon={<Package size={18} />}
            title="Support resource inventory"
            subtitle="Non-sensitive logistics: fuel bands, maintenance capacity and ground support."
          />
          <Table>
            <thead>
              <tr>
                <TH>Resource</TH>
                <TH>Category</TH>
                <TH>Available</TH>
                <TH>Minimum</TH>
                <TH>Status</TH>
                <TH />
              </tr>
            </thead>
            <tbody>
              {data.resources.map((row) => (
                <tr key={row.id}>
                  <TD>
                    <span className="font-hand text-lg text-navy-900">{row.id}</span>
                    <span className="block text-xs">{row.name}</span>
                  </TD>
                  <TD className="whitespace-nowrap text-xs">{humanise(row.category)}</TD>
                  <TD className={cn("font-hand text-xl", row.availableQuantity < row.minimumRequired ? "text-red-700" : "text-emerald-800")}>
                    {row.availableQuantity}
                  </TD>
                  <TD className="text-xs">{row.minimumRequired}</TD>
                  <TD>
                    <StatusPill value={row.status} />
                  </TD>
                  <TD>
                    <Button size="sm" onClick={() => setEditingResource(row)}>
                      <Pencil size={13} /> Set
                    </Button>
                  </TD>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>

      {editingAircraft ? (
        <AircraftDialog
          aircraft={editingAircraft}
          onClose={() => setEditingAircraft(null)}
          onSaved={(affected) => {
            setEditingAircraft(null);
            notifyChanged();
            toast.success(
              `${editingAircraft.id} updated`,
              affected.length > 0
                ? `${affected.length} task(s) flagged for review and returned to Pending. Generate a fresh plan to see them re-allocated.`
                : "Readiness metrics recalculated. No assigned task was affected."
            );
          }}
        />
      ) : null}

      {editingCrew ? (
        <CrewDialog
          crew={editingCrew}
          onClose={() => setEditingCrew(null)}
          onSaved={(affected) => {
            setEditingCrew(null);
            notifyChanged();
            toast.success(
              `${editingCrew.id} updated`,
              affected.length > 0 ? `${affected.length} task(s) flagged for review.` : "Crew availability recalculated."
            );
          }}
        />
      ) : null}

      {editingResource ? (
        <ResourceDialog
          resource={editingResource}
          onClose={() => setEditingResource(null)}
          onSaved={() => {
            setEditingResource(null);
            notifyChanged();
            toast.success(`${editingResource.name} updated`, "Inventory band recalculated.");
          }}
        />
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------- dialogs */

function toLocalInput(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function AircraftDialog({
  aircraft,
  onClose,
  onSaved,
}: {
  aircraft: AircraftRow;
  onClose: () => void;
  onSaved: (affected: string[]) => void;
}) {
  const [status, setStatus] = useState(aircraft.status);
  const [readiness, setReadiness] = useState(String(aircraft.readinessPercentage));
  const [turnaround, setTurnaround] = useState(String(aircraft.turnaroundMinutes));
  const [maintenanceAt, setMaintenanceAt] = useState(toLocalInput(aircraft.maintenanceCompletionAt));
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const submit = async () => {
    setFormError(null);
    const readinessValue = Number(readiness);
    const turnaroundValue = Number(turnaround);
    if (!Number.isInteger(readinessValue) || readinessValue < 0 || readinessValue > 100) {
      setFormError("Readiness must be a whole number between 0 and 100.");
      return;
    }
    if (!Number.isInteger(turnaroundValue) || turnaroundValue < 5 || turnaroundValue > 720) {
      setFormError("Turnaround must be between 5 and 720 minutes.");
      return;
    }
    if (status === "MAINTENANCE" && !maintenanceAt) {
      setFormError("An aircraft in maintenance needs an estimated completion time.");
      return;
    }
    if (status === "MAINTENANCE" && new Date(maintenanceAt).getTime() <= Date.now()) {
      setFormError("The maintenance completion estimate must be in the future.");
      return;
    }
    if (status !== "MAINTENANCE" && maintenanceAt && new Date(maintenanceAt).getTime() > Date.now()) {
      setFormError("Clear the future maintenance estimate before leaving Maintenance status.");
      return;
    }

    setBusy(true);
    try {
      const result = await apiPatch<{ affectedTasks: string[] }>(`/api/fleet/${aircraft.id}`, {
        status,
        readinessPercentage: readinessValue,
        turnaroundMinutes: turnaroundValue,
        maintenanceCompletionAt: maintenanceAt ? new Date(maintenanceAt).toISOString() : null,
      });
      onSaved(result.affectedTasks ?? []);
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : "Update failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      title={`Update ${aircraft.id}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-ink/70">
        {aircraft.name} · {humanise(aircraft.category)}. Availability, readiness and turnaround feed directly into the
        allocation engine.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Availability status">
          <Select value={status} onChange={(event) => setStatus(event.target.value)}>
            {AIRCRAFT_STATUSES.map((value) => (
              <option key={value} value={value}>
                {humanStatus(value)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Readiness %" hint="Below 60% an airframe cannot be allocated.">
          <Input type="number" min={0} max={100} value={readiness} onChange={(event) => setReadiness(event.target.value)} />
        </Field>
        <Field label="Turnaround (minutes)" hint="Time needed before the next task window.">
          <Input type="number" min={5} max={720} value={turnaround} onChange={(event) => setTurnaround(event.target.value)} />
        </Field>
        <Field label="Maintenance completion estimate" hint="Required while in maintenance.">
          <Input type="datetime-local" value={maintenanceAt} onChange={(event) => setMaintenanceAt(event.target.value)} />
        </Field>
      </div>
      {formError ? <p className="mt-3 sketch-2 border-red-600 bg-red-50 px-3 py-2 text-sm text-red-800">{formError}</p> : null}
    </Dialog>
  );
}

function CrewDialog({
  crew,
  onClose,
  onSaved,
}: {
  crew: CrewRow;
  onClose: () => void;
  onSaved: (affected: string[]) => void;
}) {
  const [status, setStatus] = useState(crew.status);
  const [qualification, setQualification] = useState(crew.qualificationCategory);
  const [availableFrom, setAvailableFrom] = useState(toLocalInput(crew.availableFrom));
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const submit = async () => {
    setFormError(null);
    if (status !== "AVAILABLE" && availableFrom) {
      setFormError("A crew member who is not available cannot carry a future availability date.");
      return;
    }
    if (status === "AVAILABLE" && availableFrom && new Date(availableFrom).getTime() > Date.now()) {
      setFormError("Mark the member as Assigned or Unavailable while the availability date is still in the future.");
      return;
    }
    setBusy(true);
    try {
      const result = await apiPatch<{ affectedTasks: string[] }>(`/api/crew/${crew.id}`, {
        status,
        qualificationCategory: qualification,
        availableFrom: availableFrom ? new Date(availableFrom).toISOString() : null,
      });
      onSaved(result.affectedTasks ?? []);
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : "Update failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      title={`Update ${crew.id}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-ink/70">
        {crew.displayName}. Qualification and availability gate every task that needs this crew category.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Status">
          <Select value={status} onChange={(event) => setStatus(event.target.value)}>
            {CREW_STATUSES.map((value) => (
              <option key={value} value={value}>
                {humanStatus(value)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Qualification category">
          <Select value={qualification} onChange={(event) => setQualification(event.target.value)}>
            {QUALIFICATION_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {humanise(value)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Available from" hint="Optional. An available member must be available from a past date.">
          <Input type="datetime-local" value={availableFrom} onChange={(event) => setAvailableFrom(event.target.value)} />
        </Field>
      </div>
      {formError ? <p className="mt-3 sketch-2 border-red-600 bg-red-50 px-3 py-2 text-sm text-red-800">{formError}</p> : null}
    </Dialog>
  );
}

function ResourceDialog({
  resource,
  onClose,
  onSaved,
}: {
  resource: ResourceRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [available, setAvailable] = useState(String(resource.availableQuantity));
  const [minimum, setMinimum] = useState(String(resource.minimumRequired));
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const submit = async () => {
    setFormError(null);
    const availableValue = Number(available);
    const minimumValue = Number(minimum);
    if (!Number.isInteger(availableValue) || availableValue < 0) {
      setFormError("Available quantity must be a whole number of 0 or more.");
      return;
    }
    if (!Number.isInteger(minimumValue) || minimumValue < 0) {
      setFormError("The minimum holding must be a whole number of 0 or more.");
      return;
    }
    setBusy(true);
    try {
      await apiPatch(`/api/resources/${resource.id}`, { availableQuantity: availableValue, minimumRequired: minimumValue });
      onSaved();
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : "Update failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      title={`Set ${resource.id}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-ink/70">
        {resource.name} ({humanise(resource.category)}). Below its minimum holding the resource is reported as Low and
        dependent tasks are deferred by policy.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Available quantity">
          <Input type="number" min={0} value={available} onChange={(event) => setAvailable(event.target.value)} />
        </Field>
        <Field label="Minimum required">
          <Input type="number" min={0} value={minimum} onChange={(event) => setMinimum(event.target.value)} />
        </Field>
      </div>
      {formError ? <p className="mt-3 sketch-2 border-red-600 bg-red-50 px-3 py-2 text-sm text-red-800">{formError}</p> : null}
    </Dialog>
  );
}
