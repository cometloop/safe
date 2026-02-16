import type { SafeInstance, SafeResult } from '@cometloop/safe'
import type { MutationConfig, MutationCallable, SearchParams, MutationFnContext } from './types'
import { QueryCache } from './query-cache'
import { EntityStore } from './entity-store'
import { Notifier } from './notifier'

export type MutationDeps<E> = {
  safeInstance: SafeInstance<E, any>
  queryCache: QueryCache
  entityStore: EntityStore
  notifier: Notifier
  enableOptimisticUpdates: boolean
}

export function createMutation<
  TData,
  TBody = void,
  E = unknown,
  TPath extends string = string,
  TMethod extends 'POST' | 'PUT' | 'PATCH' | 'DELETE' =
    | 'POST'
    | 'PUT'
    | 'PATCH'
    | 'DELETE',
  TParsed = TData,
>(
  config: MutationConfig<TData, TBody, TPath, TMethod, TParsed>,
  deps: MutationDeps<E>
): MutationCallable<TParsed, E, TPath, TBody> {
  const {
    safeInstance,
    queryCache,
    entityStore,
    notifier,
    enableOptimisticUpdates,
  } = deps

  const method = config.method
  const parseResponse = config.parseResponse
  const entities = config.entities
  const retry = config.retry
  const optimisticConfig = config.optimistic

  function resolveOptimistic(params?: Record<string, string>): {
    entityType: string
    entityId: string
  } | null {
    if (!enableOptimisticUpdates) return null
    if (method === 'POST') return null
    if (!entities) return null

    if (optimisticConfig) {
      return {
        entityType: optimisticConfig.entityType,
        entityId: optimisticConfig.entityId(params as any),
      }
    }

    // Auto-infer: single entity key
    const entityKeys = Object.keys(entities)
    if (entityKeys.length !== 1) return null

    const entityType = entityKeys[0]

    // Get entity ID from last path param
    if (!params) return null
    const paramValues = Object.values(params)
    if (paramValues.length === 0) return null
    const entityId = paramValues[paramValues.length - 1]

    return { entityType, entityId }
  }

  function invoke(options: { params?: Record<string, string>; searchParams?: SearchParams; signal?: AbortSignal; body?: unknown }): Promise<SafeResult<TParsed, E>> {
    const params = options?.params
    const body = options?.body
    const opt = resolveOptimistic(params)

    // Optimistic update flow
    let snapshot: ReturnType<typeof entityStore.snapshot> | null = null
    let affectedQueryKeys: Set<string> | null = null

    if (opt && (method === 'PUT' || method === 'PATCH') && body !== undefined) {
      snapshot = entityStore.snapshot()
      const existing = entityStore.get(opt.entityType, opt.entityId)
      if (existing) {
        const merged = { ...(existing as Record<string, unknown>), ...(body as Record<string, unknown>) }
        entityStore.set(opt.entityType, opt.entityId, merged)
        affectedQueryKeys = entityStore.getQueriesForEntity(
          opt.entityType,
          opt.entityId
        )
        notifier.notifyMany(affectedQueryKeys)
      }
    } else if (opt && method === 'DELETE') {
      snapshot = entityStore.snapshot()
      affectedQueryKeys = entityStore.getQueriesForEntity(
        opt.entityType,
        opt.entityId
      )
      entityStore.delete(opt.entityType, opt.entityId)
      notifier.notifyMany(affectedQueryKeys)
    }

    return safeInstance.async<TData, TParsed>(
      (signal) => {
        const context = { ...options }
        if (signal) context.signal = options?.signal ?? signal
        return config.fn(context as MutationFnContext<TPath, TBody>)
      },
      {
        parseResult: parseResponse as
          | ((response: TData) => TParsed)
          | undefined,
        retry,
        onSuccess: (result) => {
          if (entities && result !== undefined) {
            const { entityKeys } = entityStore.normalize(
              result,
              entities as Record<string, (entity: any) => string>
            )
            // Notify all queries that contain affected entities
            const queryKeys = new Set<string>()
            for (const eKey of entityKeys) {
              const idx = eKey.indexOf(':')
              const type = eKey.substring(0, idx)
              const id = eKey.substring(idx + 1)
              for (const qk of entityStore.getQueriesForEntity(type, id)) {
                queryKeys.add(qk)
              }
            }
            if (affectedQueryKeys) {
              for (const qk of affectedQueryKeys) {
                queryKeys.add(qk)
              }
            }
            notifier.notifyMany(queryKeys)
          }
        },
        onError: () => {
          // Rollback optimistic update
          if (snapshot) {
            entityStore.restore(snapshot)
            if (affectedQueryKeys) {
              // Invalidate affected queries to refetch server truth
              for (const qk of affectedQueryKeys) {
                queryCache.invalidate(qk)
              }
              notifier.notifyMany(affectedQueryKeys)
            }
          }
        },
      }
    )
  }

  return invoke as MutationCallable<TParsed, E, TPath, TBody>
}
