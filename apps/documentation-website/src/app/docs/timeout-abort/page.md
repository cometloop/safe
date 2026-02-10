---
title: Timeout / Abort
---

The `safe.async` and `safe.wrapAsync` functions support automatic timeout. This is useful for preventing operations from hanging indefinitely. {% .lead %}

---

## abortAfter configuration

The `abortAfter` option specifies a timeout in milliseconds. When the timeout is reached:

1. A `TimeoutError` is thrown (which can be transformed via `parseError`)
2. If retry is configured, each attempt gets its own fresh timeout

```ts
import { safe, TimeoutError } from '@cometloop/safe'

// Basic timeout - operation must complete within 5 seconds
const [data, error] = await safe.async(() => fetchSlowApi(), {
  abortAfter: 5000,
})

if (error instanceof TimeoutError) {
  console.log('Operation timed out')
}
```

{% callout title="safe.async vs safe.wrapAsync" type="warning" %}
`safe.async` passes an `AbortSignal` as the first parameter to your function, enabling **cooperative cancellation** (e.g., passing the signal to `fetch`). `safe.wrapAsync` does **not** pass a signal — it only enforces an external deadline. If the timeout fires, the underlying operation continues running in the background. Use `safe.async` when you need the function to actually cancel.
{% /callout %}

---

## Timeout with safe.async

When `abortAfter` is configured, `safe.async` passes an `AbortSignal` as the first parameter to your function. You can use this signal to cooperatively cancel the operation.

```ts
import { safe, TimeoutError } from '@cometloop/safe'

// Using the AbortSignal to cancel fetch
const [data, error] = await safe.async(
  (signal) => fetch('/api/data', { signal }),
  { abortAfter: 5000 }
)

// With error mapping
const [data, error] = await safe.async(
  (signal) => fetch('/api/data', { signal }),
  (e) => ({
    code: e instanceof TimeoutError ? 'TIMEOUT' : 'UNKNOWN',
    message: e instanceof Error ? e.message : 'Unknown error',
  }),
  { abortAfter: 5000 }
)

if (error?.code === 'TIMEOUT') {
  console.log('Operation timed out after 5 seconds')
}
```

The signal can be used with any `AbortSignal`-compatible API:

```ts
const [result, error] = await safe.async(
  async (signal) => {
    const controller = new AbortController()

    // Link the safe signal to your own controller
    signal?.addEventListener('abort', () => controller.abort())

    const [users, orders] = await Promise.all([
      fetch('/api/users', { signal: controller.signal }),
      fetch('/api/orders', { signal: controller.signal }),
    ])

    return { users: await users.json(), orders: await orders.json() }
  },
  { abortAfter: 10000 }
)
```

---

## Timeout with safe.wrapAsync

With `safe.wrapAsync`, `abortAfter` enforces an external deadline — the promise is rejected with a `TimeoutError` after the specified duration. However, the wrapped function does **not** receive an `AbortSignal`, so the underlying operation continues running in the background after timeout.

```ts
import { safe, TimeoutError } from '@cometloop/safe'

// Wrap a function with timeout
const safeFetch = safe.wrapAsync(
  async (url: string) => {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  },
  { abortAfter: 10000 }
)

const [data, error] = await safeFetch('/api/users')

if (error instanceof TimeoutError) {
  console.log('Request timed out')
}
```

With error mapping and timeout:

```ts
type ApiError = { code: string; message: string }

const safeFetch = safe.wrapAsync(
  async (url: string) => {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  },
  (e): ApiError => ({
    code: e instanceof TimeoutError ? 'TIMEOUT' : 'FETCH_ERROR',
    message: e instanceof Error ? e.message : 'Unknown error',
  }),
  { abortAfter: 10000 }
)
```

{% callout title="Need cooperative cancellation?" type="note" %}
If you need the function to actually stop work on timeout (e.g., cancel a `fetch` request), use `safe.async` instead — it passes the `AbortSignal` directly to your function.
{% /callout %}

---

## Timeout with createSafe

The `createSafe` factory supports a default `abortAfter` that applies to all `async` and `wrapAsync` calls:

```ts
import { createSafe, TimeoutError } from '@cometloop/safe'

const apiSafe = createSafe({
  parseError: (e) => ({
    code: e instanceof TimeoutError ? 'TIMEOUT' : 'API_ERROR',
    message: e instanceof Error ? e.message : 'Unknown',
  }),
  defaultError: { code: 'API_ERROR', message: 'Unknown' },
  abortAfter: 10000, // Default 10s timeout for all async operations
})

// All async calls use the default timeout
const safeFetchUsers = apiSafe.wrapAsync(fetchUsers)
const [users, error] = await safeFetchUsers()

// Per-call timeout OVERRIDES the default
const [data, error] = await apiSafe.async(
  () => slowOperation(),
  { abortAfter: 30000 } // Override: 30 seconds instead of 10
)

// Disable timeout for a specific call
const [result, error] = await apiSafe.async(
  () => longRunningTask(),
  { abortAfter: undefined } // Explicitly disable
)
```

---

## Timeout with retry

When both `abortAfter` and `retry` are configured, each retry attempt gets its own fresh timeout. This is **per-attempt** timeout, not total timeout.

```ts
import { safe, TimeoutError } from '@cometloop/safe'

// Each attempt gets 5 seconds, up to 3 retries (4 total attempts)
// Total maximum time: 4 x 5 seconds = 20 seconds
const [data, error] = await safe.async(
  (signal) => fetch('/api/data', { signal }),
  {
    abortAfter: 5000,
    retry: { times: 3 },
    onRetry: (error, attempt, []) => {
      if (error instanceof TimeoutError) {
        console.log(`Attempt ${attempt} timed out, retrying...`)
      }
    },
  }
)
```

With createSafe:

```ts
const apiSafe = createSafe({
  parseError: (e) => ({
    type: e instanceof TimeoutError ? 'timeout' : 'error',
    message: e instanceof Error ? e.message : 'Unknown',
  }),
  defaultError: { type: 'error', message: 'Unknown' },
  abortAfter: 5000,
  retry: { times: 2 },
  onRetry: (error, attempt) => {
    console.log(`Retry ${attempt}: ${error.type}`)
  },
})

// Each call gets 3 attempts (1 initial + 2 retries), each with 5s timeout
const safeFetchData = apiSafe.wrapAsync(fetchData)
const [data, error] = await safeFetchData()
```

---

## TimeoutError class

```ts
import { TimeoutError } from '@cometloop/safe'

// TimeoutError is a subclass of Error
const error = new TimeoutError(5000)
console.log(error.name)    // 'TimeoutError'
console.log(error.message) // 'Operation timed out after 5000ms'
console.log(error instanceof Error)        // true
console.log(error instanceof TimeoutError) // true

// Use in error mapping
const parseError = (e: unknown) => {
  if (e instanceof TimeoutError) {
    return { code: 'TIMEOUT', retryable: true }
  }
  return { code: 'ERROR', retryable: false }
}
```
