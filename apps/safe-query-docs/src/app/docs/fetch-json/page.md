---
title: fetchJson
---

`fetchJson` is a lightweight wrapper around the native `fetch` API, purpose-built for JSON APIs. It handles content-type headers, body serialization, error handling, and empty responses so your query and mutation functions stay concise.

---

## Function signature

```ts
function fetchJson<T>(url: string, options?: FetchOptions): Promise<T>
```

```ts
type FetchOptions = {
  method?: string
  headers?: Record<string, string>
  body?: unknown
  signal?: AbortSignal
}
```

By default, `fetchJson` sets both `Content-Type` and `Accept` headers to `application/json`. Any headers you provide in `options.headers` are merged on top, so you can override these defaults or add additional headers like `Authorization`.

---

## Basic usage

### GET request

The simplest case — fetch JSON data from a URL:

```ts
import { fetchJson } from '@cometloop/safe-query'

type User = {
  id: string
  name: string
  email: string
}

const users = await fetchJson<User[]>('https://api.example.com/users')
```

### POST request

Pass a `method` and `body` to send data. The body is automatically serialized with `JSON.stringify`:

```ts
const newUser = await fetchJson<User>('https://api.example.com/users', {
  method: 'POST',
  body: { name: 'Alice', email: 'alice@example.com' },
})
```

### PUT request

```ts
const updatedUser = await fetchJson<User>('https://api.example.com/users/123', {
  method: 'PUT',
  body: { name: 'Alice Updated', email: 'alice@example.com' },
})
```

### DELETE request

```ts
await fetchJson<void>('https://api.example.com/users/123', {
  method: 'DELETE',
})
```

---

## Custom headers

Provide additional headers via `options.headers`. These are merged with the default `Content-Type` and `Accept` headers:

```ts
const data = await fetchJson<User>('https://api.example.com/me', {
  headers: {
    Authorization: 'Bearer eyJhbGciOiJIUzI1NiIs...',
    'X-Request-Id': crypto.randomUUID(),
  },
})
```

To override a default header, set it explicitly:

```ts
const data = await fetchJson<string>('https://api.example.com/report', {
  headers: {
    Accept: 'text/plain',
  },
})
```

---

## Abort signals

Pass an `AbortSignal` to cancel in-flight requests. This is especially useful for search-as-you-type or component unmount scenarios:

```ts
const controller = new AbortController()

const promise = fetchJson<User[]>('https://api.example.com/users', {
  signal: controller.signal,
})

// Cancel the request
controller.abort()
```

{% callout type="note" %}
When used inside safe-query's `fn` callback, the `signal` is provided automatically via the context object. You do not need to create your own `AbortController`.
{% /callout %}

---

## Error handling

When the server responds with a non-2xx status code, `fetchJson` throws an `HttpError`:

```ts
import { HttpError } from '@cometloop/safe-query'

try {
  await fetchJson<User>('https://api.example.com/users/999')
} catch (err) {
  if (err instanceof HttpError) {
    console.log(err.status)     // 404
    console.log(err.statusText) // "Not Found"
    console.log(err.body)       // parsed response body (see below)
    console.log(err.message)    // "HTTP 404: Not Found"
  }
}
```

### HttpError class

```ts
class HttpError extends Error {
  readonly status: number
  readonly statusText: string
  readonly body: unknown
}
```

The `body` property contains the server's error response. `fetchJson` attempts to parse it in this order:

1. **JSON** — if the response body is valid JSON, `body` is the parsed object
2. **Text** — if JSON parsing fails, `body` is the raw text string
3. **null** — if both fail, `body` is `null`

This makes it straightforward to access structured error responses from your API:

```ts
try {
  await fetchJson<User>('https://api.example.com/users', {
    method: 'POST',
    body: { name: '' },
  })
} catch (err) {
  if (err instanceof HttpError && err.status === 422) {
    // body might be { errors: [{ field: 'name', message: 'Required' }] }
    const errors = err.body as { errors: { field: string; message: string }[] }
    console.log(errors)
  }
}
```

---

## Empty responses (204 and content-length: 0)

`fetchJson` returns `undefined` for responses with:

- HTTP status `204 No Content`
- A `content-length` header of `"0"`

This is common for DELETE endpoints and some PUT/PATCH endpoints that return no body:

```ts
// Server returns 204 No Content
const result = await fetchJson<void>('https://api.example.com/users/123', {
  method: 'DELETE',
})
// result is undefined
```

---

## Integration with safe-query

`fetchJson` is designed to be used inside query and mutation `fn` callbacks. Combined with `buildUrl`, it provides a clean pattern for defining API calls:

### In queries

```ts
import { safeQuery, fetchJson, buildUrl } from '@cometloop/safe-query'

const BASE_URL = 'https://api.example.com'

const getUsers = api.query({
  key: '/users',
  fn: ({ signal }) =>
    fetchJson<User[]>(buildUrl(BASE_URL, '/users'), { signal }),
})

const getUser = api.query({
  key: '/users/:id',
  fn: ({ params, signal }) =>
    fetchJson<User>(buildUrl(BASE_URL, '/users/:id', params), { signal }),
})
```

### In mutations

```ts
const createUser = api.mutate<User, { name: string; email: string }>({
  key: '/users',
  method: 'POST',
  fn: ({ body, signal }) =>
    fetchJson<User>(buildUrl(BASE_URL, '/users'), {
      method: 'POST',
      body,
      signal,
    }),
})

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

const deleteUser = api.mutate<void, void, '/users/:id', 'DELETE'>({
  key: '/users/:id',
  method: 'DELETE',
  fn: ({ params, signal }) =>
    fetchJson<void>(buildUrl(BASE_URL, '/users/:id', params), {
      method: 'DELETE',
      signal,
    }),
})
```

### With search params

```ts
const searchUsers = api.query({
  key: '/users',
  fn: ({ searchParams, signal }) =>
    fetchJson<User[]>(
      buildUrl(BASE_URL, '/users', undefined, searchParams),
      { signal }
    ),
})

// Invoke with search params
const [users, error] = await searchUsers({
  searchParams: { role: 'admin', active: true },
})
```

---

## What's next?

- [buildUrl](/docs/build-url) — learn how to construct URLs with path params and search params
- [Queries](/docs/queries) — define queries using fetchJson
- [Mutations](/docs/mutations) — define mutations with full CRUD support
- [Types reference](/docs/types) — see the full FetchOptions and HttpError type definitions
