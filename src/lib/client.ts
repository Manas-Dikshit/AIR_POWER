"use client";

import { useCallback, useEffect, useState } from "react";

/** Thin fetch wrapper: unwraps `{ data }` and raises readable errors. */
export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });

  const payload = (await response.json().catch(() => null)) as
    | { data?: T; error?: { message?: string; details?: unknown } }
    | null;

  if (!response.ok) {
    const message = payload?.error?.message ?? `Request failed (${response.status})`;
    const details = payload?.error?.details;
    const detailText =
      details && typeof details === "object" && !Array.isArray(details)
        ? Object.values(details as Record<string, string[]>)
            .flat()
            .filter(Boolean)
            .join(" ")
        : Array.isArray(details)
          ? details.join(" ")
          : "";
    throw new Error(detailText ? `${message}: ${detailText}` : message);
  }

  return payload?.data as T;
}

export const apiPost = <T,>(path: string, body?: unknown) =>
  apiRequest<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) });

export const apiPatch = <T,>(path: string, body?: unknown) =>
  apiRequest<T>(path, { method: "PATCH", body: JSON.stringify(body ?? {}) });

export const apiDelete = <T,>(path: string) => apiRequest<T>(path, { method: "DELETE" });

/**
 * Broadcasts "something changed" so every mounted view refetches. Cheaper than
 * a cache layer and it keeps modules consistent with each other.
 */
export function notifyChanged() {
  window.dispatchEvent(new Event("airpower:changed"));
}

export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!path) return;
    try {
      const result = await apiRequest<T>(path);
      setData(result);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (cancelled) return;
      await load();
    };
    run();
    const onChange = () => {
      run();
    };
    window.addEventListener("airpower:changed", onChange);
    return () => {
      cancelled = true;
      window.removeEventListener("airpower:changed", onChange);
    };
  }, [load]);

  return { data, error, loading, reload: load };
}
