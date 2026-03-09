import type { SafeInstance, SafeResult } from '@cometloop/safe'
import type {
  InfiniteQueryConfig,
  InfiniteQueryState,
  InfiniteQueryCallable,
  InfiniteData,
  SearchParams,
  InfiniteQueryFnContext,
  LifecycleCallbacks,
  GlobalEntityConfig,
} from './types'
import { QueryDisabledError, QueryAbortedError } from './types'
import { QueryCache } from './query-cache'
import { EntityStore } from './entity-store'
import { Notifier } from './notifier'
import type { FocusManager } from './focus-manager'

export type InfiniteQueryDeps<E> = {
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
  registerCleanup: (cleanup: () => void) => void
}

type PageDirection = 'forward' | 'backward'

export function createInfiniteQuery<TData, E, TPath extends string, TParsed = TData, TMapped = TParsed>(
  config: InfiniteQueryConfig<TData, TPath, TParsed, TMapped>,
  deps: InfiniteQueryDeps<E>
): InfiniteQueryCallable<TMapped, E, TPath> {
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
  const initialPageParam = config.initialPageParam
  const getNextPageParam = config.getNextPageParam
  const getPreviousPageParam = config.getPreviousPageParam
  const maxPages = config.maxPages

  const refetchInterval = config.refetchInterval ?? defaultRefetchInterval
  const refetchIntervalInBackground = config.refetchIntervalInBackground ?? defaultRefetchIntervalInBackground
  const refetchOnWindowFocus = config.refetchOnWindowFocus ?? defaultRefetchOnWindowFocus

  const intervalTimers = new Map<string, ReturnType<typeof setInterval>>()
  const focusUnsubs = new Map<string, () => void>()

  // Track fetching direction per key
  const fetchingDirection = new Map<string, PageDirection | null>()

  deps.registerCleanup(() => {
    for (const key of [...intervalTimers.keys()]) stopInterval(key)
    for (const key of [...focusUnsubs.keys()]) stopFocusListener(key)
  })

  const combinedParse: ((data: TData) => TMapped) | undefined = mapToEntities
    ? (data: TData) => mapToEntities((parseResponse ? parseResponse(data) : data) as TParsed)
    : parseResponse as ((data: TData) => TMapped) | undefined

  const hasParams = path.includes(':')
  let warnedDefaultKey = false

  function warnIfParameterized(): void {
    if (hasParams && !warnedDefaultKey) {
      warnedDefaultKey = true
      console.warn(
        `[safe-query] Accessing getter on parameterized infinite query "${path}" returns state for the parameterless default key. ` +
        `Use .subscribe({ params }) or invoke with params to access parameterized state.`
      )
    }
  }

  function getInfiniteData(key: string): InfiniteData<TMapped> | undefined {
    const entry = queryCache.get(key)
    if (!entry || entry.data === undefined) return undefined
    return entry.data as InfiniteData<TMapped>
  }

  function normalizePages(pages: TMapped[], key: string): void {
    const allEntityKeys = new Set<string>()
    for (const page of pages) {
      if (normalize && entities) {
        const entityMap = normalize(page)
        const entityKeys = entityStore.normalizeExplicit(entityMap, entities)
        for (const ek of entityKeys) allEntityKeys.add(ek)
      } else if (entities) {
        const { entityKeys } = entityStore.normalize(page, entities)
        for (const ek of entityKeys) allEntityKeys.add(ek)
      }
    }
    if (allEntityKeys.size > 0) {
      entityStore.registerQueryEntities(key, allEntityKeys)
    }
  }

  function getState(key: string): InfiniteQueryState<TMapped, E> {
    const entry = queryCache.get(key)
    if (!entry) {
      return {
        data: undefined,
        error: null,
        status: 'idle',
        isFetching: false,
        isFetchingNextPage: false,
        isFetchingPreviousPage: false,
        hasNextPage: false,
        hasPreviousPage: false,
        isStale: true,
        dataUpdatedAt: null,
      }
    }

    const data = entry.data as InfiniteData<TMapped> | undefined
    const isStale = queryCache.isStale(entry)
    const status =
      entry.error !== null
        ? 'error'
        : entry.data !== undefined
          ? 'success'
          : entry.inflightPromise !== null
            ? 'loading'
            : 'idle'

    const dir = fetchingDirection.get(key) ?? null
    const isFetching = entry.inflightPromise !== null

    let hasNextPage = false
    let hasPreviousPage = false
    if (data && data.pages.length > 0) {
      const lastPage = data.pages[data.pages.length - 1]!
      hasNextPage = getNextPageParam(lastPage, data.pages) !== undefined
      if (getPreviousPageParam) {
        hasPreviousPage = getPreviousPageParam(data.pages[0]!, data.pages) !== undefined
      }
    }

    return {
      data,
      error: entry.error as E | null,
      status,
      isFetching,
      isFetchingNextPage: isFetching && dir === 'forward',
      isFetchingPreviousPage: isFetching && dir === 'backward',
      hasNextPage,
      hasPreviousPage,
      isStale,
      dataUpdatedAt: entry.dataUpdatedAt,
    }
  }

  function fetchPage(
    key: string,
    pageParam: unknown,
    direction: PageDirection | null,
    params?: Record<string, string>,
    searchParams?: SearchParams,
    signal?: AbortSignal,
  ): Promise<SafeResult<InfiniteData<TMapped>, E>> {
    const entry = queryCache.getOrCreate(key, staleTime, gcTime)

    // Deduplication
    if (entry.inflightPromise) {
      return entry.inflightPromise as Promise<SafeResult<InfiniteData<TMapped>, E>>
    }

    const generation = ++entry.generation
    fetchingDirection.set(key, direction)

    const controller = new AbortController()
    entry.abortController = controller

    let signalCleanup: (() => void) | null = null
    if (signal) {
      if (signal.aborted) {
        controller.abort(signal.reason)
      } else {
        const handler = () => controller.abort(signal.reason)
        signal.addEventListener('abort', handler, { once: true })
        signalCleanup = () => signal.removeEventListener('abort', handler)
      }
    }

    const promise = safeInstance.async<TData, TMapped>(
      () => {
        const context: Record<string, unknown> = {}
        if (params) context.params = params
        if (searchParams) context.searchParams = searchParams
        context.signal = controller.signal
        context.pageParam = pageParam
        return fn(context as InfiniteQueryFnContext<TPath>)
      },
      {
        parseResult: combinedParse,
        retry,
        onSuccess: (pageData) => {
          if (entry.generation !== generation) return

          const currentData = getInfiniteData(key)
          let pages: TMapped[]
          let pageParams: unknown[]

          if (!currentData) {
            pages = [pageData]
            pageParams = [pageParam]
          } else if (direction === 'backward') {
            pages = [pageData, ...currentData.pages]
            pageParams = [pageParam, ...currentData.pageParams]
          } else {
            pages = [...currentData.pages, pageData]
            pageParams = [...currentData.pageParams, pageParam]
          }

          // Apply maxPages
          if (maxPages !== undefined && pages.length > maxPages) {
            if (direction === 'backward') {
              pages = pages.slice(0, maxPages)
              pageParams = pageParams.slice(0, maxPages)
            } else {
              pages = pages.slice(-maxPages)
              pageParams = pageParams.slice(-maxPages)
            }
          }

          const infiniteData: InfiniteData<TMapped> = { pages, pageParams }

          normalizePages([pageData], key)
          queryCache.setData(key, infiniteData, undefined, entry.entityKeys)

          configOnSuccess?.(infiniteData)
        },
        onError: (error) => {
          if (entry.generation !== generation) return
          queryCache.setError(key, error)
          configOnError?.(error as E)
        },
        onSettled: () => {
          if (signalCleanup) {
            signalCleanup()
            signalCleanup = null
          }
          if (entry.generation !== generation) return
          entry.inflightPromise = null
          entry.abortController = null
          fetchingDirection.set(key, null)
          notifier.notify(key)

          const state = getState(key)
          configOnSettled?.(state.data, state.error)
        },
      }
    )

    // The promise resolves to SafeResult<TMapped, E>, but we need SafeResult<InfiniteData<TMapped>, E>
    // We'll map the result
    const mappedPromise = promise.then(([, err]) => {
      if (err !== null) {
        return [null, err] as unknown as SafeResult<InfiniteData<TMapped>, E>
      }
      const data = getInfiniteData(key)
      return [data!, null] as unknown as SafeResult<InfiniteData<TMapped>, E>
    }) as Promise<SafeResult<InfiniteData<TMapped>, E>>

    entry.inflightPromise = mappedPromise as Promise<SafeResult<unknown, unknown>>
    notifier.notify(key)

    return mappedPromise
  }

  function invoke(options?: { params?: Record<string, string>; searchParams?: SearchParams; signal?: AbortSignal; enabled?: boolean }): Promise<SafeResult<InfiniteData<TMapped>, E>> {
    const params = options?.params
    const searchParams = options?.searchParams
    const key = queryCache.buildKey(path, params, searchParams)

    queryCache.getOrCreate(key, staleTime, gcTime)

    if (options?.enabled === false) {
      return safeInstance.async<InfiniteData<TMapped>>(() => {
        throw new QueryDisabledError()
      }) as Promise<SafeResult<InfiniteData<TMapped>, E>>
    }

    const entry = queryCache.getOrCreate(key, staleTime, gcTime)

    // Return cached data if fresh
    if (!queryCache.isStale(entry) && entry.data !== undefined) {
      const data = entry.data as InfiniteData<TMapped>
      return Promise.resolve([data, null] as unknown as SafeResult<InfiniteData<TMapped>, E>)
    }

    // Deduplication
    if (entry.inflightPromise) {
      return entry.inflightPromise as Promise<SafeResult<InfiniteData<TMapped>, E>>
    }

    // For initial fetch or refetch, re-fetch all pages
    const currentData = getInfiniteData(key)
    if (currentData && currentData.pages.length > 0) {
      return refetchAllPages(key, currentData, params, searchParams, options?.signal)
    }

    return fetchPage(key, initialPageParam, null, params, searchParams, options?.signal)
  }

  function refetchAllPages(
    key: string,
    currentData: InfiniteData<TMapped>,
    params?: Record<string, string>,
    searchParams?: SearchParams,
    signal?: AbortSignal,
  ): Promise<SafeResult<InfiniteData<TMapped>, E>> {
    const entry = queryCache.getOrCreate(key, staleTime, gcTime)
    const generation = ++entry.generation

    const controller = new AbortController()
    entry.abortController = controller
    fetchingDirection.set(key, null)

    let signalCleanup: (() => void) | null = null
    if (signal) {
      if (signal.aborted) {
        controller.abort(signal.reason)
      } else {
        const handler = () => controller.abort(signal.reason)
        signal.addEventListener('abort', handler, { once: true })
        signalCleanup = () => signal.removeEventListener('abort', handler)
      }
    }

    const refetchPromise = (async (): Promise<SafeResult<InfiniteData<TMapped>, E>> => {
      const pages: TMapped[] = []
      const pageParams: unknown[] = []

      for (let i = 0; i < currentData.pageParams.length; i++) {
        const pageParam = currentData.pageParams[i]
        const context: Record<string, unknown> = {}
        if (params) context.params = params
        if (searchParams) context.searchParams = searchParams
        context.signal = controller.signal
        context.pageParam = pageParam

        const [pageData, err] = await safeInstance.async<TData, TMapped>(
          () => fn(context as InfiniteQueryFnContext<TPath>),
          { parseResult: combinedParse, retry }
        )

        if (err !== null) {
          if (entry.generation !== generation) {
            if (signalCleanup) { signalCleanup(); signalCleanup = null }
            return [null, err] as unknown as SafeResult<InfiniteData<TMapped>, E>
          }
          queryCache.setError(key, err)
          configOnError?.(err)
          entry.inflightPromise = null
          entry.abortController = null
          fetchingDirection.set(key, null)
          notifier.notify(key)
          const state = getState(key)
          configOnSettled?.(state.data, state.error)
          if (signalCleanup) { signalCleanup(); signalCleanup = null }
          return [null, err] as unknown as SafeResult<InfiniteData<TMapped>, E>
        }

        if (entry.generation !== generation) {
          if (signalCleanup) { signalCleanup(); signalCleanup = null }
          return await safeInstance.async<InfiniteData<TMapped>>(() => {
            throw new QueryAbortedError()
          }) as SafeResult<InfiniteData<TMapped>, E>
        }

        pages.push(pageData!)
        pageParams.push(pageParam)
      }

      if (entry.generation !== generation) {
        if (signalCleanup) { signalCleanup(); signalCleanup = null }
        return await safeInstance.async<InfiniteData<TMapped>>(() => {
          throw new QueryAbortedError()
        }) as SafeResult<InfiniteData<TMapped>, E>
      }

      const infiniteData: InfiniteData<TMapped> = { pages, pageParams }
      normalizePages(pages, key)
      queryCache.setData(key, infiniteData, undefined, entry.entityKeys)

      entry.inflightPromise = null
      entry.abortController = null
      fetchingDirection.set(key, null)
      notifier.notify(key)

      configOnSuccess?.(infiniteData)
      const state = getState(key)
      configOnSettled?.(state.data, state.error)
      if (signalCleanup) { signalCleanup(); signalCleanup = null }

      return [infiniteData, null] as unknown as SafeResult<InfiniteData<TMapped>, E>
    })()

    entry.inflightPromise = refetchPromise as Promise<SafeResult<unknown, unknown>>
    notifier.notify(key)

    return refetchPromise
  }

  function fetchNextPage(options?: { params?: Record<string, string>; searchParams?: SearchParams }): Promise<SafeResult<InfiniteData<TMapped>, E>> {
    const params = options?.params
    const searchParams = options?.searchParams
    const key = queryCache.buildKey(path, params, searchParams)
    const currentData = getInfiniteData(key)

    if (!currentData || currentData.pages.length === 0) {
      return fetchPage(key, initialPageParam, 'forward', params, searchParams)
    }

    const lastPage = currentData.pages[currentData.pages.length - 1]!
    const nextPageParam = getNextPageParam(lastPage, currentData.pages)
    if (nextPageParam === undefined) {
      return Promise.resolve([currentData, null] as unknown as SafeResult<InfiniteData<TMapped>, E>)
    }

    return fetchPage(key, nextPageParam, 'forward', params, searchParams)
  }

  function fetchPreviousPage(options?: { params?: Record<string, string>; searchParams?: SearchParams }): Promise<SafeResult<InfiniteData<TMapped>, E>> {
    const params = options?.params
    const searchParams = options?.searchParams
    const key = queryCache.buildKey(path, params, searchParams)
    const currentData = getInfiniteData(key)

    if (!getPreviousPageParam) {
      return Promise.resolve([(currentData ?? { pages: [], pageParams: [] }), null] as unknown as SafeResult<InfiniteData<TMapped>, E>)
    }

    if (!currentData || currentData.pages.length === 0) {
      return fetchPage(key, initialPageParam, 'backward', params, searchParams)
    }

    const firstPage = currentData.pages[0]!
    const prevPageParam = getPreviousPageParam(firstPage, currentData.pages)
    if (prevPageParam === undefined) {
      return Promise.resolve([currentData, null] as unknown as SafeResult<InfiniteData<TMapped>, E>)
    }

    return fetchPage(key, prevPageParam, 'backward', params, searchParams)
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
    callback: (state: InfiniteQueryState<TMapped, E>) => void,
    options?: { params?: Record<string, string>; searchParams?: SearchParams; enabled?: boolean },
  ): () => void {
    const params = options?.params
    const searchParams = options?.searchParams
    const enabled = options?.enabled !== false

    const key = queryCache.buildKey(path, params, searchParams)
    queryCache.getOrCreate(key, staleTime, gcTime)

    if (enabled) {
      queryCache.addSubscriber(key)
      const entry = queryCache.get(key)!
      if (entry.subscriberCount === 1) {
        startInterval(key, params, searchParams)
        startFocusListener(key, params, searchParams)
      }
    }

    const unsub = notifier.subscribe(key, () => {
      callback(getState(key))
    })

    callback(getState(key))

    return () => {
      unsub()
      if (enabled) {
        queryCache.removeSubscriber(key)
        const current = queryCache.get(key)
        if (!current || current.subscriberCount <= 0) {
          stopInterval(key)
          stopFocusListener(key)
        }
      }
    }
  }

  function invalidate(options?: { params?: Record<string, string>; searchParams?: SearchParams }): void {
    const key = queryCache.buildKey(path, options?.params, options?.searchParams)
    queryCache.invalidate(key)
    notifier.notify(key)
  }

  function refetch(options?: { params?: Record<string, string>; searchParams?: SearchParams }): Promise<SafeResult<InfiniteData<TMapped>, E>> {
    const params = options?.params
    const searchParams = options?.searchParams
    const key = queryCache.buildKey(path, params, searchParams)
    queryCache.invalidate(key)
    return invoke({ params, searchParams })
  }

  function cancel(options?: { params?: Record<string, string>; searchParams?: SearchParams }): void {
    const key = queryCache.buildKey(path, options?.params, options?.searchParams)
    queryCache.cancelInflight(key)
    fetchingDirection.set(key, null)
    notifier.notify(key)
  }

  const callable = Object.assign(invoke, { subscribe, invalidate, refetch, cancel, fetchNextPage, fetchPreviousPage })

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
  Object.defineProperty(callable, 'isFetchingNextPage', {
    get() { warnIfParameterized(); return getState(defaultKey).isFetchingNextPage },
    enumerable: true,
  })
  Object.defineProperty(callable, 'isFetchingPreviousPage', {
    get() { warnIfParameterized(); return getState(defaultKey).isFetchingPreviousPage },
    enumerable: true,
  })
  Object.defineProperty(callable, 'hasNextPage', {
    get() { warnIfParameterized(); return getState(defaultKey).hasNextPage },
    enumerable: true,
  })
  Object.defineProperty(callable, 'hasPreviousPage', {
    get() { warnIfParameterized(); return getState(defaultKey).hasPreviousPage },
    enumerable: true,
  })
  Object.defineProperty(callable, 'isStale', {
    get() { warnIfParameterized(); return getState(defaultKey).isStale },
    enumerable: true,
  })

  return callable as InfiniteQueryCallable<TMapped, E, TPath>
}
