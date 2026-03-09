---
title: Installation
---

## Install the packages

`@cometloop/safe-query` requires `@cometloop/safe` as a peer dependency. Install both:

```bash
npm install @cometloop/safe @cometloop/safe-query
```

Or with your preferred package manager:

```bash
# pnpm
pnpm add @cometloop/safe @cometloop/safe-query

# yarn
yarn add @cometloop/safe @cometloop/safe-query

# bun
bun add @cometloop/safe @cometloop/safe-query
```

---

## Requirements

- **Node.js** 18 or later
- **TypeScript** 5.0 or later (recommended)
- Both ESM and CommonJS are supported

---

## Basic setup

### 1. Create a safe instance

First, create a `safe` instance from `@cometloop/safe`. This provides the error handling foundation that safe-query builds on:

```ts
import { createSafe } from '@cometloop/safe'

// Define your app's error type
type AppError = {
  code: string
  message: string
}

const safe = createSafe<AppError>({
  parseError: (err) => ({
    code: err instanceof Error ? err.name : 'UNKNOWN',
    message: err instanceof Error ? err.message : 'An unknown error occurred',
  }),
  defaultError: {
    code: 'UNKNOWN',
    message: 'An unknown error occurred',
  },
})
```

### 2. Create a safe-query client

Pass your `safe` instance to `safeQuery()` to create a client:

```ts
import { safeQuery } from '@cometloop/safe-query'

const api = safeQuery<AppError>({
  safe,
  staleTime: 30_000,           // Data is fresh for 30 seconds
  gcTime: 5 * 60_000,          // Unused cache entries are garbage collected after 5 minutes
  refetchOnWindowFocus: true,  // Refetch stale queries when the window regains focus
})
```

### 3. Define queries and mutations

```ts
import { fetchJson, buildUrl } from '@cometloop/safe-query'

const BASE_URL = 'https://api.example.com'

// A simple query
const getUsers = api.query({
  key: '/users',
  fn: () => fetchJson<User[]>(buildUrl(BASE_URL, '/users')),
})

// A query with path parameters
const getUser = api.query({
  key: '/users/:id',
  fn: (ctx) => fetchJson<User>(buildUrl(BASE_URL, '/users/:id', ctx.params)),
})

// A mutation
const createUser = api.mutate<User, { name: string; email: string }>({
  key: '/users',
  method: 'POST',
  fn: (ctx) => fetchJson<User>(buildUrl(BASE_URL, '/users'), {
    method: 'POST',
    body: ctx.body,
  }),
})
```

### 4. Use them

```ts
// Invoke a query
const [users, error] = await getUsers()

// Invoke with path params
const [user, userError] = await getUser({ params: { id: '123' } })

// Invoke a mutation
const [newUser, createError] = await createUser({
  body: { name: 'Alice', email: 'alice@example.com' },
})

// Subscribe to live state updates
const unsubscribe = getUsers.subscribe((state) => {
  console.log(state.status) // 'idle' | 'loading' | 'success' | 'error'
  console.log(state.data)   // User[] | undefined
  console.log(state.error)  // AppError | null
})
```

---

## What's next?

- [Client setup](/docs/client-setup) — learn about all the configuration options
- [Queries](/docs/queries) — deep dive into the query API
- [Mutations](/docs/mutations) — learn about mutations and optimistic updates
- [Entity normalization](/docs/entity-normalization) — set up automatic cross-query cache consistency
