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
  query: <TData, TPath extends string = string, TParsed = TData>(
    config: QueryConfig<TData, TPath, TParsed>
  ) => QueryCallable<TParsed, E, TPath>
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
  >(
    config: MutationConfig<TData, TBody, TPath, TMethod, TParsed>
  ) => MutationCallable<
    TParsed,
    E,
    TPath,
    TBody
  >
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

  const queryCache = new QueryCache(staleTime, gcTime)
  const entityStore = new EntityStore()
  const notifier = new Notifier()

  return {
    query: <TData, TPath extends string = string, TParsed = TData>(
      queryConfig: QueryConfig<TData, TPath, TParsed>
    ) => {
      return createQuery(queryConfig as any, {
        safeInstance,
        queryCache,
        entityStore,
        notifier,
        defaultStaleTime: staleTime,
        defaultGcTime: gcTime,
      }) as any
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
    >(
      mutationConfig: MutationConfig<TData, TBody, TPath, TMethod, TParsed>
    ) => {
      return createMutation(mutationConfig as any, {
        safeInstance,
        queryCache,
        entityStore,
        notifier,
        enableOptimisticUpdates,
      }) as any
    },
  }
}
