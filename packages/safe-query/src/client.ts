import type {
  SafeQueryConfig,
  QueryConfig,
  MutationConfig,
  QueryCallable,
  MutationCallable,
} from './types'
import { QueryCache } from './query-cache'
import { EntityStore } from './entity-store'
import { Notifier } from './notifier'
import { createQuery } from './query'
import { createMutation } from './mutation'

export type SafeQueryClient<E> = {
  query: <TData, TPath extends string = string, TParsed = TData, TMapped = TParsed>(
    config: QueryConfig<TData, TPath, TParsed, TMapped>
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
    config: MutationConfig<TData, TBody, TPath, TMethod, TParsed, TMapped>
  ) => MutationCallable<
    TMapped,
    E,
    TPath,
    TBody
  >
  invalidateByPrefix: (prefix: string) => void
  invalidateAll: () => void
  clear: () => void
  destroy: () => void
}

export function safeQuery<E>(
  config: SafeQueryConfig<E>
): SafeQueryClient<E> {
  const {
    safe: safeInstance,
    enableOptimisticUpdates = false,
    staleTime = 0,
    gcTime = 5 * 60_000,
  } = config

  const entityStore = new EntityStore()
  const queryCache = new QueryCache(staleTime, gcTime, (key) => entityStore.unregisterQuery(key))
  const notifier = new Notifier()
  let disposed = false

  function assertNotDisposed(): void {
    if (disposed) {
      throw new Error('SafeQueryClient has been destroyed and can no longer be used.')
    }
  }

  return {
    query: <TData, TPath extends string = string, TParsed = TData, TMapped = TParsed>(
      queryConfig: QueryConfig<TData, TPath, TParsed, TMapped>
    ) => {
      assertNotDisposed()
      return createQuery<TData, E, TPath, TParsed, TMapped>(queryConfig, {
        safeInstance,
        queryCache,
        entityStore,
        notifier,
        defaultStaleTime: staleTime,
        defaultGcTime: gcTime,
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
      mutationConfig: MutationConfig<TData, TBody, TPath, TMethod, TParsed, TMapped>
    ) => {
      assertNotDisposed()
      return createMutation<TData, TBody, E, TPath, TMethod, TParsed, TMapped>(mutationConfig, {
        safeInstance,
        queryCache,
        entityStore,
        notifier,
        enableOptimisticUpdates,
      })
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
    },
  }
}
