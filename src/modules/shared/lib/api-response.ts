import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AppError, RateLimitError, ValidationError, toAppError } from './errors';
import type { Result } from './result';
import { logger } from './logger';

// Standardized JSON envelope used by EVERY route handler.
//   success -> { ok: true,  data: <payload> }
//   error   -> { ok: false, error: { code, message, fieldErrors? } }

export type ApiSuccess<T> = { ok: true; data: T };
export type ApiError = {
  ok: false;
  error: { code: string; message: string; fieldErrors?: Record<string, string[] | undefined> };
};
export type ApiResponseBody<T> = ApiSuccess<T> | ApiError;

/** 2xx success envelope. */
export function apiSuccess<T>(data: T, status = 200): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ ok: true, data } as ApiSuccess<T>, { status });
}

/** Map a typed AppError to the standardized error envelope + correct HTTP status. */
export function apiError(error: AppError): NextResponse<ApiError> {
  const body: ApiError = {
    ok: false,
    error: {
      code: error.code,
      message: error.message,
      ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}),
    },
  };
  // Never cacheable at any layer — an error is not the resource, whether it reaches the client via
  // a rejected Result or an uncaught throw (see `apiUnexpected`). Applies to every error response
  // app-wide, not just the public-cache-aware routes, since a thrown exception in a route handler
  // bypasses any route-specific cache wrapper on its way to this function.
  const headers: Record<string, string> = { 'Cache-Control': 'no-store' };
  if (error instanceof RateLimitError && error.retryAfterSeconds != null) {
    headers['Retry-After'] = String(error.retryAfterSeconds);
  }
  // Log server-side detail; only the safe code/message reaches the client (never `cause`/stack).
  if (error.httpStatus >= 500) {
    const cause = error.cause;
    logger.error('request_failed', {
      code: error.code,
      kind: error.kind,
      stack: error.stack,
      ...(cause instanceof Error
        ? { causeMessage: cause.message, causeStack: cause.stack, causeName: cause.name }
        : cause !== undefined
          ? { cause: String(cause) }
          : {}),
    });
  }
  return NextResponse.json(body, { status: error.httpStatus, headers });
}

/** Build a 400 from a ZodError with structured field errors. */
export function apiValidationError(error: z.ZodError): NextResponse<ApiError> {
  const { fieldErrors } = z.flattenError(error);
  return apiError(new ValidationError('Invalid input.', fieldErrors));
}

/** Map a service Result to a response. Success -> data envelope; Err -> mapped error. */
export function respond<T>(
  result: Result<T>,
  successStatus = 200,
): NextResponse<ApiResponseBody<T>> {
  return result.ok ? apiSuccess(result.data, successStatus) : apiError(result.error);
}

/** Last-resort wrapper: coerce any unexpected throw into a safe 500 envelope. */
export function apiUnexpected(error: unknown): NextResponse<ApiError> {
  return apiError(toAppError(error));
}

export type PublicCacheOptions = {
  /** Browser (private-cache) TTL in seconds. Kept shorter than `edgeTtl` per ADR-007's
   * "fast cache, always current" intent — a stale browser tab should catch up sooner than the
   * shared edge cache does. */
  browserTtl: number;
  /** Cloudflare/shared-cache TTL in seconds — mirrors this route's `export const revalidate`. */
  edgeTtl: number;
  staleWhileRevalidate: number;
};

/**
 * Explicit `Cache-Control` for a public, non-personalized GET response. Next.js only synthesizes
 * its own `s-maxage` header from `export const revalidate` when the handler hasn't already set
 * one (`send-payload.js`: `if (cacheControl && !res.getHeader('Cache-Control'))`), so setting this
 * here is respected as-is rather than overwritten — it's what lets browser TTL and edge TTL differ
 * intentionally instead of both inheriting the same `revalidate` value.
 */
export function withPublicCache<T>(
  response: NextResponse<T>,
  opts: PublicCacheOptions,
): NextResponse<T> {
  response.headers.set(
    'Cache-Control',
    `public, max-age=${opts.browserTtl}, s-maxage=${opts.edgeTtl}, stale-while-revalidate=${opts.staleWhileRevalidate}`,
  );
  return response;
}

/**
 * Like `respond`, but for public cacheable GET routes: a successful response gets the shared
 * public `Cache-Control` above. An error (validation failure, unexpected 500, etc.) already gets
 * `no-store` from `apiError` itself — an error is not the real resource and must never be cached
 * as if it were, at any layer.
 */
export function respondPublicCache<T>(
  result: Result<T>,
  opts: PublicCacheOptions,
  successStatus = 200,
): NextResponse<ApiResponseBody<T>> {
  const response = respond(result, successStatus);
  return result.ok ? withPublicCache(response, opts) : response;
}
