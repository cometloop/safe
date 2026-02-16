import type { SafeInstance, SafeResult } from '@cometloop/safe'
import type { QueryConfig, QueryState, QueryCallable, SearchParams } from './types'
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

export function createQuery<TData, E, TPath extends string>(
  config: QueryConfig<TData, TPath>,
  deps: QueryDeps<E>
): QueryCallable<TData, E, TPath> {
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

  let lastKey: string | undefined

  function getState(key: string): QueryState<TData, E> {
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

    let data: TData | undefined
    if (entry.normalizedData !== undefined && entities) {
      data = entityStore.denormalize(entry.normalizedData) as TData
    } else {
      data = entry.data as TData | undefined
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

  function invoke(options?: any): Promise<SafeResult<TData, E>> {
    const params = options?.params
    const searchParams = options?.searchParams
    const key = queryCache.buildKey(path, params, searchParams)
    lastKey = key
    const entry = queryCache.getOrCreate(key, staleTime, gcTime)

    // Return cached data if fresh
    if (!queryCache.isStale(entry) && entry.data !== undefined) {
      const state = getState(key)
      return Promise.resolve([state.data!, null] as unknown as SafeResult<TData, E>)
    }

    // Deduplication: return inflight promise
    if (entry.inflightPromise) {
      return entry.inflightPromise as Promise<SafeResult<TData, E>>
    }

    const generation = ++entry.generation

    // Notify loading state
    entry.inflightPromise = {} as any // placeholder to indicate fetching
    notifier.notify(key)

    const promise = safeInstance.async<TData, TData>(
      (signal) => {
        const context: any = { ...options }
        if (signal) context.signal = options?.signal ?? signal
        return fn(context)
      },
      {
        parseResult: parseResponse as
          | ((response: TData) => TData)
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
        },
        onError: (error) => {
          if (entry.generation !== generation) return
          queryCache.setError(key, error)
        },
        onSettled: () => {
          if (entry.generation !== generation) return
          entry.inflightPromise = null
          notifier.notify(key)
        },
      }
    )

    entry.inflightPromise = promise as Promise<SafeResult<any, any>>

    return promise
  }

  function subscribe(
    callback: (state: QueryState<TData, E>) => void,
    options?: any,
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

  function invalidate(options?: any): void {
    const params = options?.params
    const searchParams = options?.searchParams

    const key = queryCache.buildKey(path, params, searchParams)
    queryCache.invalidate(key)
    notifier.notify(key)
  }

  function refetch(options?: any): Promise<SafeResult<TData, E>> {
    const params = options?.params
    const searchParams = options?.searchParams

    const key = queryCache.buildKey(path, params, searchParams)
    queryCache.invalidate(key)
    return invoke({ params, searchParams })
  }

  // Attach methods
  invoke.subscribe = subscribe as any
  invoke.invalidate = invalidate as any
  invoke.refetch = refetch as any

  // Attach reactive getters
  Object.defineProperty(invoke, 'status', {
    get() { return getState(lastKey ?? queryCache.buildKey(path)).status },
    enumerable: true,
  })
  Object.defineProperty(invoke, 'data', {
    get() { return getState(lastKey ?? queryCache.buildKey(path)).data },
    enumerable: true,
  })
  Object.defineProperty(invoke, 'error', {
    get() { return getState(lastKey ?? queryCache.buildKey(path)).error },
    enumerable: true,
  })
  Object.defineProperty(invoke, 'isFetching', {
    get() { return getState(lastKey ?? queryCache.buildKey(path)).isFetching },
    enumerable: true,
  })
  Object.defineProperty(invoke, 'isStale', {
    get() { return getState(lastKey ?? queryCache.buildKey(path)).isStale },
    enumerable: true,
  })

  return invoke as QueryCallable<TData, E, TPath>
}
