import type { SafeInstance, SafeResult } from '@cometloop/safe'
import type { QueryConfig, QueryState, QueryCallable, SearchParams, QueryFnContext, LifecycleCallbacks } from './types'
import { QueryCache } from './query-cache'
import { EntityStore } from './entity-store'
import { Notifier } from './notifier'

export type QueryDeps<E> = {
  safeInstance: SafeInstance<E, any>
  queryCache: QueryCache
  entityStore: EntityStore
  notifier: Notifier
  defaultStaleTime: number
  defaultGcTime: number
}

export function createQuery<TData, E, TPath extends string, TParsed = TData>(
  config: QueryConfig<TData, TPath, TParsed>,
  deps: QueryDeps<E>
): QueryCallable<TParsed, E, TPath> {
  const {
    safeInstance,
    queryCache,
    entityStore,
    notifier,
    defaultStaleTime,
    defaultGcTime,
  } = deps

  const path = config.key
  const fn = config.fn
  const staleTime = config.staleTime ?? defaultStaleTime
  const gcTime = config.gcTime ?? defaultGcTime
  const parseResponse = config.parseResponse
  const entities = config.entities
  const retry = config.retry
  const configOnSuccess = config.onSuccess
  const configOnError = config.onError
  const configOnSettled = config.onSettled

  function getState(key: string): QueryState<TParsed, E> {
    const entry = queryCache.get(key)
    if (!entry) {
      return {
        data: undefined,
        error: null,
        status: 'idle',
        isFetching: false,
        isStale: true,
        dataUpdatedAt: null,
      }
    }

    let data: TParsed | undefined
    if (entry.normalizedData !== undefined && entities) {
      data = entityStore.denormalize(entry.normalizedData) as TParsed
    } else {
      data = entry.data as TParsed | undefined
    }

    const isStale = queryCache.isStale(entry)
    const status =
      entry.error !== null
        ? 'error'
        : entry.data !== undefined
          ? 'success'
          : entry.inflightPromise !== null
            ? 'loading'
            : 'idle'

    return {
      data,
      error: entry.error as E | null,
      status,
      isFetching: entry.inflightPromise !== null,
      isStale,
      dataUpdatedAt: entry.dataUpdatedAt,
    }
  }

  function invoke(options?: { params?: Record<string, string>; searchParams?: SearchParams; signal?: AbortSignal; enabled?: boolean } & LifecycleCallbacks<TParsed, E>): Promise<SafeResult<TParsed, E>> {
    // Skip fetch when disabled
    if (options?.enabled === false) {
      const params = options?.params
      const searchParams = options?.searchParams
      const key = queryCache.buildKey(path, params, searchParams)
      const entry = queryCache.get(key)
      if (entry?.data !== undefined) {
        const state = getState(key)
        return Promise.resolve([state.data!, null] as unknown as SafeResult<TParsed, E>)
      }
      return Promise.resolve([null, null] as unknown as SafeResult<TParsed, E>)
    }

    const invokeOnSuccess = options?.onSuccess
    const invokeOnError = options?.onError
    const invokeOnSettled = options?.onSettled

    const params = options?.params
    const searchParams = options?.searchParams
    const key = queryCache.buildKey(path, params, searchParams)
    const entry = queryCache.getOrCreate(key, staleTime, gcTime)

    // Return cached data if fresh
    if (!queryCache.isStale(entry) && entry.data !== undefined) {
      const state = getState(key)
      return Promise.resolve([state.data!, null] as unknown as SafeResult<TParsed, E>)
    }

    // Deduplication: return inflight promise
    if (entry.inflightPromise) {
      return entry.inflightPromise as Promise<SafeResult<TParsed, E>>
    }

    const generation = ++entry.generation

    const promise = safeInstance.async<TData, TParsed>(
      (signal) => {
        const context = { ...options }
        if (signal) context.signal = options?.signal ?? signal
        return fn(context as QueryFnContext<TPath>)
      },
      {
        parseResult: parseResponse as
          | ((response: TData) => TParsed)
          | undefined,
        retry,
        onSuccess: (result) => {
          // Check generation to discard stale responses
          if (entry.generation !== generation) return

          if (entities) {
            const { normalized, entityKeys } = entityStore.normalize(
              result,
              entities as Record<string, (entity: any) => string>
            )
            queryCache.setData(key, result, normalized, entityKeys)
            entityStore.registerQueryEntities(key, entityKeys)
          } else {
            queryCache.setData(key, result, undefined, new Set())
          }

          configOnSuccess?.(result)
          invokeOnSuccess?.(result)
        },
        onError: (error) => {
          if (entry.generation !== generation) return
          queryCache.setError(key, error)

          configOnError?.(error as E)
          invokeOnError?.(error as E)
        },
        onSettled: () => {
          if (entry.generation !== generation) return
          entry.inflightPromise = null
          notifier.notify(key)

          const state = getState(key)
          configOnSettled?.(state.data, state.error)
          invokeOnSettled?.(state.data, state.error)
        },
      }
    )

    entry.inflightPromise = promise as Promise<SafeResult<unknown, unknown>>
    notifier.notify(key)

    return promise
  }

  function subscribe(
    callback: (state: QueryState<TParsed, E>) => void,
    options?: { params?: Record<string, string>; searchParams?: SearchParams },
  ): () => void {
    const params = options?.params
    const searchParams = options?.searchParams

    const key = queryCache.buildKey(path, params, searchParams)
    queryCache.getOrCreate(key, staleTime, gcTime)
    queryCache.addSubscriber(key)

    const unsub = notifier.subscribe(key, () => {
      callback(getState(key))
    })

    // Initial notification
    callback(getState(key))

    return () => {
      unsub()
      queryCache.removeSubscriber(key)
    }
  }

  function invalidate(options?: { params?: Record<string, string>; searchParams?: SearchParams }): void {
    const params = options?.params
    const searchParams = options?.searchParams

    const key = queryCache.buildKey(path, params, searchParams)
    queryCache.invalidate(key)
    notifier.notify(key)
  }

  function refetch(options?: { params?: Record<string, string>; searchParams?: SearchParams }): Promise<SafeResult<TParsed, E>> {
    const params = options?.params
    const searchParams = options?.searchParams

    const key = queryCache.buildKey(path, params, searchParams)
    queryCache.invalidate(key)
    return invoke({ params, searchParams })
  }

  const callable = Object.assign(invoke, { subscribe, invalidate, refetch })

  // Attach reactive getters using default key (base path, no params)
  const defaultKey = queryCache.buildKey(path)
  Object.defineProperty(callable, 'status', {
    get() { return getState(defaultKey).status },
    enumerable: true,
  })
  Object.defineProperty(callable, 'data', {
    get() { return getState(defaultKey).data },
    enumerable: true,
  })
  Object.defineProperty(callable, 'error', {
    get() { return getState(defaultKey).error },
    enumerable: true,
  })
  Object.defineProperty(callable, 'isFetching', {
    get() { return getState(defaultKey).isFetching },
    enumerable: true,
  })
  Object.defineProperty(callable, 'isStale', {
    get() { return getState(defaultKey).isStale },
    enumerable: true,
  })

  return callable as QueryCallable<TParsed, E, TPath>
}
