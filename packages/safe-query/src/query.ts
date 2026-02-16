import type { SafeInstance, SafeResult } from '@cometloop/safe'
import type { QueryConfig, QueryState, SearchParams } from './types'
import { QueryCache } from './query-cache'
import { EntityStore } from './entity-store'
import { Notifier } from './notifier'
import { fetchJson } from './fetch-client'
import { buildUrl } from './url'

export type QueryDeps<E> = {
  safeInstance: SafeInstance<E>
  queryCache: QueryCache
  entityStore: EntityStore
  notifier: Notifier
  baseUrl: string
  headers?: () => Record<string, string>
  defaultStaleTime: number
  defaultGcTime: number
}

export function createQuery<TData, E, TPath extends string>(
  path: TPath,
  config: QueryConfig<TData> | undefined,
  deps: QueryDeps<E>
) {
  const {
    safeInstance,
    queryCache,
    entityStore,
    notifier,
    baseUrl,
    headers,
    defaultStaleTime,
    defaultGcTime,
  } = deps

  const staleTime = config?.staleTime ?? defaultStaleTime
  const gcTime = config?.gcTime ?? defaultGcTime
  const parseResponse = config?.parseResponse
  const entities = config?.entities
  const retry = config?.retry

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

  const hasPathParams = path.includes(':')

  function executeInner(
    ...args: any[]
  ): Promise<SafeResult<TData, E>> {
    let params: Record<string, string> | undefined
    let options: { signal?: AbortSignal; searchParams?: SearchParams } | undefined

    if (hasPathParams) {
      params = args[0]
      options = args[1]
    } else {
      options = args[0]
    }

    const searchParams = options?.searchParams
    const key = queryCache.buildKey(path, params, searchParams)
    const entry = queryCache.getOrCreate(key, staleTime, gcTime)

    // Return cached data if fresh
    if (!queryCache.isStale(entry) && entry.data !== undefined) {
      const state = getState(key)
      return Promise.resolve([state.data!, null] as SafeResult<TData, E>)
    }

    // Deduplication: return inflight promise
    if (entry.inflightPromise) {
      return entry.inflightPromise as Promise<SafeResult<TData, E>>
    }

    const generation = ++entry.generation
    const url = buildUrl(baseUrl, path, params, searchParams)

    // Notify loading state
    entry.inflightPromise = {} as any // placeholder to indicate fetching
    notifier.notify(key)

    const promise = safeInstance.async<TData, TData>(
      (signal) => {
        const mergedSignal = options?.signal ?? signal
        return fetchJson<TData>(url, {
          method: 'GET',
          headers: headers?.(),
          signal: mergedSignal,
        })
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
    paramsOrCallback:
      | Record<string, string>
      | ((state: QueryState<TData, E>) => void),
    maybeCallbackOrOptions?:
      | ((state: QueryState<TData, E>) => void)
      | { searchParams?: SearchParams },
    maybeOptions?: { searchParams?: SearchParams }
  ): () => void {
    let params: Record<string, string> | undefined
    let callback: (state: QueryState<TData, E>) => void
    let searchParams: SearchParams | undefined

    if (typeof paramsOrCallback === 'function') {
      callback = paramsOrCallback
      searchParams = (
        maybeCallbackOrOptions as { searchParams?: SearchParams } | undefined
      )?.searchParams
    } else {
      params = paramsOrCallback
      callback = maybeCallbackOrOptions as (
        state: QueryState<TData, E>
      ) => void
      searchParams = maybeOptions?.searchParams
    }

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

  function invalidate(...args: any[]): void {
    let params: Record<string, string> | undefined
    let options: { searchParams?: SearchParams } | undefined

    if (hasPathParams) {
      params = args[0]
      options = args[1]
    } else {
      options = args[0]
    }

    const key = queryCache.buildKey(path, params, options?.searchParams)
    queryCache.invalidate(key)
    notifier.notify(key)
  }

  function refetch(...args: any[]): Promise<SafeResult<TData, E>> {
    let params: Record<string, string> | undefined
    let options: { searchParams?: SearchParams } | undefined

    if (hasPathParams) {
      params = args[0]
      options = args[1]
    } else {
      options = args[0]
    }

    const searchParams = options?.searchParams
    const key = queryCache.buildKey(path, params, searchParams)
    queryCache.invalidate(key)
    if (hasPathParams) {
      return executeInner(params, { searchParams })
    }
    return executeInner({ searchParams })
  }

  return {
    execute: executeInner as any,
    subscribe: subscribe as any,
    invalidate: invalidate as any,
    refetch: refetch as any,
  }
}
