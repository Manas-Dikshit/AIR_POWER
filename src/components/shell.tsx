"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  ClipboardList,
  FlaskConical,
  LayoutDashboard,
  Plane,
  RefreshCw,
  Route,
  ScrollText,
} from "lucide-react";
import { ToastProvider, cn } from "@/components/ui";
import { useApi } from "@/lib/client";
import { formatWhen } from "@/lib/format";
import type { ReactNode } from "react";

const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard, hint: "Operational snapshot" },
  { href: "/fleet", label: "Fleet & Crew", icon: Plane, hint: "Readiness and inventory" },
  { href: "/tasks", label: "Tasks", icon: ClipboardList, hint: "Priorities and windows" },
  { href: "/plans", label: "Allocation Plans", icon: Route, hint: "Explainable recommendations" },
  { href: "/scenarios", label: "Scenario Simulator", icon: FlaskConical, hint: "What-if events" },
  { href: "/activity", label: "Activity Log", icon: ScrollText, hint: "Audit trail" },
];

type PlanRow = { id: string; status: string; generatedAt: string; appliedAt: string | null };

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { data: plans } = useApi<PlanRow[]>("/api/plans");
  const latest = plans?.[0];

  return (
    <ToastProvider>
      <div className="flex min-h-screen flex-col lg:flex-row">
        <aside className="nav-ink lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:shrink-0 lg:overflow-y-auto">
          <div className="flex items-center justify-between gap-3 px-4 py-3 lg:block">
            <Link href="/" className="block">
              <div className="flex items-center gap-2">
                <Plane size={26} className="rotate-[-18deg] text-cyan-300" />
                <div>
                  <p className="font-hand text-3xl leading-none text-paper">AIR POWER</p>
                  <p className="text-[10px] uppercase tracking-[0.18em] text-cyan-200/80">
                    Dynamic air operations
                  </p>
                </div>
              </div>
            </Link>
            <div className="lg:hidden">
              <button
                onClick={() => document.getElementById("airnav")?.classList.toggle("hidden")}
                className="border-2 border-paper/70 px-2 py-1 text-xs text-paper"
                style={{ borderRadius: "10px 6px 11px 7px / 7px 11px 6px 10px" }}
              >
                Menu
              </button>
            </div>
          </div>

          <nav id="airnav" className="hidden px-2 pb-3 lg:block">
            <ul className="flex flex-col gap-1.5">
              {NAV.map((item) => {
                const active = pathname === item.href;
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-start gap-2.5 border-2 px-2.5 py-1.5 transition-colors",
                        active
                          ? "border-cyan-300 bg-cyan-300/15 text-paper"
                          : "border-transparent text-paper/75 hover:border-paper/40 hover:text-paper"
                      )}
                      style={{
                        borderRadius: active
                          ? "14px 8px 15px 9px / 9px 15px 8px 14px"
                          : "10px 6px 11px 7px / 7px 11px 6px 10px",
                      }}
                    >
                      <Icon size={17} className="mt-0.5 shrink-0" />
                      <span>
                        <span className="block font-hand text-xl leading-none">{item.label}</span>
                        <span className="block text-[10px] uppercase tracking-wide text-paper/50">{item.hint}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="hidden px-4 py-3 lg:block">
            <div
              className="rotate-a border-2 border-dashed border-amber-300/70 px-2.5 py-2 text-amber-200"
              style={{ borderRadius: "12px 7px 13px 8px / 8px 13px 7px 12px" }}
            >
              <p className="text-[11px] font-bold uppercase tracking-[0.16em]">Simulation environment</p>
              <p className="mt-0.5 text-[10px] leading-snug text-amber-100/70">
                Synthetic data only. No real aircraft, crew, bases or missions.
              </p>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-ink/15 bg-paper/80 px-4 py-2.5 backdrop-blur">
            <div className="flex items-center gap-2">
              <Activity size={17} className="text-accent" />
              <p className="font-hand text-xl text-navy-900">
                {NAV.find((item) => item.href === pathname)?.label ?? "AIR POWER"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-ink/70">
              <span
                className="rotate-b border-2 border-ink/60 bg-white px-2 py-0.5 font-semibold uppercase tracking-wide"
                style={{ borderRadius: "10px 6px 11px 7px / 7px 11px 6px 10px" }}
              >
                Last plan generated: {latest ? formatWhen(latest.generatedAt) : "none yet"}
              </span>
              <span className="inline-flex items-center gap-1">
                <RefreshCw size={12} />
                {latest ? latest.status : "no plan"}
              </span>
            </div>
          </header>

          <main className="min-w-0 flex-1 px-4 py-5">{children}</main>

          <footer className="border-t-2 border-dashed border-ink/20 px-4 py-3 text-[11px] text-ink/55">
            AIR POWER · decision-support prototype for simulated air operations. All aircraft, crew, tasks, regions
            and quantities are synthetic demonstration data.
          </footer>
        </div>
      </div>
    </ToastProvider>
  );
}
