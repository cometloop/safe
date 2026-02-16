# @cometloop/safe-query

Type-safe data fetching and caching built on [@cometloop/safe](https://github.com/cometloop/safe). Framework-agnostic with normalized entity caching and optimistic updates.

## Install

```bash
npm install @cometloop/safe-query @cometloop/safe
```

## Quick Start

```typescript
import { createSafe } from '@cometloop/safe'
import { safeQuery } from '@cometloop/safe-query'

type AppError = { code: string; message: string }

// Create a safe instance with your error handling
const safe = createSafe<AppError>({
  parseError: (e) => ({
    code: 'UNKNOWN',
    message: e instanceof Error ? e.message : String(e),
  }),
  defaultError: { code: 'UNKNOWN', message: 'Unknown error' },
})

// Create the query client — pass your safe instance
const api = safeQuery<AppError>({
  safe,
  staleTime: 30_000,
  gcTime: 5 * 60_000,
})
```

## Typed Queries

Queries return a **callable function** — call it directly to fetch data. Path params are extracted from the key pattern automatically.

```typescript
type User = { id: string; name: string; email: string }

// No path params — call with no arguments
const getUsers = api.query({
  key: '/users',
  fn: (): Promise<User[]> => fetch('/api/users').then(r => r.json()),
})
const [users, err] = await getUsers()
//     ^? User[]       ^? AppError | null

// :id in the key — call with { params: { id: string } }
const getUser = api.query({
  key: '/users/:id',
  fn: ({ params }) => fetch(`/api/users/${params.id}`).then(r => r.json()) as Promise<User>,
})
const [user, err] = await getUser({ params: { id: '123' } })

// Multiple path params — all are required
const getComment = api.query({
  key: '/users/:userId/posts/:postId/comments/:commentId',
  fn: ({ params }) =>
    fetch(`/api/users/${params.userId}/posts/${params.postId}/comments/${params.commentId}`)
      .then(r => r.json()),
})
await getComment({
  params: { userId: 'u1', postId: 'p1', commentId: 'c1' },
})
```

## Search Params

Pass `searchParams` when calling any query or mutation. Different search params produce different cache entries.

```typescript
// Query with search params
const [users, err] = await getUsers({
  searchParams: { search: 'alice', page: 1, limit: 20 },
})

// Combined with path params
const getPosts = api.query({
  key: '/users/:id/posts',
  fn: ({ params, searchParams }) =>
    fetch(`/api/users/${params.id}/posts?${new URLSearchParams(searchParams as any)}`)
      .then(r => r.json()),
})
const [posts, err] = await getPosts({
  params: { id: 'u1' },
  searchParams: { page: 2, sort: 'date' },
})

// Search params are available in the fn context
const getFiltered = api.query({
  key: '/items',
  fn: ({ searchParams }) => {
    const url = new URL('/api/items', 'https://api.example.com')
    if (searchParams) {
      for (const [k, v] of Object.entries(searchParams)) {
        url.searchParams.set(k, String(v))
      }
    }
    return fetch(url).then(r => r.json())
  },
})

// Mutations accept searchParams too
const [result, err] = await createUser({
  body: { name: 'Alice', email: 'alice@test.com' },
  searchParams: { dryRun: true },
})

// Subscribe/invalidate/refetch with search params
getUsers.subscribe((state) => { ... }, { searchParams: { page: 1 } })
getUsers.invalidate({ searchParams: { page: 1 } })
await getUsers.refetch({ searchParams: { page: 1 } })
```

## Typed Mutations

Mutations also return a callable. Specify `<ResponseType, BodyType>` as generics, or let the types be inferred from your `fn`.

```typescript
type CreateUserInput = { name: string; email: string }
type UpdateUserInput = { name?: string; email?: string }

// POST — call with { body: CreateUserInput }
const createUser = api.mutate<User, CreateUserInput>({
  key: '/users',
  fn: ({ body }) => fetch('/api/users', {
    method: 'POST',
    body: JSON.stringify(body),
  }).then(r => r.json()),
  method: 'POST',
})
const [user, err] = await createUser({
  body: { name: 'Alice', email: 'alice@test.com' },
})

// PUT with path params — call with { params, body }
const updateUser = api.mutate<User, UpdateUserInput, '/users/:id'>({
  key: '/users/:id',
  fn: ({ params, body }) => fetch(`/api/users/${params.id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  }).then(r => r.json()),
  method: 'PUT',
})
const [updated, err] = await updateUser({
  params: { id: '123' },
  body: { name: 'New Name' },
})

// DELETE with path params
const deleteUser = api.mutate<void, void, '/users/:id'>({
  key: '/users/:id',
  fn: ({ params }) => fetch(`/api/users/${params.id}`, { method: 'DELETE' }).then(() => undefined as void),
  method: 'DELETE',
})
await deleteUser({ params: { id: '123' } })
```

## Reactive Properties and Methods

Query callables have reactive getters and methods attached directly to the function:

```typescript
// Subscribe to state changes
const unsub = getUsers.subscribe((state) => {
  state.data          // User[] | undefined
  state.error         // AppError | null
  state.status        // 'idle' | 'loading' | 'success' | 'error'
  state.isFetching    // boolean
  state.isStale       // boolean
  state.dataUpdatedAt // number | null
})

// Reactive getters on the callable itself
getUsers.status      // 'idle' | 'loading' | 'success' | 'error'
getUsers.data        // User[] | undefined
getUsers.error       // AppError | null
getUsers.isFetching  // boolean
getUsers.isStale     // boolean

// Cache control
getUsers.invalidate()
getUsers.refetch()

// With path params — pass params to subscribe/invalidate/refetch
getUser.subscribe((state) => { ... }, { params: { id: '123' } })
getUser.invalidate({ params: { id: '123' } })
```

## Conditional Queries

Pass `enabled: false` to skip a fetch and return cached data (or `[null, null]` if nothing is cached). Useful when a dependency like a param isn't ready yet.

```typescript
const userId = getUserId() // might be null

const [user, err] = await getUser({
  params: { id: userId! },
  enabled: !!userId, // no network request when userId is falsy
})
```

## Lifecycle Callbacks

Add `onSuccess`, `onError`, and `onSettled` callbacks to queries and mutations. These run **after** internal cache/entity logic and never interfere with the underlying `safe` instance hooks.

Callbacks can be set at **config level** (shared across all calls) and at **invoke level** (per-call). Config callbacks run first, then invoke callbacks.

```typescript
// Config-level — runs on every call
const getUsers = api.query({
  key: '/users',
  fn: () => fetch('/api/users').then(r => r.json()),
  onSuccess: (data) => console.log('Fetched users:', data.length),
  onError: (error) => console.error('Failed to fetch users:', error),
  onSettled: (data, error) => console.log('Done', { data, error }),
})

// Invoke-level — runs for this specific call only
const [users, err] = await getUsers({
  onSuccess: (data) => analytics.track('users_loaded', { count: data.length }),
})

// Same pattern for mutations
const createUser = api.mutate<User, CreateUserInput>({
  key: '/users',
  fn: ({ body }) => fetch('/api/users', {
    method: 'POST',
    body: JSON.stringify(body),
  }).then(r => r.json()),
  method: 'POST',
  onSuccess: (user) => getUsers.invalidate(), // always invalidate the list
})

const [user, err] = await createUser({
  body: { name: 'Alice', email: 'alice@test.com' },
  onSuccess: (user) => navigate(`/users/${user.id}`), // per-call redirect
})
```

## Cache Invalidation

Invalidate queries by exact key, by prefix, or all at once. Subscribers are notified immediately.

```typescript
// Exact key (on query callable)
getUsers.invalidate()
getUser.invalidate({ params: { id: '123' } })

// By prefix — invalidates all queries whose cache key starts with the prefix
api.invalidateByPrefix('/users')   // invalidates /users, /users?id=123, etc.

// All queries
api.invalidateAll()
```

## Client Lifecycle

```typescript
// Soft reset — clears cache and entity store, client remains usable
api.clear()

// Hard teardown — clears everything, removes all listeners, prevents further use
api.destroy()

// After destroy(), calling query()/mutate()/etc. throws:
// "SafeQueryClient has been destroyed and can no longer be used."
```

## Entity Normalization

Entities with a `__type` field are normalized into a shared store. When a mutation updates an entity, all queries containing it are notified automatically.

```typescript
// If your API returns __type natively
const getUsers = api.query({
  key: '/users',
  fn: (): Promise<User[]> => fetch('/api/users').then(r => r.json()),
  entities: { user: (u) => u.id },
})

// If not, use parseResponse to tag them
const getPosts = api.query({
  key: '/posts',
  fn: () => fetch('/api/posts').then(r => r.json()),
  parseResponse: (data: Post[]) =>
    data.map((post) => ({
      ...post,
      __type: 'post' as const,
      author: { ...post.author, __type: 'user' as const },
    })),
  entities: {
    post: (p) => p.id,
    user: (u) => u.userId,
  },
})
```

## Optimistic Updates

Enable at the client level. Supported for `PUT`, `PATCH`, and `DELETE` mutations with `entities` configured. Rolls back on error.

```typescript
const api = safeQuery<AppError>({
  safe,
  enableOptimisticUpdates: true,
})

const updateUser = api.mutate<User, UpdateUserInput, '/users/:id'>({
  key: '/users/:id',
  fn: ({ params, body }) => fetch(`/api/users/${params.id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  }).then(r => r.json()),
  method: 'PUT',
  entities: { user: (u) => u.id },
})

// Subscribers see optimistic state immediately, then server-confirmed state.
// On error, original state is restored.
await updateUser({ params: { id: '123' }, body: { name: 'New Name' } })
```

For mutations with multiple entity types, specify which to update optimistically:

```typescript
const updatePost = api.mutate({
  key: '/posts/:postId',
  fn: ({ params, body }) => fetch(`/api/posts/${params.postId}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  }).then(r => r.json()),
  method: 'PUT',
  entities: { post: (p) => p.id, user: (u) => u.id },
  optimistic: {
    entityType: 'post',
    entityId: (params) => params.postId,
  },
})
```

## Utilities

`fetchJson` and `buildUrl` are available as opt-in utilities if you want them:

```typescript
import { fetchJson, buildUrl } from '@cometloop/safe-query'

// fetchJson: fetch wrapper that handles JSON parsing and error responses
const data = await fetchJson<User>('https://api.example.com/users/1')

// buildUrl: constructs URLs with path params and search params
const url = buildUrl('https://api.example.com', '/users/:id', { id: '1' }, { page: 2 })
// → 'https://api.example.com/users/1?page=2'
```

## Configuration

| Option | Default | Description |
|--------|---------|-------------|
| `staleTime` | `0` | Ms before cached data is considered stale |
| `gcTime` | `300000` | Ms before unused cache entries are garbage collected |
| `enableOptimisticUpdates` | `false` | Enable optimistic mutations |

`staleTime`, `gcTime`, and `retry` can be overridden per-query/mutation.

### Client Methods

| Method | Description |
|--------|-------------|
| `query(config)` | Create a query callable |
| `mutate(config)` | Create a mutation callable |
| `invalidateByPrefix(prefix)` | Invalidate all queries whose key starts with `prefix` |
| `invalidateAll()` | Invalidate every cached query |
| `clear()` | Soft reset — clears cache and entity store |
| `destroy()` | Hard teardown — clears all state and prevents further use |

## License

MIT
