import type { SafeResult, SafeHooks, SafeAsyncHooks, CreateSafeConfig, SafeInstance } from './types'
import { safeSync, safeAsync, wrap, wrapAsync, safeAll, safeAllSettled, callHook } from './safe'

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
        callHook(() => hooks?.onSuccess?.(result, context), onHookError, 'onSuccess')
      },
      onError: (error, context) => {
        callHook(() => defaultOnError?.(error), onHookError, 'onError')
        callHook(() => hooks?.onError?.(error, context), onHookError, 'onError')
      },
      onSettled: (result, error, context) => {
        callHook(() => defaultOnSettled?.(result, error), onHookError, 'onSettled')
        callHook(() => hooks?.onSettled?.(result, error, context), onHookError, 'onSettled')
      },
      onHookError,
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
        callHook(() => hooks?.onSuccess?.(result, context), onHookError, 'onSuccess')
      },
      onError: (error, context) => {
        callHook(() => defaultOnError?.(error), onHookError, 'onError')
        callHook(() => hooks?.onError?.(error, context), onHookError, 'onError')
      },
      onSettled: (result, error, context) => {
        callHook(() => defaultOnSettled?.(result, error), onHookError, 'onSettled')
        callHook(() => hooks?.onSettled?.(result, error, context), onHookError, 'onSettled')
      },
      onRetry: (error, attempt, context) => {
        callHook(() => defaultOnRetry?.(error, attempt), onHookError, 'onRetry')
        callHook(() => hooks?.onRetry?.(error, attempt, context), onHookError, 'onRetry')
      },
      // Per-call retry completely overrides default retry
      retry: hooks?.retry ?? defaultRetry,
      // Per-call abortAfter overrides default abortAfter
      abortAfter: hooks?.abortAfter ?? defaultAbortAfter,
      onHookError,
    }
  }

  return {
    sync: <T, TOut = [TResult] extends [never] ? T : TResult>(
      fn: () => T,
      hooks?: SafeHooks<T, E, [], TOut>
    ): SafeResult<TOut, E> => {
      return safeSync(fn, parseError, mergeHooks<T, [], TOut>(hooks))
    },
    async: <T, TOut = [TResult] extends [never] ? T : TResult>(
      fn: (signal?: AbortSignal) => Promise<T>,
      hooks?: SafeAsyncHooks<T, E, [], TOut>
    ): Promise<SafeResult<TOut, E>> => {
      return safeAsync(fn, parseError, mergeAsyncHooks<T, [], TOut>(hooks))
    },
    wrap: <TArgs extends unknown[], T, TOut = [TResult] extends [never] ? T : TResult>(
      fn: (...args: TArgs) => T,
      hooks?: SafeHooks<T, E, TArgs, TOut>
    ): ((...args: TArgs) => SafeResult<TOut, E>) => {
      return wrap(fn, parseError, mergeHooks<T, TArgs, TOut>(hooks))
    },
    wrapAsync: <TArgs extends unknown[], T, TOut = [TResult] extends [never] ? T : TResult>(
      fn: (...args: TArgs) => Promise<T>,
      hooks?: SafeAsyncHooks<T, E, TArgs, TOut>
    ): ((...args: TArgs) => Promise<SafeResult<TOut, E>>) => {
      return wrapAsync(fn, parseError, mergeAsyncHooks<T, TArgs, TOut>(hooks))
    },
    all: safeAll,
    allSettled: safeAllSettled,
  }
}
