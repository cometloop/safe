---
title: Optimistic updates
---

Optimistic updates let your UI respond instantly to user actions by applying mutations to the local cache before the server confirms them. If the server request succeeds, the optimistic value is replaced by the real response. If it fails, the cache rolls back to the previous state automatically.

---

## Enabling optimistic updates

Optimistic updates are disabled by default. Enable them globally on the client:

```ts
const api = safeQuery<AppError>({
  safe,
  enableOptimisticUpdates: true,
})
```

{% callout type="note" %}
Optimistic updates only work for `PUT`, `PATCH`, and `DELETE` mutations. `POST` mutations are excluded because the entity does not exist in the cache yet -- there is nothing to optimistically update.
{% /callout %}

---

## Requirements

For a mutation to participate in optimistic updates, it must meet two conditions:

1. **`enableOptimisticUpdates: true`** is set on the client config.
2. **`entities`** is configured on the mutation so safe-query knows which entity type is being modified.

If both conditions are met, safe-query will attempt to resolve the target entity either through auto-inference or an explicit `optimistic` config.

---

## Auto-inference

When a mutation has exactly one entity type in its `entities` config, safe-query can automatically determine the entity type and ID without any additional configuration.

The entity type is taken from the single key in `entities`. The entity ID is extracted from the last `:param` segment in the mutation's path.

```ts
type Todo = {
  __type: 'Todo'
  id: string
  title: string
  completed: boolean
}

const updateTodo = api.mutate<Todo, Partial<Todo>>({
  key: '/todos/:id',
  method: 'PATCH',
  fn: (ctx) => fetchJson<Todo>(buildUrl(BASE_URL, '/todos/:id', ctx.params), {
    method: 'PATCH',
    body: ctx.body,
  }),
  entities: {
    Todo: (todo) => todo.id,
  },
})
```

In this example:
- `entityType` is auto-inferred as `'Todo'` (the only key in `entities`).
- `entityId` is auto-inferred from the last `:param` in the path, which is `:id`. When you call `updateTodo({ params: { id: '42' }, body: { completed: true } })`, the entity ID resolves to `'42'`.

---

## Explicit OptimisticConfig

When a mutation has multiple entity types or you need custom ID resolution, provide an explicit `optimistic` config:

```ts
type Comment = {
  __type: 'Comment'
  id: string
  body: string
  author: { __type: 'User'; id: string; name: string }
}

const updateComment = api.mutate<Comment, { body: string }>({
  key: '/posts/:postId/comments/:commentId',
  method: 'PATCH',
  fn: (ctx) => fetchJson<Comment>(
    buildUrl(BASE_URL, '/posts/:postId/comments/:commentId', ctx.params),
    { method: 'PATCH', body: ctx.body },
  ),
  entities: {
    Comment: (c) => c.id,
    User: (u) => u.id,
  },
  optimistic: {
    entityType: 'Comment',
    entityId: (params) => params.commentId,
  },
})
```

The `optimistic` config has two fields:

| Field | Type | Description |
| --- | --- | --- |
| `entityType` | `string` | The entity type name to target for optimistic updates. Must match a key in `entities`. |
| `entityId` | `(params) => string` | A function that extracts the entity ID from the mutation's path params. |

---

## PUT/PATCH flow

When you invoke a `PUT` or `PATCH` mutation with a body, the following sequence occurs:

1. **Save base value.** `beginOptimistic()` saves the current entity value as a restore point and increments the in-flight counter.
2. **Merge.** The mutation body is shallow-merged with the existing entity: `{ ...existing, ...body }`. This merged value is written to the entity store immediately.
3. **Notify subscribers.** All queries that reference the affected entity receive a state update with the merged data.
4. **Server request fires.** The actual network call runs in the background.
5. **On success:** `endOptimistic(true)` discards the base value. The server response is normalized into the entity store, replacing the optimistic merge.
6. **On error:** `endOptimistic(false)` restores the base value if all in-flight mutations for this entity have settled. Affected queries are invalidated and re-notified.

```ts
// User sees the title change instantly
await updateTodo({
  params: { id: '42' },
  body: { title: 'Updated title' },
})
```

---

## DELETE flow

For `DELETE` mutations, the flow is slightly different because the entity is removed rather than merged:

1. **Save base value.** `beginOptimistic()` saves the current entity as a restore point.
2. **Delete entity.** The entity is removed from the entity store immediately.
3. **Notify subscribers.** All queries referencing the deleted entity receive a state update. Lists will no longer include the deleted item.
4. **Server request fires.**
5. **On success:** The base value is discarded. The entity remains deleted.
6. **On error:** The base value is restored. Affected queries are invalidated and subscribers are notified, bringing the entity back into view.

```ts
const deleteTodo = api.mutate<void>({
  key: '/todos/:id',
  method: 'DELETE',
  fn: (ctx) => fetchJson<void>(buildUrl(BASE_URL, '/todos/:id', ctx.params), {
    method: 'DELETE',
  }),
  entities: {
    Todo: (todo) => todo.id,
  },
})

// Item disappears from the list immediately
await deleteTodo({ params: { id: '42' } })
```

---

## Nested (concurrent) mutations

When multiple mutations target the same entity concurrently, safe-query uses an in-flight counter to coordinate rollback behavior.

Each call to `beginOptimistic()` increments the counter. Each `endOptimistic()` decrements it. The base value is only saved on the first `beginOptimistic()` call -- subsequent concurrent mutations stack on top of each other.

The base value is restored only when **all** in-flight mutations for an entity have settled **and** at least one of them failed. If all succeed, the base value is discarded.

```ts
// User rapidly toggles a todo and edits its title at the same time
const toggle = updateTodo({
  params: { id: '42' },
  body: { completed: true },
})

const rename = updateTodo({
  params: { id: '42' },
  body: { title: 'New title' },
})

// Both mutations are in flight. The UI shows both changes merged.
// If both succeed: server data is normalized, base discarded.
// If either fails: base value is restored after both settle.
await Promise.all([toggle, rename])
```

This approach prevents partial rollbacks. If one mutation succeeds and another fails, you do not end up in an inconsistent state where some optimistic changes are kept and others are reverted. The entity is either fully committed (all succeeded) or fully rolled back (any failed).

{% callout type="warning" %}
When a rollback occurs, safe-query also invalidates all affected queries. This triggers a refetch from the server to ensure the UI reflects the true server state.
{% /callout %}

---

## Real-world examples

### Inline edit

A common pattern is an inline text editor where the user edits a field and saves it. The UI should reflect the change immediately while the server processes it.

```ts
type Article = {
  __type: 'Article'
  id: string
  title: string
  body: string
  updatedAt: string
}

const getArticle = api.query({
  key: '/articles/:id',
  fn: (ctx) => fetchJson<Article>(buildUrl(BASE_URL, '/articles/:id', ctx.params)),
  entities: {
    Article: (a) => a.id,
  },
})

const updateArticle = api.mutate<Article, Partial<Article>>({
  key: '/articles/:id',
  method: 'PATCH',
  fn: (ctx) => fetchJson<Article>(buildUrl(BASE_URL, '/articles/:id', ctx.params), {
    method: 'PATCH',
    body: ctx.body,
  }),
  entities: {
    Article: (a) => a.id,
  },
})

// Subscribe to the article -- UI renders immediately on optimistic update
const unsub = getArticle.subscribe(
  (state) => {
    if (state.data) {
      renderArticle(state.data)
    }
  },
  { params: { id: '1' } },
)

// User saves an edit -- UI updates instantly
await updateArticle({
  params: { id: '1' },
  body: { title: 'Updated Title' },
})
```

When `updateArticle` is called, the article in the entity store is immediately updated with `{ ...existingArticle, title: 'Updated Title' }`. The `getArticle` subscriber fires with the merged data, so the UI shows the new title before the server responds.

### Delete button

A list with delete buttons where items disappear immediately on click.

```ts
type Task = {
  __type: 'Task'
  id: string
  title: string
  assignee: string
}

const getTasks = api.query({
  key: '/tasks',
  fn: () => fetchJson<Task[]>(buildUrl(BASE_URL, '/tasks')),
  entities: {
    Task: (t) => t.id,
  },
})

const deleteTask = api.mutate<void>({
  key: '/tasks/:id',
  method: 'DELETE',
  fn: (ctx) => fetchJson<void>(buildUrl(BASE_URL, '/tasks/:id', ctx.params), {
    method: 'DELETE',
  }),
  entities: {
    Task: (t) => t.id,
  },
})

// Subscribe to the task list
getTasks.subscribe((state) => {
  if (state.data) {
    renderTaskList(state.data)
  }
})

// Fetch the initial list
await getTasks()

// User clicks delete -- task disappears from the list instantly
async function handleDelete(taskId: string) {
  const [, error] = await deleteTask({ params: { id: taskId } })
  if (error) {
    showToast('Failed to delete task. It has been restored.')
  }
}
```

Because `getTasks` has `entities` configured for `Task`, the entity store knows which queries reference each task. When `deleteTask` removes a task from the store, the `getTasks` subscriber fires with a list that no longer includes the deleted task.

### Todo toggle

A todo list where checkboxes toggle completion status. This demonstrates rapid sequential mutations on different entities.

```ts
type Todo = {
  __type: 'Todo'
  id: string
  title: string
  completed: boolean
}

const getTodos = api.query({
  key: '/todos',
  fn: () => fetchJson<Todo[]>(buildUrl(BASE_URL, '/todos')),
  entities: {
    Todo: (t) => t.id,
  },
})

const toggleTodo = api.mutate<Todo, { completed: boolean }>({
  key: '/todos/:id',
  method: 'PATCH',
  fn: (ctx) => fetchJson<Todo>(buildUrl(BASE_URL, '/todos/:id', ctx.params), {
    method: 'PATCH',
    body: ctx.body,
  }),
  entities: {
    Todo: (t) => t.id,
  },
})

// Subscribe to the list
getTodos.subscribe((state) => {
  if (state.data) {
    renderTodoList(state.data)
  }
})

await getTodos()

// User rapidly toggles multiple todos
async function handleToggle(todo: Todo) {
  const [, error] = await toggleTodo({
    params: { id: todo.id },
    body: { completed: !todo.completed },
  })
  if (error) {
    showToast(`Failed to update "${todo.title}". Change has been reverted.`)
  }
}
```

Each toggle immediately updates the entity store and notifies the list subscriber. Even if the user clicks multiple checkboxes in rapid succession, each entity is tracked independently. A failure on one todo only rolls back that specific todo -- the others are unaffected (assuming they target different entity IDs).

---

## What's next?

- [Entity normalization](/docs/entity-normalization) -- understand how entities are stored and shared across queries
- [Mutations](/docs/mutations) -- learn about the full mutation API
- [Cache invalidation](/docs/cache-invalidation) -- manual strategies for keeping data fresh
