import type { SafeResult, SafeHooks, SafeAsyncHooks } from './types'
import { TimeoutError, ok, err } from './types'

// Valid keys for SafeHooks and SafeAsyncHooks.
// Using Record<keyof ..., true> ensures compile-time errors if a hook key is
// added to SafeAsyncHooks but not listed here (missing key) or if a stale key
// remains after removal (extra key).
const HOOK_KEY_MAP: Record<keyof SafeAsyncHooks<any, any, any>, true> = {
  parseResult: true,
  onSuccess: true,
  onError: true,
  onSettled: true,
  onHookError: true,
  onRetry: true,
  retry: true,
  abortAfter: true,
}
const HOOK_KEYS: ReadonlySet<string> = new Set(Object.keys(HOOK_KEY_MAP))

// Type guard to distinguish hooks object from parseError function
const isHooks = <T, E, TContext extends unknown[]>(
  arg: unknown
): arg is SafeHooks<T, E, TContext> =>
  typeof arg === 'object' &&
  arg !== null &&
  !Array.isArray(arg) &&
  Object.keys(arg).every(key => HOOK_KEYS.has(key))

// Safely call a hook, swallowing any errors it throws.
// A logging hook throwing should never crash the application
// or alter the returned SafeResult.
const callHook = (
  fn: (() => void) | undefined,
  onHookError?: (error: unknown, hookName: string) => void,
  hookName?: string
): void => {
  try {
    fn?.()
  } catch (e) {
    try {
      onHookError?.(e, hookName ?? 'unknown')
    } catch {
      // onHookError itself must never throw
    }
  }
}

// Helper for async delays
const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms))

// Helper to wrap a promise with timeout
const withTimeout = <T>(
  promise: Promise<T>,
  ms: number,
  controller: AbortController
): Promise<T> => {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      controller.abort()
      reject(new TimeoutError(ms))
    }, ms)

    promise
      .then(resolve)
      .catch(reject)
      .finally(() => clearTimeout(timeoutId))
  })
}

/**
 * Execute a synchronous function and return a result tuple instead of throwing.
 *
 * Catches any error thrown by `fn` and returns `[null, error]`.
 * On success, returns `[result, null]`.
 *
 * @param fn - The synchronous function to execute.
 * @param parseError - Optional function to transform the caught error into a custom type `E`.
 *   Unlike hooks, `parseError` is **not** wrapped in a try/catch — if it throws,
 *   the exception propagates uncaught past the safe boundary. Ensure it does not throw.
 * @param hooks - Optional hooks for side effects (`parseResult`, `onSuccess`, `onError`, `onSettled`).
 * @returns A `SafeResult<T, E>` tuple: `[value, null]` on success or `[null, error]` on failure.
 *
 * @example
 * ```typescript
 * const [user, error] = safe.sync(() => JSON.parse(rawJson))
 *
 * // With custom error parsing and hooks
 * const [value, err] = safe.sync(
 *   () => riskyOperation(),
 *   (e) => ({ code: 'PARSE_ERROR', message: String(e) }),
 *   { onError: (error) => console.error(error.code) }
 * )
 * ```
 */
function safeSync<T>(fn: () => T): SafeResult<T, Error>
function safeSync<T, TOut = T>(
  fn: () => T,
  hooks: SafeHooks<T, Error, [], TOut>
): SafeResult<TOut, Error>
function safeSync<T, E>(
  fn: () => T,
  parseError: (e: unknown) => E
): SafeResult<T, E>
function safeSync<T, E, TOut = T>(
  fn: () => T,
  parseError: (e: unknown) => E,
  hooks: SafeHooks<T, E, [], TOut>
): SafeResult<TOut, E>
function safeSync<T, E = Error, TOut = T>(
  fn: () => T,
  parseErrorOrHooks?: ((e: unknown) => E) | SafeHooks<T, E, [], TOut>,
  hooks?: SafeHooks<T, E, [], TOut>
): SafeResult<TOut, E> {
  const context: [] = []
  let parseError: ((e: unknown) => E) | undefined
  let resolvedHooks: SafeHooks<T, E, [], TOut> | undefined

  if (isHooks<T, E, []>(parseErrorOrHooks)) {
    resolvedHooks = parseErrorOrHooks as SafeHooks<T, E, [], TOut>
  } else {
    parseError = parseErrorOrHooks as ((e: unknown) => E) | undefined
    resolvedHooks = hooks
  }

  const onHookError = resolvedHooks?.onHookError

  try {
    const rawResult = fn()
    const result = (resolvedHooks?.parseResult
      ? resolvedHooks.parseResult(rawResult)
      : rawResult) as TOut
    callHook(() => resolvedHooks?.onSuccess?.(result, context), onHookError, 'onSuccess')
    callHook(() => resolvedHooks?.onSettled?.(result, null, context), onHookError, 'onSettled')
    return ok(result)
  } catch (e) {
    const error = parseError ? parseError(e) : (e as E)
    callHook(() => resolvedHooks?.onError?.(error, context), onHookError, 'onError')
    callHook(() => resolvedHooks?.onSettled?.(null, error, context), onHookError, 'onSettled')
    return err(error)
  }
}

/**
 * Execute an asynchronous function and return a result tuple instead of throwing.
 *
 * Catches any error thrown or rejected by `fn` and returns `[null, error]`.
 * On success, returns `[result, null]`. Supports retry and timeout via hooks.
 *
 * @param fn - The async function to execute. Receives an optional `AbortSignal` when `abortAfter` is configured.
 * @param parseError - Optional function to transform the caught error into a custom type `E`.
 *   Unlike hooks, `parseError` is **not** wrapped in a try/catch — if it throws,
 *   the exception propagates uncaught past the safe boundary. Ensure it does not throw.
 * @param hooks - Optional hooks including `retry`, `abortAfter`, `onRetry`, `parseResult`, `onSuccess`, `onError`, `onSettled`.
 * @returns A `Promise<SafeResult<T, E>>` tuple: `[value, null]` on success or `[null, error]` on failure.
 *
 * @example
 * ```typescript
 * const [data, error] = await safe.async(() => fetch('/api/users').then(r => r.json()))
 *
 * // With retry and timeout
 * const [data, error] = await safe.async(
 *   (signal) => fetch('/api/users', { signal }).then(r => r.json()),
 *   { retry: { times: 3 }, abortAfter: 5000 }
 * )
 * ```
 */
function safeAsync<T>(fn: (signal?: AbortSignal) => Promise<T>): Promise<SafeResult<T, Error>>
function safeAsync<T, TOut = T>(
  fn: (signal?: AbortSignal) => Promise<T>,
  hooks: SafeAsyncHooks<T, Error, [], TOut>
): Promise<SafeResult<TOut, Error>>
function safeAsync<T, E>(
  fn: (signal?: AbortSignal) => Promise<T>,
  parseError: (e: unknown) => E
): Promise<SafeResult<T, E>>
function safeAsync<T, E, TOut = T>(
  fn: (signal?: AbortSignal) => Promise<T>,
  parseError: (e: unknown) => E,
  hooks: SafeAsyncHooks<T, E, [], TOut>
): Promise<SafeResult<TOut, E>>
async function safeAsync<T, E = Error, TOut = T>(
  fn: (signal?: AbortSignal) => Promise<T>,
  parseErrorOrHooks?: ((e: unknown) => E) | SafeAsyncHooks<T, E, [], TOut>,
  hooks?: SafeAsyncHooks<T, E, [], TOut>
): Promise<SafeResult<TOut, E>> {
  const context: [] = []
  let parseError: ((e: unknown) => E) | undefined
  let resolvedHooks: SafeAsyncHooks<T, E, [], TOut> | undefined

  if (isHooks<T, E, []>(parseErrorOrHooks)) {
    resolvedHooks = parseErrorOrHooks as SafeAsyncHooks<T, E, [], TOut>
  } else {
    parseError = parseErrorOrHooks as ((e: unknown) => E) | undefined
    resolvedHooks = hooks
  }

  const maxAttempts = (resolvedHooks?.retry?.times ?? 0) + 1
  const abortAfter = resolvedHooks?.abortAfter
  const onHookError = resolvedHooks?.onHookError
  let lastError!: E

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Create a fresh AbortController for each attempt if timeout is configured
    const controller = abortAfter !== undefined ? new AbortController() : undefined

    try {
      let promise = fn(controller?.signal)

      // Wrap with timeout if configured
      if (abortAfter !== undefined && controller) {
        promise = withTimeout(promise, abortAfter, controller)
      }

      const rawResult = await promise
      const result = (resolvedHooks?.parseResult
        ? resolvedHooks.parseResult(rawResult)
        : rawResult) as TOut
      callHook(() => resolvedHooks?.onSuccess?.(result, context), onHookError, 'onSuccess')
      callHook(() => resolvedHooks?.onSettled?.(result, null, context), onHookError, 'onSettled')
      return ok(result)
    } catch (e) {
      lastError = parseError ? parseError(e) : (e as E)

      // If not the last attempt, call onRetry and potentially wait
      if (attempt < maxAttempts) {
        callHook(() => resolvedHooks?.onRetry?.(lastError, attempt, context), onHookError, 'onRetry')
        const waitMs = resolvedHooks?.retry?.waitBefore?.(attempt) ?? 0
        if (waitMs > 0) {
          await sleep(waitMs)
        }
      }
    }
  }

  callHook(() => resolvedHooks?.onError?.(lastError, context), onHookError, 'onError')
  callHook(() => resolvedHooks?.onSettled?.(null, lastError, context), onHookError, 'onSettled')
  return err(lastError)
}

/**
 * Wrap a synchronous function so it returns a result tuple instead of throwing.
 *
 * Returns a new function with the same parameter signature that catches
 * errors and returns `[null, error]` instead of throwing. The original
 * arguments are passed through to hooks as context.
 *
 * @param fn - The synchronous function to wrap.
 * @param parseError - Optional function to transform the caught error into a custom type `E`.
 *   Unlike hooks, `parseError` is **not** wrapped in a try/catch — if it throws,
 *   the exception propagates uncaught past the safe boundary. Ensure it does not throw.
 * @param hooks - Optional hooks for side effects (`parseResult`, `onSuccess`, `onError`, `onSettled`). Hooks receive the original call arguments as context.
 * @returns A wrapped function `(...args) => SafeResult<T, E>`.
 *
 * @example
 * ```typescript
 * const safeJsonParse = safe.wrap(JSON.parse)
 * const [data, error] = safeJsonParse('{"valid": true}')
 *
 * // With hooks that receive the original arguments
 * const safeDivide = safe.wrap(
 *   (a: number, b: number) => { if (b === 0) throw new Error('Division by zero'); return a / b },
 *   { onError: (error, [a, b]) => console.error(`Failed to divide ${a} by ${b}`) }
 * )
 * ```
 */
function wrap<TArgs extends unknown[], T>(
  fn: (...args: TArgs) => T
): (...args: TArgs) => SafeResult<T, Error>
function wrap<TArgs extends unknown[], T, TOut = T>(
  fn: (...args: TArgs) => T,
  hooks: SafeHooks<T, Error, TArgs, TOut>
): (...args: TArgs) => SafeResult<TOut, Error>
function wrap<TArgs extends unknown[], T, E>(
  fn: (...args: TArgs) => T,
  parseError: (e: unknown) => E
): (...args: TArgs) => SafeResult<T, E>
function wrap<TArgs extends unknown[], T, E, TOut = T>(
  fn: (...args: TArgs) => T,
  parseError: (e: unknown) => E,
  hooks: SafeHooks<T, E, TArgs, TOut>
): (...args: TArgs) => SafeResult<TOut, E>
function wrap<TArgs extends unknown[], T, E = Error, TOut = T>(
  fn: (...args: TArgs) => T,
  parseErrorOrHooks?: ((e: unknown) => E) | SafeHooks<T, E, TArgs, TOut>,
  hooks?: SafeHooks<T, E, TArgs, TOut>
): (...args: TArgs) => SafeResult<TOut, E> {
  let parseError: ((e: unknown) => E) | undefined
  let resolvedHooks: SafeHooks<T, E, TArgs, TOut> | undefined

  if (isHooks<T, E, TArgs>(parseErrorOrHooks)) {
    resolvedHooks = parseErrorOrHooks as SafeHooks<T, E, TArgs, TOut>
  } else {
    parseError = parseErrorOrHooks as ((e: unknown) => E) | undefined
    resolvedHooks = hooks
  }

  const onHookError = resolvedHooks?.onHookError

  return (...args: TArgs) => {
    try {
      const rawResult = fn(...args)
      const result = (resolvedHooks?.parseResult
        ? resolvedHooks.parseResult(rawResult)
        : rawResult) as TOut
      callHook(() => resolvedHooks?.onSuccess?.(result, args), onHookError, 'onSuccess')
      callHook(() => resolvedHooks?.onSettled?.(result, null, args), onHookError, 'onSettled')
      return ok(result)
    } catch (e) {
      const error = parseError ? parseError(e) : (e as E)
      callHook(() => resolvedHooks?.onError?.(error, args), onHookError, 'onError')
      callHook(() => resolvedHooks?.onSettled?.(null, error, args), onHookError, 'onSettled')
      return err(error)
    }
  }
}

/**
 * Wrap an asynchronous function so it returns a result tuple instead of throwing.
 *
 * Returns a new function with the same parameter signature that catches
 * errors and returns `[null, error]` instead of throwing. Supports retry
 * and timeout via hooks.
 *
 * **Note on `abortAfter`:** When configured, `abortAfter` acts as an external
 * deadline — the promise is rejected with a `TimeoutError` after the specified
 * duration, but the wrapped function does **not** receive an `AbortSignal`.
 * This means the underlying operation will continue running in the background
 * even after the timeout fires. If you need cooperative cancellation (e.g.
 * passing a signal to `fetch`), use {@link safeAsync | safe.async} instead,
 * which passes the signal directly to the function:
 *
 * ```typescript
 * // Cooperative cancellation with safe.async
 * const [data, error] = await safe.async(
 *   (signal) => fetch('/api/data', { signal }),
 *   { abortAfter: 5000 }
 * )
 * ```
 *
 * @param fn - The async function to wrap.
 * @param parseError - Optional function to transform the caught error into a custom type `E`.
 *   Unlike hooks, `parseError` is **not** wrapped in a try/catch — if it throws,
 *   the exception propagates uncaught past the safe boundary. Ensure it does not throw.
 * @param hooks - Optional hooks including `retry`, `abortAfter`, `onRetry`, `parseResult`, `onSuccess`, `onError`, `onSettled`. Hooks receive the original call arguments as context.
 * @returns A wrapped function `(...args) => Promise<SafeResult<T, E>>`.
 *
 * @example
 * ```typescript
 * const safeFetchUser = safe.wrapAsync(
 *   (id: string) => fetch(`/api/users/${id}`).then(r => r.json())
 * )
 * const [user, error] = await safeFetchUser('123')
 *
 * // With retry
 * const safeFetch = safe.wrapAsync(
 *   (url: string) => fetch(url).then(r => r.json()),
 *   { retry: { times: 3, waitBefore: (attempt) => attempt * 1000 } }
 * )
 * ```
 */
function wrapAsync<TArgs extends unknown[], T>(
  fn: (...args: TArgs) => Promise<T>
): (...args: TArgs) => Promise<SafeResult<T, Error>>
function wrapAsync<TArgs extends unknown[], T, TOut = T>(
  fn: (...args: TArgs) => Promise<T>,
  hooks: SafeAsyncHooks<T, Error, TArgs, TOut>
): (...args: TArgs) => Promise<SafeResult<TOut, Error>>
function wrapAsync<TArgs extends unknown[], T, E>(
  fn: (...args: TArgs) => Promise<T>,
  parseError: (e: unknown) => E
): (...args: TArgs) => Promise<SafeResult<T, E>>
function wrapAsync<TArgs extends unknown[], T, E, TOut = T>(
  fn: (...args: TArgs) => Promise<T>,
  parseError: (e: unknown) => E,
  hooks: SafeAsyncHooks<T, E, TArgs, TOut>
): (...args: TArgs) => Promise<SafeResult<TOut, E>>
function wrapAsync<TArgs extends unknown[], T, E = Error, TOut = T>(
  fn: (...args: TArgs) => Promise<T>,
  parseErrorOrHooks?: ((e: unknown) => E) | SafeAsyncHooks<T, E, TArgs, TOut>,
  hooks?: SafeAsyncHooks<T, E, TArgs, TOut>
): (...args: TArgs) => Promise<SafeResult<TOut, E>> {
  let parseError: ((e: unknown) => E) | undefined
  let resolvedHooks: SafeAsyncHooks<T, E, TArgs, TOut> | undefined

  if (isHooks<T, E, TArgs>(parseErrorOrHooks)) {
    resolvedHooks = parseErrorOrHooks as SafeAsyncHooks<T, E, TArgs, TOut>
  } else {
    parseError = parseErrorOrHooks as ((e: unknown) => E) | undefined
    resolvedHooks = hooks
  }

  const maxAttempts = (resolvedHooks?.retry?.times ?? 0) + 1
  const abortAfter = resolvedHooks?.abortAfter
  const onHookError = resolvedHooks?.onHookError

  return async (...args: TArgs) => {
    let lastError!: E

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // Create a fresh AbortController for each attempt if timeout is configured
      const controller = abortAfter !== undefined ? new AbortController() : undefined

      try {
        let promise = fn(...args)

        // Wrap with timeout if configured
        if (abortAfter !== undefined && controller) {
          promise = withTimeout(promise, abortAfter, controller)
        }

        const rawResult = await promise
        const result = (resolvedHooks?.parseResult
          ? resolvedHooks.parseResult(rawResult)
          : rawResult) as TOut
        callHook(() => resolvedHooks?.onSuccess?.(result, args), onHookError, 'onSuccess')
        callHook(() => resolvedHooks?.onSettled?.(result, null, args), onHookError, 'onSettled')
        return ok(result)
      } catch (e) {
        lastError = parseError ? parseError(e) : (e as E)

        // If not the last attempt, call onRetry and potentially wait
        if (attempt < maxAttempts) {
          callHook(() => resolvedHooks?.onRetry?.(lastError, attempt, args), onHookError, 'onRetry')
          const waitMs = resolvedHooks?.retry?.waitBefore?.(attempt) ?? 0
          if (waitMs > 0) {
            await sleep(waitMs)
          }
        }
      }
    }

    callHook(() => resolvedHooks?.onError?.(lastError, args), onHookError, 'onError')
    callHook(() => resolvedHooks?.onSettled?.(null, lastError, args), onHookError, 'onSettled')
    return err(lastError)
  }
}

/**
 * Run multiple safe-wrapped async operations in parallel and return all values or the first error.
 *
 * Accepts an object map of `Promise<SafeResult>` entries. If all succeed, returns
 * `ok({ key: value, ... })` with unwrapped values. If any fail, returns `err(firstError)`.
 *
 * @param promises - An object map of `Promise<SafeResult<T, E>>` entries.
 * @returns A `Promise<SafeResult<{ [K]: V }, E>>` — all values on success, first error on failure.
 *
 * @example
 * ```typescript
 * const [data, error] = await safe.all({
 *   user: safe.async(() => fetchUser()),
 *   posts: safe.async(() => fetchPosts()),
 * })
 * if (error) return handleError(error)
 * data.user   // User
 * data.posts  // Post[]
 * ```
 */
async function safeAll<T extends Record<string, Promise<SafeResult<any, any>>>>(
  promises: T
): Promise<
  SafeResult<
    { [K in keyof T]: T[K] extends Promise<SafeResult<infer V, any>> ? V : never },
    T[keyof T] extends Promise<SafeResult<any, infer E>> ? E : never
  >
> {
  const keys = Object.keys(promises)
  const values = Object.values(promises)
  const results = await Promise.all(values)

  for (const result of results) {
    if (!result.ok) {
      return err(result[1]) as any
    }
  }

  const obj: Record<string, unknown> = {}
  for (let i = 0; i < keys.length; i++) {
    obj[keys[i]] = results[i][0]
  }

  return ok(obj) as any
}

/**
 * Run multiple safe-wrapped async operations in parallel and return all individual results.
 *
 * Accepts an object map of `Promise<SafeResult>` entries. Always returns all results
 * as named SafeResult entries — never fails at the group level.
 *
 * @param promises - An object map of `Promise<SafeResult<T, E>>` entries.
 * @returns A `Promise<{ [K]: SafeResult<V, E> }>` — each key maps to its individual result.
 *
 * @example
 * ```typescript
 * const results = await safe.allSettled({
 *   user: safe.async(() => fetchUser()),
 *   posts: safe.async(() => fetchPosts()),
 * })
 * if (results.user.ok) {
 *   results.user.value  // User
 * }
 * if (!results.posts.ok) {
 *   results.posts.error  // Error
 * }
 * ```
 */
async function safeAllSettled<T extends Record<string, Promise<SafeResult<any, any>>>>(
  promises: T
): Promise<{ [K in keyof T]: Awaited<T[K]> }> {
  const keys = Object.keys(promises)
  const values = Object.values(promises)
  const results = await Promise.all(values)

  const obj: Record<string, unknown> = {}
  for (let i = 0; i < keys.length; i++) {
    obj[keys[i]] = results[i]
  }

  return obj as any
}

export const safe = {
  sync: safeSync,
  async: safeAsync,
  wrap,
  wrapAsync,
  all: safeAll,
  allSettled: safeAllSettled,
} as const

// Export individual functions for use by createSafe
export { safeSync, safeAsync, wrap, wrapAsync, safeAll, safeAllSettled, callHook }
