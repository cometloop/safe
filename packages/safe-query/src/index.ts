export { safeQuery } from './client'
export type { SafeQueryClient } from './client'

export function keepPreviousData<TData = unknown>(
  context: { previousData?: TData },
): TData | undefined {
  return context.previousData
}
export type {
  ExtractPathParams,
  PathParams,
  HasPathParams,
  MatchedEntityExtractor,
  GlobalEntityConfig,
  NormalizeFn,
  EntityRef,
  QueryState,
  MutationState,
  MutationVariables,
  CacheEntry,
  FetchOptions,
  SafeQueryConfig,
  QueryConfig,
  MutationConfig,
  OptimisticConfig,
  QueryCallable,
  MutationCallable,
  QueryFnContext,
  DataFnContext,
  MutationFnContext,
  QueryInvokeOptions,
  MutationInvokeOptions,
  KeyOptions,
  Subscriber,
  SearchParamValue,
  SearchParams,
  LifecycleCallbacks,
} from './types'
export { HttpError, QueryDisabledError } from './types'
export { QueryCache } from './query-cache'
export { FocusManager } from './focus-manager'
export { buildUrl } from './url'
export { fetchJson } from './fetch-client'
