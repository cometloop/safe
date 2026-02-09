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
   * **Important:** Unlike hooks (`onError`, `onSuccess`, etc.), `parseError` is
   * **not** wrapped in a try/catch. If this function throws, the exception will
   * propagate uncaught past the safe boundary. This is intentional — `parseError`
   * is part of the error-handling contract (its return value determines the `E` in
   * `SafeResult<T, E>`), so there is no meaningful way to represent a failure
   * inside `parseError` as a `SafeResult`. Ensure this function does not throw.
   */
  parseError: (e: unknown) => E
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
  all: <T extends Record<string, Promise<SafeResult<any, any>>>>(
    promises: T
  ) => Promise<
    SafeResult<
      { [K in keyof T]: T[K] extends Promise<SafeResult<infer V, any>> ? V : never },
      T[keyof T] extends Promise<SafeResult<any, infer EE>> ? EE : never
    >
  >
  allSettled: <T extends Record<string, Promise<SafeResult<any, any>>>>(
    promises: T
  ) => Promise<{ [K in keyof T]: Awaited<T[K]> }>
}
