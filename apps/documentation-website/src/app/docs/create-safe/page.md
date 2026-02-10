---
title: createSafe
---

The recommended way to use `@cometloop/safe`. Creates a pre-configured safe instance so your call sites stay clean and minimal — just a normal function call, no extra configuration. {% .lead %}

---

## When to use createSafe

`createSafe` is the best way to use this library. The goal is simple: **move all error handling configuration out of your call sites** so they read like normal function calls.

- You want call sites that are clean and minimal — no inline `parseError`, no options objects
- You want consistent error mapping across multiple operations without repeating yourself
- You need default logging/analytics hooks that run automatically
- You want to wrap functions once and call them everywhere like any other function

---

## Signature

```ts
function createSafe<E, TResult = never>(
  config: CreateSafeConfig<E, TResult>
): SafeInstance<E, TResult>

type CreateSafeConfig<E, TResult = never> = {
  parseError: (e: unknown) => NonFalsy<E>  // Required: transforms caught errors
  defaultError: E                          // Required: fallback when parseError throws
  parseResult?: (result: unknown) => TResult // Optional: transforms successful results
  onSuccess?: (result: unknown) => void    // Optional: called on every success
  onError?: (error: E) => void             // Optional: called on every error
  onSettled?: (result: unknown, error: E | null) => void // Optional: called after success or error
  onRetry?: (error: E, attempt: number) => void // Optional: called before each retry
  retry?: RetryConfig                      // Optional: default retry config (async only)
  abortAfter?: number                      // Optional: default timeout (async only)
  onHookError?: (error: unknown, hookName: string) => void // Optional: called when a hook throws
}
```

---

## Basic usage

Configure once, then every call site is just a function call:

```ts
import { createSafe } from '@cometloop/safe'

type AppError = {
  code: string
  message: string
}

// All the configuration lives here — once
const appSafe = createSafe({
  parseError: (e): AppError => ({
    code: 'UNKNOWN_ERROR',
    message: e instanceof Error ? e.message : 'An unknown error occurred',
  }),
  defaultError: {
    code: 'UNKNOWN_ERROR',
    message: 'An unknown error occurred',
  },
})

// Wrap your functions
const safeJsonParse = appSafe.wrap(JSON.parse)
const safeFetchUser = appSafe.wrapAsync(fetchUser)

// Call sites are clean — just like calling a normal function
const [data, error] = safeJsonParse(jsonString)
const [user, err] = await safeFetchUser(id)
// error and err are fully typed as AppError
```

---

## With default hooks

Global logging for all operations:

```ts
const loggingSafe = createSafe({
  parseError: (e): AppError => ({
    code: 'ERROR',
    message: e instanceof Error ? e.message : String(e),
  }),
  defaultError: {
    code: 'ERROR',
    message: 'An unknown error occurred',
  },
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
  defaultError: { type: 'API_ERROR' as const, status: 500, message: 'Request failed' },
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
  defaultError: { code: 'ERROR', message: 'Unknown error' },
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
  defaultError: { type: 'DB_ERROR' as const, query: 'unknown', message: 'Database error' },
})

const authSafe = createSafe({
  parseError: (e) => ({
    type: 'AUTH_ERROR' as const,
    code: e instanceof TokenExpiredError ? 'EXPIRED' : 'INVALID',
    message: e instanceof Error ? e.message : 'Authentication failed',
  }),
  defaultError: { type: 'AUTH_ERROR' as const, code: 'INVALID', message: 'Authentication failed' },
})

// Each instance has its own error type
const [user, dbError] = await dbSafe.async(() => db.user.findById(id))
const [token, authError] = authSafe.sync(() => verifyToken(jwt))
// dbError is { type: 'DB_ERROR'; ... }
// authError is { type: 'AUTH_ERROR'; ... }
```

---

## Hook error visibility

Set a factory-level `onHookError` to catch hook errors across all operations:

```ts
const appSafe = createSafe({
  parseError: (e) => String(e),
  defaultError: 'unknown error',
  onSuccess: (result) => {
    externalLogger.log(result) // might throw
  },
  onHookError: (err, hookName) => {
    // Called when onSuccess (or any hook) throws
    monitoring.trackHookFailure(hookName, err)
  },
})

// All operations get hook error visibility
appSafe.sync(() => computeValue())
await appSafe.async(() => fetchData())
```

Per-call `onHookError` **overrides** the factory-level callback:

```ts
appSafe.sync(() => riskyOperation(), {
  onHookError: (err, hookName) => {
    // Replaces the factory onHookError for this call only
    customLogger.warn(`${hookName} failed`, err)
  },
})
```

See [Hooks — onHookError](/docs/hooks#onhookerror) for more details.

---

## Hook execution order

When both default hooks (from config) and per-call hooks are provided:

1. Default hook (from `createSafe` config)
2. Per-call hook (from method call)

```ts
const appSafe = createSafe({
  parseError: (e) => String(e),
  defaultError: 'unknown error',
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
  defaultError: { code: 'ERR', message: 'Unknown' },
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
The returned instance has `sync`, `async`, `wrap`, `wrapAsync`, `all`, and `allSettled` methods — all pre-configured with the error type. The `all` and `allSettled` methods accept raw async functions (not pre-wrapped `Promise<SafeResult>` entries). See [Types](/docs/types) for the full `SafeInstance<E>` definition.
{% /callout %}
