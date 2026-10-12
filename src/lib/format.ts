import { HUMAN_LABELS } from "./domain";

export function humanise(value: string | null | undefined): string {
  if (!value) return "—";
  return HUMAN_LABELS[value] ?? value.replaceAll("_", " ");
}

export function formatWhen(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRelative(value: string | Date | null | undefined, from: Date = new Date()): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  const diffMinutes = Math.round((date.getTime() - from.getTime()) / 60000);
  const abs = Math.abs(diffMinutes);
  const text = abs < 60 ? `${abs}m` : abs < 60 * 48 ? `${Math.round(abs / 60)}h` : `${Math.round(abs / 1440)}d`;
  return diffMinutes >= 0 ? `in ${text}` : `${text} ago`;
}

export function formatDays(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toISOString().slice(0, 10);
}
