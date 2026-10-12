"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Gauge,
  Plane,
  RefreshCcw,
  Users,
  Wrench,
} from "lucide-react";
import { Badge, Card, CardHeader, DoodleBurst, DoodleStar, EmptyState, ErrorState, LoadingState, ProgressBar, TD, TH, Table, humanStatus, toneFor } from "@/components/ui";
import { useApi } from "@/lib/client";
import { formatRelative, formatWhen, humanise } from "@/lib/format";

type Dashboard = {
  generatedAt: string;
  dataVersion: string;
  metrics: {
    totalAircraft: number;
    availableAircraft: number;
    assignedAircraft: number;
    maintenanceAircraft: number;
    unavailableAircraft: number;
    totalCrew: number;
    availableCrew: number;
    assignedCrew: number;
    unavailableCrew: number;
    totalTasks: number;
    openTasks: number;
    pendingTasks: number;
    blockedTasks: number;
    needsReplanning: number;
    activeConstraints: number;
    restrictedRegions: number;
    resourcesBelowMinimum: number;
    resourceUtilisationPercent: number;
  };
  readiness: { score: number; band: string; averageFleetReadiness: number; formula: string };
  aircraftChart: Array<{ category: string; available: number; assigned: number; maintenance: number; unavailable: number }>;
  taskBreakdown: Array<{ status: string; count: number }>;
  timeline: Array<{ at: string; kind: string; title: string; detail: string }>;
  activity: Array<{ id: string; eventType: string; description: string; createdAt: string }>;
  lastPlan: { id: string; generatedAt: string; appliedAt: string | null; status: string } | null;
};

const CHART_COLOURS = {
  available: "#34d399",
  assigned: "#2f6fed",
  maintenance: "#fbbf24",
  unavailable: "#f87171",
};

export default function OverviewPage() {
  const { data, error, loading, reload } = useApi<Dashboard>("/api/dashboard");

  if (loading) return <LoadingState label="Reading the operational picture" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <EmptyState title="Nothing to show yet" detail="The dashboard returned no data." />;

  const { metrics, readiness } = data;
  const taskChart = data.taskBreakdown.map((row) => ({ ...row, label: humanStatus(row.status) }));

  return (
    <div className="space-y-5">
      <section className="grid gap-4 xl:grid-cols-[1.15fr_1fr]">
        <Card variant={1} className="relative overflow-hidden p-4">
          <DoodleBurst className="pointer-events-none absolute -right-3 -top-3 text-accent/15" />
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-hand text-2xl text-navy-900">Operational readiness</p>
              <p className="text-xs text-ink/60">Calculated from live fleet, crew and task data — not hardcoded.</p>
            </div>
            <Badge tone={toneFor(readiness.band)}>{readiness.band}</Badge>
          </div>
          <div className="mt-3 flex items-end gap-4">
            <p className="font-hand text-7xl leading-none text-navy-900">{readiness.score}</p>
            <div className="pb-2">
              <p className="text-sm font-semibold text-ink/70">out of 100</p>
              <p className="text-[11px] text-ink/60">
                Average fleet readiness {readiness.averageFleetReadiness}%
              </p>
            </div>
          </div>
          <ProgressBar value={readiness.score} tone={toneFor(readiness.band)} className="mt-3" />
          <p className="mt-2 text-[11px] italic text-ink/55">{readiness.formula}</p>
        </Card>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <MetricTile icon={<Plane size={15} />} label="Aircraft in fleet" value={metrics.totalAircraft} detail={`${metrics.availableAircraft} available`} tone="blue" />
          <MetricTile icon={<CheckCircle2 size={15} />} label="Available airframes" value={metrics.availableAircraft} detail={`${metrics.assignedAircraft} committed`} tone="green" />
          <MetricTile icon={<Wrench size={15} />} label="In maintenance" value={metrics.maintenanceAircraft} detail={`${metrics.unavailableAircraft} unavailable`} tone="amber" />
          <MetricTile icon={<Users size={15} />} label="Crew available" value={`${metrics.availableCrew}/${metrics.totalCrew}`} detail={`${metrics.unavailableCrew} unavailable`} tone="green" />
          <MetricTile icon={<ClipboardList size={15} />} label="Pending tasks" value={metrics.pendingTasks} detail={`${metrics.openTasks} open, ${metrics.blockedTasks} blocked`} tone="blue" />
          <MetricTile icon={<Gauge size={15} />} label="Resource utilisation" value={`${metrics.resourceUtilisationPercent}%`} detail="airframes + crew committed" tone="cyan" />
          <MetricTile icon={<AlertTriangle size={15} />} label="Active constraints" value={metrics.activeConstraints} detail={`${metrics.restrictedRegions} restricted regions`} tone="amber" />
          <MetricTile icon={<RefreshCcw size={15} />} label="Needs replanning" value={metrics.needsReplanning} detail={`${metrics.resourcesBelowMinimum} resource(s) below minimum`} tone={metrics.needsReplanning > 0 ? "red" : "green"} />
          <MetricTile icon={<CalendarClock size={15} />} label="Total tasks" value={metrics.totalTasks} detail={data.lastPlan ? `plan applied ${formatRelative(data.lastPlan.appliedAt ?? data.lastPlan.generatedAt)}` : "no plan applied"} tone="slate" />
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <Card variant={2}>
          <CardHeader
            title="Aircraft readiness by category"
            subtitle="Every airframe in the simulated fleet, grouped by its current status."
            icon={<Plane size={18} />}
          />
          <div className="h-72 px-2 py-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.aircraftChart} barSize={26}>
                <CartesianGrid strokeDasharray="4 6" stroke="rgba(31,36,48,0.18)" vertical={false} />
                <XAxis dataKey="category" tick={{ fill: "#1f2430", fontSize: 12 }} tickFormatter={(value) => humanise(String(value))} />
                <YAxis allowDecimals={false} tick={{ fill: "#1f2430", fontSize: 12 }} width={28} />
                <Tooltip
                  contentStyle={{ border: "2px solid #1f2430", borderRadius: 8, background: "#fbf8f1", fontSize: 12 }}
                  formatter={(value: number, name: string) => [value, humanStatus(name)]}
                />
                <Legend formatter={(value: string) => <span className="text-xs text-ink/80">{humanStatus(value)}</span>} />
                <Bar dataKey="available" stackId="a" fill={CHART_COLOURS.available} />
                <Bar dataKey="assigned" stackId="a" fill={CHART_COLOURS.assigned} />
                <Bar dataKey="maintenance" stackId="a" fill={CHART_COLOURS.maintenance} />
                <Bar dataKey="unavailable" stackId="a" fill={CHART_COLOURS.unavailable} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card variant={3} wobble>
          <CardHeader
            title="Task status breakdown"
            subtitle="Where every simulated support task stands right now."
            icon={<ClipboardList size={18} />}
          />
          <div className="h-48 px-2 pt-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={taskChart} layout="vertical" barSize={18} margin={{ left: 18 }}>
                <CartesianGrid strokeDasharray="4 6" stroke="rgba(31,36,48,0.18)" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fill: "#1f2430", fontSize: 12 }} />
                <YAxis type="category" dataKey="label" width={92} tick={{ fill: "#1f2430", fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ border: "2px solid #1f2430", borderRadius: 8, background: "#fbf8f1", fontSize: 12 }}
                  formatter={(value: number) => [value, "Tasks"]}
                />
                <Bar dataKey="count">
                  {taskChart.map((row) => (
                    <Cell key={row.status} fill={CHART_COLOURS.available && toneFill(row.status)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ul className="grid grid-cols-2 gap-1 px-4 pb-4 text-xs sm:grid-cols-3">
            {data.taskBreakdown.map((row) => (
              <li key={row.status} className="flex items-center justify-between gap-2 border-b border-dashed border-ink/20 py-1">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: toneFill(row.status) }} />
                  {humanStatus(row.status)}
                </span>
                <span className="font-hand text-lg text-navy-900">{row.count}</span>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Card variant={1}>
          <CardHeader
            title="Coming up"
            subtitle="Maintenance returns, restriction reviews and the next task windows."
            icon={<CalendarClock size={18} />}
          />
          {data.timeline.length === 0 ? (
            <EmptyState title="Nothing scheduled" detail="No maintenance, restriction or task events ahead." />
          ) : (
            <ol className="px-4 py-3">
              {data.timeline.map((entry, index) => (
                <li key={`${entry.kind}-${index}`} className="relative flex gap-3 pb-4 last:pb-1">
                  <span className="relative flex w-3 justify-center">
                    <span
                      className="mt-1 h-2.5 w-2.5 shrink-0 border-2 border-ink"
                      style={{ borderRadius: "50%", background: timelineColour(entry.kind) }}
                    />
                    {index < data.timeline.length - 1 ? (
                      <span className="absolute top-4 h-full border-l-2 border-dashed border-ink/25" />
                    ) : null}
                  </span>
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-baseline gap-2 text-sm font-medium text-ink">
                      <Badge tone="slate">{humanStatus(entry.kind)}</Badge>
                      {entry.title}
                    </p>
                    <p className="text-[11px] text-ink/60">
                      {entry.detail} · {formatWhen(entry.at)} ({formatRelative(entry.at)})
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card variant={2}>
          <CardHeader title="Recent activity" subtitle="Every change to the simulated world is recorded." icon={<DoodleStar className="text-accent" />} />
          {data.activity.length === 0 ? (
            <EmptyState title="No activity yet" detail="Actions you take will show up here." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <TH>When</TH>
                  <TH>Event</TH>
                  <TH>Detail</TH>
                </tr>
              </thead>
              <tbody>
                {data.activity.map((entry) => (
                  <tr key={entry.id}>
                    <TD className="whitespace-nowrap text-xs text-ink/70">{formatWhen(entry.createdAt)}</TD>
                    <TD className="whitespace-nowrap text-xs font-semibold">{humanStatus(entry.eventType)}</TD>
                    <TD className="text-xs">{entry.description}</TD>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </section>

      <p className="text-[11px] text-ink/50">
        Snapshot generated {formatWhen(data.generatedAt)} · data version <code className="font-semibold">{data.dataVersion}</code>
      </p>
    </div>
  );
}

function MetricTile({
  icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  detail: string;
  tone: "green" | "amber" | "red" | "blue" | "cyan" | "slate";
}) {
  const ring: Record<string, string> = {
    green: "border-emerald-600",
    amber: "border-amber-500",
    red: "border-red-500",
    blue: "border-accent",
    cyan: "border-cyan-500",
    slate: "border-ink/40",
  };
  return (
    <div
      className={`sketch-2 border-2 bg-white px-3 py-2 sketch-shadow-sm ${ring[tone]}`}
      style={{ borderRadius: "14px 8px 15px 9px / 9px 15px 8px 14px" }}
    >
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink/60">
        {icon}
        {label}
      </p>
      <p className="font-hand text-3xl leading-tight text-navy-900">{value}</p>
      <p className="text-[11px] text-ink/60">{detail}</p>
    </div>
  );
}

function toneFill(status: string): string {
  switch (status) {
    case "COMPLETED":
      return CHART_COLOURS.available;
    case "ASSIGNED":
    case "RECOMMENDED":
      return CHART_COLOURS.assigned;
    case "PENDING":
      return CHART_COLOURS.maintenance;
    case "BLOCKED":
      return CHART_COLOURS.unavailable;
    default:
      return "#94a3b8";
  }
}

function timelineColour(kind: string): string {
  switch (kind) {
    case "MAINTENANCE":
      return "#fbbf24";
    case "WEATHER":
      return "#22b8cf";
    case "AIRSPACE":
      return "#f87171";
    default:
      return "#2f6fed";
  }
}
