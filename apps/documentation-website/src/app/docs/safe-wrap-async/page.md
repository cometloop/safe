---
title: safe.wrapAsync
---

Wraps an asynchronous function to return `Promise<SafeResult>` instead of throwing. Automatically preserves function parameter types. Supports automatic retry with configurable backoff. {% .lead %}

---

## Signatures

```ts
safe.wrapAsync<TArgs, T>(fn: (...args: TArgs) => Promise<T>): (...args: TArgs) => Promise<SafeResult<T, Error>>
safe.wrapAsync<TArgs, T>(fn: (...args: TArgs) => Promise<T>, hooks: SafeAsyncHooks<T, Error, TArgs>): (...args: TArgs) => Promise<SafeResult<T, Error>>
safe.wrapAsync<TArgs, T, E>(fn: (...args: TArgs) => Promise<T>, parseError: (e: unknown) => NonFalsy<E>): (...args: TArgs) => Promise<SafeResult<T, E>>
safe.wrapAsync<TArgs, T, E>(fn: (...args: TArgs) => Promise<T>, parseError: (e: unknown) => NonFalsy<E>, hooks: SafeAsyncHooks<T, E, TArgs> & { defaultError: E }): (...args: TArgs) => Promise<SafeResult<T, E>>
```

{% callout title="Error normalization" type="note" %}
When no `parseError` is provided, non-`Error` thrown values are automatically normalized to `Error` instances via `new Error(String(e))`. The original thrown value is preserved as `error.cause`.
{% /callout %}

---

## Basic usage

```ts
// Setup: an async function that can throw
const fetchUser = async (id: number) => {
  const response = await fetch(`/api/users/${id}`)
  if (!response.ok) throw new Error(`User ${id} not found`)
  return response.json() as Promise<User>
}

// Wrap it
const safeFetchUser = safe.wrapAsync(fetchUser)
const [user, error] = await safeFetchUser(42) // Types inferred automatically!

if (error) {
  console.error('Fetch failed:', error.message)
  return
}
console.log(user.name) // user is typed as User
```

---

## With error mapping

```ts
type ApiError = {
  statusCode: number
  message: string
  endpoint: string
}

const safeFetchUser = safe.wrapAsync(
  fetchUser,
  (e): ApiError => ({
    statusCode:
      e instanceof Error && e.message.includes('not found') ? 404 : 500,
    message: e instanceof Error ? e.message : 'Unknown error',
    endpoint: '/api/users',
  })
)

const [user, error] = await safeFetchUser(42)
if (error) {
  // error is typed as ApiError
  if (error.statusCode === 404) {
    showNotFound()
  } else {
    showServerError(error.message)
  }
}
```

---

## With hooks

For `safe.wrapAsync`, the hook context contains the **original arguments**:

```ts
const safeFetchUser = safe.wrapAsync(fetchUser, {
  onSuccess: (user, [id]) => {
    console.log(`Fetched user ${id}:`, user.name)
    cache.set(`user:${id}`, user)
  },
  onError: (error, [id]) => {
    console.error(`Failed to fetch user ${id}:`, error.message)
    metrics.increment('user_fetch_error')
  },
})

await safeFetchUser(42)  // logs: "Fetched user 42: John"
await safeFetchUser(999) // logs: "Failed to fetch user 999: User 999 not found"
```

---

## With error mapping and hooks

```ts
const safeFetchUser = safe.wrapAsync(
  fetchUser,
  (e): ApiError => ({
    statusCode: 500,
    message: e instanceof Error ? e.message : 'Unknown error',
    endpoint: '/api/users',
  }),
  {
    onSuccess: (user, [id]) => {
      analytics.track('user_fetched', { userId: id })
      logger.info(`User ${id} fetched successfully`)
    },
    onError: (error, [id]) => {
      // error is typed as ApiError here
      analytics.track('user_fetch_failed', {
        userId: id,
        statusCode: error.statusCode,
      })
      logger.error(`Failed to fetch user ${id}`, {
        endpoint: error.endpoint,
        message: error.message,
      })
    },
  }
)
```

---

## With retry

```ts
const safeFetchWithRetry = safe.wrapAsync(fetchUser, {
  retry: { times: 3, waitBefore: (attempt) => attempt * 1000 },
  onRetry: (error, attempt, [id]) => {
    console.log(`Retry ${attempt} for user ${id}: ${error.message}`)
  },
})

const [user, error] = await safeFetchWithRetry(42)
```

Each call gets its own independent retry attempts. See [Retry support](/docs/retry-support) for full details.
