---
title: SSR / Hydration
---

Transfer cache state from server to client using `dehydrate` and `hydrate`. Eliminates redundant fetches and provides instant page loads. {% .lead %}

---

## Overview

1. **Server**: Fetch data, call `dehydrate()` to serialize cache state
2. **Transfer**: Embed the serialized state in the HTML response
3. **Client**: Call `hydrate()` to restore cache state before rendering

---

## Server-side

```ts
import { createSafe } from '@cometloop/safe'
import { safeQuery } from '@cometloop/safe-query'

const safe = createSafe<AppError>({ /* ... */ })
const serverApi = safeQuery<AppError>({ safe, staleTime: 30_000 })

// Fetch data during SSR
const getUsers = serverApi.query({
  key: '/users',
  fn: () => fetchJson<User[]>('/api/users'),
})
await getUsers()

const getPosts = serverApi.query({
  key: '/posts',
  fn: () => fetchJson<Post[]>('/api/posts'),
})
await getPosts()

// Serialize cache state
const dehydratedState = serverApi.dehydrate()
const json = JSON.stringify(dehydratedState)

// Embed in HTML response
// <script>window.__DEHYDRATED_STATE__ = ${json}</script>
```

---

## Client-side

```ts
const clientApi = safeQuery<AppError>({ safe, staleTime: 30_000 })

// Restore server state
clientApi.hydrate(JSON.parse(window.__DEHYDRATED_STATE__))

// Queries return hydrated data without refetching (if still fresh)
const getUsers = clientApi.query({
  key: '/users',
  fn: () => fetchJson<User[]>('/api/users'),
})

const [users, err] = await getUsers()
// Returns server-fetched data instantly — no network request
```

---

## Hydration behavior

### Freshness

Hydrated data respects `staleTime`. If the data was fetched recently enough on the server, client queries return it without refetching:

```ts
// Server fetches at time T
// Client hydrates at time T + 5s
// staleTime is 30s
// → Data is fresh, no refetch needed

// If staleTime is 2s:
// → Data is stale, query triggers a refetch
```

### No overwrite of newer data

If the client already has newer data for a key, hydration skips that key:

```ts
// Client already fetched fresh data for /users
clientApi.hydrate(olderServerState)
// /users data is NOT overwritten
```

### Entity normalization

If `entities` is configured, hydrated data is normalized into the entity store during hydration:

```ts
const api = safeQuery<AppError>({
  safe,
  entities: {
    user: { match: (obj) => 'email' in obj, id: (u) => u.id },
  },
  staleTime: 30_000,
})

api.hydrate(dehydratedState)
// Entities from hydrated data are now in the entity store
```

### Subscriber notifications

Subscribers are notified when hydrated data is applied, so reactive UIs update automatically:

```ts
const getUsers = api.query({ key: '/users', fn: fetchUsers })

getUsers.subscribe((state) => {
  // Called when hydrate() applies data for /users
  renderUsers(state.data)
})

api.hydrate(dehydratedState) // triggers subscriber notification
```

---

## DehydratedState type

```ts
type DehydratedState = {
  queries: Array<{
    key: string
    data: unknown
    dataUpdatedAt: number | null
  }>
}
```

The dehydrated state is a plain JSON-serializable object. It contains only the data and timestamps — no functions, promises, or internal state.

{% callout title="Framework integration" type="note" %}
For Next.js App Router, dehydrate in a Server Component and pass the state as a prop to a Client Component that calls `hydrate()`. For Pages Router, dehydrate in `getServerSideProps` and hydrate in `_app.tsx`.
{% /callout %}
