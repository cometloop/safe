---
title: createSafe
---

Creates a pre-configured safe instance with a fixed error mapping function and optional default hooks. The error type is automatically inferred from the `parseError` return type. {% .lead %}

---

## When to use createSafe

- You want consistent error mapping across multiple operations
- You need default logging/analytics hooks for all operations
- You want to avoid repeating `parseError` on every call

---

## Signature

```ts
function createSafe<E, TResult = never>(
  config: CreateSafeConfig<E, TResult>
): SafeInstance<E, TResult>

type CreateSafeConfig<E, TResult = never> = {
  parseError: (e: unknown) => E            // Required: transforms caught errors
  parseResult?: (result: unknown) => TResult // Optional: transforms successful results
  onSuccess?: (result: unknown) => void    // Optional: called on every success
  onError?: (error: E) => void             // Optional: called on every error
  onRetry?: (error: E, attempt: number) => void // Optional: called before each retry
  retry?: RetryConfig                      // Optional: default retry config (async only)
  abortAfter?: number                      // Optional: default timeout (async only)
}
```

---

## Basic usage

```ts
import { createSafe } from '@cometloop/safe'

type AppError = {
  code: string
  message: string
  timestamp: Date
}

const appSafe = createSafe({
  parseError: (e): AppError => ({
    code: 'UNKNOWN_ERROR',
    message: e instanceof Error ? e.message : 'An unknown error occurred',
    timestamp: new Date(),
  }),
})

// All methods now return AppError on failure
const [data, error] = appSafe.sync(() => JSON.parse(jsonString))
if (error) {
  console.error(error.code, error.message) // error is typed as AppError
}

const [user, err] = await appSafe.async(() => fetchUser(id))
if (err) {
  console.error(err.code) // err is typed as AppError
}
```

---

## With default hooks

Global logging for all operations:

```ts
const loggingSafe = createSafe({
  parseError: (e): AppError => ({
    code: 'ERROR',
    message: e instanceof Error ? e.message : String(e),
    timestamp: new Date(),
  }),
  onSuccess: (result) => {
    console.log('Operation succeeded:', result)
    analytics.track('operation_success')
  },
  onError: (error) => {
    console.error('Operation failed:', error.code)
    analytics.track('operation_failed', { code: error.code })
    Sentry.captureException(error)
  },
})

// Default hooks are called automatically
loggingSafe.sync(() => processData()) // logs success or error
```

---

## Per-call hooks

Override or extend default behavior with per-call hooks. Per-call hooks run **after** default hooks:

```ts
const [result, error] = loggingSafe.sync(() => riskyOperation(), {
  // Per-call hooks run AFTER default hooks
  onSuccess: (result, []) => {
    cache.set('result', result)
  },
  onError: (error, []) => {
    showUserNotification(error.message)
  },
})
```

---

## Wrapping functions

```ts
const apiSafe = createSafe({
  parseError: (e) => ({
    type: 'API_ERROR' as const,
    status: 500,
    message: e instanceof Error ? e.message : 'Request failed',
  }),
  onError: (error) => metrics.increment('api_error', { type: error.type }),
})

// Wrap functions - they inherit the configured parseError
const safeFetch = apiSafe.wrapAsync(async (url: string) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
})

const [data, error] = await safeFetch('/api/users')
// error is typed as { type: 'API_ERROR'; status: number; message: string }
```

---

## With parseResult

Set a factory-level `parseResult` to transform all successful results:

```ts
import { createSafe } from '@cometloop/safe'
import { z } from 'zod'

const schema = z.object({ id: z.number(), name: z.string() })

const validatedSafe = createSafe({
  parseError: (e) => ({
    code: 'ERROR',
    message: e instanceof Error ? e.message : String(e),
  }),
  parseResult: (result) => schema.parse(result),
})

// All methods validate results through the schema
const [user, error] = validatedSafe.sync(() => JSON.parse(data))
// user is typed as { id: number; name: string }
```

Per-call `parseResult` overrides the factory default:

```ts
const [raw, error] = validatedSafe.sync(() => fetchData(), {
  parseResult: (result) => result, // bypass factory validation
})
```

---

## Multiple instances

Create different instances for different contexts:

```ts
const dbSafe = createSafe({
  parseError: (e) => ({
    type: 'DB_ERROR' as const,
    query: 'unknown',
    message: e instanceof Error ? e.message : String(e),
  }),
})

const authSafe = createSafe({
  parseError: (e) => ({
    type: 'AUTH_ERROR' as const,
    code: e instanceof TokenExpiredError ? 'EXPIRED' : 'INVALID',
    message: e instanceof Error ? e.message : 'Authentication failed',
  }),
})

// Each instance has its own error type
const [user, dbError] = await dbSafe.async(() => db.user.findById(id))
const [token, authError] = authSafe.sync(() => verifyToken(jwt))
// dbError is { type: 'DB_ERROR'; ... }
// authError is { type: 'AUTH_ERROR'; ... }
```

---

## Hook execution order

When both default hooks (from config) and per-call hooks are provided:

1. Default hook (from `createSafe` config)
2. Per-call hook (from method call)

```ts
const appSafe = createSafe({
  parseError: (e) => String(e),
  onSuccess: () => console.log('1. Default hook'),
})

appSafe.sync(() => 'result', {
  onSuccess: () => console.log('2. Per-call hook'),
})

// Output:
// 1. Default hook
// 2. Per-call hook
```

---

## Type inference

The error type `E` is automatically inferred from the `parseError` return type:

```ts
// Error type is inferred as { code: string; message: string }
const appSafe = createSafe({
  parseError: (e) => ({
    code: 'ERR',
    message: e instanceof Error ? e.message : 'Unknown',
  }),
})

// Per-call hooks receive the correctly typed error
appSafe.sync(
  () => {
    throw new Error('fail')
  },
  {
    onError: (error) => {
      // TypeScript knows: error.code is string, error.message is string
      console.log(error.code, error.message)
    },
  }
)
```

{% callout title="SafeInstance type" type="note" %}
The returned instance has `sync`, `async`, `wrap`, and `wrapAsync` methods — all pre-configured with the error type. See [Types](/docs/types) for the full `SafeInstance<E>` definition.
{% /callout %}
