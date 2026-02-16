import type { SafeResult, RetryConfig } from '@cometloop/safe'

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

// ─── Entity Type Inference ───

export type ExtractEntityTypeNames<T, D extends number[] = []> =
  D['length'] extends 5
    ? never
    : NonNullable<T> extends { __type: infer Type extends string }
      ?
          | Type
          | {
              [K in keyof NonNullable<T>]: ExtractEntityTypeNames<
                NonNullable<T>[K],
                [...D, 0]
              >
            }[keyof NonNullable<T>]
      : NonNullable<T> extends Array<infer Item>
        ? ExtractEntityTypeNames<Item, [...D, 0]>
        : NonNullable<T> extends object
          ? {
              [K in keyof NonNullable<T>]: ExtractEntityTypeNames<
                NonNullable<T>[K],
                [...D, 0]
              >
            }[keyof NonNullable<T>]
          : never

export type ExtractEntityByType<
  T,
  TypeName extends string,
  D extends number[] = [],
> =
  D['length'] extends 5
    ? never
    : NonNullable<T> extends { __type: TypeName }
      ? NonNullable<T>
      : NonNullable<T> extends Array<infer Item>
        ? ExtractEntityByType<Item, TypeName, [...D, 0]>
        : NonNullable<T> extends object
          ? {
              [K in keyof NonNullable<T>]: ExtractEntityByType<
                NonNullable<T>[K],
                TypeName,
                [...D, 0]
              >
            }[keyof NonNullable<T>]
          : never

export type EntityExtractors<TParsed> = {
  [K in ExtractEntityTypeNames<TParsed>]: (
    entity: ExtractEntityByType<TParsed, K>
  ) => string
}

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
  inflightPromise: Promise<SafeResult<any, any>> | null
  entityKeys: Set<string>
}

// ─── HTTP Types ───

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

export type CreateSafeQueryClientConfig<E> = {
  name: string
  baseUrl: string
  headers?: () => Record<string, string>
  enableOptimisticUpdates?: boolean
  parseError: (e: unknown) => E
  defaultError: E
  retry?: RetryConfig
  staleTime?: number
  gcTime?: number
}

// ─── Query Config ───

export type QueryConfig<TData, TParsed = TData> = {
  parseResponse?: (data: TData) => TParsed
  entities?: EntityExtractors<TParsed>
  staleTime?: number
  gcTime?: number
  retry?: RetryConfig
}

// ─── Mutation Config ───

export type OptimisticConfig<TPath extends string> = {
  entityType: string
  entityId: (
    params: [HasPathParams<TPath>] extends [true] ? PathParams<TPath> : never
  ) => string
}

export type MutationConfig<TData, TPath extends string, TParsed = TData> = {
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  parseResponse?: (data: TData) => TParsed
  entities?: EntityExtractors<TParsed>
  optimistic?: OptimisticConfig<TPath>
  retry?: RetryConfig
}

// ─── Query Object ───

export type QueryObject<TData, TError, TPath extends string> =
  [HasPathParams<TPath>] extends [true]
    ? {
        execute: (
          params: PathParams<TPath>,
          options?: { signal?: AbortSignal }
        ) => Promise<SafeResult<TData, TError>>
        subscribe: (
          params: PathParams<TPath>,
          callback: (state: QueryState<TData, TError>) => void
        ) => () => void
        invalidate: (params: PathParams<TPath>) => void
        refetch: (
          params: PathParams<TPath>
        ) => Promise<SafeResult<TData, TError>>
      }
    : {
        execute: (options?: {
          signal?: AbortSignal
        }) => Promise<SafeResult<TData, TError>>
        subscribe: (
          callback: (state: QueryState<TData, TError>) => void
        ) => () => void
        invalidate: () => void
        refetch: () => Promise<SafeResult<TData, TError>>
      }

// ─── Mutation Object ───

type MutationExecuteWithParamsAndBody<TData, TError, TPath extends string> = (
  params: PathParams<TPath>,
  body: unknown,
  options?: { signal?: AbortSignal }
) => Promise<SafeResult<TData, TError>>

type MutationExecuteWithParamsOnly<TData, TError, TPath extends string> = (
  params: PathParams<TPath>,
  options?: { signal?: AbortSignal }
) => Promise<SafeResult<TData, TError>>

type MutationExecuteWithBodyOnly<TData, TError> = (
  body: unknown,
  options?: { signal?: AbortSignal }
) => Promise<SafeResult<TData, TError>>

export type MutationObject<
  TData,
  TError,
  TPath extends string,
  TMethod extends string,
> =
  [HasPathParams<TPath>] extends [true]
    ? TMethod extends 'DELETE'
      ? { execute: MutationExecuteWithParamsOnly<TData, TError, TPath> }
      : { execute: MutationExecuteWithParamsAndBody<TData, TError, TPath> }
    : TMethod extends 'DELETE'
      ? {
          execute: (options?: {
            signal?: AbortSignal
          }) => Promise<SafeResult<TData, TError>>
        }
      : { execute: MutationExecuteWithBodyOnly<TData, TError> }

// ─── Subscriber callback ───

export type Subscriber<TData, TError> = (
  state: QueryState<TData, TError>
) => void
