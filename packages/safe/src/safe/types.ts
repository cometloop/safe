// Falsy types that would break the `if (error)` check pattern.
// parseError returning any of these makes the error undetectable via truthiness.
type Falsy = false | 0 | '' | null | undefined | 0n | void

/**
 * Strips falsy members from E via distributive conditional.
 * When E is purely falsy (e.g. null, false, 0), the result is `never`,
 * making the parseError return type unsatisfiable — a compile error.
 *
 * For union types like `string | null`, the falsy member (`null`) is
 * stripped, so `parseError` must return `string` — which means
 * `(e: unknown) => e?.message ?? null` correctly fails to compile.
 */
export type NonFalsy<E> = E extends Falsy ? never : E

// Tagged result types: tuple intersection with discriminant properties
export type SafeOk<T> = readonly [T, null] & {
  readonly ok: true
  readonly value: T
  readonly error: null
}

export type SafeErr<E> = readonly [null, E] & {
  readonly ok: false
  readonly value: null
  readonly error: E
}

export type SafeResult<T, E = Error> = SafeOk<T> | SafeErr<E>

// Object-style result types
export type SafeOkObj<T> = {
  readonly ok: true
  readonly data: T
  readonly error: null
}

export type SafeErrObj<E> = {
  readonly ok: false
  readonly data: null
  readonly error: E
}

export type SafeResultObj<T, E = Error> = SafeOkObj<T> | SafeErrObj<E>

// Construct a success result
export function ok<T>(value: T): SafeOk<T> {
  const tuple = [value, null] as readonly [T, null]
  Object.defineProperties(tuple, {
    ok: { value: true, enumerable: false },
    value: { value, enumerable: false },
    error: { value: null, enumerable: false },
  })
  return tuple as SafeOk<T>
}

// Construct an error result
export function err<E>(error: E): SafeErr<E> {
  const tuple = [null, error] as readonly [null, E]
  Object.defineProperties(tuple, {
    ok: { value: false, enumerable: false },
    value: { value: null, enumerable: false },
    error: { value: error, enumerable: false },
  })
  return tuple as SafeErr<E>
}

// Construct a success object result
export function okObj<T>(data: T): SafeOkObj<T> {
  return { ok: true, data, error: null }
}

// Construct an error object result
export function errObj<E>(error: E): SafeErrObj<E> {
  return { ok: false, data: null, error }
}

// Timeout error class for abortAfter functionality
export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Operation timed out after ${ms}ms`)
    this.name = 'TimeoutError'
  }
}

// Retry configuration for async operations
export type RetryConfig = {
  times: number
  waitBefore?: (attempt: number) => number
}

// Hooks for side effects on success/error/settled
// TOut defaults to T — when parseResult is provided, it overrides the result type
export type SafeHooks<T, E, TContext extends unknown[] = [], TOut = T> = {
  parseResult?: (response: T) => TOut
  onSuccess?: (result: TOut, context: TContext) => void
  onError?: (error: E, context: TContext) => void
  onSettled?: (result: TOut | null, error: E | null, context: TContext) => void
  onHookError?: (error: unknown, hookName: string) => void
  /** Fallback error value returned when `parseError` throws. */
  defaultError?: E
}

// Extended hooks for async operations with retry and timeout support
export type SafeAsyncHooks<T, E, TContext extends unknown[] = [], TOut = T> = SafeHooks<T, E, TContext, TOut> & {
  onRetry?: (error: E, attempt: number, context: TContext) => void
  retry?: RetryConfig
  abortAfter?: number // timeout in milliseconds
}

/**
 * Configuration for creating a pre-configured safe instance
 * @typeParam E - The error type that parseError returns
 * @typeParam TResult - The return type of parseResult (inferred from parseResult)
 */
export type CreateSafeConfig<E, TResult = never> = {
  /**
   * Error mapping function applied to all caught errors.
   *
   * If `parseError` throws, the exception is caught and reported via `onHookError`
   * (hookName `'parseError'`). The `defaultError` value is returned as the error
   * result; if `defaultError` is not provided, the raw caught error is normalized
   * to an `Error` instance via `new Error(String(e))`.
   */
  parseError: (e: unknown) => NonFalsy<E>
  /**
   * Fallback error value returned when `parseError` throws.
   * Must be provided alongside `parseError` in `createSafe`.
   */
  defaultError: E
  /** Optional response transform applied to all successful results. Per-call parseResult overrides this. */
  parseResult?: (response: unknown) => TResult
  /** Optional default success hook (result is unknown since T varies per call) */
  onSuccess?: (result: unknown) => void
  /** Optional default error hook (receives the mapped error type E) */
  onError?: (error: E) => void
  /** Optional default settled hook — fires after success or error */
  onSettled?: (result: unknown, error: E | null) => void
  /** Optional default retry hook for async operations */
  onRetry?: (error: E, attempt: number) => void
  /** Optional default retry configuration for async operations */
  retry?: RetryConfig
  /** Optional default timeout for all async operations in milliseconds */
  abortAfter?: number
  /** Optional callback invoked when any hook throws. Receives the thrown error and the hook name. */
  onHookError?: (error: unknown, hookName: string) => void
}

/**
 * A pre-configured safe instance with a fixed error type
 * Methods do not accept parseError parameter (already configured)
 * @typeParam E - The error type used by all methods
 * @typeParam TResult - The factory parseResult return type (never = no factory parseResult)
 */
export type SafeInstance<E, TResult = never> = {
  sync: <T, TOut = [TResult] extends [never] ? T : TResult>(
    fn: () => T,
    hooks?: SafeHooks<T, E, [], TOut>
  ) => SafeResult<TOut, E>
  async: <T, TOut = [TResult] extends [never] ? T : TResult>(
    fn: (signal?: AbortSignal) => Promise<T>,
    hooks?: SafeAsyncHooks<T, E, [], TOut>
  ) => Promise<SafeResult<TOut, E>>
  wrap: <TArgs extends unknown[], T, TOut = [TResult] extends [never] ? T : TResult>(
    fn: (...args: TArgs) => T,
    hooks?: SafeHooks<T, E, TArgs, TOut>
  ) => (...args: TArgs) => SafeResult<TOut, E>
  wrapAsync: <TArgs extends unknown[], T, TOut = [TResult] extends [never] ? T : TResult>(
    fn: (...args: TArgs) => Promise<T>,
    hooks?: SafeAsyncHooks<T, E, TArgs, TOut>
  ) => (...args: TArgs) => Promise<SafeResult<TOut, E>>
  all: <T extends Record<string, (signal?: AbortSignal) => Promise<any>>>(
    fns: T
  ) => Promise<
    SafeResult<
      { [K in keyof T]: [TResult] extends [never]
        ? (T[K] extends (signal?: AbortSignal) => Promise<infer V> ? V : never)
        : TResult
      },
      E
    >
  >
  allSettled: <T extends Record<string, (signal?: AbortSignal) => Promise<any>>>(
    fns: T
  ) => Promise<{
    [K in keyof T]: SafeResult<
      [TResult] extends [never]
        ? (T[K] extends (signal?: AbortSignal) => Promise<infer V> ? V : never)
        : TResult,
      E
    >
  }>
}

/**
 * Object-style variant of SafeInstance where all methods return SafeResultObj instead of SafeResult tuples.
 * Created by wrapping a SafeInstance with withObjects().
 */
export type SafeObjectInstance<E, TResult = never> = {
  sync: <T, TOut = [TResult] extends [never] ? T : TResult>(
    fn: () => T,
    hooks?: SafeHooks<T, E, [], TOut>
  ) => SafeResultObj<TOut, E>
  async: <T, TOut = [TResult] extends [never] ? T : TResult>(
    fn: (signal?: AbortSignal) => Promise<T>,
    hooks?: SafeAsyncHooks<T, E, [], TOut>
  ) => Promise<SafeResultObj<TOut, E>>
  wrap: <TArgs extends unknown[], T, TOut = [TResult] extends [never] ? T : TResult>(
    fn: (...args: TArgs) => T,
    hooks?: SafeHooks<T, E, TArgs, TOut>
  ) => (...args: TArgs) => SafeResultObj<TOut, E>
  wrapAsync: <TArgs extends unknown[], T, TOut = [TResult] extends [never] ? T : TResult>(
    fn: (...args: TArgs) => Promise<T>,
    hooks?: SafeAsyncHooks<T, E, TArgs, TOut>
  ) => (...args: TArgs) => Promise<SafeResultObj<TOut, E>>
  all: <T extends Record<string, (signal?: AbortSignal) => Promise<any>>>(fns: T) => Promise<
    SafeResultObj<
      { [K in keyof T]: [TResult] extends [never]
        ? (T[K] extends (signal?: AbortSignal) => Promise<infer V> ? V : never)
        : TResult },
      E
    >
  >
  allSettled: <T extends Record<string, (signal?: AbortSignal) => Promise<any>>>(fns: T) => Promise<{
    [K in keyof T]: SafeResultObj<
      [TResult] extends [never]
        ? (T[K] extends (signal?: AbortSignal) => Promise<infer V> ? V : never)
        : TResult,
      E
    >
  }>
}
