---
title: Mutations
---

Mutations handle data modifications -- creating, updating, and deleting resources. The `mutate()` method on your client creates a `MutationCallable` that wraps your mutation function with error handling, entity cache updates, and optional optimistic updates.

---

## Defining a mutation

Pass a configuration object to `api.mutate()`. The two type parameters are the response type and the body type:

```ts
import { fetchJson, buildUrl } from '@cometloop/safe-query'

const BASE_URL = 'https://api.example.com'

const createUser = api.mutate<User, { name: string; email: string }>({
  key: '/users',
  method: 'POST',
  fn: (ctx) =>
    fetchJson<User>(buildUrl(BASE_URL, '/users'), {
      method: 'POST',
      body: ctx.body,
    }),
})
```

---

## Mutation configuration

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `key` | `string` | **(required)** | Path string like `'/users'` or `'/users/:id'`. Used for cache key construction. |
| `fn` | `(context: MutationFnContext) => Promise<TData>` | **(required)** | The function that performs the mutation. Receives a context object with `params`, `body`, `searchParams`, and `signal`. |
| `method` | `'POST' \| 'PUT' \| 'PATCH' \| 'DELETE'` | — | The HTTP method for this mutation. Affects how optimistic updates behave. |
| `parseResponse` | `(data: TData) => TParsed` | — | Transform the raw response before processing. |
| `mapToEntities` | `(data: TParsed) => TMapped` | — | Add `__type` fields for entity normalization. Required when `TMapped` differs from `TParsed`. |
| `entities` | `{ [typeName]: (entity) => string }` | — | Entity extractors for normalization. Maps type names to functions that return entity IDs. |
| `optimistic` | `{ entityType: string, entityId: (params) => string }` | — | Configure optimistic updates. See [Optimistic updates](/docs/optimistic-updates). |
| `retry` | `RetryConfig` | — | Retry configuration from `@cometloop/safe`. Controls automatic retries on failure. |
| `onSuccess` | `(data: TMapped) => void` | — | Called when the mutation succeeds. |
| `onError` | `(error: E) => void` | — | Called when the mutation fails. |
| `onSettled` | `(data: TMapped \| undefined, error: E \| null) => void` | — | Called when the mutation completes, regardless of success or failure. |

---

## MutationFnContext

The `fn` function receives a context object:

```ts
type MutationFnContext<TBody> = {
  params?: Record<string, string>   // Path parameters
  body?: TBody                      // The request body
  searchParams?: Record<string, string>  // Search/query parameters
  signal?: AbortSignal              // For cancelling the request
}
```

---

## Calling a mutation

A `MutationCallable` is a function that returns a `Promise<SafeResult<TMapped, E>>`:

```ts
const [newUser, error] = await createUser({
  body: { name: 'Alice', email: 'alice@example.com' },
})

if (error) {
  console.error('Failed to create user:', error.message)
} else {
  console.log('Created user:', newUser.id)
}
```

### Call options

| Option | Type | Description |
| --- | --- | --- |
| `params` | `Record<string, string>` | Path parameters to substitute into the key. |
| `body` | `TBody` | The request body passed to the mutation function. |
| `searchParams` | `Record<string, string>` | Search parameters passed to the mutation function. |
| `signal` | `AbortSignal` | Abort signal for cancelling the request. |
| `onSuccess` | `(data: TMapped) => void` | Per-call success callback. |
| `onError` | `(error: E) => void` | Per-call error callback. |
| `onSettled` | `(data: TMapped \| undefined, error: E \| null) => void` | Per-call settled callback. |

---

## Mutations by method

### POST -- Creating resources

Use `POST` for creating new resources. The body contains the data for the new resource:

```ts
const createUser = api.mutate<User, { name: string; email: string }>({
  key: '/users',
  method: 'POST',
  fn: (ctx) =>
    fetchJson<User>(buildUrl(BASE_URL, '/users'), {
      method: 'POST',
      body: ctx.body,
    }),
})

const [user, error] = await createUser({
  body: { name: 'Alice', email: 'alice@example.com' },
})
```

### PUT -- Replacing resources

Use `PUT` for full resource replacement. Typically used with path parameters:

```ts
const replaceUser = api.mutate<User, User>({
  key: '/users/:id',
  method: 'PUT',
  fn: (ctx) =>
    fetchJson<User>(buildUrl(BASE_URL, '/users/:id', ctx.params), {
      method: 'PUT',
      body: ctx.body,
    }),
})

const [user, error] = await replaceUser({
  params: { id: '123' },
  body: { id: '123', name: 'Alice Updated', email: 'alice@new.com', role: 'admin' },
})
```

### PATCH -- Partial updates

Use `PATCH` for partial resource updates. Only the fields you include in the body are changed:

```ts
const updateUser = api.mutate<User, Partial<User>>({
  key: '/users/:id',
  method: 'PATCH',
  fn: (ctx) =>
    fetchJson<User>(buildUrl(BASE_URL, '/users/:id', ctx.params), {
      method: 'PATCH',
      body: ctx.body,
    }),
})

const [user, error] = await updateUser({
  params: { id: '123' },
  body: { name: 'Alice Updated' },
})
```

### DELETE -- Removing resources

Use `DELETE` for removing resources. Usually no body is needed:

```ts
const deleteUser = api.mutate<void, never>({
  key: '/users/:id',
  method: 'DELETE',
  fn: (ctx) =>
    fetchJson<void>(buildUrl(BASE_URL, '/users/:id', ctx.params), {
      method: 'DELETE',
    }),
})

const [, error] = await deleteUser({
  params: { id: '123' },
})
```

---

## Mutations and the entity cache

When a mutation response includes entities (via `mapToEntities` and `entities`), the entity cache is automatically updated. Any queries that reference the updated entities are notified and their subscribers receive the new data.

```ts
const updateUser = api.mutate<User, Partial<User>>({
  key: '/users/:id',
  method: 'PATCH',
  fn: (ctx) =>
    fetchJson<User>(buildUrl(BASE_URL, '/users/:id', ctx.params), {
      method: 'PATCH',
      body: ctx.body,
    }),
  mapToEntities: (user) => ({ ...user, __type: 'User' }),
  entities: {
    User: (user) => user.id,
  },
})

// After this mutation succeeds, any query that includes User:123
// will automatically receive the updated data
const [user, error] = await updateUser({
  params: { id: '123' },
  body: { name: 'Alice Updated' },
})
```

This means you often do not need to manually invalidate queries after a mutation. If your queries and mutations share the same entity configuration, the cache stays consistent automatically. See [Entity normalization](/docs/entity-normalization) for more details.

---

## Invalidating queries after mutations

When entity normalization is not sufficient (for example, when a `POST` creates a new resource that needs to appear in a list), use `onSuccess` to invalidate relevant queries:

```ts
const createUser = api.mutate<User, { name: string; email: string }>({
  key: '/users',
  method: 'POST',
  fn: (ctx) =>
    fetchJson<User>(buildUrl(BASE_URL, '/users'), {
      method: 'POST',
      body: ctx.body,
    }),
  onSuccess: () => {
    // The list query needs to refetch to include the new user
    api.invalidateByPrefix('/users')
  },
})
```

You can also invalidate from the call site:

```ts
const [user, error] = await createUser({
  body: { name: 'Alice', email: 'alice@example.com' },
  onSuccess: () => {
    api.invalidateByPrefix('/users')
  },
})
```

---

## Per-call lifecycle callbacks

Override or add callbacks on individual mutation calls. Per-call callbacks run in addition to mutation-level callbacks:

```ts
const updateUser = api.mutate<User, Partial<User>>({
  key: '/users/:id',
  method: 'PATCH',
  fn: (ctx) =>
    fetchJson<User>(buildUrl(BASE_URL, '/users/:id', ctx.params), {
      method: 'PATCH',
      body: ctx.body,
    }),
  onSuccess: (data) => {
    // Always runs on success
    console.log('User updated:', data.id)
  },
})

// This call has an additional success callback
const [user, error] = await updateUser({
  params: { id: '123' },
  body: { name: 'Alice Updated' },
  onSuccess: (data) => {
    // Also runs on success, in addition to the mutation-level callback
    showToast(`Updated ${data.name}`)
  },
})
```

---

## Response transformation

Use `parseResponse` to transform the raw API response:

```ts
type ApiResponse = {
  data: User
  meta: { updatedAt: string }
}

const updateUser = api.mutate<ApiResponse, Partial<User>>({
  key: '/users/:id',
  method: 'PATCH',
  fn: (ctx) =>
    fetchJson<ApiResponse>(buildUrl(BASE_URL, '/users/:id', ctx.params), {
      method: 'PATCH',
      body: ctx.body,
    }),
  parseResponse: (response) => response.data,
})

// Returns User, not ApiResponse
const [user, error] = await updateUser({
  params: { id: '123' },
  body: { name: 'Alice Updated' },
})
```

---

## Optimistic updates

Optimistic updates allow you to update the UI immediately when a mutation is fired, before the server responds. If the mutation fails, the changes are automatically rolled back.

Optimistic updates require:
- `enableOptimisticUpdates: true` on the client
- A `method` of `PUT`, `PATCH`, or `DELETE` on the mutation
- An `optimistic` config with `entityType` and `entityId`
- Entity normalization set up on your queries

```ts
const api = safeQuery<AppError>({
  safe,
  enableOptimisticUpdates: true,
})

const updateUser = api.mutate<User, Partial<User>>({
  key: '/users/:id',
  method: 'PATCH',
  fn: (ctx) =>
    fetchJson<User>(buildUrl(BASE_URL, '/users/:id', ctx.params), {
      method: 'PATCH',
      body: ctx.body,
    }),
  mapToEntities: (user) => ({ ...user, __type: 'User' }),
  entities: {
    User: (user) => user.id,
  },
  optimistic: {
    entityType: 'User',
    entityId: (params) => params.id,
  },
})
```

For a single entity type, the `optimistic` config is automatically inferred from the `entities` config, so you can simplify:

```ts
const updateUser = api.mutate<User, Partial<User>>({
  key: '/users/:id',
  method: 'PATCH',
  fn: (ctx) =>
    fetchJson<User>(buildUrl(BASE_URL, '/users/:id', ctx.params), {
      method: 'PATCH',
      body: ctx.body,
    }),
  mapToEntities: (user) => ({ ...user, __type: 'User' }),
  entities: {
    User: (user) => user.id,
  },
  // optimistic config auto-inferred for single entity type
})
```

For full details on how optimistic updates work, including rollback behavior and nested mutations, see [Optimistic updates](/docs/optimistic-updates).

---

## Cancelling a mutation

Pass an `AbortSignal` to cancel a mutation in progress:

```ts
const controller = new AbortController()

const promise = updateUser({
  params: { id: '123' },
  body: { name: 'Alice Updated' },
  signal: controller.signal,
})

// Cancel the mutation
controller.abort()

const [user, error] = await promise
```

---

## Complete example

```ts
import { safeQuery, fetchJson, buildUrl } from '@cometloop/safe-query'

const api = safeQuery<AppError>({
  safe,
  enableOptimisticUpdates: true,
})

const BASE_URL = 'https://api.example.com'

// Create
const createTodo = api.mutate<Todo, { title: string }>({
  key: '/todos',
  method: 'POST',
  fn: (ctx) =>
    fetchJson<Todo>(buildUrl(BASE_URL, '/todos'), {
      method: 'POST',
      body: ctx.body,
    }),
  onSuccess: () => {
    api.invalidateByPrefix('/todos')
  },
})

// Update with optimistic UI
const updateTodo = api.mutate<Todo, Partial<Todo>>({
  key: '/todos/:id',
  method: 'PATCH',
  fn: (ctx) =>
    fetchJson<Todo>(buildUrl(BASE_URL, '/todos/:id', ctx.params), {
      method: 'PATCH',
      body: ctx.body,
    }),
  mapToEntities: (todo) => ({ ...todo, __type: 'Todo' }),
  entities: {
    Todo: (todo) => todo.id,
  },
})

// Delete with optimistic UI
const deleteTodo = api.mutate<void, never>({
  key: '/todos/:id',
  method: 'DELETE',
  fn: (ctx) =>
    fetchJson<void>(buildUrl(BASE_URL, '/todos/:id', ctx.params), {
      method: 'DELETE',
    }),
  mapToEntities: () => ({ __type: 'Todo' }),
  entities: {
    Todo: () => '',
  },
  onSuccess: () => {
    api.invalidateByPrefix('/todos')
  },
})

// Usage
const [todo, err1] = await createTodo({
  body: { title: 'Write documentation' },
})

const [updated, err2] = await updateTodo({
  params: { id: todo!.id },
  body: { title: 'Write great documentation' },
})

const [, err3] = await deleteTodo({
  params: { id: todo!.id },
})
```

---

## What's next?

- [Optimistic updates](/docs/optimistic-updates) — deep dive into optimistic mutation behavior
- [Entity normalization](/docs/entity-normalization) — automatic cross-query cache consistency
- [Cache keys](/docs/cache-keys) — understand how mutation keys are constructed
- [Lifecycle callbacks](/docs/lifecycle-callbacks) — onSuccess, onError, onSettled patterns
