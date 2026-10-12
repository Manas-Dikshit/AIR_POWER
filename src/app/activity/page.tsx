"use client";

import { useMemo, useState } from "react";
import {
  ClipboardList,
  FlaskConical,
  Package,
  Plane,
  RefreshCw,
  Route,
  ScrollText,
  Search,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  cn,
  humanStatus,
  toneFor,
} from "@/components/ui";
import { useApi } from "@/lib/client";
import { formatWhen } from "@/lib/format";

type ActivityRow = {
  id: string;
  eventType: string;
  description: string;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
};

const CATEGORY_OF: Record<string, string> = {
  PLAN_GENERATED: "Plans",
  PLAN_APPLIED: "Plans",
  SCENARIO_ACTIVATED: "Scenarios",
  DEMO_RESET: "System",
  TASK_CREATED: "Tasks",
  TASK_UPDATED: "Tasks",
  TASK_STATUS_CHANGED: "Tasks",
  TASK_DELETED: "Tasks",
  AIRCRAFT_UPDATED: "Fleet & crew",
  CREW_UPDATED: "Fleet & crew",
  RESOURCE_UPDATED: "Resources",
};

const CHIP_TONES: Record<string, string> = {
  Plans: "bg-blue-100 text-blue-800 border-blue-700",
  Scenarios: "bg-purple-100 text-purple-800 border-purple-700",
  Tasks: "bg-amber-100 text-amber-800 border-amber-700",
  "Fleet & crew": "bg-cyan-100 text-cyan-800 border-cyan-700",
  Resources: "bg-emerald-100 text-emerald-800 border-emerald-700",
  System: "bg-slate-100 text-slate-700 border-slate-600",
};

const CATEGORY_ICON: Record<string, typeof Plane> = {
  Plans: Route,
  Scenarios: FlaskConical,
  Tasks: ClipboardList,
  "Fleet & crew": Plane,
  Resources: Package,
  System: RefreshCw,
};

export default function ActivityPage() {
  const { data, error, loading, reload } = useApi<ActivityRow[]>("/api/activity?limit=200");
  const [filter, setFilter] = useState("ALL");
  const [query, setQuery] = useState("");

  const categories = useMemo(() => {
    const seen = new Set<string>();
    for (const row of data ?? []) {
      const category = CATEGORY_OF[row.eventType] ?? "Other";
      seen.add(category);
    }
    return [...seen];
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const needle = query.trim().toLowerCase();
    return data.filter((row) => {
      const category = CATEGORY_OF[row.eventType] ?? "Other";
      if (filter !== "ALL" && category !== filter) return false;
      if (needle.length === 0) return true;
      return (
        row.eventType.toLowerCase().includes(needle) ||
        row.description.toLowerCase().includes(needle) ||
        (row.entityId ?? "").toLowerCase().includes(needle)
      );
    });
  }, [data, filter, query]);

  if (loading) return <LoadingState label="Loading activity log" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <EmptyState title="No activity" detail="The activity log returned nothing." />;

  return (
    <div className="space-y-4">
      <Card variant={1}>
        <CardHeader
          icon={<ScrollText size={18} />}
          title="Activity log"
          subtitle={`${data.length} most recent events across plans, scenarios, tasks, fleet, crew and resources.`}
          actions={
            <div className="relative">
              <Search size={14} className="absolute left-2 top-2.5 text-ink/50" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search log" className="w-52 pl-7" aria-label="Search activity log" />
            </div>
          }
        />
        <div className="flex flex-wrap gap-1.5 px-4 py-3">
          <FilterChip active={filter === "ALL"} onClick={() => setFilter("ALL")} label={`All (${data.length})`} />
          {categories.map((category) => {
            const count = data.filter((row) => (CATEGORY_OF[row.eventType] ?? "Other") === category).length;
            return (
              <FilterChip
                key={category}
                active={filter === category}
                onClick={() => setFilter(category)}
                label={`${category} (${count})`}
                className={filter === category ? CHIP_TONES[category] : undefined}
              />
            );
          })}
        </div>

        {filtered.length === 0 ? (
          <EmptyState title="No events match" detail="Try a different filter or clear the search box." />
        ) : (
          <ol className="divide-y divide-dashed divide-ink/20">
            {filtered.map((row) => {
              const category = CATEGORY_OF[row.eventType] ?? "Other";
              const Icon = CATEGORY_ICON[category] ?? RefreshCw;
              return (
                <li key={row.id} className="flex gap-3 px-4 py-2.5">
                  <span className="mt-0.5 shrink-0 text-ink/50">
                    <Icon size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Badge tone={toneFor(row.eventType)}>{humanStatus(row.eventType)}</Badge>
                      <span className="text-[11px] uppercase tracking-wide text-ink/45">
                        {category} · {formatWhen(row.createdAt)}
                      </span>
                    </p>
                    <p className="mt-0.5 text-sm text-ink/80">{row.description}</p>
                    {row.entityId ? (
                      <p className="mt-0.5 text-[11px] text-ink/50">
                        {row.entityType ?? "Entity"} <span className="font-hand text-sm text-navy-900">{row.entityId}</span>
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </Card>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  className,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  className?: string;
}) {
  return (
    <Button size="sm" onClick={onClick} className={cn(active && "border-accent bg-accent text-white", className)} aria-pressed={active}>
      {label}
    </Button>
  );
}