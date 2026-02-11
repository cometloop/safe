---
title: Retry support
---

The `safe.async` and `safe.wrapAsync` functions support automatic retry with configurable backoff. This is useful for handling transient failures like network timeouts, rate limits, or temporary service unavailability. {% .lead %}

---

## RetryConfig

```ts
type RetryConfig = {
  times: number                        // Number of retry attempts (not including initial)
  waitBefore?: (attempt: number) => number // Returns ms to wait before retry (1-indexed)
}
```

**Key behaviors:**

- `times` specifies the number of **retry** attempts, not total attempts. With `times: 3`, you get 4 total attempts (1 initial + 3 retries)
- `waitBefore` receives a **1-indexed** attempt number (first retry = 1, second retry = 2, etc.)
- `onRetry` hook is called **before** each retry, not after the final failure
- `onError` hook is only called **after all retries are exhausted**

---

## Retry with safe.async

```ts
import { safe } from '@cometloop/safe'

// Basic retry - 3 retries with no delay
const [data, error] = await safe.async(() => fetchUnstableApi(), {
  retry: { times: 3 },
})

// Retry with fixed delay
const [data, error] = await safe.async(() => fetchUnstableApi(), {
  retry: {
    times: 3,
    waitBefore: () => 1000, // Wait 1 second before each retry
  },
})

// Retry with logging
const [data, error] = await safe.async(() => fetchUnstableApi(), {
  retry: { times: 3 },
  onRetry: (error, attempt, []) => {
    console.log(`Attempt ${attempt} failed: ${error.message}. Retrying...`)
  },
  onError: (error, []) => {
    console.error(`All attempts failed: ${error.message}`)
  },
})

// Retry with error mapping
const [data, error] = await safe.async(
  () => fetchUnstableApi(),
  (e) => ({ code: 'API_ERROR', message: String(e) }),
  {
    retry: { times: 2 },
    onRetry: (error, attempt, []) => {
      // error is typed as { code: string; message: string }
      console.log(`Retry ${attempt}: ${error.code}`)
    },
  }
)
```

---

## Retry with safe.wrapAsync

```ts
import { safe } from '@cometloop/safe'

// Wrap a function with retry logic
const fetchWithRetry = safe.wrapAsync(
  async (url: string) => {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  },
  {
    retry: { times: 3, waitBefore: (attempt) => attempt * 500 },
    onRetry: (error, attempt, [url]) => {
      console.log(`Retry ${attempt} for ${url}`)
    },
  }
)

// Each call gets its own independent retry attempts
const [data1, error1] = await fetchWithRetry('/api/users')
const [data2, error2] = await fetchWithRetry('/api/orders')
```

With error mapping and retry:

```ts
type ApiError = { code: string; message: string; retryable: boolean }

const safeFetch = safe.wrapAsync(
  async (url: string) => {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  },
  (e): ApiError => ({
    code: 'FETCH_ERROR',
    message: e instanceof Error ? e.message : 'Unknown error',
    retryable: true,
  }),
  {
    retry: { times: 2 },
    onRetry: (error, attempt, [url]) => {
      if (error.retryable) {
        console.log(`Retrying ${url} (attempt ${attempt})`)
      }
    },
  }
)
```

---

## Retry with createSafe

The `createSafe` factory supports default retry configuration that applies to all `async` and `wrapAsync` calls:

```ts
import { createSafe } from '@cometloop/safe'

const apiSafe = createSafe({
  parseError: (e) => ({
    code: 'API_ERROR',
    message: e instanceof Error ? e.message : 'Unknown',
  }),
  defaultError: { code: 'API_ERROR', message: 'Unknown' },
  retry: {
    times: 3,
    waitBefore: (attempt) => attempt * 1000, // 1s, 2s, 3s
  },
  onRetry: (error, attempt) => {
    console.log(`Default retry ${attempt}: ${error.code}`)
  },
})

// All async calls use the default retry config
const safeFetchUsers = apiSafe.wrapAsync(fetchUsers)
const [users, error] = await safeFetchUsers()

const safeFetchJson = apiSafe.wrapAsync(fetchJson)
```

Per-call retry **completely overrides** the default:

```ts
// Override default retry
const [data, error] = await apiSafe.async(() => criticalOperation(), {
  retry: { times: 5 }, // Overrides default times: 3
})

// Disable retry for a specific call
const [result, error] = await apiSafe.async(() => oneTimeOperation(), {
  retry: { times: 0 }, // No retries
})
```

{% callout title="Hook merging" type="note" %}

- `onSuccess`: Default hook called first, then per-call hook
- `onError`: Default hook called first, then per-call hook
- `onRetry`: Default hook called first, then per-call hook
- `retry`: Per-call config **completely overrides** default config (not merged)
  {% /callout %}

---

## Exponential backoff

Common retry patterns using `waitBefore`:

```ts
// Linear backoff: 1s, 2s, 3s, 4s...
const linearBackoff = (attempt: number) => attempt * 1000

// Exponential backoff: 1s, 2s, 4s, 8s...
const exponentialBackoff = (attempt: number) => Math.pow(2, attempt - 1) * 1000

// Exponential with jitter (recommended for distributed systems)
const exponentialWithJitter = (attempt: number) => {
  const base = Math.pow(2, attempt - 1) * 1000
  const jitter = Math.random() * 500 // 0-500ms random jitter
  return base + jitter
}

// Capped exponential: grows but caps at 30s
const cappedExponential = (attempt: number) =>
  Math.min(Math.pow(2, attempt - 1) * 1000, 30000)

// Usage with wrapAsync
const safeFetchData = safe.wrapAsync(fetchData, {
  retry: { times: 5, waitBefore: exponentialWithJitter },
  onRetry: (error, attempt, args) => {
    console.log(`Retry ${attempt} after backoff`)
  },
})

const [data, error] = await safeFetchData()
```
