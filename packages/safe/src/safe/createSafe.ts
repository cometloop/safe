import type { SafeResult, SafeHooks, SafeAsyncHooks, CreateSafeConfig, SafeInstance } from './types'
import { ok, err } from './types'
import { safeSync, safeAsync, wrap, wrapAsync, callHook, toError, callParseError } from './safe'

// Utility types for typed assertions in all/allSettled (mirrors SafeInstance declarations)
type AllValues<
  T extends Record<string, (signal?: AbortSignal) => Promise<any>>,
  TResult
> = {
  [K in keyof T]: [TResult] extends [never]
    ? (T[K] extends (signal?: AbortSignal) => Promise<infer V> ? V : never)
    : TResult
}

type AllSettledResults<
  T extends Record<string, (signal?: AbortSignal) => Promise<any>>,
  E,
  TResult
> = {
  [K in keyof T]: SafeResult<
    [TResult] extends [never]
      ? (T[K] extends (signal?: AbortSignal) => Promise<infer V> ? V : never)
      : TResult,
    E
  >
}

/**
 * Create a pre-configured safe instance with a fixed error mapping function
 *
 * Returns a new safe object where all methods use the configured parseError.
 * The error type E is automatically inferred from the parseError return type.
 * If parseResult is provided, TResult is inferred from its return type
 * and becomes the default result type for all methods.
 *
 * @example
 * ```typescript
 * const appSafe = createSafe({
 *   parseError: (e) => ({
 *     code: 'UNKNOWN_ERROR',
 *     message: e instanceof Error ? e.message : 'Unknown error',
 *   }),
 *   onError: (error) => logger.error(error.code),
 * })
 *
 * const [result, error] = appSafe.sync(() => JSON.parse(data))
 * // error is typed as { code: string; message: string }
 *
 * // With parseResult for runtime validation:
 * const validatedSafe = createSafe({
 *   parseError: (e) => toAppError(e),
 *   parseResult: (response) => schema.parse(response),
 * })
 * // All methods return SafeResult<z.infer<typeof schema>, AppError>
 * ```
 */
export function createSafe<E, TResult = never>(config: CreateSafeConfig<E, TResult>): SafeInstance<E, TResult> {
  const {
    parseError,
    defaultError,
    parseResult: defaultParseResult,
    onSuccess: defaultOnSuccess,
    onError: defaultOnError,
    onSettled: defaultOnSettled,
    onRetry: defaultOnRetry,
    retry: defaultRetry,
    abortAfter: defaultAbortAfter,
    onHookError: defaultOnHookError,
  } = config

  const mergeHooks = <T, TContext extends unknown[], TOut>(
    hooks?: SafeHooks<T, E, TContext, TOut>
  ): SafeHooks<T, E, TContext, TOut> => {
    const onHookError = hooks?.onHookError ?? defaultOnHookError
    return {
      parseResult: (hooks?.parseResult
        ?? defaultParseResult) as SafeHooks<T, E, TContext, TOut>['parseResult'],
      onSuccess: (result, context) => {
        callHook(() => defaultOnSuccess?.(result), onHookError, 'onSuccess')
        hooks?.onSuccess?.(result, context)
      },
      onError: (error, context) => {
        callHook(() => defaultOnError?.(error), onHookError, 'onError')
        hooks?.onError?.(error, context)
      },
      onSettled: (result, error, context) => {
        callHook(() => defaultOnSettled?.(result, error), onHookError, 'onSettled')
        hooks?.onSettled?.(result, error, context)
      },
      onHookError,
      defaultError: hooks?.defaultError ?? defaultError,
    }
  }

  const mergeAsyncHooks = <T, TContext extends unknown[], TOut>(
    hooks?: SafeAsyncHooks<T, E, TContext, TOut>
  ): SafeAsyncHooks<T, E, TContext, TOut> => {
    const onHookError = hooks?.onHookError ?? defaultOnHookError
    return {
      parseResult: (hooks?.parseResult
        ?? defaultParseResult) as SafeAsyncHooks<T, E, TContext, TOut>['parseResult'],
      onSuccess: (result, context) => {
        callHook(() => defaultOnSuccess?.(result), onHookError, 'onSuccess')
        hooks?.onSuccess?.(result, context)
      },
      onError: (error, context) => {
        callHook(() => defaultOnError?.(error), onHookError, 'onError')
        hooks?.onError?.(error, context)
      },
      onSettled: (result, error, context) => {
        callHook(() => defaultOnSettled?.(result, error), onHookError, 'onSettled')
        hooks?.onSettled?.(result, error, context)
      },
      onRetry: (error, attempt, context) => {
        callHook(() => defaultOnRetry?.(error, attempt), onHookError, 'onRetry')
        hooks?.onRetry?.(error, attempt, context)
      },
      // Per-call retry completely overrides default retry
      retry: hooks?.retry ?? defaultRetry,
      // Per-call abortAfter overrides default abortAfter
      abortAfter: hooks?.abortAfter ?? defaultAbortAfter,
      onHookError,
      defaultError: hooks?.defaultError ?? defaultError,
    }
  }

  return {
    sync: <T, TOut = [TResult] extends [never] ? T : TResult>(
      fn: () => T,
      hooks?: SafeHooks<T, E, [], TOut>
    ): SafeResult<TOut, E> => {
      return safeSync(fn, parseError, mergeHooks<T, [], TOut>(hooks) as SafeHooks<T, E, [], TOut> & { defaultError: E })
    },
    async: <T, TOut = [TResult] extends [never] ? T : TResult>(
      fn: (signal?: AbortSignal) => Promise<T>,
      hooks?: SafeAsyncHooks<T, E, [], TOut>
    ): Promise<SafeResult<TOut, E>> => {
      return safeAsync(fn, parseError, mergeAsyncHooks<T, [], TOut>(hooks) as SafeAsyncHooks<T, E, [], TOut> & { defaultError: E })
    },
    wrap: <TArgs extends unknown[], T, TOut = [TResult] extends [never] ? T : TResult>(
      fn: (...args: TArgs) => T,
      hooks?: SafeHooks<T, E, TArgs, TOut>
    ): ((...args: TArgs) => SafeResult<TOut, E>) => {
      return wrap(fn, parseError, mergeHooks<T, TArgs, TOut>(hooks) as SafeHooks<T, E, TArgs, TOut> & { defaultError: E })
    },
    wrapAsync: <TArgs extends unknown[], T, TOut = [TResult] extends [never] ? T : TResult>(
      fn: (...args: TArgs) => Promise<T>,
      hooks?: SafeAsyncHooks<T, E, TArgs, TOut>
    ): ((...args: TArgs) => Promise<SafeResult<TOut, E>>) => {
      return wrapAsync(fn, parseError, mergeAsyncHooks<T, TArgs, TOut>(hooks) as SafeAsyncHooks<T, E, TArgs, TOut> & { defaultError: E })
    },
    all: <T extends Record<string, (signal?: AbortSignal) => Promise<any>>>(
      fns: T
    ) => {
      type Result = SafeResult<AllValues<T, TResult>, E>

      const keys = Object.keys(fns)
      const promises = keys.map(key =>
        safeAsync(fns[key], parseError, mergeAsyncHooks<unknown, [], unknown>() as SafeAsyncHooks<unknown, E, [], unknown> & { defaultError: E })
      )

      if (promises.length === 0) {
        return Promise.resolve(ok({}) as Result)
      }

      return new Promise<Result>((resolve) => {
        const results = new Array<SafeResult<unknown, unknown>>(promises.length)
        let remaining = promises.length
        let done = false

        for (let i = 0; i < promises.length; i++) {
          promises[i].then(
            (result) => {
              if (done) return
              if (!result.ok) {
                done = true
                resolve(err(result.error) as Result)
                return
              }
              results[i] = result
              remaining--
              if (remaining === 0) {
                done = true
                const obj: Record<string, unknown> = {}
                for (let j = 0; j < keys.length; j++) {
                  obj[keys[j]] = results[j].value
                }
                resolve(ok(obj) as Result)
              }
            },
            (rejection) => {
              if (done) return
              done = true
              resolve(err(callParseError(rejection, parseError, defaultOnHookError, defaultError)) as Result)
            },
          )
        }
      })
    },
    allSettled: async <T extends Record<string, (signal?: AbortSignal) => Promise<any>>>(
      fns: T
    ) => {
      type Settled = AllSettledResults<T, E, TResult>

      const keys = Object.keys(fns)
      const promises = keys.map(key =>
        safeAsync(fns[key], parseError, mergeAsyncHooks<unknown, [], unknown>() as SafeAsyncHooks<unknown, E, [], unknown> & { defaultError: E })
      )
      const results = await Promise.all(promises)

      const obj: Record<string, unknown> = {}
      for (let i = 0; i < keys.length; i++) {
        obj[keys[i]] = results[i]
      }

      return obj as Settled
    },
  }
}
