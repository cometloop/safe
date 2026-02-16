# @cometloop/safe-query

Type-safe data fetching and caching built on [@cometloop/safe](https://github.com/cometloop/safe). Framework-agnostic with normalized entity caching and optimistic updates.

## Install

```bash
npm install @cometloop/safe-query @cometloop/safe
```

## Quick Start

```typescript
import { createSafeQueryClient } from '@cometloop/safe-query'

type AppError = { code: string; message: string }

// Error type E is inferred from parseError and flows to every query/mutation
const api = createSafeQueryClient<AppError>({
  name: 'backend',
  baseUrl: 'https://api.example.com',
  headers: () => ({ Authorization: `Bearer ${getToken()}` }),
  parseError: (e) => ({
    code: 'UNKNOWN',
    message: e instanceof Error ? e.message : String(e),
  }),
  defaultError: { code: 'UNKNOWN', message: 'Unknown error' },
  staleTime: 30_000,
  gcTime: 5 * 60_000,
})
```

## Typed Queries

The response type is the first generic parameter. Path params are extracted from the URL pattern automatically.

```typescript
type User = { id: string; name: string; email: string }

// No path params → execute() takes no arguments
const usersQuery = api.query<User[]>('/users')
const [users, err] = await usersQuery.execute()
//     ^? User[]       ^? AppError | null

// :id in the path → execute() requires { id: string }
const userQuery = api.query<User>('/users/:id')
const [user, err] = await userQuery.execute({ id: '123' })
//                                           ^? { id: string }

// Multiple path params → all are required
const commentQuery = api.query('/users/:userId/posts/:postId/comments/:commentId')
await commentQuery.execute({
  userId: 'u1',     // ← required
  postId: 'p1',     // ← required
  commentId: 'c1',  // ← required
})

// Subscribe signature adapts too
usersQuery.subscribe((state) => { ... })                      // no params
userQuery.subscribe({ id: '123' }, (state) => { ... })        // params required
```

## Typed Mutations

Mutations take two generic parameters: `<ResponseType, BodyType>`.

```typescript
type CreateUserInput = { name: string; email: string }
type UpdateUserInput = { name?: string; email?: string }

// POST — execute(body: CreateUserInput)
const createUser = api.mutate<User, CreateUserInput>('/users', {
  method: 'POST',
})
const [user, err] = await createUser.execute({
  name: 'Alice',          // ✓ required by CreateUserInput
  email: 'alice@test.com' // ✓ required by CreateUserInput
})

// PUT with path params — execute(params: { id: string }, body: UpdateUserInput)
const updateUser = api.mutate<User, UpdateUserInput>('/users/:id', {
  method: 'PUT',
})
const [updated, err] = await updateUser.execute(
  { id: '123' },       // ← path params (typed from URL pattern)
  { name: 'New Name' } // ← body (typed as UpdateUserInput)
)

// DELETE with path params
const deleteUser = api.mutate('/users/:id', { method: 'DELETE' })
const [, err] = await deleteUser.execute({ id: '123' }, undefined)
//                                        ^? { id: string }

// DELETE with typed body (bulk delete)
type BulkDeleteInput = { ids: string[] }
const bulkDelete = api.mutate<void, BulkDeleteInput>('/users', {
  method: 'DELETE',
})
await bulkDelete.execute({ ids: ['1', '2', '3'] })
//                        ^? BulkDeleteInput
```

If you only need the response typed (body stays `unknown`), pass a single generic:

```typescript
const createUser = api.mutate<User>('/users', { method: 'POST' })
```

## Subscriber State

```typescript
const unsub = usersQuery.subscribe((state) => {
  state.data          // User[] | undefined
  state.error         // AppError | null
  state.status        // 'idle' | 'loading' | 'success' | 'error'
  state.isFetching    // boolean
  state.isStale       // boolean
  state.dataUpdatedAt // number | null
})

// Cache control
usersQuery.invalidate()
usersQuery.refetch()
userQuery.invalidate({ id: '123' })
```

## Entity Normalization

Entities with a `__type` field are normalized into a shared store. When a mutation updates an entity, all queries containing it are notified automatically.

```typescript
// If your API returns __type natively
const usersQuery = api.query<User[]>('/users', {
  entities: { user: (u) => u.id },
})

// If not, use parseResponse to tag them
const postsQuery = api.query('/posts', {
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
const api = createSafeQueryClient<AppError>({
  // ...
  enableOptimisticUpdates: true,
})

const updateUser = api.mutate<User, UpdateUserInput>('/users/:id', {
  method: 'PUT',
  entities: { user: (u) => u.id },
})

// Subscribers see optimistic state immediately, then server-confirmed state.
// On error, original state is restored.
await updateUser.execute({ id: '123' }, { name: 'New Name' })
```

For mutations with multiple entity types, specify which to update optimistically:

```typescript
const updatePost = api.mutate<Post, UpdatePostInput>('/posts/:postId', {
  method: 'PUT',
  entities: { post: (p) => p.id, user: (u) => u.id },
  optimistic: {
    entityType: 'post',
    entityId: (params) => params.postId,
  },
})
```

## Configuration

| Option | Default | Description |
|--------|---------|-------------|
| `staleTime` | `0` | Ms before cached data is considered stale |
| `gcTime` | `300000` | Ms before unused cache entries are garbage collected |
| `retry` | `undefined` | Retry config: `{ times: 3, waitBefore: (n) => n * 1000 }` |
| `enableOptimisticUpdates` | `false` | Enable optimistic mutations |

All options can be overridden per-query/mutation.

## License

MIT
