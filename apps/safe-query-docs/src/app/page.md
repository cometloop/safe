---
title: Getting started
---

A type-safe data fetching and caching layer built on `@cometloop/safe`. Framework-agnostic with normalized entity caching, optimistic updates, and background refetching. {% .lead %}

{% quick-links %}

{% quick-link title="Installation" icon="installation" href="/docs/installation" description="Install @cometloop/safe-query and set up your first client." /%}

{% quick-link title="Queries" icon="presets" href="/docs/queries" description="Define type-safe queries with caching, deduplication, and subscriptions." /%}

{% quick-link title="Mutations" icon="plugins" href="/docs/mutations" description="Create mutations with optimistic updates and automatic cache sync." /%}

{% quick-link title="Entity normalization" icon="theming" href="/docs/entity-normalization" description="Normalize entities for automatic cross-query consistency." /%}

{% /quick-links %}

---

## What is @cometloop/safe-query?

`@cometloop/safe-query` is a type-safe data fetching and caching layer built on top of [`@cometloop/safe`](https://cometloop.github.io/safe/). It provides a framework-agnostic solution for managing server state in TypeScript applications.

### Key features

- **Framework-agnostic** — works with React, Vue, Svelte, vanilla JS, or any other framework
- **Type-safe queries and mutations** — full TypeScript inference for path params, response types, and entity types
- **Normalized entity caching** — entities are stored once and shared across queries automatically
- **Optimistic updates** — instant UI feedback with automatic rollback on failure
- **Background refetching** — interval polling and window focus refetch to keep data fresh
- **Stale-while-revalidate** — return cached data immediately while fetching in the background
- **Request deduplication** — identical in-flight queries are automatically deduplicated
- **Lifecycle callbacks** — `onSuccess`, `onError`, and `onSettled` at both config and call-site level
- **Built on @cometloop/safe** — leverages the Result pattern for type-safe error handling, retries, and timeouts

### Quick example

```ts
import { createSafe } from '@cometloop/safe'
import { safeQuery, fetchJson, buildUrl } from '@cometloop/safe-query'

const safe = createSafe({ defaultError: 'Something went wrong' })

const api = safeQuery({
  safe,
  staleTime: 30_000,           // 30s before data is considered stale
  refetchOnWindowFocus: true,  // Refetch stale queries when tab gains focus
})

// Define a query
const getUsers = api.query({
  key: '/users',
  fn: () => fetchJson(buildUrl('https://api.example.com', '/users')),
})

// Invoke it — returns a Result tuple
const [users, error] = await getUsers()
if (error) {
  console.error('Failed to fetch users:', error)
} else {
  console.log('Users:', users)
}
```

### How it works

1. **Create a client** — `safeQuery()` creates a client with global defaults for caching, refetching, and optimistic updates
2. **Define queries** — `api.query()` creates reusable, callable query functions with built-in caching
3. **Define mutations** — `api.mutate()` creates mutation functions that can optimistically update the cache
4. **Subscribe to state** — `query.subscribe()` lets you react to cache changes in real-time
5. **Entity normalization** — entities are stored in a normalized store, so updating one entity updates every query that contains it

### Comparison with other libraries

| Feature | safe-query | TanStack Query | SWR |
|---------|-----------|----------------|-----|
| Framework-agnostic core | Yes | Yes | No (React only) |
| Type-safe path params | Yes | No | No |
| Normalized entity cache | Yes | No | No |
| Optimistic updates | Built-in | Manual | Manual |
| Result pattern (no try/catch) | Yes | No | No |
| Zero dependencies* | Yes | No | No |

\* Only depends on `@cometloop/safe`

---

## Next steps

- [Installation](/docs/installation) — install and set up your first client
- [Client setup](/docs/client-setup) — learn about all configuration options
- [Queries](/docs/queries) — deep dive into the query API
- [Entity normalization](/docs/entity-normalization) — set up automatic cross-query consistency
