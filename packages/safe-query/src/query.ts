import type { SafeInstance, SafeResult } from '@cometloop/safe'
import type { QueryConfig, QueryState, QueryCallable, SearchParams, QueryFnContext, DataFnContext, LifecycleCallbacks, GlobalEntityConfig } from './types'
import { QueryDisabledError } from './types'
import { QueryCache } from './query-cache'
import { EntityStore } from './entity-store'
import { Notifier } from './notifier'
import type { FocusManager } from './focus-manager'

export type QueryDeps<E> = {
  safeInstance: SafeInstance<E, any>
  queryCache: QueryCache
  entityStore: EntityStore
  notifier: Notifier
  entities?: GlobalEntityConfig
  defaultStaleTime: number
  defaultGcTime: number
  focusManager: FocusManager
  defaultRefetchInterval: number | false
  defaultRefetchIntervalInBackground: boolean
  defaultRefetchOnWindowFocus: boolean
}

export function createQuery<TData, E, TPath extends string, TParsed = TData, TMapped = TParsed>(
  config: QueryConfig<TData, TPath, TParsed, TMapped>,
  deps: QueryDeps<E>
): QueryCallable<TMapped, E, TPath> {
  const {
    safeInstance,
    queryCache,
    entityStore,
    notifier,
    defaultStaleTime,
    defaultGcTime,
    focusManager,
    defaultRefetchInterval,
    defaultRefetchIntervalInBackground,
    defaultRefetchOnWindowFocus,
  } = deps

  const path = config.key
  const fn = config.fn
  const staleTime = config.staleTime ?? defaultStaleTime
  const gcTime = config.gcTime ?? defaultGcTime
  const parseResponse = config.parseResponse
  const mapToEntities = config.mapToEntities
  const entities = deps.entities
  const normalize = config.normalize
  const retry = config.retry
  const configOnSuccess = config.onSuccess
  const configOnError = config.onError
  const configOnSettled = config.onSettled

  const initialData = config.initialData
  const initialDataUpdatedAt = config.initialDataUpdatedAt
  const placeholderData = config.placeholderData

  const refetchInterval = config.refetchInterval ?? defaultRefetchInterval
  const refetchIntervalInBackground = config.refetchIntervalInBackground ?? defaultRefetchIntervalInBackground
  const refetchOnWindowFocus = config.refetchOnWindowFocus ?? defaultRefetchOnWindowFocus

  const intervalTimers = new Map<string, ReturnType<typeof setInterval>>()
  const focusUnsubs = new Map<string, () => void>()

  // Track last successful data across all keys for keepPreviousData support
  let lastSuccessfulData: TMapped | undefined = undefined

  // When mapToEntities is absent, TMapped = TParsed by type constraint (see QueryConfig).
  // The cast is safe because the conditional type on QueryConfig requires mapToEntities
  // whenever TMapped differs from TParsed.
  const combinedParse: ((data: TData) => TMapped) | undefined = mapToEntities
    ? (data: TData) => mapToEntities((parseResponse ? parseResponse(data) : data) as TParsed)
    : parseResponse as ((data: TData) => TMapped) | undefined

  const hasParams = path.includes(':')
  let warnedDefaultKey = false

  function warnIfParameterized(): void {
    if (hasParams && !warnedDefaultKey) {
      warnedDefaultKey = true
      console.warn(
        `[safe-query] Accessing getter on parameterized query "${path}" returns state for the parameterless default key. ` +
        `Use .subscribe({ params }) or invoke with params to access parameterized state.`
      )
    }
  }

  function buildDataFnContext(params?: Record<string, string>, searchParams?: SearchParams, previousData?: TMapped): DataFnContext<TPath, TMapped> {
    const ctx: Record<string, unknown> = {
      getEntity: (type: string, id: string) => entityStore.get(type, id),
    }
    if (params) ctx.params = params
    if (searchParams) ctx.searchParams = searchParams
    if (previousData !== undefined) ctx.previousData = previousData
    return ctx as DataFnContext<TPath, TMapped>
  }

  function resolveDataOption(
    option: TMapped | ((context: DataFnContext<TPath, TMapped>) => TMapped | undefined) | undefined,
    params?: Record<string, string>,
    searchParams?: SearchParams,
    previousData?: TMapped,
  ): TMapped | undefined {
    if (option === undefined) return undefined
    if (typeof option === 'function') {
      return (option as (ctx: DataFnContext<TPath, TMapped>) => TMapped | undefined)(
        buildDataFnContext(params, searchParams, previousData),
      )
    }
    return option
  }

  function seedInitialData(key: string, params?: Record<string, string>, searchParams?: SearchParams): void {
    const entry = queryCache.get(key)
    if (!entry || entry.data !== undefined || entry.dataUpdatedAt !== null || initialData === undefined) return

    const resolved = resolveDataOption(initialData, params, searchParams)
    if (resolved === undefined) return

    if (normalize && entities) {
      const entityMap = normalize(resolved as TMapped)
      const entityKeys = entityStore.normalizeExplicit(entityMap, entities)
      queryCache.setData(key, resolved, resolved, entityKeys)
      entityStore.registerQueryEntities(key, entityKeys)
    } else if (entities) {
      const { normalized: normalizedData, entityKeys } = entityStore.normalize(resolved, entities)
      queryCache.setData(key, resolved, normalizedData, entityKeys)
      entityStore.registerQueryEntities(key, entityKeys)
    } else {
      queryCache.setData(key, resolved, undefined, new Set())
    }

    // Override dataUpdatedAt if initialDataUpdatedAt is provided
    if (initialDataUpdatedAt !== undefined) {
      const updatedAt = typeof initialDataUpdatedAt === 'function'
        ? initialDataUpdatedAt()
        : initialDataUpdatedAt
      if (updatedAt !== undefined) {
        entry.dataUpdatedAt = updatedAt
      }
    }
  }

  function getState(key: string, params?: Record<string, string>, searchParams?: SearchParams): QueryState<TMapped, E> {
    const entry = queryCache.get(key)
    if (!entry) {
      return {
        data: undefined,
        error: null,
        status: 'idle',
        isFetching: false,
        isStale: true,
        dataUpdatedAt: null,
        isPlaceholderData: false,
      }
    }

    let data: TMapped | undefined
    if (entry.normalizedData !== undefined && entities) {
      data = entityStore.denormalizeCached(entry.normalizedData) as TMapped
    } else {
      data = entry.data as TMapped | undefined
    }

    const isStale = queryCache.isStale(entry)
    // Status priority: error > success > loading > idle.
    // When a refetch fails after a previous success, status is 'error' but data
    // retains the last successful value (stale-while-revalidate pattern).
    // Consumers can check `status === 'error' && data !== undefined` for this case.
    const status =
      entry.error !== null
        ? 'error'
        : entry.data !== undefined
          ? 'success'
          : entry.inflightPromise !== null
            ? 'loading'
            : 'idle'

    // Placeholder injection: only when no real data and fetch in progress
    let isPlaceholderData = false
    if (data === undefined && entry.inflightPromise !== null && placeholderData !== undefined) {
      const resolved = resolveDataOption(placeholderData, params, searchParams, lastSuccessfulData)
      if (resolved !== undefined) {
        data = resolved
        isPlaceholderData = true
      }
    }

    return {
      data,
      error: entry.error as E | null,
      status: isPlaceholderData ? 'success' : status,
      isFetching: entry.inflightPromise !== null,
      isStale,
      dataUpdatedAt: entry.dataUpdatedAt,
      isPlaceholderData,
    }
  }

  function invoke(options?: { params?: Record<string, string>; searchParams?: SearchParams; signal?: AbortSignal; enabled?: boolean } & LifecycleCallbacks<TMapped, E>): Promise<SafeResult<TMapped, E>> {
    const params = options?.params
    const searchParams = options?.searchParams
    const key = queryCache.buildKey(path, params, searchParams)

    // Ensure cache entry exists and seed initial data
    queryCache.getOrCreate(key, staleTime, gcTime)
    seedInitialData(key, params, searchParams)

    // Skip fetch when disabled (now sees initialData in cache)
    if (options?.enabled === false) {
      const entry = queryCache.get(key)
      if (entry?.data !== undefined) {
        const state = getState(key, params, searchParams)
        return Promise.resolve([state.data!, null] as unknown as SafeResult<TMapped, E>)
      }
      return safeInstance.async<TMapped>(() => { throw new QueryDisabledError() })
    }

    const invokeOnSuccess = options?.onSuccess
    const invokeOnError = options?.onError
    const invokeOnSettled = options?.onSettled

    const entry = queryCache.getOrCreate(key, staleTime, gcTime)

    // Return cached data if fresh
    if (!queryCache.isStale(entry) && entry.data !== undefined) {
      const state = getState(key, params, searchParams)
      return Promise.resolve([state.data!, null] as unknown as SafeResult<TMapped, E>)
    }

    // Deduplication: return inflight promise
    if (entry.inflightPromise) {
      return entry.inflightPromise as Promise<SafeResult<TMapped, E>>
    }

    const generation = ++entry.generation

    // Create AbortController for this request
    const controller = new AbortController()
    entry.abortController = controller

    // Link user-provided signal
    let signalCleanup: (() => void) | null = null
    const userSignal = options?.signal
    if (userSignal) {
      if (userSignal.aborted) {
        controller.abort(userSignal.reason)
      } else {
        const handler = () => controller.abort(userSignal.reason)
        userSignal.addEventListener('abort', handler, { once: true })
        signalCleanup = () => userSignal.removeEventListener('abort', handler)
      }
    }

    const promise = safeInstance.async<TData, TMapped>(
      () => {
        const context: Record<string, unknown> = { ...options }
        context.signal = controller.signal
        return fn(context as QueryFnContext<TPath>)
      },
      {
        parseResult: combinedParse,
        retry,
        onSuccess: (result) => {
          // Check generation to discard stale responses
          if (entry.generation !== generation) return

          // Track last successful data for keepPreviousData
          lastSuccessfulData = result

          if (normalize && entities) {
            const entityMap = normalize(result)
            const entityKeys = entityStore.normalizeExplicit(entityMap, entities)
            queryCache.setData(key, result, result, entityKeys)
            entityStore.registerQueryEntities(key, entityKeys)
          } else if (entities) {
            const { normalized: normalizedData, entityKeys } = entityStore.normalize(result, entities)
            queryCache.setData(key, result, normalizedData, entityKeys)
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
          if (signalCleanup) {
            signalCleanup()
            signalCleanup = null
          }
          if (entry.generation !== generation) return
          entry.inflightPromise = null
          entry.abortController = null
          notifier.notify(key)

          const state = getState(key, params, searchParams)
          configOnSettled?.(state.data, state.error)
          invokeOnSettled?.(state.data, state.error)
        },
      }
    )

    entry.inflightPromise = promise as Promise<SafeResult<unknown, unknown>>
    notifier.notify(key)

    return promise
  }

  function startInterval(key: string, params?: Record<string, string>, searchParams?: SearchParams): void {
    if (refetchInterval === false || refetchInterval <= 0) return
    if (intervalTimers.has(key)) return

    const timer = setInterval(() => {
      if (queryCache.isDisposed()) return
      if (!refetchIntervalInBackground && !focusManager.isFocused()) return
      const entry = queryCache.get(key)
      if (!entry || entry.subscriberCount <= 0) return
      invoke({ params, searchParams })
    }, refetchInterval)

    intervalTimers.set(key, timer)
  }

  function stopInterval(key: string): void {
    const timer = intervalTimers.get(key)
    if (timer !== undefined) {
      clearInterval(timer)
      intervalTimers.delete(key)
    }
  }

  function startFocusListener(key: string, params?: Record<string, string>, searchParams?: SearchParams): void {
    if (!refetchOnWindowFocus) return
    if (focusUnsubs.has(key)) return

    const unsub = focusManager.subscribe(() => {
      if (queryCache.isDisposed()) return
      const entry = queryCache.get(key)
      if (!entry || entry.subscriberCount <= 0) return
      if (!queryCache.isStale(entry)) return
      invoke({ params, searchParams })
    })

    focusUnsubs.set(key, unsub)
  }

  function stopFocusListener(key: string): void {
    const unsub = focusUnsubs.get(key)
    if (unsub) {
      unsub()
      focusUnsubs.delete(key)
    }
  }

  function subscribe(
    callback: (state: QueryState<TMapped, E>) => void,
    options?: { params?: Record<string, string>; searchParams?: SearchParams },
  ): () => void {
    const params = options?.params
    const searchParams = options?.searchParams

    const key = queryCache.buildKey(path, params, searchParams)
    queryCache.getOrCreate(key, staleTime, gcTime)
    seedInitialData(key, params, searchParams)
    queryCache.addSubscriber(key)

    const entry = queryCache.get(key)!
    if (entry.subscriberCount === 1) {
      startInterval(key, params, searchParams)
      startFocusListener(key, params, searchParams)
    }

    const unsub = notifier.subscribe(key, () => {
      callback(getState(key, params, searchParams))
    })

    // Initial notification
    callback(getState(key, params, searchParams))

    return () => {
      unsub()
      queryCache.removeSubscriber(key)
      const current = queryCache.get(key)
      if (!current || current.subscriberCount <= 0) {
        stopInterval(key)
        stopFocusListener(key)
      }
    }
  }

  function invalidate(options?: { params?: Record<string, string>; searchParams?: SearchParams }): void {
    const params = options?.params
    const searchParams = options?.searchParams

    const key = queryCache.buildKey(path, params, searchParams)
    queryCache.invalidate(key)
    notifier.notify(key)
  }

  function refetch(options?: { params?: Record<string, string>; searchParams?: SearchParams }): Promise<SafeResult<TMapped, E>> {
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
    get() { warnIfParameterized(); return getState(defaultKey).status },
    enumerable: true,
  })
  Object.defineProperty(callable, 'data', {
    get() { warnIfParameterized(); return getState(defaultKey).data },
    enumerable: true,
  })
  Object.defineProperty(callable, 'error', {
    get() { warnIfParameterized(); return getState(defaultKey).error },
    enumerable: true,
  })
  Object.defineProperty(callable, 'isFetching', {
    get() { warnIfParameterized(); return getState(defaultKey).isFetching },
    enumerable: true,
  })
  Object.defineProperty(callable, 'isStale', {
    get() { warnIfParameterized(); return getState(defaultKey).isStale },
    enumerable: true,
  })

  return callable as QueryCallable<TMapped, E, TPath>
}
