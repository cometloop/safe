---
title: Client setup
---

The `safeQuery()` factory creates a client that manages queries, mutations, caching, and background refetching. This page covers all configuration options and the methods available on the client instance.

---

## Creating a client

Pass a configuration object to `safeQuery()` to create a client. The only required option is `safe`, which must be a `SafeInstance` from `@cometloop/safe`:

```ts
import { createSafe } from '@cometloop/safe'
import { safeQuery } from '@cometloop/safe-query'

type AppError = {
  code: string
  message: string
}

const safe = createSafe<AppError>({
  parseError: (err) => ({
    code: err instanceof Error ? err.name : 'UNKNOWN',
    message: err instanceof Error ? err.message : 'An unknown error occurred',
  }),
  defaultError: {
    code: 'UNKNOWN',
    message: 'An unknown error occurred',
  },
})

const api = safeQuery<AppError>({
  safe,
})
```

---

## Configuration options

All options except `safe` are optional and provide sensible defaults.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `safe` | `SafeInstance` | **(required)** | The safe instance used for error handling. All queries and mutations return `SafeResult` tuples through this instance. |
| `staleTime` | `number` | `0` | Milliseconds before cached data is considered stale. While data is fresh, subsequent calls return the cached value without refetching. |
| `gcTime` | `number` | `300000` (5 min) | Milliseconds before unused cache entries are garbage collected. An entry is "unused" when it has no active subscribers. |
| `enableOptimisticUpdates` | `boolean` | `false` | Enable optimistic mutations. When `true`, mutations with `optimistic` config will update the entity cache immediately before the server responds. |
| `refetchInterval` | `number \| false` | `false` | Milliseconds between automatic refetches. Set to a number to enable polling. Only active when a query has at least one subscriber. |
| `refetchIntervalInBackground` | `boolean` | `false` | When `true`, interval-based refetching continues even when the browser tab is hidden. By default, polling pauses when the tab loses visibility. |
| `refetchOnWindowFocus` | `boolean` | `false` | When `true`, stale queries are automatically refetched when the browser window regains focus. Only applies to queries with at least one subscriber. |
| `entities` | `GlobalEntityConfig` | `undefined` | Global entity configuration for normalized caching. Maps entity type names to `{ match, id }` extractors. See [Entity normalization](/docs/entity-normalization). |

---

## Configuration examples

### Minimal setup

For simple use cases where you want direct control over when data is fetched:

```ts
const api = safeQuery<AppError>({
  safe,
})
```

With a `staleTime` of `0` (the default), every call triggers a network request. This is the most predictable behavior and a good starting point.

### Dashboard with polling

For a dashboard that needs to stay up-to-date:

```ts
const api = safeQuery<AppError>({
  safe,
  staleTime: 10_000,
  refetchInterval: 30_000,
  refetchOnWindowFocus: true,
})
```

Data is fresh for 10 seconds. Every 30 seconds, subscribed queries are automatically refetched. When a user switches back to the tab, stale queries are immediately refetched.

### Long-lived cache with optimistic updates

For an app where data changes infrequently and you want instant UI feedback on mutations:

```ts
const api = safeQuery<AppError>({
  safe,
  staleTime: 5 * 60_000,
  gcTime: 30 * 60_000,
  enableOptimisticUpdates: true,
  entities: {
    user: { match: (obj) => 'email' in obj, id: (u: any) => String(u.id) },
    post: { match: (obj) => 'title' in obj, id: (p: any) => String(p.id) },
  },
})
```

Data stays fresh for 5 minutes. Unused cache entries live for 30 minutes before being garbage collected. Mutations with `optimistic` config update the UI immediately. The `entities` map tells the cache how to recognize and normalize `user` and `post` objects across all queries.

### Aggressive background sync

For a real-time collaboration app:

```ts
const api = safeQuery<AppError>({
  safe,
  staleTime: 0,
  refetchInterval: 5_000,
  refetchIntervalInBackground: true,
  refetchOnWindowFocus: true,
})
```

Data is always considered stale. Polling every 5 seconds, even when the tab is hidden. This ensures data is always current but generates significant network traffic.

{% callout type="warning" %}
Setting `refetchIntervalInBackground` to `true` means network requests continue even when the user is not looking at your app. Use this sparingly and consider the impact on battery life and server load.
{% /callout %}

---

## Client methods

The client returned by `safeQuery()` exposes methods for defining queries and mutations, as well as cache management.

### query(config)

Creates a `QueryCallable` for fetching data. See the [Queries](/docs/queries) page for full details.

```ts
const getUsers = api.query({
  key: '/users',
  fn: () => fetchJson<User[]>(buildUrl(BASE_URL, '/users')),
})
```

### mutate(config)

Creates a `MutationCallable` for modifying data. See the [Mutations](/docs/mutations) page for full details.

```ts
const createUser = api.mutate<User, { name: string }>({
  key: '/users',
  method: 'POST',
  fn: (ctx) => fetchJson<User>(buildUrl(BASE_URL, '/users'), {
    method: 'POST',
    body: ctx.body,
  }),
})
```

### getQueryData(path, options?)

Reads cached data for a query key. Returns `undefined` if no data is cached. If entities are configured and the cache contains normalized data, it is denormalized automatically.

```ts
// Simple key
const users = api.getQueryData<User[]>('/users')

// With path params
const user = api.getQueryData<User>('/users/:id', { params: { id: '123' } })

// With search params
const page = api.getQueryData<User[]>('/users', { searchParams: { page: 1 } })
```

This is useful for checking cache state before deciding whether to fetch, prefetching on hover, or sharing data between unrelated queries.

### setQueryData(path, updater, options?)

Imperatively writes data to the cache for a query key. Accepts a static value or an updater function that receives the current cached data (or `undefined`). If entities are configured, the data is normalized into the entity store automatically. Subscribers are notified immediately.

```ts
// Set data directly
api.setQueryData('/users', [{ id: '1', name: 'Alice' }])

// Updater function
api.setQueryData<User[]>('/users', (old) =>
  old ? [...old, newUser] : [newUser]
)

// With path params
api.setQueryData('/users/:id', updatedUser, { params: { id: '123' } })
```

Common use cases:

```ts
// WebSocket push update
ws.on('user:updated', (user) => {
  api.setQueryData('/users/:id', user, { params: { id: user.id } })
})

// Prefetch on hover
function onHover(userId: string) {
  if (!api.getQueryData('/users/:id', { params: { id: userId } })) {
    fetchUser(userId).then((user) => {
      api.setQueryData('/users/:id', user, { params: { id: userId } })
    })
  }
}

// Optimistic list update after creating an item
const createUser = api.mutate<User, CreateUserInput>({
  key: '/users',
  method: 'POST',
  fn: (ctx) => fetchJson<User>(buildUrl(BASE_URL, '/users'), {
    method: 'POST',
    body: ctx.body,
  }),
  onSuccess: (newUser) => {
    api.setQueryData<User[]>('/users', (old) =>
      old ? [...old, newUser] : [newUser]
    )
  },
})
```

{% callout type="note" %}
If the updater function returns `undefined`, the cache is not modified. This lets you conditionally skip updates.
{% /callout %}

### invalidateByPrefix(prefix)

Marks all cache entries whose key starts with the given prefix as stale. If any of those entries have active subscribers, they are refetched immediately.

```ts
// Invalidate all user-related queries
api.invalidateByPrefix('/users')
```

This is useful after a mutation that affects multiple queries. For example, creating a new user might affect both `/users` and `/users?role=admin`:

```ts
const createUser = api.mutate<User, { name: string; role: string }>({
  key: '/users',
  method: 'POST',
  fn: (ctx) => fetchJson<User>(buildUrl(BASE_URL, '/users'), {
    method: 'POST',
    body: ctx.body,
  }),
  onSuccess: () => {
    api.invalidateByPrefix('/users')
  },
})
```

### invalidateAll()

Marks every cache entry as stale. Entries with active subscribers are refetched immediately.

```ts
api.invalidateAll()
```

This is a blunt instrument. Prefer `invalidateByPrefix()` when you know which queries are affected.

### clear()

Removes all entries from the cache. Unlike `invalidateAll()`, this does not trigger refetches. Subscribers will receive a state update with `data: undefined` and `status: 'idle'`.

```ts
api.clear()
```

A common use case is clearing the cache on user logout:

```ts
function logout() {
  api.clear()
  authStore.reset()
  router.navigate('/login')
}
```

### destroy()

Tears down the client completely. Clears the cache, removes all event listeners (window focus, visibility change), and stops all interval-based refetching. Call this when the client is no longer needed.

```ts
api.destroy()
```

{% callout type="warning" %}
After calling `destroy()`, the client should not be used. Any queries or mutations created from this client will no longer function correctly.
{% /callout %}

---

## Per-query overrides

Many client-level options can be overridden on individual queries. Query-level settings take precedence over client-level defaults:

```ts
const api = safeQuery<AppError>({
  safe,
  staleTime: 30_000,
  refetchOnWindowFocus: true,
})

// This query has its own stale time and disables window focus refetching
const getAnalytics = api.query({
  key: '/analytics',
  fn: () => fetchJson<Analytics>(buildUrl(BASE_URL, '/analytics')),
  staleTime: 5 * 60_000,
  refetchOnWindowFocus: false,
})

// This query uses the client defaults (30s stale time, refetch on focus)
const getUsers = api.query({
  key: '/users',
  fn: () => fetchJson<User[]>(buildUrl(BASE_URL, '/users')),
})
```

{% callout type="note" %}
The `entities` option is client-level only and cannot be overridden per-query. To control how a specific query extracts entities from its response, use the `normalize` option on the query instead. See [Entity normalization](/docs/entity-normalization) for details.
{% /callout %}

See the [Queries](/docs/queries) page for the full list of per-query options.

---

## What's next?

- [Queries](/docs/queries) — define queries and learn the full QueryCallable API
- [Mutations](/docs/mutations) — define mutations and handle side effects
- [Cache keys](/docs/cache-keys) — understand how cache keys are constructed
- [Entity normalization](/docs/entity-normalization) — set up cross-query cache consistency
