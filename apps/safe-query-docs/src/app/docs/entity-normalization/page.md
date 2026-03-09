---
title: Entity normalization
---

Entity normalization is the most powerful feature in safe-query. It solves a problem that plagues every client-side cache: **when the same entity appears in multiple queries, how do you keep them all in sync?**

Without normalization, updating a user's name in a detail view leaves the old name showing in every list, search result, and sidebar that references that user. With normalization, you update the entity **once** and every query that contains it is automatically updated.

---

## The problem

Imagine you have two queries:

```ts
// GET /users -> [{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }]
const getUsers = api.query({ key: '/users', fn: ... })

// GET /users/1 -> { id: 1, name: "Alice" }
const getUser = api.query({ key: '/users/:id', fn: ... })
```

Both queries return the same user (Alice, id: 1). If you mutate Alice's name to "Alicia" and only the detail query refetches, the list query still shows "Alice". You have **inconsistent data** across your UI.

The typical solution is to manually invalidate every query that might contain the affected entity. This is tedious, error-prone, and doesn't scale.

Entity normalization solves this automatically.

---

## How it works

The normalization system has three parts:

1. **Entity identification** — Entities are plain objects with a `__type` field. An **extractor** function returns a unique ID for each entity.
2. **Normalize** — When query data arrives, the normalizer walks the data recursively, finds every entity (object with `__type`), stores it in a central **EntityStore**, and replaces it in the query data with a lightweight reference (`{ __ref: "type:id" }`).
3. **Denormalize** — When a subscriber reads query data, references are resolved back into full entity objects from the EntityStore. If an entity has been updated anywhere, every query that contains it sees the new value.

```ts
// Original data from API
{
  id: 1,
  name: "Alice",
  __type: "User"
}

// After normalize() — stored in cache
{
  __ref: "User:1"
}

// Entity stored in EntityStore
EntityStore["User:1"] = { id: 1, name: "Alice", __type: "User" }

// After denormalize() — returned to subscribers
{
  id: 1,
  name: "Alice",
  __type: "User"
}
```

---

## Setting up entity normalization

### 1. Add `__type` to your data

Entities need a `__type` field so the normalizer can identify them. You can add this on the server or transform responses on the client:

```ts
type User = {
  id: number
  name: string
  email: string
  __type: 'User'
}

type Post = {
  id: number
  title: string
  body: string
  author: User
  __type: 'Post'
}
```

### 2. Configure `mapToEntities`

Tell safe-query how to extract IDs from your entities using the `mapToEntities` option:

```ts
const api = safeQuery<AppError>({
  safe,
  staleTime: 30_000,
  mapToEntities: {
    User: (user) => String(user.id),
    Post: (post) => String(post.id),
    Comment: (comment) => String(comment.id),
  },
})
```

Each key in `mapToEntities` corresponds to a `__type` value. The function receives the entity object and must return a **string ID**. This ID, combined with the type, creates the unique key used in the EntityStore (e.g., `"User:1"`, `"Post:42"`).

{% callout type="warning" %}
The extractor must return a **string**. If your IDs are numbers, convert them with `String(id)`. The ID must be stable and unique within its type.
{% /callout %}

---

## The normalize/denormalize flow

### Normalize

When a query's fetch function returns data, the normalizer walks the entire response:

```ts
// API returns this data for GET /posts/1
const apiResponse = {
  id: 1,
  title: "Hello World",
  __type: "Post",
  author: {
    id: 42,
    name: "Alice",
    __type: "User",
  },
  comments: [
    {
      id: 100,
      body: "Great post!",
      __type: "Comment",
      author: {
        id: 43,
        name: "Bob",
        __type: "User",
      },
    },
  ],
}
```

The normalizer processes this recursively:

1. Finds the `Comment` author (Bob) — stores `User:43` in EntityStore, replaces with `{ __ref: "User:43" }`.
2. Finds the `Comment` — stores `Comment:100` in EntityStore (with Bob replaced by a ref), replaces with `{ __ref: "Comment:100" }`.
3. Finds the `Post` author (Alice) — stores `User:42` in EntityStore, replaces with `{ __ref: "User:42" }`.
4. Finds the `Post` itself — stores `Post:1` in EntityStore, replaces with `{ __ref: "Post:1" }`.

The normalized data stored in the cache is just:

```ts
{ __ref: "Post:1" }
```

And the EntityStore now contains:

```ts
{
  "User:42":    { id: 42, name: "Alice", __type: "User" },
  "User:43":    { id: 43, name: "Bob", __type: "User" },
  "Comment:100": { id: 100, body: "Great post!", __type: "Comment", author: { __ref: "User:43" } },
  "Post:1":     { id: 1, title: "Hello World", __type: "Post", author: { __ref: "User:42" }, comments: [{ __ref: "Comment:100" }] },
}
```

### Denormalize

When a subscriber reads the data, `denormalize()` walks the normalized data and replaces every `{ __ref }` with the current entity from the EntityStore. This reconstructs the full object graph — but using the **latest** version of every entity.

---

## EntityRef

The `EntityRef` is the marker object that replaces entities in normalized data:

```ts
type EntityRef = {
  __ref: string // Format: "Type:id" — e.g., "User:42", "Post:1"
}
```

During denormalization, any object with a `__ref` property is looked up in the EntityStore and replaced with the full entity. This is an internal detail — you never create `EntityRef` objects yourself.

---

## The reverse index

The EntityStore maintains a **reverse index**: a mapping from each entity to the set of query cache keys that contain it.

```ts
// When GET /posts returns posts by Alice and Bob:
// reverse index tracks:
//   "User:42" -> ["/posts", "/posts?author=alice"]
//   "User:43" -> ["/posts", "/users/43"]
```

When an entity is updated (via a mutation or by any query refetching), the reverse index tells safe-query **exactly which queries need to be notified**. Those queries are denormalized again with the updated entity, and their subscribers receive the new data.

This is registered automatically via `registerQueryEntities()` — every time a query's data is normalized, the entities it contains are tracked in the reverse index.

---

## Cross-query consistency in action

Here is the core value proposition. Watch how a single mutation updates data across multiple queries:

```ts
// Define queries
const getUsers = api.query({
  key: '/users',
  fn: () => fetchJson<User[]>(buildUrl(BASE_URL, '/users')),
})

const getUser = api.query({
  key: '/users/:id',
  fn: (ctx) => fetchJson<User>(buildUrl(BASE_URL, '/users/:id', ctx.params)),
})

const getPostsByUser = api.query({
  key: '/users/:userId/posts',
  fn: (ctx) => fetchJson<Post[]>(buildUrl(BASE_URL, '/users/:userId/posts', ctx.params)),
})

// Subscribe to all three
getUsers.subscribe((state) => {
  // Shows list of users including Alice
  renderUserList(state.data)
})

getUser.subscribe(
  (state) => {
    // Shows Alice's detail view
    renderUserDetail(state.data)
  },
  { params: { id: '42' } },
)

getPostsByUser.subscribe(
  (state) => {
    // Shows posts — each post has an author field that is Alice
    renderPosts(state.data)
  },
  { params: { userId: '42' } },
)
```

Now, you mutate Alice's name:

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

await updateUser({
  params: { id: '42' },
  body: { name: 'Alicia' },
})
```

When the mutation response comes back with the updated user (`{ id: 42, name: "Alicia", __type: "User" }`):

1. The response is normalized — `User:42` in the EntityStore is updated to `{ name: "Alicia" }`.
2. The reverse index shows `User:42` appears in three queries: `/users`, `/users?id=42`, and `/users/42/posts`.
3. All three queries are denormalized again with the updated entity.
4. All three subscribers fire with the new data — **Alice is now "Alicia" everywhere**.

No manual invalidation. No refetching. Instant, consistent updates across your entire UI.

---

## Nested entities

The normalizer handles deeply nested entities automatically. Consider a blog post with an author and comments, where each comment also has an author:

```ts
type Comment = {
  id: number
  body: string
  author: User
  __type: 'Comment'
}

type Post = {
  id: number
  title: string
  author: User
  comments: Comment[]
  __type: 'Post'
}
```

When a post is fetched, the normalizer extracts **every** entity at every level:

```ts
// API response for GET /posts/1
{
  id: 1,
  title: "Understanding Normalization",
  __type: "Post",
  author: { id: 42, name: "Alice", __type: "User" },
  comments: [
    {
      id: 200,
      body: "Great explanation!",
      __type: "Comment",
      author: { id: 43, name: "Bob", __type: "User" },
    },
    {
      id: 201,
      body: "Thanks for writing this.",
      __type: "Comment",
      author: { id: 42, name: "Alice", __type: "User" },
    },
  ],
}
```

After normalization, the EntityStore contains `User:42`, `User:43`, `Comment:200`, `Comment:201`, and `Post:1`. Notice that Alice appears twice (as post author and as comment author) but is stored only once in the EntityStore as `User:42`. If Alice's name changes, both appearances update simultaneously.

---

## Arrays of entities

The normalizer handles arrays seamlessly. A list query returning an array of entities is normalized element by element:

```ts
// GET /users returns:
[
  { id: 1, name: "Alice", __type: "User" },
  { id: 2, name: "Bob", __type: "User" },
  { id: 3, name: "Carol", __type: "User" },
]

// Normalized cache entry becomes:
[
  { __ref: "User:1" },
  { __ref: "User:2" },
  { __ref: "User:3" },
]
```

---

## Circular references

The normalizer handles circular references safely. If entity A references entity B and entity B references entity A, the normalizer will not enter an infinite loop. Each entity is stored once, and references break the cycle:

```ts
// User has a "manager" field that is also a User
{
  id: 1,
  name: "Alice",
  __type: "User",
  manager: {
    id: 2,
    name: "Bob",
    __type: "User",
    directReports: [
      { id: 1, name: "Alice", __type: "User", manager: ... } // circular!
    ]
  }
}

// After normalization — no circularity, just refs
// User:1 -> { id: 1, name: "Alice", __type: "User", manager: { __ref: "User:2" } }
// User:2 -> { id: 2, name: "Bob", __type: "User", directReports: [{ __ref: "User:1" }] }
```

---

## Reading entities directly with getEntity

You can read any entity directly from the EntityStore without going through a query. This is primarily used with `initialData` and `placeholderData`:

```ts
const getUser = api.query({
  key: '/users/:id',
  fn: (ctx) => fetchJson<User>(buildUrl(BASE_URL, '/users/:id', ctx.params)),
  initialData: (ctx) => {
    // Pull the user from the entity store — it may have been cached
    // by the /users list query
    return ctx.getEntity('User', ctx.params?.id)
  },
})
```

The `getEntity(type, id)` function is available on the `DataFnContext` object passed to `initialData` and `placeholderData` functions. It returns the entity if it exists in the store, or `undefined` if it doesn't.

---

## Complete example: list/detail sync

This is the most common pattern. A list query fetches all users, and a detail query fetches a single user. Entity normalization keeps them in sync automatically.

```ts
import { createSafe } from '@cometloop/safe'
import { safeQuery, fetchJson, buildUrl } from '@cometloop/safe-query'

type AppError = { code: string; message: string }

type User = {
  id: number
  name: string
  email: string
  __type: 'User'
}

const safe = createSafe<AppError>({
  parseError: (err) => ({
    code: err instanceof Error ? err.name : 'UNKNOWN',
    message: err instanceof Error ? err.message : 'Unknown error',
  }),
  defaultError: { code: 'UNKNOWN', message: 'Unknown error' },
})

const api = safeQuery<AppError>({
  safe,
  staleTime: 60_000,
  mapToEntities: {
    User: (user) => String(user.id),
  },
})

const BASE_URL = 'https://api.example.com'

// List query
const getUsers = api.query({
  key: '/users',
  fn: () => fetchJson<User[]>(buildUrl(BASE_URL, '/users')),
})

// Detail query — seeds from entity store
const getUser = api.query({
  key: '/users/:id',
  fn: (ctx) => fetchJson<User>(buildUrl(BASE_URL, '/users/:id', ctx.params)),
  initialData: (ctx) => ctx.getEntity('User', ctx.params?.id),
})

// Mutation
const updateUser = api.mutate<User, Partial<User>>({
  key: '/users/:id',
  method: 'PATCH',
  fn: (ctx) =>
    fetchJson<User>(buildUrl(BASE_URL, '/users/:id', ctx.params), {
      method: 'PATCH',
      body: ctx.body,
    }),
})

// Usage:

// 1. Fetch the user list — entities are extracted and stored
await getUsers()

// 2. Navigate to a detail view — Alice is instantly available from the entity store
//    via initialData, no network request needed (if still fresh)
const [alice, err] = await getUser({ params: { id: '42' } })

// 3. Update Alice's name
await updateUser({
  params: { id: '42' },
  body: { name: 'Alicia' },
})

// 4. Both getUsers and getUser subscribers now show "Alicia" — automatically
```

---

## Mutation update propagation

Here is exactly what happens when a mutation returns an entity, step by step:

1. The mutation's `fn` returns a `Result` with the updated entity.
2. The response data is **normalized** — the normalizer walks the response, finds entities with `__type`, and updates them in the EntityStore.
3. For each updated entity, the reverse index is consulted to find **every query** that contains that entity.
4. Each affected query's normalized data is **denormalized** using the updated EntityStore, producing new data.
5. Each affected query's subscribers are **notified** with the new state.

This entire process is synchronous and happens immediately when the mutation response is processed. There are no extra network requests, no manual cache updates, and no risk of forgetting to invalidate a query.

{% callout type="note" %}
Entity normalization does not remove the need for invalidation entirely. If a mutation **adds or removes** entities from a list (e.g., creating a new user or deleting one), the list query needs to be invalidated so it can refetch and include/exclude the new entity. Normalization handles **updates** to existing entities automatically.
{% /callout %}
