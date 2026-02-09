// Result tuple: result first, error second
export type SafeResult<T, E = Error> = readonly [T, null] | readonly [null, E]

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
  /** Error mapping function applied to all caught errors */
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
 *
 * Note: When abortAfter is configured, async functions receive an AbortSignal as an
 * additional argument. The function can optionally accept this signal to handle cancellation.
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
}
