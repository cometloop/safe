---
title: buildUrl
---

`buildUrl` constructs fully-qualified URLs from a base URL, a path with optional parameter placeholders, path parameters, and search parameters. It handles encoding, slash normalization, and consistent parameter ordering.

---

## Function signature

```ts
function buildUrl(
  baseUrl: string,
  path: string,
  params?: Record<string, string>,
  searchParams?: SearchParams
): string
```

```ts
type SearchParamValue = string | number | boolean

type SearchParams = Record<string, SearchParamValue | SearchParamValue[]>
```

---

## Path parameter substitution

Path segments prefixed with `:` are replaced with the corresponding value from the `params` object. Values are encoded with `encodeURIComponent`:

```ts
import { buildUrl } from '@cometloop/safe-query'

buildUrl('https://api.example.com', '/users/:id', { id: '123' })
// => "https://api.example.com/users/123"

buildUrl('https://api.example.com', '/users/:id/posts/:postId', {
  id: '42',
  postId: '7',
})
// => "https://api.example.com/users/42/posts/7"
```

Special characters in parameter values are encoded automatically:

```ts
buildUrl('https://api.example.com', '/search/:query', {
  query: 'hello world',
})
// => "https://api.example.com/search/hello%20world"
```

---

## URL normalization

`buildUrl` normalizes the join between `baseUrl` and `path` so you never end up with double slashes or missing slashes:

```ts
// Trailing slash on base is removed
buildUrl('https://api.example.com/', '/users')
// => "https://api.example.com/users"

// Leading slash on path is added if missing
buildUrl('https://api.example.com', 'users')
// => "https://api.example.com/users"

// Both cases handled together
buildUrl('https://api.example.com/', 'users')
// => "https://api.example.com/users"
```

---

## Search parameters

The optional `searchParams` argument appends query string parameters to the URL. Parameters are sorted alphabetically by key and encoded with `encodeURIComponent`.

### Single values

Strings, numbers, and booleans are all supported:

```ts
buildUrl('https://api.example.com', '/users', undefined, {
  role: 'admin',
  active: true,
  limit: 50,
})
// => "https://api.example.com/users?active=true&limit=50&role=admin"
```

Notice that the parameters are sorted alphabetically (`active` before `limit` before `role`). This ensures the same set of parameters always produces the same URL, which is important for cache key consistency.

### Array values

When a parameter value is an array, each element produces a separate key-value pair:

```ts
buildUrl('https://api.example.com', '/users', undefined, {
  status: ['active', 'pending'],
  sort: 'name',
})
// => "https://api.example.com/users?sort=name&status=active&status=pending"
```

### Mixed types in arrays

Arrays can contain strings, numbers, and booleans:

```ts
buildUrl('https://api.example.com', '/items', undefined, {
  ids: [1, 2, 3],
})
// => "https://api.example.com/items?ids=1&ids=2&ids=3"
```

---

## Combining params and search params

Path parameters and search parameters can be used together:

```ts
buildUrl(
  'https://api.example.com',
  '/users/:id/posts',
  { id: '42' },
  { page: 1, limit: 10, tag: ['typescript', 'react'] }
)
// => "https://api.example.com/users/42/posts?limit=10&page=1&tag=typescript&tag=react"
```

---

## Common patterns

### API base URL constant

Define your base URL once and reuse it across all queries:

```ts
const BASE_URL = 'https://api.example.com/v2'

buildUrl(BASE_URL, '/users')
// => "https://api.example.com/v2/users"

buildUrl(BASE_URL, '/users/:id', { id: '123' })
// => "https://api.example.com/v2/users/123"
```

### With safe-query queries

`buildUrl` is designed to work seamlessly inside query and mutation `fn` callbacks:

```ts
import { safeQuery, fetchJson, buildUrl } from '@cometloop/safe-query'

const BASE_URL = 'https://api.example.com'

// Simple list query
const getUsers = api.query({
  key: '/users',
  fn: ({ signal }) =>
    fetchJson<User[]>(buildUrl(BASE_URL, '/users'), { signal }),
})

// Query with path params
const getUser = api.query({
  key: '/users/:id',
  fn: ({ params, signal }) =>
    fetchJson<User>(buildUrl(BASE_URL, '/users/:id', params), { signal }),
})

// Query with search params
const searchPosts = api.query({
  key: '/posts',
  fn: ({ searchParams, signal }) =>
    fetchJson<Post[]>(
      buildUrl(BASE_URL, '/posts', undefined, searchParams),
      { signal }
    ),
})

// Query with both path params and search params
const getUserPosts = api.query({
  key: '/users/:id/posts',
  fn: ({ params, searchParams, signal }) =>
    fetchJson<Post[]>(
      buildUrl(BASE_URL, '/users/:id/posts', params, searchParams),
      { signal }
    ),
})
```

### With mutations

```ts
const updateUser = api.mutate<User, Partial<User>, '/users/:id', 'PUT'>({
  key: '/users/:id',
  method: 'PUT',
  fn: ({ params, body, signal }) =>
    fetchJson<User>(buildUrl(BASE_URL, '/users/:id', params), {
      method: 'PUT',
      body,
      signal,
    }),
})
```

---

## Search params and cache keys

safe-query uses a separate mechanism to build cache keys (via `QueryCache.buildKey`), but the search params you pass when invoking a query flow through to `buildUrl` inside your `fn` callback. This means the URL sent to the server and the cache key stay consistent automatically when you follow the standard pattern.

```ts
// Both calls cache separately because they have different search params
const [admins] = await getUsers({ searchParams: { role: 'admin' } })
const [editors] = await getUsers({ searchParams: { role: 'editor' } })
```

---

## What's next?

- [fetchJson](/docs/fetch-json) — the companion function for making JSON API calls
- [Cache keys](/docs/cache-keys) — understand how safe-query constructs cache keys from paths and params
- [Types reference](/docs/types) — see the full SearchParams type definition
