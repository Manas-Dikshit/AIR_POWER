"use client";

import clsx, { type ClassValue } from "clsx";
import { X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useState,
  type ReactNode,
} from "react";

export const cn = (...inputs: ClassValue[]) => clsx(inputs);

/* ------------------------------------------------------------------- tones */

export type Tone = "green" | "amber" | "red" | "blue" | "slate" | "cyan";

const TONE_TEXT: Record<Tone, string> = {
  green: "text-emerald-800",
  amber: "text-amber-800",
  red: "text-red-700",
  blue: "text-blue-800",
  cyan: "text-cyan-800",
  slate: "text-slate-700",
};

const TONE_BG: Record<Tone, string> = {
  green: "bg-emerald-100",
  amber: "bg-amber-100",
  red: "bg-red-100",
  blue: "bg-blue-100",
  cyan: "bg-cyan-100",
  slate: "bg-slate-100",
};

/** Status vocabulary → hand-drawn colour coding used everywhere. */
export function toneFor(value: string | null | undefined): Tone {
  switch (value) {
    case "AVAILABLE":
    case "OPEN":
    case "COMPLETED":
    case "APPLIED":
    case "READY":
      return "green";
    case "ASSIGNED":
    case "RECOMMENDED":
    case "RECOMMENDED ":
      return "blue";
    case "MAINTENANCE":
    case "LOW":
    case "PENDING":
    case "DEGRADED":
    case "RESTRICTED":
      return "amber";
    case "UNAVAILABLE":
    case "BLOCKED":
    case "CANCELLED":
    case "CONSTRAINED":
      return "red";
    default:
      return "slate";
  }
}

/* ------------------------------------------------------------------ layout */

export function Card({
  children,
  className,
  variant = 1,
  wobble = false,
}: {
  children: ReactNode;
  className?: string;
  variant?: 1 | 2 | 3;
  wobble?: boolean;
}) {
  return (
    <section
      className={cn(
        "bg-white/95 sketch-shadow-sm",
        variant === 1 && "sketch",
        variant === 2 && "sketch-2",
        variant === 3 && "sketch-3",
        wobble && "rotate-a",
        className
      )}
    >
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  subtitle,
  actions,
  icon,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-dashed border-ink/25 px-4 py-3">
      <div className="flex items-start gap-3">
        {icon ? <span className="mt-0.5 text-navy-900">{icon}</span> : null}
        <div>
          <h2 className="font-hand text-2xl leading-tight text-navy-900">{title}</h2>
          {subtitle ? <p className="text-xs text-ink/65">{subtitle}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/* ----------------------------------------------------------------- buttons */

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success";
  size?: "sm" | "md";
};

export function Button({ variant = "secondary", size = "md", className, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={cn(
        "sketch-sm inline-flex items-center justify-center gap-1.5 border-2 border-ink font-medium transition-transform",
        "disabled:cursor-not-allowed disabled:opacity-45 enabled:hover:translate-x-[1px] enabled:hover:translate-y-[1px] enabled:hover:shadow-none disabled:sketch-shadow-sm",
        "sketch-shadow-sm",
        size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm",
        variant === "primary" && "bg-accent text-white",
        variant === "secondary" && "bg-white text-ink",
        variant === "ghost" && "bg-transparent text-ink shadow-none",
        variant === "danger" && "bg-red-100 text-red-800",
        variant === "success" && "bg-emerald-100 text-emerald-900",
        className
      )}
      style={{ borderRadius: "12px 8px 14px 9px / 9px 14px 8px 12px" }}
    />
  );
}

export function Badge({ children, tone = "slate", className }: { children: ReactNode; tone?: Tone; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 border-2 border-ink/70 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
        TONE_BG[tone],
        TONE_TEXT[tone],
        className
      )}
      style={{ borderRadius: "10px 6px 11px 7px / 7px 11px 6px 10px" }}
    >
      {children}
    </span>
  );
}

export function StatusPill({ value, label }: { value: string | null | undefined; label?: string }) {
  return (
    <Badge tone={toneFor(value)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", value === "AVAILABLE" || value === "APPLIED" ? "bg-emerald-600" : "bg-ink/50")} />
      {label ?? humanStatus(value)}
    </Badge>
  );
}

export function humanStatus(value: string | null | undefined) {
  if (!value) return "—";
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/* ------------------------------------------------------------------ inputs */

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-hand text-lg leading-none text-navy-900">{label}</span>
      {children}
      {hint ? <span className="text-[11px] text-ink/60">{hint}</span> : null}
      {error ? <span className="text-[11px] font-semibold text-red-700">{error}</span> : null}
    </label>
  );
}

const controlClass =
  "w-full border-2 border-ink/80 bg-white px-2.5 py-1.5 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 disabled:bg-slate-100";

const controlStyle = { borderRadius: "11px 7px 12px 8px / 8px 12px 7px 11px" };

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(controlClass, props.className)} style={controlStyle} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(controlClass, "pr-6", props.className)} style={controlStyle} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(controlClass, props.className)} style={controlStyle} />;
}

/* ------------------------------------------------------------------- table */

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("w-full overflow-x-auto", className)}>
      <table className="hand-rows w-full border-collapse text-left text-sm">{children}</table>
    </div>
  );
}

export function TH({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        "border-b-2 border-ink/70 px-3 py-2 font-hand text-base font-normal tracking-wide text-navy-900",
        className
      )}
    >
      {children}
    </th>
  );
}

export function TD({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cn("tick px-3 py-2 align-top text-ink/85", className)}>{children}</td>;
}

/* ------------------------------------------------------------------ states */

export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-8 text-ink/70">
      <span className="inline-block h-4 w-4 animate-spin border-2 border-ink border-t-transparent" style={{ borderRadius: "50%" }} />
      <span className="font-hand text-xl">{label}…</span>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="m-4 sketch-2 border-red-600 bg-red-50 px-4 py-3">
      <p className="font-hand text-xl text-red-800">Something went sideways</p>
      <p className="text-sm text-red-700">{message}</p>
      {onRetry ? (
        <Button size="sm" variant="danger" className="mt-2" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export function EmptyState({ title, detail, action }: { title: string; detail?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <Squiggle className="text-accent" />
      <p className="font-hand text-2xl text-navy-900">{title}</p>
      {detail ? <p className="max-w-md text-sm text-ink/70">{detail}</p> : null}
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------ doodles */

export function Squiggle({ className }: { className?: string }) {
  return (
    <svg width="72" height="10" viewBox="0 0 72 10" fill="none" className={className} aria-hidden>
      <path
        d="M1 6c6-5 10 4 16-1s10 4 16-1 10 4 16-1 8 4 14 0"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function DoodleArrow({ className }: { className?: string }) {
  return (
    <svg width="54" height="34" viewBox="0 0 54 34" fill="none" className={className} aria-hidden>
      <path d="M2 4c10 22 28 26 46 22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M40 20l9 6-11 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function DoodleStar({ className }: { className?: string }) {
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" fill="none" className={className} aria-hidden>
      <path
        d="M17 2l4 9 10 1-7 7 2 10-9-5-9 5 2-10-7-7 10-1z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function DoodleBurst({ className }: { className?: string }) {
  return (
    <svg width="60" height="60" viewBox="0 0 60 60" fill="none" className={className} aria-hidden>
      <path
        d="M30 3v10M30 47v10M3 30h10M47 30h10M11 11l7 7M42 42l7 7M49 11l-7 7M18 42l-7 7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Hand-drawn left-to-right progress bar. */
export function ProgressBar({ value, tone = "blue", className }: { value: number; tone?: Tone; className?: string }) {
  const width = Math.max(0, Math.min(100, value));
  const fill: Record<Tone, string> = {
    green: "bg-emerald-400",
    amber: "bg-amber-400",
    red: "bg-red-400",
    blue: "bg-accent",
    cyan: "bg-cyan-400",
    slate: "bg-slate-400",
  };
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="h-3 flex-1 overflow-hidden border-2 border-ink/70 bg-white hatch" style={{ borderRadius: "8px 4px 9px 5px / 5px 9px 4px 8px" }}>
        <div className={cn("h-full", fill[tone])} style={{ width: `${width}%` }} />
      </div>
      <span className="w-10 text-right font-hand text-lg text-navy-900">{Math.round(width)}%</span>
    </div>
  );
}

/* ------------------------------------------------------------------ dialog */

export function Dialog({
  open,
  title,
  onClose,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-navy-950/45 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "sketch my-6 w-full bg-paper p-0 sketch-shadow",
          size === "sm" && "max-w-sm",
          size === "md" && "max-w-xl",
          size === "lg" && "max-w-3xl"
        )}
      >
        <header className="flex items-center justify-between border-b-2 border-dashed border-ink/30 px-4 py-2.5">
          <h3 id={titleId} className="font-hand text-2xl text-navy-900">
            {title}
          </h3>
          <button onClick={onClose} aria-label="Close dialog" className="border-2 border-ink/60 p-1 hover:bg-white" style={{ borderRadius: "9px 5px 10px 6px / 6px 10px 5px 9px" }}>
            <X size={15} />
          </button>
        </header>
        <div className="px-4 py-4">{children}</div>
        {footer ? (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t-2 border-dashed border-ink/30 px-4 py-3">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  tone = "primary",
  busy,
  onConfirm,
  onCancel,
  children,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  tone?: "primary" | "danger";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  return (
    <Dialog
      open={open}
      title={title}
      onClose={onCancel}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} onClick={onConfirm} disabled={busy}>
            {busy ? "Working…" : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-2 text-sm text-ink/85">{message}</div>
      {children}
    </Dialog>
  );
}

/* ------------------------------------------------------------------- toast */

type ToastTone = "success" | "error" | "info";
type ToastItem = { id: number; tone: ToastTone; title: string; detail?: string };

const ToastContext = createContext<{
  success: (title: string, detail?: string) => void;
  error: (title: string, detail?: string) => void;
  info: (title: string, detail?: string) => void;
} | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((tone: ToastTone, title: string, detail?: string) => {
    const id = Date.now() + Math.random();
    setItems((current) => [...current, { id, tone, title, detail }]);
    window.setTimeout(() => setItems((current) => current.filter((item) => item.id !== id)), 6000);
  }, []);

  const value = {
    success: (title: string, detail?: string) => push("success", title, detail),
    error: (title: string, detail?: string) => push("error", title, detail),
    info: (title: string, detail?: string) => push("info", title, detail),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(92vw,22rem)] flex-col gap-2">
        {items.map((item) => (
          <div
            key={item.id}
            role="status"
            className={cn(
              "sketch pointer-events-auto bg-white px-3 py-2 sketch-shadow-sm",
              item.tone === "success" && "border-emerald-700",
              item.tone === "error" && "border-red-700",
              item.tone === "info" && "border-accent"
            )}
          >
            <p className="font-hand text-xl leading-tight text-navy-900">
              {item.tone === "success" ? "Done — " : item.tone === "error" ? "Hold on — " : "Note — "}
              {item.title}
            </p>
            {item.detail ? <p className="text-xs text-ink/75">{item.detail}</p> : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}
