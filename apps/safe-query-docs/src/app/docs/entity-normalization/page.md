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

1. **Entity identification** — Each entity type is identified by a `match` function that recognizes it by its shape (its fields), plus an `id` function that extracts a unique ID.
2. **Normalize** — When query data arrives, the normalizer walks the data recursively, finds every object that matches an entity definition, stores it in a central **EntityStore**, and replaces it in the query data with a lightweight reference (`{ __ref: "type:id" }`).
3. **Denormalize** — When a subscriber reads query data, references are resolved back into full entity objects from the EntityStore. If an entity has been updated anywhere, every query that contains it sees the new value.

```ts
// Original data from API
{
  id: 1,
  name: "Alice",
  email: "alice@example.com"
}

// The "user" entity config matches this object because it has an "email" field
// match: (obj) => 'email' in obj

// After normalize() — stored in cache
{
  __ref: "user:1"
}

// Entity stored in EntityStore
EntityStore["user:1"] = { id: 1, name: "Alice", email: "alice@example.com" }

// After denormalize() — returned to subscribers
{
  id: 1,
  name: "Alice",
  email: "alice@example.com"
}
```

---

## Setting up entity normalization

### Configure entities

Tell safe-query how to identify and extract IDs from your entities using the `entities` option on the client. Each entity type needs two functions:

- **`match`** — receives a plain object and returns `true` if that object is an instance of this entity type. You identify entities by their shape (which fields they have).
- **`id`** — receives the matched object and returns a **string ID** that uniquely identifies the entity within its type.

```ts
const api = safeQuery<AppError>({
  safe,
  staleTime: 30_000,
  entities: {
    user: { match: (obj) => 'email' in obj, id: (u) => String(u.id) },
    post: { match: (obj) => 'title' in obj, id: (p) => String(p.id) },
    comment: { match: (obj) => 'body' in obj && !('title' in obj), id: (c) => String(c.id) },
  },
})
```

Each key in `entities` is the entity type name. The `id` function's return value, combined with the type name, creates the unique key used in the EntityStore (e.g., `"user:1"`, `"post:42"`).

{% callout type="warning" %}
The `id` function must return a **string**. If your IDs are numbers, convert them with `String(id)`. The ID must be stable and unique within its type.
{% /callout %}

{% callout type="note" %}
The `match` functions are evaluated in order. Make your match predicates specific enough to avoid false positives. In the example above, `comment` checks for `'body' in obj && !('title' in obj)` to avoid matching `post` objects that also have a `body` field.
{% /callout %}

Once `entities` is configured on the client, **all queries and mutations automatically participate in normalization**. You do not need any entity-related config on individual queries or mutations.

---

## The normalize/denormalize flow

### Normalize

When a query's fetch function returns data, the normalizer walks the entire response and uses the `match` functions to identify entities:

```ts
// API returns this data for GET /posts/1
const apiResponse = {
  id: 1,
  title: "Hello World",
  author: {
    id: 42,
    name: "Alice",
    email: "alice@example.com",
  },
  comments: [
    {
      id: 100,
      body: "Great post!",
      author: {
        id: 43,
        name: "Bob",
        email: "bob@example.com",
      },
    },
  ],
}
```

The normalizer processes this recursively:

1. Finds the `comment` author (Bob) — `match` identifies it as a `user`, stores `user:43` in EntityStore, replaces with `{ __ref: "user:43" }`.
2. Finds the `comment` — `match` identifies it, stores `comment:100` in EntityStore (with Bob replaced by a ref), replaces with `{ __ref: "comment:100" }`.
3. Finds the `post` author (Alice) — `match` identifies it as a `user`, stores `user:42` in EntityStore, replaces with `{ __ref: "user:42" }`.
4. Finds the `post` itself — `match` identifies it, stores `post:1` in EntityStore, replaces with `{ __ref: "post:1" }`.

The normalized data stored in the cache is just:

```ts
{ __ref: "post:1" }
```

And the EntityStore now contains:

```ts
{
  "user:42":     { id: 42, name: "Alice", email: "alice@example.com" },
  "user:43":     { id: 43, name: "Bob", email: "bob@example.com" },
  "comment:100": { id: 100, body: "Great post!", author: { __ref: "user:43" } },
  "post:1":      { id: 1, title: "Hello World", author: { __ref: "user:42" }, comments: [{ __ref: "comment:100" }] },
}
```

### Denormalize

When a subscriber reads the data, `denormalize()` walks the normalized data and replaces every `{ __ref }` with the current entity from the EntityStore. This reconstructs the full object graph — but using the **latest** version of every entity.

---

## EntityRef

The `EntityRef` is the marker object that replaces entities in normalized data:

```ts
type EntityRef = {
  __ref: string // Format: "type:id" — e.g., "user:42", "post:1"
}
```

During denormalization, any object with a `__ref` property is looked up in the EntityStore and replaced with the full entity. This is an internal detail — you never create `EntityRef` objects yourself.

---

## The reverse index

The EntityStore maintains a **reverse index**: a mapping from each entity to the set of query cache keys that contain it.

```ts
// When GET /posts returns posts by Alice and Bob:
// reverse index tracks:
//   "user:42" -> ["/posts", "/posts?author=alice"]
//   "user:43" -> ["/posts", "/users/43"]
```

When an entity is updated (via a mutation or by any query refetching), the reverse index tells safe-query **exactly which queries need to be notified**. Those queries are denormalized again with the updated entity, and their subscribers receive the new data.

This is registered automatically via `registerQueryEntities()` — every time a query's data is normalized, the entities it contains are tracked in the reverse index.

---

## Cross-query consistency in action

Here is the core value proposition. Watch how a single mutation updates data across multiple queries:

```ts
// Types — no special fields needed, just plain data
type User = {
  id: number
  name: string
  email: string
}

type Post = {
  id: number
  title: string
  body: string
  author: User
}

// Define queries — no entity config needed on individual queries
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

When the mutation response comes back with the updated user (`{ id: 42, name: "Alicia", email: "alice@example.com" }`):

1. The response is normalized — the `match` function identifies it as a `user`, and `user:42` in the EntityStore is updated to `{ name: "Alicia" }`.
2. The reverse index shows `user:42` appears in three queries: `/users`, `/users?id=42`, and `/users/42/posts`.
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
}

type Post = {
  id: number
  title: string
  author: User
  comments: Comment[]
}
```

When a post is fetched, the normalizer uses the `match` functions to extract **every** entity at every level:

```ts
// API response for GET /posts/1
{
  id: 1,
  title: "Understanding Normalization",
  author: { id: 42, name: "Alice", email: "alice@example.com" },
  comments: [
    {
      id: 200,
      body: "Great explanation!",
      author: { id: 43, name: "Bob", email: "bob@example.com" },
    },
    {
      id: 201,
      body: "Thanks for writing this.",
      author: { id: 42, name: "Alice", email: "alice@example.com" },
    },
  ],
}
```

After normalization, the EntityStore contains `user:42`, `user:43`, `comment:200`, `comment:201`, and `post:1`. Notice that Alice appears twice (as post author and as comment author) but is stored only once in the EntityStore as `user:42`. If Alice's name changes, both appearances update simultaneously.

---

## Arrays of entities

The normalizer handles arrays seamlessly. A list query returning an array of entities is normalized element by element:

```ts
// GET /users returns:
[
  { id: 1, name: "Alice", email: "alice@example.com" },
  { id: 2, name: "Bob", email: "bob@example.com" },
  { id: 3, name: "Carol", email: "carol@example.com" },
]

// Normalized cache entry becomes:
[
  { __ref: "user:1" },
  { __ref: "user:2" },
  { __ref: "user:3" },
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
  email: "alice@example.com",
  manager: {
    id: 2,
    name: "Bob",
    email: "bob@example.com",
    directReports: [
      { id: 1, name: "Alice", email: "alice@example.com", manager: ... } // circular!
    ]
  }
}

// After normalization — no circularity, just refs
// user:1 -> { id: 1, name: "Alice", email: "alice@example.com", manager: { __ref: "user:2" } }
// user:2 -> { id: 2, name: "Bob", email: "bob@example.com", directReports: [{ __ref: "user:1" }] }
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
    return ctx.getEntity('user', ctx.params?.id)
  },
})
```

The `getEntity(type, id)` function is available on the `DataFnContext` object passed to `initialData` and `placeholderData` functions. It returns the entity if it exists in the store, or `undefined` if it doesn't.

{% callout type="note" %}
The first argument to `getEntity` is the entity type name — the key you used in the `entities` config (e.g., `'user'`, `'post'`), not a class name or constructor.
{% /callout %}

---

## The normalize escape hatch

By default, the normalizer performs a recursive tree walk over your query data, using the `match` functions to find entities. For most cases this works perfectly. However, some API responses have complex shapes where the tree walk may be inefficient or where you want explicit control over which entities are extracted.

The per-query `normalize` option lets you skip the tree walk and tell safe-query exactly which entities to extract:

```ts
type Feed = {
  posts: Post[]
  trending: Post[]
  suggestedUsers: User[]
}

const getFeed = api.query({
  key: '/feed',
  fn: () => fetchJson<Feed>(buildUrl(BASE_URL, '/feed')),
  normalize: (data) => ({
    post: [...data.posts, ...data.trending],
    user: [
      ...data.suggestedUsers,
      ...data.posts.map((p) => p.author),
      ...data.trending.map((p) => p.author),
    ],
  }),
})
```

The `normalize` function receives the raw response data and returns an object where each key is an entity type name (matching a key in your `entities` config) and each value is an array of entity objects to extract. The `id` function from the entity config is still used to determine each entity's unique ID.

{% callout type="warning" %}
When you provide a `normalize` function, the automatic tree walk is skipped entirely for that query. You are responsible for returning **all** entities you want tracked. Any entities you omit will not be stored in the EntityStore for that query.
{% /callout %}

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
  entities: {
    user: { match: (obj) => 'email' in obj, id: (u) => String(u.id) },
  },
})

const BASE_URL = 'https://api.example.com'

// List query — no entity config needed
const getUsers = api.query({
  key: '/users',
  fn: () => fetchJson<User[]>(buildUrl(BASE_URL, '/users')),
})

// Detail query — seeds from entity store
const getUser = api.query({
  key: '/users/:id',
  fn: (ctx) => fetchJson<User>(buildUrl(BASE_URL, '/users/:id', ctx.params)),
  initialData: (ctx) => ctx.getEntity('user', ctx.params?.id),
})

// Mutation — no entity config needed
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
2. The response data is **normalized** — the normalizer walks the response, uses `match` functions to find entities, and updates them in the EntityStore.
3. For each updated entity, the reverse index is consulted to find **every query** that contains that entity.
4. Each affected query's normalized data is **denormalized** using the updated EntityStore, producing new data.
5. Each affected query's subscribers are **notified** with the new state.

This entire process is synchronous and happens immediately when the mutation response is processed. There are no extra network requests, no manual cache updates, and no risk of forgetting to invalidate a query.

{% callout type="note" %}
Entity normalization does not remove the need for invalidation entirely. If a mutation **adds or removes** entities from a list (e.g., creating a new user or deleting one), the list query needs to be invalidated so it can refetch and include/exclude the new entity. Normalization handles **updates** to existing entities automatically.
{% /callout %}
