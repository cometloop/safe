---
title: Hooks
---

All safe functions support optional hooks for executing side effects on success or error without affecting the return value. {% .lead %}

---

## Overview

Hooks are callbacks that run after the operation completes. They receive the result (or error) and the context (function arguments for `wrap`/`wrapAsync`, empty tuple for `sync`/`async`).

```ts
// Hooks for sync/async - context is always empty tuple []
safe.sync(() => operation(), {
  onSuccess: (result, []) => {
    /* result is the return value */
  },
  onError: (error, []) => {
    /* error is the caught/mapped error */
  },
})

// Hooks for wrap/wrapAsync - context is the arguments tuple
const safeOp = safe.wrap(
  (a: number, b: string, c: boolean) => operation(a, b, c),
  {
    onSuccess: (result, [a, b, c]) => {
      // a: number, b: string, c: boolean - fully typed!
    },
    onError: (error, [a, b, c]) => {
      // Same context available for error logging
    },
  }
)
```

---

## Context differences

### sync and async

The context is always an empty tuple `[]`:

```ts
safe.sync(() => doWork(), {
  onSuccess: (result, []) => console.log('Done:', result),
  onError: (error, []) => console.error('Failed:', error),
})

await safe.async(() => fetchData(), {
  onSuccess: (data, []) => cache.set('data', data),
  onError: (error, []) => reportToSentry(error),
})
```

### wrap and wrapAsync

The context contains the **original arguments** passed to the wrapped function:

```ts
const safeDivide = safe.wrap(
  (a: number, b: number) => a / b,
  {
    onSuccess: (result, [a, b]) => {
      console.log(`${a} / ${b} = ${result}`)
    },
    onError: (error, [a, b]) => {
      console.error(`Failed: ${a} / ${b}`)
    },
  }
)

const safeFetch = safe.wrapAsync(
  async (url: string, options?: RequestInit) => {
    const res = await fetch(url, options)
    return res.json()
  },
  {
    onSuccess: (data, [url, options]) => {
      console.log(`Fetched ${url}`)
    },
    onError: (error, [url, options]) => {
      console.error(`Failed to fetch ${url}`)
    },
  }
)
```

---

## Async-specific hooks

The `onRetry` hook is available for `safe.async` and `safe.wrapAsync`:

```ts
await safe.async(() => unstableApi(), {
  retry: { times: 3 },
  onRetry: (error, attempt, []) => {
    console.log(`Attempt ${attempt} failed: ${error.message}`)
  },
  onSuccess: (data, []) => console.log('Eventually succeeded'),
  onError: (error, []) => console.error('All retries exhausted'),
})
```

The `onRetry` hook is called **before** each retry, not after the final failure. `onError` is only called after all retries are exhausted.

---

## Common use cases

- **Logging and analytics** — Track success/failure rates
- **Error reporting** — Send errors to Sentry, DataDog, etc.
- **Metrics collection** — Increment counters, record timings
- **Audit trails** — Log who did what and when
- **Caching** — Store successful results in a cache

```ts
const safeGetUser = safe.wrapAsync(fetchUser, {
  onSuccess: (user, [id]) => {
    metrics.increment('user.fetch.success')
    cache.set(`user:${id}`, user)
  },
  onError: (error, [id]) => {
    metrics.increment('user.fetch.error')
    Sentry.captureException(error, { extra: { userId: id } })
  },
})
```

---

## parseResult

The `parseResult` option transforms the successful result **before** it reaches hooks or the return value. It is part of the hooks object but behaves differently — it changes the result type.

```ts
const [length, error] = safe.sync(
  () => 'hello world',
  {
    parseResult: (raw) => raw.length,
    onSuccess: (result, []) => {
      // result is number (the transformed type)
      console.log('Length:', result)
    },
  }
)
// length is typed as number
```

### Execution order

1. Function executes and returns raw result (`T`)
2. `parseResult` transforms the result (`T` → `TOut`)
3. `onSuccess` receives the **transformed** result (`TOut`)
4. `onSettled` receives the **transformed** result (`TOut`)

### Error handling

If `parseResult` throws, the error is caught and processed through `parseError`. For async operations with retry, a `parseResult` throw counts as a failure and triggers retry logic.

```ts
const [data, error] = safe.sync(
  () => '{"valid": true}',
  (e) => ({ code: 'PARSE_ERROR', message: String(e) }),
  {
    parseResult: (raw) => JSON.parse(raw),
  }
)
```

{% callout title="parseResult vs hooks" type="note" %}
Unlike hooks, `parseResult` **does** affect the return value — it transforms the result type. Hooks (`onSuccess`, `onError`, `onSettled`) are fire-and-forget side effects that cannot modify the `SafeResult` tuple.
{% /callout %}
