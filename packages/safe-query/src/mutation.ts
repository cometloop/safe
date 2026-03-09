import type { SafeInstance, SafeResult } from '@cometloop/safe'
import type { MutationConfig, MutationCallable, MutationState, SearchParams, MutationFnContext, MutationVariables, LifecycleCallbacks, GlobalEntityConfig } from './types'
import { QueryCache } from './query-cache'
import { EntityStore } from './entity-store'
import { Notifier } from './notifier'

export type MutationDeps<E> = {
  safeInstance: SafeInstance<E, any>
  queryCache: QueryCache
  entityStore: EntityStore
  notifier: Notifier
  entities?: GlobalEntityConfig
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
  const entities = deps.entities
  const normalize = config.normalize
  const retry = config.retry
  const optimisticConfig = config.optimistic
  const configOnMutate = config.onMutate
  const configOnSuccess = config.onSuccess
  const configOnError = config.onError
  const configOnSettled = config.onSettled

  // When mapToEntities is absent, TMapped = TParsed by type constraint (see MutationConfig).
  // The cast is safe because the conditional type on MutationConfig requires mapToEntities
  // whenever TMapped differs from TParsed.
  const combinedParse: ((data: TData) => TMapped) | undefined = mapToEntities
    ? (data: TData) => mapToEntities((parseResponse ? parseResponse(data) : data) as TParsed)
    : parseResponse as ((data: TData) => TMapped) | undefined

  // ─── State tracking ───

  let state: MutationState<TMapped, E> = {
    status: 'idle',
    isPending: false,
    isSuccess: false,
    isError: false,
    data: undefined,
    error: null,
    submittedAt: null,
  }
  const subscribers = new Set<(s: MutationState<TMapped, E>) => void>()

  function setState(updates: Partial<MutationState<TMapped, E>>) {
    const status = updates.status ?? state.status
    state = {
      ...state,
      ...updates,
      status,
      isPending: status === 'pending',
      isSuccess: status === 'success',
      isError: status === 'error',
    }
    for (const cb of subscribers) cb(state)
  }

  // ─── Optimistic resolution ───

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

  // ─── Invoke ───

  async function invoke(options: { params?: Record<string, string>; searchParams?: SearchParams; signal?: AbortSignal; body?: unknown } & LifecycleCallbacks<TMapped, E>): Promise<SafeResult<TMapped, E>> {
    const params = options?.params
    const body = options?.body
    const invokeOnSuccess = options?.onSuccess
    const invokeOnError = options?.onError
    const invokeOnSettled = options?.onSettled

    setState({ status: 'pending', data: undefined, error: null, submittedAt: Date.now() })

    let mutateContext: unknown
    let affectedQueryKeys: Set<string> | null = null
    let didOptimistic = false
    let opt: { entityType: string; entityId: string } | null = null

    if (configOnMutate) {
      // Custom optimistic via onMutate — skip built-in optimistic updates
      const variables: Record<string, unknown> = {}
      if (params) variables.params = params
      if (body !== undefined) variables.body = body
      if (options?.searchParams) variables.searchParams = options.searchParams
      mutateContext = await Promise.resolve(
        configOnMutate(variables as MutationVariables<TPath, TBody>)
      )
    } else {
      // Built-in optimistic update
      opt = resolveOptimistic(params)

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
        const existing = entityStore.get(opt.entityType, opt.entityId)
        if (existing) {
          entityStore.beginOptimistic(opt.entityType, opt.entityId)
          didOptimistic = true
          affectedQueryKeys = entityStore.getQueriesForEntity(
            opt.entityType,
            opt.entityId
          )
          entityStore.delete(opt.entityType, opt.entityId)
          notifier.notifyMany(affectedQueryKeys)
        }
      }
    }

    let signalCleanup: (() => void) | null = null

    return safeInstance.async<TData, TMapped>(
      (signal) => {
        const context = { ...options }
        if (signal || options?.signal) {
          // Compose both signals: if either aborts, the composed controller aborts
          const controller = new AbortController()
          const cleanups: (() => void)[] = []
          if (signal) {
            if (signal.aborted) {
              controller.abort(signal.reason)
            } else {
              const handler = () => controller.abort(signal.reason)
              signal.addEventListener('abort', handler, { once: true })
              cleanups.push(() => signal.removeEventListener('abort', handler))
            }
          }
          if (options?.signal) {
            if (options.signal.aborted) {
              controller.abort(options.signal.reason)
            } else {
              const handler = () => controller.abort(options.signal!.reason)
              options.signal.addEventListener('abort', handler, { once: true })
              cleanups.push(() => options.signal!.removeEventListener('abort', handler))
            }
          }
          if (cleanups.length > 0) {
            signalCleanup = () => { for (const fn of cleanups) fn() }
          }
          context.signal = controller.signal
        }
        return config.fn(context as MutationFnContext<TPath, TBody>)
      },
      {
        parseResult: combinedParse,
        retry,
        onSuccess: (result) => {
          setState({ status: 'success', data: result, error: null })

          // Normalize server response BEFORE ending optimistic tracking,
          // so endOptimistic can snapshot confirmed server state as new base
          const queryKeys = new Set<string>()

          if (entities && result !== undefined) {
            let entityKeys: Set<string>
            if (normalize) {
              const entityMap = normalize(result)
              entityKeys = entityStore.normalizeExplicit(entityMap, entities)
            } else {
              ;({ entityKeys } = entityStore.normalize(result, entities))
            }
            for (const eKey of entityKeys) {
              const idx = eKey.indexOf(':')
              const type = eKey.substring(0, idx)
              const id = eKey.substring(idx + 1)
              for (const qk of entityStore.getQueriesForEntity(type, id)) {
                queryKeys.add(qk)
              }
            }
          }

          // End optimistic tracking after store has confirmed server data
          if (didOptimistic && opt) {
            const keysToInvalidate = entityStore.endOptimistic(opt.entityType, opt.entityId, true)
            if (keysToInvalidate) {
              for (const qk of keysToInvalidate) {
                queryCache.invalidate(qk)
                queryKeys.add(qk)
              }
            }
          }

          if (affectedQueryKeys) {
            for (const qk of affectedQueryKeys) {
              queryKeys.add(qk)
            }
          }

          if (queryKeys.size > 0) {
            notifier.notifyMany(queryKeys)
          }

          configOnSuccess?.(result, mutateContext)
          invokeOnSuccess?.(result)
        },
        onError: (error) => {
          setState({ status: 'error', error: error as E })

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

          configOnError?.(error as E, mutateContext)
          invokeOnError?.(error as E)
        },
        onSettled: (result, error) => {
          if (signalCleanup) {
            signalCleanup()
            signalCleanup = null
          }
          configOnSettled?.(result as TMapped | undefined, error as E | null, mutateContext)
          invokeOnSettled?.(result as TMapped | undefined, error as E | null)
        },
      }
    )
  }

  // ─── Build callable with state tracking ───

  const callable = invoke as unknown as MutationCallable<TMapped, E, TPath, TBody>

  Object.defineProperties(callable, {
    status: { get: () => state.status, enumerable: true },
    isPending: { get: () => state.isPending, enumerable: true },
    isSuccess: { get: () => state.isSuccess, enumerable: true },
    isError: { get: () => state.isError, enumerable: true },
    data: { get: () => state.data, enumerable: true },
    error: { get: () => state.error, enumerable: true },
    submittedAt: { get: () => state.submittedAt, enumerable: true },
  })

  ;(callable as any).subscribe = (callback: (s: MutationState<TMapped, E>) => void) => {
    subscribers.add(callback)
    return () => { subscribers.delete(callback) }
  }

  ;(callable as any).reset = () => {
    setState({
      status: 'idle',
      data: undefined,
      error: null,
      submittedAt: null,
    })
  }

  return callable
}
