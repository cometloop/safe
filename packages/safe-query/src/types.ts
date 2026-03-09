import type { SafeInstance, SafeResult, RetryConfig } from '@cometloop/safe'

// ─── Path Param Extraction ───

export type ExtractPathParams<T extends string> =
  T extends `${string}:${infer Param}/${infer Rest}`
    ? Param | ExtractPathParams<Rest>
    : T extends `${string}:${infer Param}`
      ? Param
      : never

export type PathParams<T extends string> = [ExtractPathParams<T>] extends
  [never]
  ? never
  : Record<ExtractPathParams<T>, string>

export type HasPathParams<T extends string> = [ExtractPathParams<T>] extends
  [never]
  ? false
  : true

// ─── Entity Types ───

export type MatchedEntityExtractor<T = any> = {
  match: (obj: Record<string, unknown>) => boolean
  id: (entity: T) => string
}

export type GlobalEntityConfig = Record<string, MatchedEntityExtractor>

export type NormalizeFn<TData, TEntities extends GlobalEntityConfig = GlobalEntityConfig> =
  (data: TData) => { [K in keyof TEntities]?: unknown[] }

// ─── Entity Reference ───

export type EntityRef = { __ref: string }

// ─── Query State ───

export type QueryState<TData, TError> = {
  data: TData | undefined
  error: TError | null
  status: 'idle' | 'loading' | 'success' | 'error'
  isFetching: boolean
  isStale: boolean
  dataUpdatedAt: number | null
  isPlaceholderData: boolean
}

// ─── Mutation State ───

export type MutationState<TData, TError> = {
  status: 'idle' | 'pending' | 'success' | 'error'
  isPending: boolean
  isSuccess: boolean
  isError: boolean
  data: TData | undefined
  error: TError | null
  submittedAt: number | null
}

// ─── Cache Entry ───

export type CacheEntry<TData> = {
  data: TData | undefined
  normalizedData: unknown | undefined
  error: unknown | null
  dataUpdatedAt: number | null
  staleTime: number
  gcTime: number
  gcTimer: ReturnType<typeof setTimeout> | null
  subscriberCount: number
  generation: number
  inflightPromise: Promise<SafeResult<unknown, unknown>> | null
  entityKeys: Set<string>
  abortController: AbortController | null
}

// ─── Search Params ───

export type SearchParamValue = string | number | boolean

export type SearchParams = Record<string, SearchParamValue | SearchParamValue[]>

// ─── HTTP Types ───

export class QueryDisabledError extends Error {
  constructor() {
    super('Query is disabled')
    this.name = 'QueryDisabledError'
  }
}

export class HttpError extends Error {
  public readonly status: number
  public readonly statusText: string
  public readonly body: unknown

  constructor(status: number, statusText: string, body: unknown) {
    super(`HTTP ${status}: ${statusText}`)
    this.name = 'HttpError'
    this.status = status
    this.statusText = statusText
    this.body = body
  }
}

export type FetchOptions = {
  method?: string
  headers?: Record<string, string>
  body?: unknown
  signal?: AbortSignal
}

// ─── Client Config ───

export type SafeQueryConfig<E, TEntities extends GlobalEntityConfig = GlobalEntityConfig> = {
  safe: SafeInstance<E, any>
  entities?: TEntities
  staleTime?: number
  gcTime?: number
  enableOptimisticUpdates?: boolean
  refetchInterval?: number | false
  refetchIntervalInBackground?: boolean
  refetchOnWindowFocus?: boolean
}

// ─── Fn Context Types ───

export type QueryFnContext<TPath extends string> = {
  searchParams?: SearchParams
  signal?: AbortSignal
} & ([HasPathParams<TPath>] extends [true] ? { params: PathParams<TPath> } : unknown)

export type DataFnContext<TPath extends string, TData = unknown> = {
  getEntity: (type: string, id: string) => unknown | undefined
  previousData?: TData
} & ([HasPathParams<TPath>] extends [true]
  ? { params: PathParams<TPath>; searchParams?: SearchParams }
  : { searchParams?: SearchParams })

export type MutationFnContext<TPath extends string, TBody> = {
  searchParams?: SearchParams
  signal?: AbortSignal
} & ([HasPathParams<TPath>] extends [true] ? { params: PathParams<TPath> } : unknown)
  & ([TBody] extends [void | undefined] ? unknown : { body: TBody })

// ─── Lifecycle Callbacks ───

export type LifecycleCallbacks<TData, TError = unknown> = {
  onSuccess?: (data: TData) => void
  onError?: (error: TError) => void
  onSettled?: (data: TData | undefined, error: TError | null) => void
}

// ─── Query Config ───

export type QueryConfig<TData, TPath extends string = string, TParsed = TData, TMapped = TParsed, TEntities extends GlobalEntityConfig = GlobalEntityConfig> = {
  key: TPath
  fn: (context: QueryFnContext<TPath>) => Promise<TData>
  parseResponse?: (data: TData) => TParsed
  normalize?: NormalizeFn<TMapped, TEntities>
  staleTime?: number
  gcTime?: number
  retry?: RetryConfig
  refetchInterval?: number | false
  refetchIntervalInBackground?: boolean
  refetchOnWindowFocus?: boolean
  initialData?: TMapped | ((context: DataFnContext<TPath, TMapped>) => TMapped | undefined)
  initialDataUpdatedAt?: number | (() => number | undefined)
  placeholderData?: TMapped | ((context: DataFnContext<TPath, TMapped>) => TMapped | undefined)
} & LifecycleCallbacks<TMapped>
  & ([TMapped] extends [TParsed]
    ? [TParsed] extends [TMapped]
      ? { mapToEntities?: (data: TParsed) => TMapped }
      : { mapToEntities: (data: TParsed) => TMapped }
    : { mapToEntities: (data: TParsed) => TMapped })

// ─── Mutation Config ───

export type OptimisticConfig<TPath extends string> = {
  entityType: string
  entityId: (
    params: [HasPathParams<TPath>] extends [true] ? PathParams<TPath> : never
  ) => string
}

export type MutationVariables<TPath extends string, TBody> = {
  searchParams?: SearchParams
} & ([HasPathParams<TPath>] extends [true] ? { params: PathParams<TPath> } : unknown)
  & ([TBody] extends [void | undefined] ? unknown : { body: TBody })

export type MutationConfig<
  TData,
  TBody = void,
  TPath extends string = string,
  TMethod extends 'POST' | 'PUT' | 'PATCH' | 'DELETE' =
    | 'POST'
    | 'PUT'
    | 'PATCH'
    | 'DELETE',
  TParsed = TData,
  TMapped = TParsed,
  TEntities extends GlobalEntityConfig = GlobalEntityConfig,
> = {
  key: TPath
  fn: (context: MutationFnContext<TPath, TBody>) => Promise<TData>
  method?: TMethod
  parseResponse?: (data: TData) => TParsed
  normalize?: NormalizeFn<TMapped, TEntities>
  optimistic?: OptimisticConfig<TPath>
  retry?: RetryConfig
  onMutate?: (variables: MutationVariables<TPath, TBody>) => unknown | Promise<unknown>
  onSuccess?: (data: TMapped, context?: unknown) => void
  onError?: (error: unknown, context?: unknown) => void
  onSettled?: (data: TMapped | undefined, error: unknown | null, context?: unknown) => void
} & ([TMapped] extends [TParsed]
    ? [TParsed] extends [TMapped]
      ? { mapToEntities?: (data: TParsed) => TMapped }
      : { mapToEntities: (data: TParsed) => TMapped }
    : { mapToEntities: (data: TParsed) => TMapped })

// ─── Invoke Options ───

export type QueryInvokeOptions<TPath extends string> =
  [HasPathParams<TPath>] extends [true]
    ? { params: PathParams<TPath>; searchParams?: SearchParams; signal?: AbortSignal; enabled?: boolean }
    : { searchParams?: SearchParams; signal?: AbortSignal; enabled?: boolean } | void

export type MutationInvokeOptions<TPath extends string, TBody> =
  { searchParams?: SearchParams; signal?: AbortSignal }
  & ([HasPathParams<TPath>] extends [true] ? { params: PathParams<TPath> } : unknown)
  & ([TBody] extends [void | undefined] ? { body?: unknown } : { body: TBody })

export type KeyOptions<TPath extends string> =
  [HasPathParams<TPath>] extends [true]
    ? { params: PathParams<TPath>; searchParams?: SearchParams }
    : { searchParams?: SearchParams } | void

// ─── Callable Types ───

export type QueryCallable<TData, TError, TPath extends string> = {
  (options?: QueryInvokeOptions<TPath> & LifecycleCallbacks<TData, TError>): Promise<SafeResult<TData, TError>>
  subscribe: (
    callback: (state: QueryState<TData, TError>) => void,
    options?: KeyOptions<TPath> extends void ? void : KeyOptions<TPath>
  ) => () => void
  invalidate: (options?: KeyOptions<TPath> extends void ? void : KeyOptions<TPath>) => void
  refetch: (options?: KeyOptions<TPath> extends void ? void : KeyOptions<TPath>) => Promise<SafeResult<TData, TError>>
  readonly status: QueryState<TData, TError>['status']
  readonly data: TData | undefined
  readonly error: TError | null
  readonly isFetching: boolean
  readonly isStale: boolean
}

export type MutationCallable<TData, TError, TPath extends string, TBody> = {
  (options: MutationInvokeOptions<TPath, TBody> & LifecycleCallbacks<TData, TError>): Promise<SafeResult<TData, TError>>
  subscribe: (callback: (state: MutationState<TData, TError>) => void) => () => void
  readonly status: MutationState<TData, TError>['status']
  readonly isPending: boolean
  readonly isSuccess: boolean
  readonly isError: boolean
  readonly data: TData | undefined
  readonly error: TError | null
  readonly submittedAt: number | null
  reset: () => void
}

// ─── Subscriber callback ───

export type Subscriber<TData, TError> = (
  state: QueryState<TData, TError>
) => void
