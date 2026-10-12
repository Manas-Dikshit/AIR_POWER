import { NextResponse } from "next/server";
import { ZodError, type ZodSchema } from "zod";

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ data }, { status });
}

export function fail(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ error: { message, details } }, { status });
}

/** Thrown by service functions; mapped to a JSON response by `handle`. */
export class ServiceError extends Error {
  constructor(
    message: string,
    public status = 400,
    public details?: unknown
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

/** Wraps a route handler with consistent error mapping. */
export async function handle(fn: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof ServiceError) return fail(error.message, error.status, error.details);
    if (error instanceof ZodError) return fail("Validation failed", 422, error.flatten().fieldErrors);
    console.error("[api] unhandled error", error);
    return fail("Unexpected server error", 500);
  }
}

/** Parses and validates a JSON body, raising a 422 ServiceError on bad input. */
export async function parseBody<T>(request: Request, schema: ZodSchema<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ServiceError("Request body must be valid JSON", 400);
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ServiceError("Validation failed", 422, result.error.flatten().fieldErrors);
  }
  return result.data;
}
