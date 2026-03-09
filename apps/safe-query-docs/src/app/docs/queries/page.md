---
title: Queries
---

Queries are the primary way to fetch data with `@cometloop/safe-query`. The `query()` method on your client creates a `QueryCallable` -- a function you can call to fetch data, with additional properties for subscribing to state changes, invalidating cache entries, and refetching.

---

## Defining a query

Pass a configuration object to `api.query()`:

```ts
import { fetchJson, buildUrl } from '@cometloop/safe-query'

const BASE_URL = 'https://api.example.com'

const getUsers = api.query({
  key: '/users',
  fn: () => fetchJson<User[]>(buildUrl(BASE_URL, '/users')),
})
```

The `key` identifies this query in the cache. The `fn` function performs the actual data fetching and must return a `Promise`.

---

## Query configuration

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `key` | `string` | **(required)** | Path string like `'/users'` or `'/users/:id'`. Path parameters (`:param`) are extracted at the type level. |
| `fn` | `(context: QueryFnContext) => Promise<TData>` | **(required)** | The function that fetches data. Receives a context object with `signal`, `params`, and `searchParams`. |
| `parseResponse` | `(data: TData) => TParsed` | — | Transform the raw response before caching. |
| `mapToEntities` | `(data: TParsed) => TMapped` | — | Add `__type` fields for entity normalization. Required when `TMapped` differs from `TParsed`. |
| `entities` | `{ [typeName]: (entity) => string }` | — | Entity extractors for normalization. Maps type names to functions that return entity IDs. |
| `staleTime` | `number` | Client default | Override the client-level `staleTime` for this query. |
| `gcTime` | `number` | Client default | Override the client-level `gcTime` for this query. |
| `retry` | `RetryConfig` | — | Retry configuration from `@cometloop/safe`. Controls automatic retries on failure. |
| `refetchInterval` | `number \| false` | Client default | Override the client-level `refetchInterval`. |
| `refetchIntervalInBackground` | `boolean` | Client default | Override the client-level `refetchIntervalInBackground`. |
| `refetchOnWindowFocus` | `boolean` | Client default | Override the client-level `refetchOnWindowFocus`. |
| `initialData` | `TMapped \| (ctx) => TMapped \| undefined` | — | Synchronous data to populate the cache before the first fetch. See [Initial data](/docs/initial-data). |
| `initialDataUpdatedAt` | `number \| () => number \| undefined` | — | Timestamp for when `initialData` was last updated. Used to determine if initial data is stale. |
| `placeholderData` | `TMapped \| (ctx) => TMapped \| undefined` | — | Data to show while the first fetch is in progress. Not persisted to the cache. See [Placeholder data](/docs/placeholder-data). |
| `onSuccess` | `(data: TMapped) => void` | — | Called when the query successfully fetches data. |
| `onError` | `(error: E) => void` | — | Called when the query fails. |
| `onSettled` | `(data: TMapped \| undefined, error: E \| null) => void` | — | Called when the query completes, regardless of success or failure. |

---

## QueryFnContext

The `fn` function receives a context object with the following properties:

```ts
type QueryFnContext = {
  signal?: AbortSignal  // For cancelling in-flight requests
  params?: Record<string, string>  // Path parameters extracted from the key
  searchParams?: Record<string, string>  // Search/query parameters
}
```

Example using all context properties:

```ts
const searchUsers = api.query({
  key: '/users',
  fn: (ctx) =>
    fetchJson<User[]>(
      buildUrl(BASE_URL, '/users', undefined, ctx.searchParams),
      { signal: ctx.signal }
    ),
})

const getUser = api.query({
  key: '/users/:id',
  fn: (ctx) =>
    fetchJson<User>(
      buildUrl(BASE_URL, '/users/:id', ctx.params),
      { signal: ctx.signal }
    ),
})
```

---

## Calling a query

A `QueryCallable` is a function. Call it to fetch data. It returns a `Promise<SafeResult<TMapped, E>>` -- a tuple of `[data, error]`:

```ts
const [users, error] = await getUsers()

if (error) {
  console.error('Failed to fetch users:', error.message)
} else {
  console.log('Got users:', users)
}
```

### With path parameters

When a key contains path parameters (e.g., `/users/:id`), pass them via `params`:

```ts
const getUser = api.query({
  key: '/users/:id',
  fn: (ctx) => fetchJson<User>(buildUrl(BASE_URL, '/users/:id', ctx.params)),
})

const [user, error] = await getUser({ params: { id: '123' } })
```

Path parameters are type-safe. TypeScript will require exactly the parameters defined in the key string:

```ts
// TypeScript error: Property 'id' is missing
const [user, error] = await getUser({ params: {} })

// TypeScript error: 'userId' does not exist, did you mean 'id'?
const [user, error] = await getUser({ params: { userId: '123' } })
```

### With search parameters

Pass search parameters to filter or paginate results:

```ts
const [users, error] = await getUsers({
  searchParams: { role: 'admin', page: '1' },
})
```

Search parameters affect the cache key. `getUsers()` and `getUsers({ searchParams: { role: 'admin' } })` are cached separately.

### With an AbortSignal

Pass a signal to cancel the request:

```ts
const controller = new AbortController()

const [users, error] = await getUsers({ signal: controller.signal })

// Cancel the request
controller.abort()
```

### With the enabled flag

The `enabled` option controls whether the query actually fetches data:

```ts
const [user, error] = await getUser({
  params: { id: '123' },
  enabled: false,
})
```

When `enabled` is `false`:
- If cached data exists, it is returned immediately without refetching.
- If no cached data exists, a `QueryDisabledError` is returned as the error.

This is useful for conditional fetching. For example, only fetch a user's profile if you have their ID:

```ts
async function loadProfile(userId: string | null) {
  const [profile, error] = await getProfile({
    params: { id: userId ?? '' },
    enabled: userId !== null,
  })

  if (error) {
    // Could be QueryDisabledError if userId was null
    return
  }

  renderProfile(profile)
}
```

### Per-call lifecycle callbacks

Override or supplement the query-level callbacks on individual calls:

```ts
const [users, error] = await getUsers({
  onSuccess: (data) => {
    showToast(`Loaded ${data.length} users`)
  },
  onError: (error) => {
    showToast(`Failed: ${error.message}`)
  },
  onSettled: (data, error) => {
    hideLoadingSpinner()
  },
})
```

---

## Request deduplication

If the same query (same key + params + searchParams) is called multiple times while a request is already in-flight, the duplicate calls share the same network request. They all resolve with the same result:

```ts
// Only ONE network request is made
const [result1, result2, result3] = await Promise.all([
  getUsers(),
  getUsers(),
  getUsers(),
])
```

This prevents redundant network traffic when multiple parts of your application request the same data simultaneously.

---

## Stale-while-revalidate

When cached data exists but is stale (older than `staleTime`), the query returns the stale data immediately and refetches in the background. Subscribers are notified when fresh data arrives:

```ts
const getUsers = api.query({
  key: '/users',
  fn: () => fetchJson<User[]>(buildUrl(BASE_URL, '/users')),
  staleTime: 30_000, // Fresh for 30 seconds
})

// First call: fetches from the network
const [users1, err1] = await getUsers()

// Within 30 seconds: returns cached data, no network request
const [users2, err2] = await getUsers()

// After 30 seconds: returns stale cached data AND refetches in the background
const [users3, err3] = await getUsers()
```

During the background refetch, `isFetching` is `true` while `status` remains `'success'` (because stale data is still available). Subscribers see this intermediate state:

```ts
getUsers.subscribe((state) => {
  if (state.status === 'success' && state.isFetching) {
    // Stale data is being shown while fresh data loads
    showStaleIndicator()
  }
})
```

---

## QueryCallable properties

A `QueryCallable` is both a function and an object with properties. Beyond calling it to fetch data, you can subscribe to state changes, invalidate cache entries, and access current state.

### .subscribe(callback, options?)

Subscribe to state changes. Returns an unsubscribe function. See the [Subscriptions](/docs/subscriptions) page for comprehensive details.

```ts
const unsubscribe = getUsers.subscribe((state) => {
  console.log(state.status, state.data)
})

// Later: stop listening
unsubscribe()
```

### .invalidate(options?)

Mark the cache entry for this query as stale. If there are active subscribers, the query is immediately refetched:

```ts
getUsers.invalidate()

// With specific params
getUser.invalidate({ params: { id: '123' } })
```

### .refetch(options?)

Force a refetch regardless of staleness. Returns a `Promise<SafeResult>`:

```ts
const [users, error] = await getUsers.refetch()

// With specific params
const [user, error] = await getUser.refetch({ params: { id: '123' } })
```

### State getters

Access the current state of the default cache entry (no params, no search params) directly on the `QueryCallable`:

```ts
getUsers.status      // 'idle' | 'loading' | 'success' | 'error'
getUsers.data        // User[] | undefined
getUsers.error       // AppError | null
getUsers.isFetching  // boolean
getUsers.isStale     // boolean
```

{% callout type="note" %}
The state getters reflect the state for the default key (no params, no search params). To access state for a specific combination of params, use `.subscribe()` with the appropriate options.
{% /callout %}

---

## QueryState

The `subscribe` callback and state getters expose a `QueryState` object:

```ts
type QueryState<TData, E> = {
  data: TData | undefined
  error: E | null
  status: 'idle' | 'loading' | 'success' | 'error'
  isFetching: boolean
  isStale: boolean
  dataUpdatedAt: number | null
  isPlaceholderData: boolean
}
```

| Property | Description |
| --- | --- |
| `data` | The most recent successfully fetched data, or `undefined` if no data has been fetched yet. |
| `error` | The most recent error, or `null` if the last fetch succeeded. |
| `status` | The overall status: `'idle'` (never fetched), `'loading'` (first fetch in progress), `'success'` (data available), `'error'` (last fetch failed). |
| `isFetching` | `true` when a network request is in-flight. Can be `true` even when `status` is `'success'` (stale-while-revalidate). |
| `isStale` | `true` when the cached data is older than `staleTime`. |
| `dataUpdatedAt` | Timestamp (ms since epoch) of the last successful fetch, or `null`. |
| `isPlaceholderData` | `true` when the `data` field contains placeholder data (not real cached data). See [Placeholder data](/docs/placeholder-data). |

### Status transitions

A typical query goes through these states:

```text
idle -> loading -> success
                -> error
```

On subsequent fetches with stale data:

```text
success (isStale: true, isFetching: false)
  -> success (isStale: true, isFetching: true)   // background refetch starts
  -> success (isStale: false, isFetching: false)  // fresh data arrives
```

---

## QueryDisabledError

When a query is called with `enabled: false` and no cached data exists, the error in the result tuple is a `QueryDisabledError`:

```ts
import { QueryDisabledError } from '@cometloop/safe-query'

const [data, error] = await getUser({
  params: { id: '123' },
  enabled: false,
})

if (error instanceof QueryDisabledError) {
  // Query was disabled and there's no cached data
  console.log('Query is disabled')
}
```

---

## Response transformation

Use `parseResponse` to transform the raw API response before it enters the cache:

```ts
type ApiResponse = {
  data: User[]
  total: number
  page: number
}

const getUsers = api.query({
  key: '/users',
  fn: (ctx) =>
    fetchJson<ApiResponse>(
      buildUrl(BASE_URL, '/users', undefined, ctx.searchParams)
    ),
  parseResponse: (response) => response.data,
})

// getUsers returns User[], not ApiResponse
const [users, error] = await getUsers()
```

For entity normalization, use `mapToEntities` to add `__type` fields. See [Entity normalization](/docs/entity-normalization) for details.

---

## Complete example

Here is a more complete example showing multiple query patterns together:

```ts
import { safeQuery, fetchJson, buildUrl } from '@cometloop/safe-query'

const api = safeQuery<AppError>({
  safe,
  staleTime: 30_000,
  refetchOnWindowFocus: true,
})

const BASE_URL = 'https://api.example.com'

// Simple list query
const getUsers = api.query({
  key: '/users',
  fn: (ctx) =>
    fetchJson<User[]>(
      buildUrl(BASE_URL, '/users', undefined, ctx.searchParams),
      { signal: ctx.signal }
    ),
  staleTime: 60_000,
  onSuccess: (users) => {
    console.log(`Loaded ${users.length} users`)
  },
})

// Detail query with path params
const getUser = api.query({
  key: '/users/:id',
  fn: (ctx) =>
    fetchJson<User>(
      buildUrl(BASE_URL, '/users/:id', ctx.params),
      { signal: ctx.signal }
    ),
})

// Query with response transformation
const getUserPosts = api.query({
  key: '/users/:userId/posts',
  fn: (ctx) =>
    fetchJson<{ data: Post[]; meta: PageMeta }>(
      buildUrl(BASE_URL, '/users/:userId/posts', ctx.params, ctx.searchParams),
      { signal: ctx.signal }
    ),
  parseResponse: (response) => response.data,
  retry: { retries: 3, delay: 1000 },
})

// Usage
const [users, err] = await getUsers({ searchParams: { role: 'admin' } })
const [user, err2] = await getUser({ params: { id: '42' } })
const [posts, err3] = await getUserPosts({
  params: { userId: '42' },
  searchParams: { page: '2' },
})
```

---

## What's next?

- [Subscriptions](/docs/subscriptions) — listen to query state changes
- [Mutations](/docs/mutations) — modify data and update the cache
- [Cache keys](/docs/cache-keys) — understand how keys are constructed
- [Initial data](/docs/initial-data) — pre-populate the cache
- [Placeholder data](/docs/placeholder-data) — show temporary data while loading
- [Background refetching](/docs/background-refetching) — automatic refetching strategies
