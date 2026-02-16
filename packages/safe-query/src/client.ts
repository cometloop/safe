import { createSafe } from '@cometloop/safe'
import type {
  CreateSafeQueryClientConfig,
  QueryConfig,
  MutationConfig,
  QueryObject,
  MutationObject,
} from './types'
import { QueryCache } from './query-cache'
import { EntityStore } from './entity-store'
import { Notifier } from './notifier'
import { createQuery } from './query'
import { createMutation } from './mutation'

export type SafeQueryClient<E> = {
  query: <TData, TPath extends string, TParsed = TData>(
    path: TPath,
    config?: QueryConfig<TData, TParsed>
  ) => QueryObject<TParsed extends TData ? TData : TParsed, E, TPath>
  mutate: <
    TData = void,
    TBody = unknown,
    TPath extends string = string,
    TMethod extends 'POST' | 'PUT' | 'PATCH' | 'DELETE' =
      | 'POST'
      | 'PUT'
      | 'PATCH'
      | 'DELETE',
    TParsed = TData,
  >(
    path: TPath,
    config: MutationConfig<TData, TPath, TMethod, TParsed>
  ) => MutationObject<
    TParsed extends TData ? TData : TParsed,
    E,
    TPath,
    TMethod,
    TBody
  >
}

export function createSafeQueryClient<E>(
  config: CreateSafeQueryClientConfig<E>
): SafeQueryClient<E> {
  const {
    baseUrl,
    headers,
    enableOptimisticUpdates = false,
    parseError,
    defaultError,
    retry,
    staleTime = 0,
    gcTime = 5 * 60_000,
  } = config

  const safeInstance = createSafe({
    parseError: parseError as (e: unknown) => any,
    defaultError: defaultError as any,
    retry,
  })

  const queryCache = new QueryCache(staleTime, gcTime)
  const entityStore = new EntityStore()
  const notifier = new Notifier()

  return {
    query: <TData, TPath extends string, TParsed = TData>(
      path: TPath,
      queryConfig?: QueryConfig<TData, TParsed>
    ) => {
      return createQuery(path, queryConfig as any, {
        safeInstance,
        queryCache,
        entityStore,
        notifier,
        baseUrl,
        headers,
        defaultStaleTime: staleTime,
        defaultGcTime: gcTime,
      }) as any
    },

    mutate: <
      TData = void,
      _TBody = unknown,
      TPath extends string = string,
      TMethod extends 'POST' | 'PUT' | 'PATCH' | 'DELETE' =
        | 'POST'
        | 'PUT'
        | 'PATCH'
        | 'DELETE',
      TParsed = TData,
    >(
      path: TPath,
      mutationConfig: MutationConfig<TData, TPath, TMethod, TParsed>
    ) => {
      return createMutation(path, mutationConfig as any, {
        safeInstance,
        queryCache,
        entityStore,
        notifier,
        baseUrl,
        headers,
        enableOptimisticUpdates,
      }) as any
    },
  }
}
