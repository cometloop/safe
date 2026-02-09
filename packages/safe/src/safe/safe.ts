import type { SafeResult, SafeHooks, SafeAsyncHooks } from './types'
import { TimeoutError } from './types'

// Type guard to distinguish hooks object from parseError function
const isHooks = <T, E, TContext extends unknown[]>(
  arg: unknown
): arg is SafeHooks<T, E, TContext> =>
  typeof arg === 'object' && arg !== null && !Array.isArray(arg)

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

// Sync overloads
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

  try {
    const rawResult = fn()
    const result = (resolvedHooks?.parseResult
      ? resolvedHooks.parseResult(rawResult)
      : rawResult) as TOut
    resolvedHooks?.onSuccess?.(result, context)
    resolvedHooks?.onSettled?.(result, null, context)
    return [result, null]
  } catch (e) {
    const error = parseError ? parseError(e) : (e as E)
    resolvedHooks?.onError?.(error, context)
    resolvedHooks?.onSettled?.(null, error, context)
    return [null, error]
  }
}

// Async overloads
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
      resolvedHooks?.onSuccess?.(result, context)
      resolvedHooks?.onSettled?.(result, null, context)
      return [result, null]
    } catch (e) {
      const error = parseError ? parseError(e) : (e as E)

      // If not the last attempt, call onRetry and potentially wait
      if (attempt < maxAttempts) {
        resolvedHooks?.onRetry?.(error, attempt, context)
        const waitMs = resolvedHooks?.retry?.waitBefore?.(attempt) ?? 0
        if (waitMs > 0) {
          await sleep(waitMs)
        }
      } else {
        // Final attempt failed, call onError
        resolvedHooks?.onError?.(error, context)
        resolvedHooks?.onSettled?.(null, error, context)
        return [null, error]
      }
    }
  }

  // This should never be reached, but TypeScript needs it
  throw new Error('Unexpected end of retry loop')
}

// Wrap overloads - preserves function parameters
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

  return (...args: TArgs) => {
    try {
      const rawResult = fn(...args)
      const result = (resolvedHooks?.parseResult
        ? resolvedHooks.parseResult(rawResult)
        : rawResult) as TOut
      resolvedHooks?.onSuccess?.(result, args)
      resolvedHooks?.onSettled?.(result, null, args)
      return [result, null]
    } catch (e) {
      const error = parseError ? parseError(e) : (e as E)
      resolvedHooks?.onError?.(error, args)
      resolvedHooks?.onSettled?.(null, error, args)
      return [null, error]
    }
  }
}

// WrapAsync overloads - preserves function parameters
// Note: When abortAfter is configured, the function receives an AbortSignal as the last argument
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

  return async (...args: TArgs) => {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // Create a fresh AbortController for each attempt if timeout is configured
      const controller = abortAfter !== undefined ? new AbortController() : undefined

      try {
        // Call function with args and optional signal appended
        // The function can accept signal as an extra argument if it wants to use it
        let promise: Promise<T>
        if (controller) {
          // Cast needed because we're dynamically adding an argument
          // The function may or may not use the signal, but it will be passed
          const argsWithSignal = [...args, controller.signal] as unknown as TArgs
          promise = fn(...argsWithSignal)
        } else {
          promise = fn(...args)
        }

        // Wrap with timeout if configured
        if (abortAfter !== undefined && controller) {
          promise = withTimeout(promise, abortAfter, controller)
        }

        const rawResult = await promise
        const result = (resolvedHooks?.parseResult
          ? resolvedHooks.parseResult(rawResult)
          : rawResult) as TOut
        resolvedHooks?.onSuccess?.(result, args)
        resolvedHooks?.onSettled?.(result, null, args)
        return [result, null]
      } catch (e) {
        const error = parseError ? parseError(e) : (e as E)

        // If not the last attempt, call onRetry and potentially wait
        if (attempt < maxAttempts) {
          resolvedHooks?.onRetry?.(error, attempt, args)
          const waitMs = resolvedHooks?.retry?.waitBefore?.(attempt) ?? 0
          if (waitMs > 0) {
            await sleep(waitMs)
          }
        } else {
          // Final attempt failed, call onError
          resolvedHooks?.onError?.(error, args)
          resolvedHooks?.onSettled?.(null, error, args)
          return [null, error]
        }
      }
    }

    // This should never be reached, but TypeScript needs it
    throw new Error('Unexpected end of retry loop')
  }
}

export const safe = {
  sync: safeSync,
  async: safeAsync,
  wrap,
  wrapAsync,
} as const

// Export individual functions for use by createSafe
export { safeSync, safeAsync, wrap, wrapAsync }
