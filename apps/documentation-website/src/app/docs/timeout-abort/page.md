---
title: Timeout / Abort
---

The `safe.async` and `safe.wrapAsync` functions support automatic timeout with `AbortSignal` integration. This is useful for preventing operations from hanging indefinitely and for implementing cancellable requests. {% .lead %}

---

## abortAfter configuration

The `abortAfter` option specifies a timeout in milliseconds. When the timeout is reached:

1. A `TimeoutError` is thrown (which can be transformed via `parseError`)
2. The `AbortController` is aborted, signaling to the function that it should cancel
3. If retry is configured, each attempt gets its own fresh timeout

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

---

## Timeout with safe.async

```ts
import { safe, TimeoutError } from '@cometloop/safe'

// Basic timeout
const [data, error] = await safe.async(() => slowOperation(), {
  abortAfter: 5000,
})

// With error mapping
const [data, error] = await safe.async(
  () => slowOperation(),
  (e) => ({
    code: e instanceof TimeoutError ? 'TIMEOUT' : 'UNKNOWN',
    message: e instanceof Error ? e.message : 'Unknown error',
  }),
  { abortAfter: 5000 }
)

if (error?.code === 'TIMEOUT') {
  console.log('Operation timed out after 5 seconds')
}

// Using the AbortSignal in your function
const [data, error] = await safe.async(
  (signal) => fetch('/api/data', { signal }),
  { abortAfter: 5000 }
)
```

When `abortAfter` is configured, an `AbortSignal` is passed as the first parameter to your function.

---

## Timeout with safe.wrapAsync

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
```

When `abortAfter` is configured, the signal is appended as an additional argument:

```ts
const safeFetchWithSignal = safe.wrapAsync(
  async (url: string, options?: RequestInit, signal?: AbortSignal) => {
    const res = await fetch(url, { ...options, signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  },
  { abortAfter: 10000 }
)

// The signal is automatically passed when timeout is configured
const [data, error] = await safeFetchWithSignal('/api/users', { method: 'GET' })
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
  abortAfter: 10000, // Default 10s timeout for all async operations
})

// All async calls use the default timeout
const [users, error] = await apiSafe.async(() => fetchUsers())

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
  abortAfter: 5000,
  retry: { times: 2 },
  onRetry: (error, attempt) => {
    console.log(`Retry ${attempt}: ${error.type}`)
  },
})

// Each call gets 3 attempts (1 initial + 2 retries), each with 5s timeout
const [data, error] = await apiSafe.async(() => fetchData())
```

---

## Using AbortSignal

### With safe.async

The signal is passed as the first parameter to your function:

```ts
import { safe } from '@cometloop/safe'

// Function receives signal as first parameter
const [data, error] = await safe.async(
  (signal) => {
    return fetch('/api/data', { signal })
  },
  { abortAfter: 5000 }
)

// The signal can be used with any AbortSignal-compatible API
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

### With safe.wrapAsync

When `abortAfter` is configured, the signal is appended as an additional argument:

```ts
import { safe } from '@cometloop/safe'

// Define function that accepts signal as last parameter
async function fetchWithSignal(
  url: string,
  options?: RequestInit,
  signal?: AbortSignal
) {
  const res = await fetch(url, { ...options, signal })
  return res.json()
}

// Wrap with timeout - signal will be passed automatically
const safeFetch = safe.wrapAsync(fetchWithSignal, { abortAfter: 5000 })

// Call without signal - it's added automatically when timeout is configured
const [data, error] = await safeFetch('/api/users', { method: 'GET' })
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
