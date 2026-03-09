---
title: Cache keys
---

Every query and mutation in `@cometloop/safe-query` is identified by a cache key. Understanding how keys are built helps you reason about cache behavior, deduplication, and invalidation.

---

## Key format

A cache key is constructed from three parts: the **path**, **path parameters**, and **search parameters**. The format is:

```text
path?param1=val1&param2=val2~search1=sval1&search2=sval2
```

- The **path** is the base key string (e.g., `/users` or `/users/:id`).
- **Path parameters** are appended after a `?` separator.
- **Search parameters** are appended after a `~` separator.

### Examples

| Path | Params | Search Params | Cache Key |
| --- | --- | --- | --- |
| `/users` | — | — | `/users` |
| `/users/:id` | `{ id: '42' }` | — | `/users/:id?id=42` |
| `/users` | — | `{ role: 'admin' }` | `/users~role=admin` |
| `/users/:id` | `{ id: '42' }` | `{ include: 'posts' }` | `/users/:id?id=42~include=posts` |
| `/orgs/:orgId/users/:userId` | `{ orgId: '1', userId: '5' }` | — | `/orgs/:orgId/users/:userId?orgId=1&userId=5` |

---

## Path parameters

Path parameters are defined with a `:` prefix in the key string. When you call a query with `params`, those values are encoded into the cache key after the `?` separator:

```ts
const getUser = api.query({
  key: '/users/:id',
  fn: (ctx) => fetchJson<User>(buildUrl(BASE_URL, '/users/:id', ctx.params)),
})

// Cache key: /users/:id?id=123
await getUser({ params: { id: '123' } })

// Cache key: /users/:id?id=456
await getUser({ params: { id: '456' } })
```

Each unique combination of path parameters creates a separate cache entry. The two calls above are cached independently.

---

## Search parameters

Search parameters are appended after the `~` separator:

```ts
const getUsers = api.query({
  key: '/users',
  fn: (ctx) =>
    fetchJson<User[]>(buildUrl(BASE_URL, '/users', undefined, ctx.searchParams)),
})

// Cache key: /users
await getUsers()

// Cache key: /users~role=admin
await getUsers({ searchParams: { role: 'admin' } })

// Cache key: /users~page=2&role=admin
await getUsers({ searchParams: { role: 'admin', page: '2' } })
```

Like path parameters, each unique combination of search parameters creates a separate cache entry.

---

## Parameter sorting

Parameters are sorted alphabetically by key to ensure consistent cache keys regardless of the order you pass them. This means the following two calls produce the same cache key:

```ts
// Both produce: /users~page=2&role=admin
await getUsers({ searchParams: { role: 'admin', page: '2' } })
await getUsers({ searchParams: { page: '2', role: 'admin' } })
```

The same applies to path parameters:

```ts
const getResource = api.query({
  key: '/orgs/:orgId/users/:userId',
  fn: (ctx) =>
    fetchJson<User>(buildUrl(BASE_URL, '/orgs/:orgId/users/:userId', ctx.params)),
})

// Both produce: /orgs/:orgId/users/:userId?orgId=1&userId=5
await getResource({ params: { orgId: '1', userId: '5' } })
await getResource({ params: { userId: '5', orgId: '1' } })
```

This sorting guarantees that parameter order never causes duplicate cache entries.

---

## Key deduplication

Because cache keys are deterministic (same path + same params + same search params = same key), `@cometloop/safe-query` can deduplicate in-flight requests. If two calls resolve to the same cache key while a request is already in-flight, they share the same network request:

```ts
const getUser = api.query({
  key: '/users/:id',
  fn: (ctx) => fetchJson<User>(buildUrl(BASE_URL, '/users/:id', ctx.params)),
})

// These three calls all produce the same cache key: /users/:id?id=42
// Only ONE network request is made
const [r1, r2, r3] = await Promise.all([
  getUser({ params: { id: '42' } }),
  getUser({ params: { id: '42' } }),
  getUser({ params: { id: '42' } }),
])
```

---

## Keys and cache invalidation

Cache invalidation methods use key matching:

### Prefix-based invalidation

`invalidateByPrefix(prefix)` matches any cache key that starts with the given prefix:

```ts
// Invalidates:
//   /users
//   /users/:id?id=42
//   /users~role=admin
//   /users/:userId/posts?userId=42
api.invalidateByPrefix('/users')
```

This is why key hierarchy matters. Structuring your keys with shared prefixes makes invalidation intuitive:

```ts
const getUsers = api.query({ key: '/users', /* ... */ })
const getUser = api.query({ key: '/users/:id', /* ... */ })
const getUserPosts = api.query({ key: '/users/:userId/posts', /* ... */ })

// One call invalidates all user-related queries
api.invalidateByPrefix('/users')
```

### Per-query invalidation

The `.invalidate()` method on a `QueryCallable` invalidates the specific cache entry for the given params:

```ts
// Invalidates only: /users/:id?id=42
getUser.invalidate({ params: { id: '42' } })

// Invalidates only: /users (no params)
getUsers.invalidate()
```

{% callout type="note" %}
`invalidateByPrefix` operates on the full cache key string, which includes path parameters and search parameters. The prefix `/users/:id` matches `/users/:id?id=42` but not `/users~role=admin`.
{% /callout %}

---

## Keys with both params and search params

When a query uses both path parameters and search parameters, the full cache key contains both sections:

```ts
const getUserPosts = api.query({
  key: '/users/:userId/posts',
  fn: (ctx) =>
    fetchJson<Post[]>(
      buildUrl(BASE_URL, '/users/:userId/posts', ctx.params, ctx.searchParams)
    ),
})

// Cache key: /users/:userId/posts?userId=42~page=1&status=published
await getUserPosts({
  params: { userId: '42' },
  searchParams: { status: 'published', page: '1' },
})
```

Invalidating by prefix `/users` would match this key. Invalidating by prefix `/users/:userId/posts` would also match it.

---

## Designing your key hierarchy

A well-designed key hierarchy makes cache invalidation straightforward. Group related resources under common prefixes:

```ts
// All org-related queries share the /orgs prefix
const getOrgs = api.query({ key: '/orgs', /* ... */ })
const getOrg = api.query({ key: '/orgs/:id', /* ... */ })
const getOrgMembers = api.query({ key: '/orgs/:orgId/members', /* ... */ })
const getOrgSettings = api.query({ key: '/orgs/:orgId/settings', /* ... */ })

// Invalidate everything for a specific org
api.invalidateByPrefix('/orgs/:orgId')

// Invalidate all org-related queries
api.invalidateByPrefix('/orgs')
```

{% callout type="warning" %}
Be careful with short prefixes. `invalidateByPrefix('/')` would match every single cache key in your application, which is equivalent to `invalidateAll()`.
{% /callout %}

---

## What's next?

- [Queries](/docs/queries) — define queries that use cache keys
- [Mutations](/docs/mutations) — mutations and cache invalidation
- [Cache invalidation](/docs/cache-invalidation) — strategies for keeping your cache consistent
- [Entity normalization](/docs/entity-normalization) — automatic updates across related cache entries
