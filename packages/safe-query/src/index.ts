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
  SubscribeOptions,
  Subscriber,
  SearchParamValue,
  SearchParams,
  LifecycleCallbacks,
  InfiniteData,
  InfiniteQueryConfig,
  InfiniteQueryState,
  InfiniteQueryCallable,
  InfiniteQueryFnContext,
  DehydratedState,
  DehydratedQuery,
} from './types'
export { HttpError, QueryDisabledError, QueryAbortedError } from './types'
export { QueryCache } from './query-cache'
export { FocusManager } from './focus-manager'
export { buildUrl } from './url'
export { fetchJson } from './fetch-client'
