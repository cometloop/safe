import type { SafeInstance, SafeResult } from '@cometloop/safe'
import type { MutationConfig, MutationCallable, SearchParams, MutationFnContext, LifecycleCallbacks } from './types'
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
  TMapped = TParsed,
>(
  config: MutationConfig<TData, TBody, TPath, TMethod, TParsed, TMapped>,
  deps: MutationDeps<E>
): MutationCallable<TMapped, E, TPath, TBody> {
  const {
    safeInstance,
    queryCache,
    entityStore,
    notifier,
    enableOptimisticUpdates,
  } = deps

  const method = config.method
  const parseResponse = config.parseResponse
  const mapToEntities = config.mapToEntities
  const entities = config.entities
  const retry = config.retry
  const optimisticConfig = config.optimistic
  const configOnSuccess = config.onSuccess
  const configOnError = config.onError
  const configOnSettled = config.onSettled

  // When mapToEntities is absent, TMapped = TParsed by type constraint (see MutationConfig).
  // The cast is safe because the conditional type on MutationConfig requires mapToEntities
  // whenever TMapped differs from TParsed.
  const combinedParse: ((data: TData) => TMapped) | undefined = mapToEntities
    ? (data: TData) => mapToEntities((parseResponse ? parseResponse(data) : data) as TParsed)
    : parseResponse as ((data: TData) => TMapped) | undefined

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
        entityId: (optimisticConfig.entityId as (p: Record<string, string>) => string)(params!),
      }
    }

    // Auto-infer: single entity key
    const entityKeys = Object.keys(entities)
    if (entityKeys.length !== 1) return null

    const entityType = entityKeys[0]
    if (!entityType) return null

    // Get entity ID from the last :param segment in the path
    if (!params) return null
    const lastParam = config.key
      .split('/')
      .filter(s => s.startsWith(':'))
      .pop()
      ?.substring(1)
    if (!lastParam) return null
    const entityId = params[lastParam]
    if (!entityId) return null

    return { entityType, entityId }
  }

  function invoke(options: { params?: Record<string, string>; searchParams?: SearchParams; signal?: AbortSignal; body?: unknown } & LifecycleCallbacks<TMapped, E>): Promise<SafeResult<TMapped, E>> {
    const params = options?.params
    const body = options?.body
    const invokeOnSuccess = options?.onSuccess
    const invokeOnError = options?.onError
    const invokeOnSettled = options?.onSettled
    const opt = resolveOptimistic(params)

    // Optimistic update flow using per-entity tracking
    let affectedQueryKeys: Set<string> | null = null
    let didOptimistic = false

    if (opt && (method === 'PUT' || method === 'PATCH') && body !== undefined) {
      const existing = entityStore.get(opt.entityType, opt.entityId)
      if (existing) {
        entityStore.beginOptimistic(opt.entityType, opt.entityId)
        didOptimistic = true
        const merged = { ...(existing as Record<string, unknown>), ...(body as Record<string, unknown>) }
        entityStore.set(opt.entityType, opt.entityId, merged)
        affectedQueryKeys = entityStore.getQueriesForEntity(
          opt.entityType,
          opt.entityId
        )
        notifier.notifyMany(affectedQueryKeys)
      }
    } else if (opt && method === 'DELETE') {
      entityStore.beginOptimistic(opt.entityType, opt.entityId)
      didOptimistic = true
      affectedQueryKeys = entityStore.getQueriesForEntity(
        opt.entityType,
        opt.entityId
      )
      entityStore.delete(opt.entityType, opt.entityId)
      notifier.notifyMany(affectedQueryKeys)
    }

    return safeInstance.async<TData, TMapped>(
      (signal) => {
        const context = { ...options }
        if (signal || options?.signal) {
          // Compose both signals: if either aborts, the composed controller aborts
          const controller = new AbortController()
          if (signal) {
            if (signal.aborted) {
              controller.abort(signal.reason)
            } else {
              signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true })
            }
          }
          if (options?.signal) {
            if (options.signal.aborted) {
              controller.abort(options.signal.reason)
            } else {
              options.signal.addEventListener('abort', () => controller.abort(options.signal!.reason), { once: true })
            }
          }
          context.signal = controller.signal
        }
        return config.fn(context as MutationFnContext<TPath, TBody>)
      },
      {
        parseResult: combinedParse,
        retry,
        onSuccess: (result) => {
          // End optimistic tracking as success
          if (didOptimistic && opt) {
            entityStore.endOptimistic(opt.entityType, opt.entityId, true)
          }

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

          configOnSuccess?.(result)
          invokeOnSuccess?.(result)
        },
        onError: (error) => {
          // Rollback optimistic update using per-entity tracking
          if (didOptimistic && opt) {
            const keysToInvalidate = entityStore.endOptimistic(opt.entityType, opt.entityId, false)
            if (keysToInvalidate) {
              for (const qk of keysToInvalidate) {
                queryCache.invalidate(qk)
              }
              notifier.notifyMany(keysToInvalidate)
            } else if (affectedQueryKeys) {
              // Counter still > 0, notify affected queries to reflect current state
              notifier.notifyMany(affectedQueryKeys)
            }
          }

          configOnError?.(error as E)
          invokeOnError?.(error as E)
        },
        onSettled: (result, error) => {
          configOnSettled?.(result as TMapped | undefined, error as E | null)
          invokeOnSettled?.(result as TMapped | undefined, error as E | null)
        },
      }
    )
  }

  return invoke as MutationCallable<TMapped, E, TPath, TBody>
}
