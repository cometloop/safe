import type {
  SafeQueryConfig,
  QueryConfig,
  MutationConfig,
  QueryCallable,
  MutationCallable,
  GlobalEntityConfig,
  SearchParams,
} from './types'
import { QueryCache } from './query-cache'
import { EntityStore } from './entity-store'
import { Notifier } from './notifier'
import { FocusManager } from './focus-manager'
import { createQuery } from './query'
import { createMutation } from './mutation'

export type SafeQueryClient<E, TEntities extends GlobalEntityConfig = GlobalEntityConfig> = {
  query: <TData, TPath extends string = string, TParsed = TData, TMapped = TParsed>(
    config: QueryConfig<TData, TPath, TParsed, TMapped, TEntities>
  ) => QueryCallable<TMapped, E, TPath>
  mutate: <
    TData = void,
    TBody = void,
    TPath extends string = string,
    TMethod extends 'POST' | 'PUT' | 'PATCH' | 'DELETE' =
      | 'POST'
      | 'PUT'
      | 'PATCH'
      | 'DELETE',
    TParsed = TData,
    TMapped = TParsed,
  >(
    config: MutationConfig<TData, TBody, TPath, TMethod, TParsed, TMapped, TEntities>
  ) => MutationCallable<
    TMapped,
    E,
    TPath,
    TBody
  >
  getQueryData: <TData = unknown>(
    path: string,
    options?: { params?: Record<string, string>; searchParams?: SearchParams },
  ) => TData | undefined
  setQueryData: <TData = unknown>(
    path: string,
    updater: TData | ((old: TData | undefined) => TData | undefined),
    options?: { params?: Record<string, string>; searchParams?: SearchParams },
  ) => void
  invalidateByPrefix: (prefix: string) => void
  invalidateAll: () => void
  clear: () => void
  destroy: () => void
}

export function safeQuery<E, TEntities extends GlobalEntityConfig = GlobalEntityConfig>(
  config: SafeQueryConfig<E, TEntities>
): SafeQueryClient<E, TEntities> {
  const {
    safe: safeInstance,
    entities,
    enableOptimisticUpdates = false,
    staleTime = 0,
    gcTime = 5 * 60_000,
    refetchInterval = false,
    refetchIntervalInBackground = false,
    refetchOnWindowFocus = false,
  } = config

  const entityStore = new EntityStore()
  const queryCache = new QueryCache(staleTime, gcTime, (key) => entityStore.unregisterQuery(key))
  const notifier = new Notifier()
  const focusManager = new FocusManager()
  const normalizeRegistry = new Map<string, (data: any) => Record<string, unknown | unknown[]>>()
  let disposed = false

  function assertNotDisposed(): void {
    if (disposed) {
      throw new Error('SafeQueryClient has been destroyed and can no longer be used.')
    }
  }

  return {
    query: <TData, TPath extends string = string, TParsed = TData, TMapped = TParsed>(
      queryConfig: QueryConfig<TData, TPath, TParsed, TMapped, TEntities>
    ) => {
      assertNotDisposed()
      if (queryConfig.normalize) {
        normalizeRegistry.set(queryConfig.key, queryConfig.normalize as (data: any) => Record<string, unknown | unknown[]>)
      }
      return createQuery<TData, E, TPath, TParsed, TMapped>(queryConfig, {
        safeInstance,
        queryCache,
        entityStore,
        notifier,
        entities,
        defaultStaleTime: staleTime,
        defaultGcTime: gcTime,
        focusManager,
        defaultRefetchInterval: refetchInterval,
        defaultRefetchIntervalInBackground: refetchIntervalInBackground,
        defaultRefetchOnWindowFocus: refetchOnWindowFocus,
      })
    },

    mutate: <
      TData = void,
      TBody = void,
      TPath extends string = string,
      TMethod extends 'POST' | 'PUT' | 'PATCH' | 'DELETE' =
        | 'POST'
        | 'PUT'
        | 'PATCH'
        | 'DELETE',
      TParsed = TData,
      TMapped = TParsed,
    >(
      mutationConfig: MutationConfig<TData, TBody, TPath, TMethod, TParsed, TMapped, TEntities>
    ) => {
      assertNotDisposed()
      return createMutation<TData, TBody, E, TPath, TMethod, TParsed, TMapped>(mutationConfig, {
        safeInstance,
        queryCache,
        entityStore,
        notifier,
        entities,
        enableOptimisticUpdates,
      })
    },

    getQueryData<TData = unknown>(
      path: string,
      options?: { params?: Record<string, string>; searchParams?: SearchParams },
    ): TData | undefined {
      assertNotDisposed()
      const key = queryCache.buildKey(path, options?.params, options?.searchParams)
      const entry = queryCache.get(key)
      if (!entry || entry.data === undefined) return undefined

      if (entry.normalizedData !== undefined && entities) {
        return entityStore.denormalizeCached(entry.normalizedData) as TData
      }
      return entry.data as TData
    },

    setQueryData<TData = unknown>(
      path: string,
      updater: TData | ((old: TData | undefined) => TData | undefined),
      options?: { params?: Record<string, string>; searchParams?: SearchParams },
    ): void {
      assertNotDisposed()
      const key = queryCache.buildKey(path, options?.params, options?.searchParams)
      queryCache.getOrCreate(key, staleTime, gcTime)

      // Get current data (denormalized if needed)
      const entry = queryCache.get(key)!
      let currentData: TData | undefined
      if (entry.normalizedData !== undefined && entities) {
        currentData = entityStore.denormalizeCached(entry.normalizedData) as TData
      } else {
        currentData = entry.data as TData | undefined
      }

      // Resolve new data
      const newData = typeof updater === 'function'
        ? (updater as (old: TData | undefined) => TData | undefined)(currentData)
        : updater

      if (newData === undefined) return

      // Store with entity normalization if configured
      if (entities) {
        const registeredNormalize = normalizeRegistry.get(path)
        if (registeredNormalize) {
          const entityMap = registeredNormalize(newData)
          const entityKeys = entityStore.normalizeExplicit(entityMap, entities)
          queryCache.setData(key, newData, newData, entityKeys)
          entityStore.registerQueryEntities(key, entityKeys)
        } else {
          const { normalized, entityKeys } = entityStore.normalize(newData, entities)
          queryCache.setData(key, newData, normalized, entityKeys)
          entityStore.registerQueryEntities(key, entityKeys)
        }
      } else {
        queryCache.setData(key, newData, undefined, new Set())
      }

      notifier.notify(key)
    },

    invalidateByPrefix(prefix: string): void {
      assertNotDisposed()
      const keys = queryCache.invalidateByPrefix(prefix)
      for (const key of keys) {
        notifier.notify(key)
      }
    },

    invalidateAll(): void {
      assertNotDisposed()
      const keys = queryCache.invalidateAll()
      for (const key of keys) {
        notifier.notify(key)
      }
    },

    clear(): void {
      assertNotDisposed()
      queryCache.clear()
      entityStore.clear()
      notifier.clear()
    },

    destroy(): void {
      if (disposed) return
      disposed = true
      queryCache.destroy()
      entityStore.clear()
      notifier.clear()
      focusManager.destroy()
    },
  }
}
